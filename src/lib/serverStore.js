// 개발 서버의 파일 저장소(vite.config.js 의 spatialLogStore) 읽기·쓰기. 서버가 없으면 { ok: false } 로 알려 브라우저 저장소만 쓰게 한다.
// 저장소 API 주소. 나중에 DB 를 붙이면 빌드할 때 VITE_STORE_API_URL(예: https://api.example.com/store/)만 지정하면 된다.
// 지정하지 않으면 개발 서버의 파일 저장소(/SAMS/api/store/)를 쓴다. 규약은 docs/STORE_API.md 참고.
const EXTERNAL = (import.meta.env.VITE_STORE_API_URL || '').trim();
const base = EXTERNAL ? EXTERNAL.replace(/\/?$/, '/') : import.meta.env.BASE_URL + 'api/store/';
const snapBase = import.meta.env.BASE_URL + 'store/'; // 정적 배포에 빌드 때 담긴 읽기 전용 사본

// 개발 서버가 없는 곳(GitHub Pages 등)에서 읽는다. 없으면 undefined.
async function readSnapshot(name) {
  try {
    const r = await fetch(snapBase + name + '.json', { cache: 'no-cache' });
    if (!r.ok) return undefined;
    return JSON.parse(await r.text());
  } catch {
    return undefined;
  }
}

export async function readStore(name) {
  try {
    const r = await fetch(base + name, { cache: 'no-store' });
    if (r.status === 404 && (EXTERNAL || r.headers.get('X-Sams-Store'))) return { ok: true, data: undefined }; // 개발 서버는 있는데 아직 저장된 것이 없다 (표식이 없는 404 는 정적 호스트)
    if (!r.ok) return { ok: false, snapshot: await readSnapshot(name) };
    return { ok: true, data: JSON.parse(await r.text()) }; // 정적 호스트가 index.html 을 돌려주면 여기서 실패한다
  } catch {
    return { ok: false, snapshot: await readSnapshot(name) };
  }
}

export function writeStore(name, data) {
  return fetch(base + name, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
}
