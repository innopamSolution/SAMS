// Spatial Log 저장소 서버 — 메모·아이템 공개 여부·아이템 수정을 SQLite 에 저장한다. 규약은 docs/STORE_API.md.
// 의존 패키지 없이 Node 22.5 이상(내장 node:sqlite)만 있으면 돌아간다.
//
//   node server/admin-user.mjs add <아이디>      # 관리자 계정을 먼저 만든다(비밀번호를 물어본다)
//   node server/store-server.mjs                 # 서버 시작
//
// 환경변수
//   SAMS_ADMIN_ID / SAMS_ADMIN_PASSWORD  관리자가 한 명도 없을 때만, 시작하면서 이 계정을 만든다(처음 세팅을 쉽게 하려는 용도)
//   SAMS_TOKEN_SECRET    로그인 표(토큰) 서명 비밀값. 없으면 시작할 때마다 새로 만들어서, 서버를 껐다 켜면 다시 로그인해야 한다
//   PORT / HOST          기본 8787 / 127.0.0.1 (웹서버 뒤에서 프록시로 연결하는 것을 전제로 한다)
//   SAMS_DB              DB 파일 경로. 기본 server/data/store.sqlite
//   SAMS_SEED_DIR        DB 가 비어 있을 때 이 폴더의 annotations.json · itemStatus.json · itemEdits.json 으로 채운다
//   SAMS_CORS_ORIGINS    다른 주소의 화면에서 부를 때 허용할 출처(쉼표로 구분). 같은 도메인이면 필요 없다
//   SAMS_STORE_PREFIX    기본 /store/
//   SAMS_MAX_BODY_MB     쓰기 요청 크기 제한. 기본 30
//   SAMS_TOKEN_HOURS     로그인 유지 시간. 기본 12
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, DEFAULT_DB, setAdmin, countAdmins, verifyAdmin } from './accounts.mjs';

