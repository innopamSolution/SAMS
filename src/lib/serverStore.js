// 개발 서버의 파일 저장소(vite.config.js 의 spatialLogStore) 읽기·쓰기. 서버가 없으면 { ok: false } 로 알려 브라우저 저장소만 쓰게 한다.
const base = import.meta.env.BASE_URL + 'api/store/';

export async function readStore(name) {
  try {
    const r = await fetch(base + name, { cache: 'no-store' });
    if (r.status === 404) return { ok: true, data: undefined }; // 서버는 있는데 아직 저장된 것이 없다
    if (!r.ok) return { ok: false };
    return { ok: true, data: JSON.parse(await r.text()) }; // 정적 호스트가 index.html 을 돌려주면 여기서 실패한다
  } catch {
    return { ok: false };
  }
}

export function writeStore(name, data) {
  return fetch(base + name, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
}
