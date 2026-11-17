// 아이템 공개 여부(status: 'published' | 'draft')를 저장해 새로고침해도, (개발 서버가 있으면) 다른 브라우저에서도 유지한다.
// 아이템 id 는 엑셀을 다시 가져오면 바뀔 수 있어 공간·제목·날짜로 키를 만든다.
import { readStore, writeStore } from './serverStore';

const KEY = 'sams.itemStatus.v1';
const keyOf = (it) => it._key || `${it.space}|${it.title}|${it.date}`; // 제목을 고쳐도 키가 변하지 않게 원래 값(_key)을 쓴다

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

let map = readLocal();
let serverOn = false;

// 화면을 그리기 전에 한 번 부른다: 서버 파일이 있으면 그것을, 비어 있으면 이 브라우저의 저장값으로 서버를 채운다.
export async function loadItemStatus() {
  const r = await readStore('itemStatus');
  if (!r.ok) return;
  serverOn = true;
  if (r.data === undefined) { if (Object.keys(map).length) writeStore('itemStatus', map); return; }
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    map = r.data;
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* 캐시일 뿐 */ }
  }
}

export function applyStoredStatus(items) {
  items.forEach((it) => { const v = map[keyOf(it)]; if (v === 'published' || v === 'draft') it.status = v; });
}

export function saveItemStatus(it, status) {
  it.status = status;
  map = { ...map, [keyOf(it)]: status };
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* 저장소를 못 쓰면 서버·이번 화면에서만 유지 */ }
  if (serverOn) writeStore('itemStatus', map);
}
