// 3D 타일 항목의 팝업 미리보기.
//  - 클릭 팝업: 작은 3D 지도에 타일을 비스듬히 천천히 돌려 보여준다(팝업을 닫으면 정리).
//  - 호버 카드: 정지 이미지. 한 번 그려 본 항목은 스냅샷을 저장해 두고, 없으면 뒤에서 한 장 만들어 채운다.
import maplibregl from 'maplibre-gl';
import { buildCompareStyle } from './mapStyles';
import { addTilesLayer } from './tiles3d';

export const isTileItem = (it) => !!(it && it.tilesetUrl && it.lat != null && (it.cat === 'model3d' || it.cat === 'pointcloud'));

// ── 스냅샷 저장(메모리 + localStorage) ───────────────────────
const KEY = 'sams.tilepreview.v5'; // 시점 중심이 바뀌면 올린다(이전 스냅샷 폐기)
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

// 팝업에 넣는 미리보기 자리. live=true 면 이어서 mountLivePreview 로 작은 3D 지도를 얹는다.
export function tilePreviewHtml(it, height, live) {
  const still = getStill(it.id);
  const img = still ? `<img class="sams-tilepv-still" src="${still}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">` : '';
  const note = live ? `<div class="sams-tilepv-note" style="${HTML_NOTE}">3D 미리보기 불러오는 중…</div>` : '';
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

// 클릭 팝업: 천천히 돌아가는 작은 3D 지도. 돌려받는 함수로 정리한다.
export function mountLivePreview(popupEl, it) {
  const box = popupEl && popupEl.querySelector(`.sams-tilepv[data-id="${it.id}"]`);
  if (!box) return () => {};
  const host = box.querySelector('.sams-tilepv-map');
  const note = box.querySelector('.sams-tilepv-note');
  const handle = makePreviewMap(host, it);
  const { map } = handle;
  let alive = true;
  let raf = 0;
  let last = performance.now();
  const spin = () => {
    if (!alive) return;
    const now = performance.now();
    map.jumpTo({ bearing: (map.getBearing() + ((now - last) / 1000) * 7) % 360 });
    last = now;
    raf = requestAnimationFrame(spin);
  };
  map.once('load', () => { raf = requestAnimationFrame(spin); });
  whenLoaded(handle, 20000, () => alive).then((done) => {
    if (!alive) return;
    if (note) note.remove();
    const still = box.querySelector('.sams-tilepv-still');
    if (still) still.remove();
    if (done) { map.once('render', () => { const s = snapshot(map); if (s) putStill(it.id, s); }); map.triggerRepaint(); }
  });
  return () => { alive = false; cancelAnimationFrame(raf); try { map.remove(); } catch { /* noop */ } };
}

// ── 호버용 정지 이미지: 뒤에서 한 장씩 만든다 ─────────────────
const queue = [];
const pending = new Set();
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
    const { it, cb, wanted } = queue.shift();
    if (getStill(it.id)) { pending.delete(it.id); if (wanted()) cb(getStill(it.id)); continue; }
    if (!wanted()) { pending.delete(it.id); continue; } // 기다리는 사이 호버가 끝났으면 만들지 않는다
    let s = null;
    try { s = await generate(it); } catch (e) { console.warn('[tilePreview]', e); }
    pending.delete(it.id);
    if (s && wanted()) cb(s);
  }
  busy = false;
}

// 호버 카드에 넣을 정지 이미지를 요청한다. wanted() 가 false 가 되면(호버 종료) 아직 시작 전인 작업은 건너뛴다.
export function requestStill(it, cb, wanted) {
  if (pending.has(it.id)) return;
  pending.add(it.id);
  queue.push({ it, cb, wanted });
  pump();
}
