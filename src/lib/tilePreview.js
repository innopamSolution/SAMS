// 3D 타일 항목의 팝업 미리보기.
//  - 클릭 팝업·상세 패널: 정지 이미지만 보여준다(PC 부하를 줄이려고 라이브 3D 는 띄우지 않는다. 3D 로 보려면 '지도에서 3D 렌더링').
//    한 번 만든 항목은 스냅샷을 저장해 두고, 없으면 뒤에서 한 장(한 번에 하나씩) 만들어 채운다.
import maplibregl from 'maplibre-gl';
import { buildCompareStyle } from './mapStyles';
import { addTilesLayer } from './tiles3d';

export const isTileItem = (it) => !!(it && it.tilesetUrl && it.lat != null && (it.cat === 'model3d' || it.cat === 'pointcloud'));

// ── 스냅샷 저장(메모리 + localStorage) ───────────────────────
const KEY = 'sams.tilepreview.v8'; // 바탕 위성 지도가 브이월드로 바뀌며 올림(이전 스냅샷 폐기)
// 예전 자료(옛 3D 자료)의 스냅샷이 브라우저에 남지 않게, 이전 버전 키는 모두 지운다.
(() => { try { ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].forEach((v) => localStorage.removeItem('sams.tilepreview.' + v)); } catch { /* noop */ } })(); // 시점 중심이 바뀌면 올린다(이전 스냅샷 폐기)
const MAX_ENTRIES = 40;
let stills = null;
const load = () => {
  if (stills) return stills;
  try { stills = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { stills = {}; }
  return stills;
};
export const getStill = (id) => load()[id] || null;
function putStill(id, dataUrl) {
  const s = load();
  delete s[id];
  s[id] = dataUrl; // 삽입 순서 = 최근 순
  const ids = Object.keys(s);
  while (ids.length > MAX_ENTRIES) delete s[ids.shift()];
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 용량이 모자라면 메모리에만 둔다 */ }
}

const HTML_NOTE = 'position:absolute;left:9px;bottom:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,0.85);background:rgba(0,0,0,0.4);padding:3px 7px;border-radius:20px;pointer-events:none;';

// 팝업에 넣는 미리보기 자리. live=true 면 스냅샷이 없을 때 '만드는 중' 표시를 넣고, 이어서 mountStillPreview 로 채운다.
export function tilePreviewHtml(it, height, live) {
  const still = getStill(it.id);
  const img = still ? `<img class="sams-tilepv-still" src="${still}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">` : '';
  const note = live && !still ? `<div class="sams-tilepv-note" style="${HTML_NOTE}">미리보기 만드는 중…</div>` : '';
  return `<div class="sams-tilepv" data-id="${it.id}" style="position:relative;height:${height}px;overflow:hidden;background:radial-gradient(circle at 50% 40%, #14202e, #060a10);">${img}<div class="sams-tilepv-map" style="position:absolute;inset:0;"></div>${note}</div>`;
}

// ── 작은 3D 지도 ─────────────────────────────────────────────
function makePreviewMap(container, it, { zoom = 15.9, pitch = 45 } = {}) { // 높은 건물도 통째로 들어오는 거리(작은 화면에 맞춰 멀리서, 덜 기울여)
  const map = new maplibregl.Map({
    container, style: buildCompareStyle(), center: [it.lng, it.lat], zoom, pitch, bearing: -22,
    interactive: false, attributionControl: false, pixelRatio: 1, preserveDrawingBuffer: true, fadeDuration: 0,
  });
  map.setPadding({ top: 40, bottom: 0, left: 0, right: 0 }); // 건물은 지면 점 위로 솟으므로 중심을 조금 아래로
  map.on('error', (e) => console.warn('[tilePreview]', e?.error?.message || e));
  let tiles = null;
  map.on('load', () => {
    try { map.setTerrain({ source: 'terrain', exaggeration: 1.15 }); } catch { /* noop */ }
    tiles = addTilesLayer(maplibregl, map, { url: it.tilesetUrl, lngLat: [it.lng, it.lat], cacheMB: 160 }).tiles;
  });
  return { map, progress: () => (tiles ? tiles.loadProgress : 0), hasTiles: () => !!tiles };
}

// 타일이 다 들어올 때까지 기다린다(최대 timeout ms). 다 들어왔으면 true.
function whenLoaded(handle, timeout, isAlive) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let steady = 0;
    const tick = () => {
      if (!isAlive()) { resolve(false); return; }
      const ok = handle.hasTiles() && handle.progress() >= 1;
      steady = ok ? steady + 1 : 0;
      if (steady >= 20) { resolve(true); return; }
      if (performance.now() - t0 > timeout) { resolve(handle.progress() > 0.6); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function snapshot(map) {
  try { return map.getCanvas().toDataURL('image/jpeg', 0.72); } catch { return null; }
}

// 정지 이미지만 채운다: 저장된 스냅샷이 있으면 그대로 두고, 없으면 뒤에서 만들어 채운다. 돌려받는 함수로 정리한다.
export function mountStillPreview(rootEl, it) {
  const box = rootEl && rootEl.querySelector(`.sams-tilepv[data-id="${it.id}"]`);
  if (!box || getStill(it.id)) return () => {};
  let alive = true;
  requestStill(it, (s) => {
    if (!alive) return;
    const note = box.querySelector('.sams-tilepv-note');
    if (!s) { if (note) note.textContent = '미리보기를 만들 수 없습니다'; return; }
    if (note) note.remove();
    const img = document.createElement('img');
    img.className = 'sams-tilepv-still';
    img.alt = '';
    img.src = s;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
    box.insertBefore(img, box.firstChild);
  }, () => alive);
  return () => { alive = false; };
}

// ── 정지 이미지: 뒤에서 한 장씩 만든다 ─────────────────
const queue = [];
const waiters = new Map(); // id → [{ cb, wanted }]  같은 항목을 여러 곳(팝업·패널)에서 기다릴 수 있다
let busy = false;

async function generate(it) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:190px;pointer-events:none;';
  document.body.appendChild(host);
  const handle = makePreviewMap(host, it);
  try {
    const done = await whenLoaded(handle, 20000, () => true);
    if (!done) return null;
    await new Promise((res) => { handle.map.once('render', res); handle.map.triggerRepaint(); });
    const s = snapshot(handle.map);
    if (s) putStill(it.id, s);
    return s;
  } finally {
    try { handle.map.remove(); } catch { /* noop */ }
    host.remove();
  }
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const it = queue.shift();
    const notify = (s) => { (waiters.get(it.id) || []).forEach((w) => { if (w.wanted()) w.cb(s); }); waiters.delete(it.id); };
    if (getStill(it.id)) { notify(getStill(it.id)); continue; }
    if (!(waiters.get(it.id) || []).some((w) => w.wanted())) { waiters.delete(it.id); continue; } // 기다리는 사이 닫혔으면 만들지 않는다
    let s = null;
    try { s = await generate(it); } catch (e) { console.warn('[tilePreview]', e); }
    notify(s);
  }
  busy = false;
}

// 정지 이미지를 요청한다. wanted() 가 false 가 되면(팝업·패널을 닫음) 아직 시작 전인 작업은 건너뛴다. 실패하면 cb(null).
export function requestStill(it, cb, wanted) {
  const list = waiters.get(it.id);
  if (list) { list.push({ cb, wanted }); return; }
  waiters.set(it.id, [{ cb, wanted }]);
  queue.push(it);
  pump();
}
