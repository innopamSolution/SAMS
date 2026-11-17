// 관리 화면에서 고친 아이템 제목·설명·위치를 저장해 새로고침해도, (개발 서버가 있으면) 다른 브라우저에서도 유지한다.
// 원본(엑셀) 값은 건드리지 않고, 고친 값만 덧씌운다. 키는 엑셀에서 가져온 원래 공간·제목·날짜(it._key)다.
import { readStore, writeStore } from './serverStore';

const KEY = 'sams.itemEdits.v1';
const FIELDS = ['title', 'desc', 'lng', 'lat'];

function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

let map = readLocal();
let serverOn = false;

export async function loadItemEdits() {
  const r = await readStore('itemEdits');
  if (!r.ok) return;
  serverOn = true;
  if (r.data === undefined) { if (Object.keys(map).length) writeStore('itemEdits', map); return; }
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    map = r.data;
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* 캐시일 뿐 */ }
  }
}

export function applyStoredEdits(items) {
  items.forEach((it) => {
    const e = map[it._key];
    if (e) FIELDS.forEach((f) => { if (f in e) it[f] = e[f]; });
  });
}

export function saveItemEdits(it) {
  if (!it._key) return; // 엑셀에서 온 아이템만 저장한다
  const e = {};
  FIELDS.forEach((f) => { e[f] = it[f] ?? null; });
  map = { ...map, [it._key]: e };
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* 저장소를 못 쓰면 서버·이번 화면에서만 유지 */ }
  if (serverOn) writeStore('itemEdits', map);
}