const env = process.env;
const SECRET = env.SAMS_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || '127.0.0.1';
const PREFIX = (env.SAMS_STORE_PREFIX || '/store/').replace(/\/?$/, '/');
const MAX_BODY = Number(env.SAMS_MAX_BODY_MB || 30) * 1024 * 1024;
const TOKEN_MS = Number(env.SAMS_TOKEN_HOURS || 12) * 3600 * 1000;
const ORIGINS = new Set((env.SAMS_CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
const NAMES = new Set(['annotations', 'itemStatus', 'itemEdits']);

// ── DB ──────────────────────────────────────────────
const dbFile = env.SAMS_DB || DEFAULT_DB;
const db = openDb(dbFile);
if (countAdmins(db) === 0) {
  if (env.SAMS_ADMIN_ID && env.SAMS_ADMIN_PASSWORD) { setAdmin(db, env.SAMS_ADMIN_ID, env.SAMS_ADMIN_PASSWORD); console.log(`[계정] 관리자 '${env.SAMS_ADMIN_ID}' 를 만들었습니다`); }
  else console.warn('[계정] 관리자가 없습니다. 로그인하려면: node server/admin-user.mjs add <아이디>');
}
const getDoc = db.prepare('SELECT json FROM docs WHERE name = ?');
const putDoc = db.prepare('INSERT INTO docs (name, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at');
if (env.SAMS_SEED_DIR) {
  for (const n of NAMES) {
    const f = path.join(env.SAMS_SEED_DIR, n + '.json');
    if (!getDoc.get(n) && fs.existsSync(f)) { putDoc.run(n, fs.readFileSync(f, 'utf8'), Date.now()); console.log(`[seed] ${n} ← ${f}`); }
  }
}

// ── 로그인 표(토큰) ─────────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
const makeToken = (id) => { const body = b64(JSON.stringify({ id, exp: Date.now() + TOKEN_MS })); return `${body}.${sign(body)}`; };
// 표가 유효하면 아이디를, 아니면 null 을 돌려준다.
function adminOf(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() && p.id ? String(p.id) : null; } catch { return null; }
}
const isAdmin = (req) => !!adminOf(req);

// 비밀번호 대입 공격을 늦춘다: 같은 접속지(또는 같은 아이디)에서 1분에 5번 틀리면 1분간 막는다.
const fails = new Map();
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const blocked = (ip) => { const f = fails.get(ip); return !!f && f.n >= 5 && Date.now() - f.t < 60000; };
const noteFail = (ip) => { const f = fails.get(ip); const now = Date.now(); fails.set(ip, !f || now - f.t >= 60000 ? { n: 1, t: now } : { n: f.n + 1, t: f.t }); };

// ── HTTP ────────────────────────────────────────────
function cors(req, res) {
  const o = req.headers.origin;
  if (o && ORIGINS.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'X-Sams-Store');
  }
}
const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Sams-Store': '1' }); res.end(body); };
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj));
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith(PREFIX)) return send(res, 404, '{"error":"not found"}');
    const name = decodeURIComponent(u.pathname.slice(PREFIX.length));

    if (name === 'login' && req.method === 'POST') {
      const ip = clientIp(req);
      let id = ''; let pw = '';
      try { const j = JSON.parse(await readBody(req)); id = String(j.id ?? '').trim(); pw = String(j.password ?? ''); } catch { return sendJson(res, 400, { error: 'bad request' }); }
      const idKey = 'id:' + id.toLowerCase();
      if (blocked(ip) || blocked(idKey)) return sendJson(res, 429, { error: '잠시 후 다시 시도해 주세요' });
      if (!id || !pw || !verifyAdmin(db, id, pw)) { noteFail(ip); noteFail(idKey); return sendJson(res, 401, { error: '아이디 또는 비밀번호가 맞지 않습니다' }); }
      fails.delete(ip); fails.delete(idKey);
      return sendJson(res, 200, { token: makeToken(id), id, expiresIn: TOKEN_MS });
    }
    if (name === 'me' && req.method === 'GET') { const id = adminOf(req); return sendJson(res, 200, id ? { admin: true, id } : { admin: false }); }

    if (!NAMES.has(name)) return sendJson(res, 404, { error: 'unknown document' });
    const admin = isAdmin(req);

    if (req.method === 'GET') {
      const row = getDoc.get(name);
      if (!row) return sendJson(res, 404, { error: 'empty' });
      if (name === 'annotations' && !admin) { // 비공개 메모는 관리자가 아닌 사람에게 보내지 않는다
        let list = [];
        try { list = JSON.parse(row.json); } catch { /* 깨진 문서는 빈 목록 */ }
        return send(res, 200, JSON.stringify((Array.isArray(list) ? list : []).filter((a) => a && a.visibility === 'public')));
      }
      return send(res, 200, row.json);
    }
    if (req.method === 'PUT') {
      if (!admin) return sendJson(res, 401, { error: '관리자 로그인이 필요합니다' });
      const text = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(text); } catch { return sendJson(res, 400, { error: 'JSON 이 아닙니다' }); }
      const okShape = name === 'annotations' ? Array.isArray(parsed) : parsed && typeof parsed === 'object' && !Array.isArray(parsed);
      if (!okShape) return sendJson(res, 400, { error: '문서 모양이 맞지 않습니다' });
      putDoc.run(name, JSON.stringify(parsed), Date.now());
      res.writeHead(204, { 'X-Sams-Store': '1' }); res.end();
      return;
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  } catch (e) {
    if (e && e.code === 413) return sendJson(res, 413, { error: '요청이 너무 큽니다' });
    console.error(e);
    return sendJson(res, 500, { error: 'server error' });
  }
});
server.listen(PORT, HOST, () => console.log(`Spatial Log 저장소 서버 http://${HOST}:${PORT}${PREFIX}  (DB: ${dbFile})`));
