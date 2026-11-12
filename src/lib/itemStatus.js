// 아이템 공개 여부(status: 'published' | 'draft')를 브라우저에 저장해 새로고침해도 유지한다.
// 아이템 id 는 엑셀을 다시 가져오면 바뀔 수 있어 공간·제목·날짜로 키를 만든다.
const KEY = 'sams.itemStatus.v1';
const keyOf = (it) => `${it.space}|${it.title}|${it.date}`;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function applyStoredStatus(items) {
  const m = read();
  items.forEach((it) => { const v = m[keyOf(it)]; if (v === 'published' || v === 'draft') it.status = v; });
}

export function saveItemStatus(it, status) {
  it.status = status;
  const m = read();
  m[keyOf(it)] = status;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 저장소를 못 쓰면 이번 화면에서만 유지 */ }
}
