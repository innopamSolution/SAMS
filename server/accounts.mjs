// 계정(아이디·비밀번호) 저장. 비밀번호는 원문이 아니라 scrypt 로 계산한 값만 DB 에 둔다.
// 역할은 두 가지: 'admin'(메모 작성·수정·삭제, 데이터 관리) · 'user'(일반 사용자, 보기만). 로그인해야 모두 볼 수 있다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_DB = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', 'store.sqlite');
export const ROLES = ['admin', 'user'];

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS docs (name TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  // 표 이름은 처음 만들 때(관리자만 있던 때)의 admins 를 그대로 쓴다.
  db.exec("CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'admin')");
  // 역할 칸이 없던 예전 DB 는 칸을 더한다. 예전 계정은 모두 관리자였으므로 admin 으로 둔다.
  if (!db.prepare('PRAGMA table_info(admins)').all().some((c) => c.name === 'role')) db.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  return db;
}

const KEYLEN = 64;
const hashOf = (pw, salt) => crypto.scryptSync(String(pw), salt, KEYLEN).toString('hex');

export const MIN_PASSWORD = 8;
export const validId = (id) => /^[A-Za-z0-9._@-]{2,40}$/.test(id);

export function setAccount(db, id, pw, role = 'admin') {
  if (!validId(id)) throw new Error('아이디는 영문·숫자·. _ @ - 로 2~40자여야 합니다');
  if (!ROLES.includes(role)) throw new Error(`역할은 ${ROLES.join(' 또는 ')} 이어야 합니다`);
  if (String(pw).length < MIN_PASSWORD) throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다`);
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO admins (id, salt, hash, created_at, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, role = excluded.role').run(id, salt, hashOf(pw, salt), Date.now(), role);
}
export const removeAccount = (db, id) => db.prepare('DELETE FROM admins WHERE id = ?').run(id).changes > 0;
export const listAccounts = (db) => db.prepare('SELECT id, role, created_at FROM admins ORDER BY created_at').all();
export const countAccounts = (db) => db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;

// 맞으면 역할('admin'|'user')을, 아니면 null 을 돌려준다.
// 없는 아이디도 같은 시간을 들여 계산해서, 응답 시간으로 아이디가 있는지 알아내지 못하게 한다.
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
export function verifyAccount(db, id, pw) {
  const row = db.prepare('SELECT salt, hash, role FROM admins WHERE id = ?').get(String(id));
  const got = Buffer.from(hashOf(pw, row ? row.salt : DUMMY_SALT), 'hex');
  const want = Buffer.from(row ? row.hash : '0'.repeat(KEYLEN * 2), 'hex');
  return row && got.length === want.length && crypto.timingSafeEqual(got, want) ? (ROLES.includes(row.role) ? row.role : 'user') : null;
}
