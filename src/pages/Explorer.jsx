import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import ConfirmDialog from '../components/ConfirmDialog';
import { AnnotationEditor, AnnotationView, AnnotationLayerPanel } from '../components/AnnotationPanel';
import { createAnnotationOverlay } from '../lib/annotationOverlay';
import { pickSurface, pickGround } from '../lib/pick3d';
import { useAnnotations, saveAnnotation, deleteAnnotation, blankAnnotation, annotationType, ANNOTATION_ADMIN, ALT_MAX, ANNO_TYPES, ANNO_TYPE_KEYS } from '../lib/annotations';
import {
  CATS, CAT_MAP, ITEMS, PERIODS, SITES, PROJECTS, EPSGS, PROJECT_LOC, structLngLat, footprintRing, COLLECTIONS, SEED_COMMENTS, itemCollections, originIdsOf, derivedIdsOf,
} from '../data/explorerData';
import { buildMainStyle, buildCompareStyle, addAssetLayers } from '../lib/mapStyles';
import { add3DLayer, addRealPointCloudLayer, addRealMeshLayer } from '../lib/three3d';
import { addTilesLayer } from '../lib/tiles3d';
import { isTileItem, tilePreviewHtml, mountLivePreview } from '../lib/tilePreview';
import { buildSpaceSites } from '../lib/spaceSites';
import { loadPointCloud } from '../lib/pointCloudAsset';
import { loadMeshAsset } from '../lib/meshAsset';
import {
  thumbHtml, wireGallery, startTurntables, wireTooltips, ensureThree, DL_SVG, CUBE_SVG, EXPAND_SVG, PLAY_SVG,
} from '../lib/popupHelpers';

// ViewCube for the 3D viewer (Figma "Spatial Log" map controls): a small cube +
// compass ring tile left of the zoom buttons that mirrors the map's bearing and
// pitch. Drag it to orbit/tilt the model by hand, click a face (TOP / FRONT /
// BACK / LEFT / RIGHT) to snap to that view, click N/E/S/W on the ring to face
// that direction. Nothing moves on its own.
const VIEWCUBE_SIDE_PITCH = 75;
const VIEWCUBE_MAX_PITCH = 80;
const VIEWCUBE_FACES = [
  { id: 'front', label: 'FRONT', t: 'translateZ(22px)', shade: '#a3a9b1', snap: { bearing: 0, pitch: VIEWCUBE_SIDE_PITCH } },
  { id: 'back', label: 'BACK', t: 'rotateY(180deg) translateZ(22px)', shade: '#8f959d', snap: { bearing: 180, pitch: VIEWCUBE_SIDE_PITCH } },
  { id: 'right', label: 'RIGHT', t: 'rotateY(90deg) translateZ(22px)', shade: '#979da5', snap: { bearing: -90, pitch: VIEWCUBE_SIDE_PITCH } },
  { id: 'left', label: 'LEFT', t: 'rotateY(-90deg) translateZ(22px)', shade: '#979da5', snap: { bearing: 90, pitch: VIEWCUBE_SIDE_PITCH } },
  { id: 'top', label: 'TOP', t: 'rotateX(90deg) translateZ(22px)', shade: '#b9bec5', snap: { pitch: 0 } },
  { id: 'bottom', label: '', t: 'rotateX(-90deg) translateZ(22px)', shade: '#7e848c', snap: null },
];
const VIEWCUBE_COMPASS = [
  { l: 'N', style: 'top:-10px;left:50%;transform:translateX(-50%);', bearing: 0 },
  { l: 'E', style: 'right:-10px;top:50%;transform:translateY(-50%);', bearing: 90 },
  { l: 'S', style: 'bottom:-10px;left:50%;transform:translateX(-50%);', bearing: 180 },
  { l: 'W', style: 'left:-10px;top:50%;transform:translateY(-50%);', bearing: 270 },
];
function createViewCubeControl() {
  let map = null; let box = null; let scene = null; let prevMaxPitch = 60;
  const sync = () => {
    if (map && scene) scene.style.transform = 'rotateX(' + (map.getPitch() - 90) + 'deg) rotateY(' + map.getBearing() + 'deg)';
  };
  const bind = (el) => {
    let sx = 0; let sy = 0; let b0 = 0; let p0 = 0; let down = false; let moved = false; let snap = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      down = true; moved = false;
      sx = e.clientX; sy = e.clientY; b0 = map.getBearing(); p0 = map.getPitch();
      const hit = e.target.closest('[data-snap]');
      snap = hit ? JSON.parse(hit.dataset.snap) : null;
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer — fine without capture */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx; const dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      map.jumpTo({ bearing: b0 + dx * 0.8, pitch: Math.max(0, Math.min(VIEWCUBE_MAX_PITCH, p0 - dy * 0.5)) });
    });
    const end = (e) => {
      if (!down) return;
      down = false;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (!moved && snap) map.easeTo({ ...snap, duration: 500 });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  return {
    onAdd(m) {
      map = m;
      prevMaxPitch = map.getMaxPitch();
      map.setMaxPitch(VIEWCUBE_MAX_PITCH);
      box = document.createElement('div');
      box.className = 'maplibregl-ctrl sams-viewcube';
      box.title = '드래그해서 회전·기울기, 면을 눌러 시점 이동';
      const ring = '<div class="sams-viewcube-ring">' + VIEWCUBE_COMPASS.map((c) => '<span data-snap=\'' + JSON.stringify({ bearing: c.bearing }) + '\' style="' + c.style + '">' + c.l + '</span>').join('') + '</div>';
      const faces = VIEWCUBE_FACES.map((f) => '<div class="sams-viewcube-face"' + (f.snap ? ' data-snap=\'' + JSON.stringify(f.snap) + '\'' : '') + ' style="transform:' + f.t + ';background:' + f.shade + ';">' + f.label + '</div>').join('');
      box.innerHTML = '<div class="sams-viewcube-scene">' + ring + '<div class="sams-viewcube-cube">' + faces + '</div></div>';
      scene = box.firstChild;
      bind(box);
      map.on('rotate', sync); map.on('pitch', sync); map.on('move', sync);
      sync();
      return box;
    },
    onRemove() {
      if (map) { map.off('rotate', sync); map.off('pitch', sync); map.off('move', sync); map.setMaxPitch(prevMaxPitch); }
      if (box && box.parentNode) box.parentNode.removeChild(box);
      map = null; scene = null;
    },
  };
}

const PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
const PANEL_WIDTH = 372;
const SHOW_LEGEND = true;

const YEARS = ['2026', '2025', '2024', '2023'];

const initialState = {
  keyword: '',
  activeCats: {},
  compareOpen: false,
  compareA: 't1',
  compareB: 't5',
  swipeX: 50,
  groupBy: 'space', // 목록은 사이트별로 묶는다(엑셀 사이트 표 순서)
  advOpen: false,
  drawerId: null,
  yearSel: {},
  periodSel: {}, // 시기(성수 클러스터 1~4차) 다중 선택
  siteSel: {}, // 사이트 다중 선택
  project: '전체 프로젝트',
  epsg: '좌표계 전체',
  boundsFilter: false,
  mapBounds: null,
  hoveredId: null,
  docHover: null,
  activeId: null,
  three3DActive: false,
  three3DTitle: '',
  basemap: '3d', // 기본 지도는 3D(위성+지형, 기울인 시점). 일반지도·위성은 우측 상단에서 바꾼다.
  toast: null,
};

const FILTER_CHIPS = CATS;
// '성수클러스터 4차'처럼 회차 이름만 있으면 어느 공간인지 알 수 없어, 공간 이름을 앞에 붙여 보여준다.
const itemName = (it) => (it.space && !it.title.includes(it.space) ? `${it.space} · ${it.title}` : it.title);

// 메모는 3D 데이터가 취득된 시기(회차)마다 따로 붙는다: 붙은 3D 자료(itemId)가 그 메모의 시기·공간이다.
// 예전 기록(itemId 없음)은 그 공간에서 열 수 있는 대표 3D 자료에 붙은 것으로 본다.
// 이벤트(공간 데이터가 없는 항목)는 원형 아이콘 대신 깃발만 쓴다.
// 지도의 깃발과 같은 모양·색(흰 테두리 + 단색). size 는 높이(px).
const MEMO_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/></svg>';
const COMPARE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/></svg>';

const FlagGlyph = ({ color, size = 28 }) => (
  <svg width={Math.round(size * 0.8)} height={size} viewBox="0 0 48 60" style={{ flex: 'none', display: 'block' }}>
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M14 56V6M14 6H42L34 17L42 28H14" fill="none" stroke="#fff" strokeWidth="8" />
      <path d="M14 56V6" stroke={color} strokeWidth="4" fill="none" />
      <path d="M14 6H42L34 17L42 28H14Z" fill={color} />
    </g>
  </svg>
);

// 아이템이 속한 사이트의 폴리곤 경계(없으면 null). 선택하면 이 영역이 화면에 잡히도록 맞춘다.
function siteBoundsOf(it) {
  const site = SITES.find((x) => x.name === it.space);
  if (!site || !site.polygon) return null;
  return site.polygon.reduce((bb, q) => bb.extend(q), new maplibregl.LngLatBounds(site.polygon[0], site.polygon[0]));
}

function threeDItemForSpace(space) {
  const list = ITEMS.filter((i) => i.space === space && i.lat != null);
  const d3 = list.filter((i) => i.cat === 'pointcloud' || i.cat === 'model3d');
  // 메모는 실제 모델 표면에 걸리므로, 렌더할 실데이터가 있는 실측 자료를 먼저 고른다(그다음 최신순).
  const rank = (i) => ((i.meshUrl || i.pointCloudUrl || i.tilesetUrl) ? 2 : 0) + (/계획/.test(i.extra || '') ? 0 : 1);
  d3.sort((a, b) => rank(b) - rank(a) || b.date.localeCompare(a.date));
  return d3[0] || list[0] || null;
}
const annoItemOf = (a) => (a.itemId && itemById(a.itemId)) || (a.space ? threeDItemForSpace(a.space) : null);

function computeFiltered(s) {
  const kw = s.keyword.trim().toLowerCase();
  const cats = Object.keys(s.activeCats).filter((k) => s.activeCats[k]);
  const ys = Object.keys(s.yearSel).filter((k) => s.yearSel[k]);
  const ps = Object.keys(s.periodSel).filter((k) => s.periodSel[k]);
  const sites = Object.keys(s.siteSel).filter((k) => s.siteSel[k]);
  const catSet = new Set(cats);
  let list = ITEMS.filter((i) => {
    if (cats.length && !catSet.has(i.cat)) return false;
    if (i.status !== 'published') return false; // 엔드유저에게는 공개된 자료만 보인다
    if (ys.length && !ys.some((y) => i.date.startsWith(y))) return false;
    if (ps.length && !ps.includes(i.period)) return false;
    if (sites.length && !sites.includes(i.space)) return false;
    if (s.project !== '전체 프로젝트' && !itemCollections(i).includes(s.project)) return false;
    if (s.epsg !== '좌표계 전체' && 'EPSG:' + i.epsg !== s.epsg) return false;
    if (kw) {
      const hay = (i.title + ' ' + i.site + ' ' + i.project + ' ' + i.desc).toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
  if (s.boundsFilter && s.mapBounds) {
    const b = s.mapBounds;
    list = list.filter((i) => i.lat == null || (i.lng >= b.w && i.lng <= b.e && i.lat >= b.s && i.lat <= b.n));
  }
  return list;
}

// Category counts respect status/year/project/keyword filters, but not the
// category selection itself — so a chip shows how many items it would add.
function computeCatCounts(s) {
  const ys = Object.keys(s.yearSel).filter((k) => s.yearSel[k]);
  const ps = Object.keys(s.periodSel).filter((k) => s.periodSel[k]);
  const sites = Object.keys(s.siteSel).filter((k) => s.siteSel[k]);
  const kw = s.keyword.trim().toLowerCase();
  const counts = {};
  CATS.forEach((c) => { counts[c.key] = 0; });
  ITEMS.forEach((i) => {
    if (i.status !== 'published') return;
    if (ys.length && !ys.some((y) => i.date.startsWith(y))) return;
    if (ps.length && !ps.includes(i.period)) return;
    if (sites.length && !sites.includes(i.space)) return;
    if (s.project !== '전체 프로젝트' && !itemCollections(i).includes(s.project)) return;
    if (kw && !(i.title + ' ' + i.site + ' ' + i.project + ' ' + i.desc).toLowerCase().includes(kw)) return;
    if (counts[i.cat] != null) counts[i.cat]++;
  });
  return counts;
}

function mchip(active) {
  return {
    display: 'inline-flex', alignItems: 'center', height: 27, padding: '0 12px', borderRadius: 20,
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500, transition: 'all .15s',
    border: active ? '1px solid var(--ant-text-heading)' : '1px solid transparent',
    background: active ? 'var(--ant-text-heading)' : 'var(--ant-bg)',
    color: active ? '#fff' : 'var(--ant-text-secondary)',
  };
}

function itemById(id) { return ITEMS.find((i) => i.id === id); }

function itemToTimelineNode(it) {
  return { id: it.id, date: it.date.replace(/-/g, '.'), label: it.title, cat: 'actual', struct: null, item: it };
}

// 시점 비교는 3D 데이터(포인트클라우드·3D 모델)만 대상으로 한다. 사진·영상·문서·이벤트 등은 제외.
function comparableNodes() {
  return ITEMS
    .filter((i) => (i.cat === 'pointcloud' || i.cat === 'model3d') && i.lat != null && (i.pointCloudUrl || i.meshUrl || i.tilesetUrl))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(itemToTimelineNode);
}

// 비교 선택지 이름: 날짜 · 공간 · 취득시기(예: 2023.09 · HQ(이마트) · 성수클러스터 1차)
const cmpNodeName = (n) => [n.date.slice(0, 7), n.item && n.item.space, n.label].filter(Boolean).join(' · ');

function cmpNodeLngLat(node) {
  return node.item ? [node.item.lng, node.item.lat] : structLngLat(node.struct);
}

function cmpPtsLabel(node) {
  return node.pc ? node.pc.pts : node.item.extra;
}

export default function Explorer({ onNavigate = () => {}, focus = null }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = (p) => setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));

  // Full-screen panorama lightbox — independent of the main state object
  // since drag-to-pan interaction doesn't need to flow through it.
  // Item detail drawer — comments live in local state so 등록 works in-session,
  // seeded with the sample threads from explorerData.
  const [comments, setComments] = useState(() => ({ ...SEED_COMMENTS }));
  const [commentDraft, setCommentDraft] = useState('');
  // 왼쪽 목록에서 접어 둔 묶음. 시기·공간 보기가 키를 섞지 않도록 보기 이름을 앞에 둔다.
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // 앱 안에서 그리는 확인 창 (브라우저 기본 confirm 은 미리보기 환경에서 즉시 취소된다)
  const [confirmState, setConfirmState] = useState(null);
  const ask = (message, onOk, extra = {}) => setConfirmState({ message, onOk, ...extra });

  // ── 메모 (3D 뷰어 위 메모·사진·파노라마) ─────────────────
  // 등록은 3D 모델이 떠 있는 이 화면에서만 한다 — 지도에서 점을 찍고 고도를 넣어 위치를 정하기 때문.
  // (목록·공개 설정·삭제는 데이터 관리 > 메모 탭에서도 다룬다.)
  const annotations = useAnnotations();
  const [annoAdd, setAnnoAdd] = useState(false);
  const [annoDraft, setAnnoDraft] = useState(null);
  const [annoViewId, setAnnoViewId] = useState(null);
  const [annoVisible, setAnnoVisible] = useState({ memo: true, photo: true, pano: true });
  const annoLayerRef = useRef(null);
  const annoAddRef = useRef(false);
  annoAddRef.current = annoAdd;


  const [panoViewer, setPanoViewer] = useState(null);
  const panoScrollRef = useRef(null);
  const openPanoViewer = (images, index, label) => setPanoViewer({ images, index, label: label || '파노라마' });
  const closePanoViewer = () => setPanoViewer(null);
  const panoViewerStep = (delta) => setPanoViewer((v) => (v ? { ...v, index: (v.index + delta + v.images.length) % v.images.length } : v));
  const beginPanoDrag = (e) => {
    const el = panoScrollRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    el.style.cursor = 'grabbing';
    const move = (ev) => { el.scrollLeft = startScroll - (ev.clientX - startX); };
    const up = () => {
      el.style.cursor = 'grab';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useEffect(() => {
    if (panoScrollRef.current) panoScrollRef.current.scrollLeft = 0;
  }, [panoViewer?.index]);

  useEffect(() => {
    if (!panoViewer) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closePanoViewer();
      else if (e.key === 'ArrowRight') panoViewerStep(1);
      else if (e.key === 'ArrowLeft') panoViewerStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoViewer]);

  // Full-screen video lightbox — the popup thumbnail only shows a short,
  // muted, looping preview; this is where the full clip actually plays.
  const [videoViewer, setVideoViewer] = useState(null);
  const openVideoViewer = (it) => setVideoViewer({ url: it.videoUrl, title: it.title });
  const closeVideoViewer = () => setVideoViewer(null);

  useEffect(() => {
    if (!videoViewer) return;
    const onKey = (e) => { if (e.key === 'Escape') closeVideoViewer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [videoViewer]);

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const hoverPopupRef = useRef(null);
  const detailPopupRef = useRef(null);
  const popupReopenRef = useRef(null);
  const markerPosRef = useRef({});
  const layersReadyRef = useRef(false);
  const lastSigRef = useRef('');
  const toastTimerRef = useRef(null);
  const navTopRef = useRef(null);
  const spaceSitesRef = useRef(null);
  const nav3DRef = useRef(null);
  const viewCtlRef = useRef(null);
  const prev3DRef = useRef(null);
  // Drawer to restore when a 3D render launched from the drawer is closed.
  const drawerReturnRef = useRef(null);
  // 연관된 데이터에서 지금 미리보기 중인 아이템 (드로어는 그대로 둔다)
  const previewIdRef = useRef(null);
  const cmpMapARef = useRef(null);
  const cmpMapBRef = useRef(null);
  const cmpLockRef = useRef(false);
  const cmpSigRef = useRef(null);

  const showToast = (msg) => {
    patch({ toast: msg });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => patch({ toast: null }), 2600);
  };

  const setFS = (id, key, val) => {
    if (!mapRef.current || !layersReadyRef.current) return;
    try { mapRef.current.setFeatureState({ source: 'assets', id }, { [key]: val }); } catch { /* noop */ }
    try { mapRef.current.setFeatureState({ source: 'footprints', id }, { [key]: val }); } catch { /* noop */ }
  };

  // Multiple items can legitimately share the exact same coordinates (e.g.
  // several scans of the same building). Left as-is, MapLibre draws them as
  // one indistinguishable dot even at max zoom — spread exact duplicates a
  // few meters apart in a small circle so each data-type color stays visible
  // once zoomed in. The jittered position each item actually renders at is
  // recorded in markerPosRef so popups/flyTo can point at the real dot
  // instead of the pre-jitter coordinate (3D anchoring still uses the true
  // it.lng/it.lat elsewhere, since that's real-world accurate data, not a
  // marker-declutter hack).
  const pushMapData = (geo) => {
    const src = mapRef.current && mapRef.current.getSource('assets');
    if (!src) return;
    const groups = new Map();
    geo.forEach((i) => {
      const key = i.lng + ',' + i.lat;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const SPREAD_M = 6;
    const features = [];
    const positions = {};
    groups.forEach((items) => {
      const n = items.length;
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((items[0].lat * Math.PI) / 180);
      items.forEach((i, idx) => {
        let [lng, lat] = [i.lng, i.lat];
        if (n > 1) {
          const angle = (2 * Math.PI * idx) / n;
          lng += (SPREAD_M * Math.cos(angle)) / mPerDegLng;
          lat += (SPREAD_M * Math.sin(angle)) / mPerDegLat;
        }
        positions[i.id] = [lng, lat];
        features.push({
          type: 'Feature', id: i.id,
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { id: i.id, color: CAT_MAP[i.cat].color, cat: i.cat },
        });
      });
    });
    markerPosRef.current = positions;
    src.setData({ type: 'FeatureCollection', features });

    // Mirror the same filtered set into the footprint source so the coverage
    // rectangles (visible past FOOTPRINT_MINZOOM) always match the list.
    const fpSrc = mapRef.current.getSource('footprints');
    if (fpSrc) {
      fpSrc.setData({
        type: 'FeatureCollection',
        features: geo
          .map((i) => ({ i, ring: footprintRing(i) }))
          .filter(({ ring }) => ring)
          .map(({ i, ring }) => ({
            type: 'Feature', id: i.id,
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: { id: i.id, color: CAT_MAP[i.cat].color },
          })),
      });
    }
  };

  // The lngLat an item's marker dot is actually rendered at right now
  // (post-jitter). Falls back to the item's true coordinates before the
  // first pushMapData call.
  const markerLngLat = (it) => markerPosRef.current[it.id] || [it.lng, it.lat];

  const showHoverCard = (it) => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverPopupRef.current) hoverPopupRef.current.remove();
    // Deliberately minimal — thumbnail + title only — so hover previews read
    // as a quick glance, clearly smaller/lighter than the click-through detail popup.
    // 미리보기 화면이 있는 자료(3D·사진·영상 등)는 썸네일 카드, 없는 것(이벤트·문서 등)은 글자 크기에 맞춘 툴팁으로 보여준다.
    const thumb = isTileItem(it) ? tilePreviewHtml(it, 124, true) : thumbHtml(it, CAT_MAP, false, 124);
    const html = thumb
      ? `<div style="width:200px;font-family:var(--ant-font-sans);">
      ${thumb}
      <div style="padding:8px 12px;">
        <div style="font-size:12px;font-weight:700;color:var(--ant-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${itemName(it)}</div>
      </div></div>`
      : `<div style="display:inline-block;padding:6px 10px;font-family:var(--ant-font-sans);font-size:13px;font-weight:700;line-height:20px;color:var(--ant-text);white-space:nowrap;">${itemName(it)}</div>`;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: thumb ? 16 : 20, maxWidth: thumb ? '220px' : 'none', anchor: 'bottom', className: thumb ? '' : 'sams-tip' })
      .setLngLat(markerLngLat(it)).setHTML(html).addTo(map);
    hoverPopupRef.current = popup;
    startTurntables(popup);
    // 3D 타일 항목은 호버 카드에서도 천천히 도는 작은 3D 로 보여준다. 마우스가 스치고 지나갈 때는 만들지 않도록
    // 잠깐(0.35초) 머문 뒤에 시작하고, 카드가 닫히면 바로 정리한다. 이전에 저장한 정지 이미지가 있으면 로드되는 동안 먼저 보인다.
    if (isTileItem(it)) {
      let dispose = null;
      const hoverTimer = setTimeout(() => {
        if (hoverPopupRef.current !== popup) return;
        dispose = mountLivePreview(popup.getElement(), it, { compact: true });
      }, 350);
      popup.on('close', () => { clearTimeout(hoverTimer); if (dispose) dispose(); });
    }
  };


  const hide3D = () => {
    const map = mapRef.current;
    if (map) {
      if (map.getLayer('sams-3d')) map.removeLayer('sams-3d');
      map.easeTo({ pitch: 55, bearing: 0, zoom: 16, duration: 900 });
    }
    patch({ three3DActive: false, three3DTitle: '' });
    setBasemap('3d');
    // If this 3D render was opened from a detail popup's "3D 보기" button,
    // bring that same popup back up in the state it was left in.
    if (popupReopenRef.current) {
      const it = popupReopenRef.current;
      popupReopenRef.current = null;
      openDetail(it);
    }
    // If it was opened from the detail drawer's 3D 렌더링 button, bring the
    // drawer back so the user lands where they left off.
    if (drawerReturnRef.current) {
      const id = drawerReturnRef.current;
      drawerReturnRef.current = null;
      patch({ drawerId: id });
      if (map) map.setPadding({ top: 0, bottom: 0, left: 0, right: 384 });
    }
  };

  const render3DAt = async (lngLat, title, color, count, H) => {
    const map = mapRef.current;
    if (!map) return;
    const ok = await ensureThree();
    if (!ok) { showToast('3D 엔진을 불러오지 못했습니다'); return; }
    if (stateRef.current.basemap !== '3d') setBasemap('3d');
    add3DLayer(maplibregl, map, color, lngLat, count, H);
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 17.5), pitch: 60, duration: 900 });
    patch({ three3DActive: true, three3DTitle: title });
  };

  const renderRealPointCloudAt = async (it) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat = [it.lng, it.lat];
    const ok = await ensureThree();
    if (!ok) { showToast('3D 엔진을 불러오지 못했습니다'); return; }
    showToast('실측 포인트클라우드 데이터를 불러오는 중…');
    const { positions, colors } = await loadPointCloud(it.pointCloudUrl);
    if (stateRef.current.basemap !== '3d') setBasemap('3d');
    addRealPointCloudLayer(maplibregl, map, lngLat, positions, colors);
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 16.6), pitch: 55, duration: 900 });
    patch({ three3DActive: true, three3DTitle: itemName(it) + ' · 실측 데이터' });
  };

  // 원본 3D Tiles 를 그대로 스트리밍해 지도 위에 올린다. 불러오지 못하면 false(기존 변환본으로 대체).
  const renderTilesAt = async (it) => {
    const map = mapRef.current;
    if (!map) return false;
    showToast('3D 타일을 불러오는 중…');
    if (stateRef.current.basemap !== '3d') setBasemap('3d');
    let failed = false;
    addTilesLayer(maplibregl, map, {
      url: it.tilesetUrl,
      lngLat: [it.lng, it.lat],
      probe: it.probe,
      onError: (err) => {
        failed = true;
        console.warn('[tiles3d] 불러오기 실패', err);
        showToast('3D 타일을 불러오지 못했습니다');
      },
    });
    const sb3 = siteBoundsOf(it);
    if (sb3) map.fitBounds(sb3, { padding: 48, maxZoom: 17.5, pitch: 55, duration: 900 });
    else map.flyTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 17), pitch: 55, duration: 900 });
    patch({ three3DActive: true, three3DTitle: itemName(it) + ' · 3D 타일' });
    return !failed;
  };

  const renderRealMeshAt = async (it) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat = [it.lng, it.lat];
    const ok = await ensureThree();
    if (!ok) { showToast('3D 엔진을 불러오지 못했습니다'); return; }
    showToast('실측 3D 메시 데이터를 불러오는 중…');
    const { positions, colors, indices } = await loadMeshAsset(it.meshUrl, it.align);
    if (stateRef.current.basemap !== '3d') setBasemap('3d');
    addRealMeshLayer(maplibregl, map, lngLat, positions, colors, indices, { followTerrain: !!(it.align && it.align.groundY != null) });
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 16.8), pitch: 55, duration: 900 });
    patch({ three3DActive: true, three3DTitle: itemName(it) + ' · 실측 메시' });
  };

  // Opening the detail drawer also drives the map to the item: zoom past the
  // footprint threshold so the real coverage area is visible, keep the item
  // centered in the space left of the floating drawer, and for scan data
  // (mesh / point cloud) render the actual 3D on the map right away.
  // 미리보기 중이던 연관 아이템의 강조와 카드를 걷어낸다.
  const clearRelatedPreview = () => {
    if (!previewIdRef.current) return;
    previewIdRef.current = null;
    if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
  };

  // 클릭하면 팝업을 거치지 않고 바로 오른쪽 상세 패널이 열린다. 마커·목록의 선택 표시도 여기서 건다.
  const openDrawer = (it) => {
    clearRelatedPreview();
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
    const prev = stateRef.current.activeId;
    if (prev && prev !== it.id) setFS(prev, 'active', false);
    if (it.lat != null) setFS(it.id, 'active', true);
    patch({ drawerId: it.id, activeId: it.id });
    const map = mapRef.current;
    if (!map) return;
    const ll = it.lat != null ? markerLngLat(it) : it.projectLat != null ? [it.projectLng, it.projectLat] : null;
    if (!ll) return;
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 384 });
    const sb = siteBoundsOf(it);
    if (sb) map.fitBounds(sb, { padding: 56, maxZoom: 18, pitch: map.getPitch(), bearing: map.getBearing(), duration: 900 });
    else map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), it.lat != null ? 17 : 16.4), duration: 900 });
  };

  // 실데이터 보기 button in the drawer header: mesh/point cloud renders in 3D
  // on the map (closing the drawer so the map gets the full width), media
  // items open their respective large viewers on top.
  // 이벤트는 그 자체로 볼 자료가 아니라 전/후 자료를 견주어 보는 것이라
  // 기존 시점 비교(스와이프)를 전후 자료로 채워 연다. 드로어에서 열었을 때만
  // 비교를 닫고 그 드로어로 되돌아간다 — 팝업에서 바로 왔다면 지도에 남는다.
  const openEventCompare = (it, { returnToDrawer = false } = {}) => {
    if (!it.compare) { showToast('비교할 자료가 연결되어 있지 않습니다'); return; }
    if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
    closeDrawer();
    drawerReturnRef.current = returnToDrawer ? it.id : null;
    patch({ compareA: it.compare.beforeId, compareB: it.compare.afterId, compareOpen: true });
  };

  const viewRealData = (it) => {
    if (it.cat === 'event') { openEventCompare(it, { returnToDrawer: true }); return; }
    if (it.meshUrl || it.pointCloudUrl || it.tilesetUrl) { closeDrawer(); drawerReturnRef.current = it.id; show3DOnMap(it); return; }
    if (it.cat === 'pano' && it.panoImages && it.panoImages.length) { openPanoViewer(it.panoImages, 0); return; }
    if (it.images && it.images.length) { openPanoViewer(it.images, 0, '이미지'); return; }
    if (it.videoUrl) { openVideoViewer(it); return; }
    showToast('표시할 실데이터가 없습니다');
  };

  const closeDrawer = () => {
    clearRelatedPreview();
    drawerReturnRef.current = null;
    if (stateRef.current.activeId) setFS(stateRef.current.activeId, 'active', false);
    patch({ drawerId: null, activeId: null });
    const map = mapRef.current;
    if (map) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  };

  const show3DOnMap = async (it, { reopenPopup } = {}) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat = it.lat != null ? [it.lng, it.lat] : it.projectLat != null ? [it.projectLng, it.projectLat] : null;
    if (!lngLat) { showToast('위치 정보가 없어 지도에 3D를 표시할 수 없습니다'); return; }
    popupReopenRef.current = reopenPopup ? it : null;
    setAnnoSpace(it.space || null);
    setAnnoItemId(it.id);
    if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    if (!(it.tilesetUrl || it.meshUrl || it.pointCloudUrl)) { showToast('이 자료는 3D로 볼 수 있는 파일이 아직 없습니다'); return; } // 가짜 3D 를 만들어 보이지 않는다
    if (it.tilesetUrl && it.lat != null && (await renderTilesAt(it))) return;
    if (it.meshUrl && it.lat != null) { await renderRealMeshAt(it); return; }
    if (it.pointCloudUrl && it.lat != null) { await renderRealPointCloudAt(it); return; }
    await render3DAt(lngLat, it.title, CAT_MAP[it.cat].color, 4600, 10.4);
  };

  const openDetail = (it, anchoredToProject, { keepDrawer } = {}) => {
    const map = mapRef.current;
    if (!it || !map) return;
    popupReopenRef.current = null;
    // A preview popup and a (possibly different item's) detail drawer open at
    // the same time reads confusingly — close the drawer when a popup opens.
    // 드로어 안 "연관된 데이터"에서 띄우는 미리보기는 드로어를 유지한다 —
    // 보고 있던 자료의 맥락 위에 곁들여 보는 것이라 서로 헷갈리지 않는다.
    if (!keepDrawer && stateRef.current.drawerId) closeDrawer();
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    if (detailPopupRef.current) detailPopupRef.current.remove();
    if (stateRef.current.activeId) setFS(stateRef.current.activeId, 'active', false);
    if (it.lat != null) setFS(it.id, 'active', true);
    patch({ activeId: it.id });
    const c = CAT_MAP[it.cat];
    const lngLat = it.lat != null ? markerLngLat(it) : [it.projectLng, it.projectLat];
    const meta = [];
    meta.push(['위치', it.site]);
    meta.push(['취득일', it.date]);
    if (it.size) meta.push(['크기', it.size]);
    if (it.epsg && it.epsg !== '—') meta.push(['좌표계', 'EPSG:' + it.epsg]);
    if (it.extra) meta.push(['규모', it.extra]);
    const metaRows = meta.map((m) => `<div style="display:flex;font-size:11.5px;line-height:1.7;"><span style="width:52px;color:var(--ant-text-tertiary);flex:none;">${m[0]}</span><span style="color:var(--ant-text);font-weight:500;">${m[1]}</span></div>`).join('');
    const projNote = anchoredToProject ? `<div style="display:flex;gap:8px;align-items:flex-start;font-size:10.5px;color:var(--ant-warning);background:var(--ant-warning-bg);border:1px solid var(--ant-warning-border);border-radius:6px;padding:5px 8px;margin:0 0 8px;">이 문헌은 좌표가 없어 프로젝트 위치에 표시됩니다.</div>` : '';
    const can3D = it.cat === 'pointcloud' || it.cat === 'model3d';
    const btn3D = can3D ? `<button data-act="show3d" data-tip="지도에서 3D 렌더링" aria-label="지도에서 3D 렌더링" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;">${CUBE_SVG}</button>` : '';
    const canPanoLarge = (it.cat === 'pano' && it.panoImages && it.panoImages.length > 0) || (it.cat === 'image' && it.images && it.images.length > 0);
    const btnPanoLargeHtml = canPanoLarge ? `<button data-act="pano-large" data-tip="크게 보기" aria-label="크게 보기" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;">${EXPAND_SVG}</button>` : '';
    const canVideoLarge = it.cat === 'video' && !!it.videoUrl;
    const btnVideoLargeHtml = canVideoLarge ? `<button data-act="video-large" data-tip="영상재생하기" aria-label="영상재생하기" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;">${PLAY_SVG}</button>` : '';
    // 이벤트는 상세를 거치지 않고 팝업에서 바로 전후 비교로 넘어간다.
    const canCompare = it.cat === 'event' && !!it.compare;
    const btnCompareHtml = canCompare ? `<button data-act="event-compare" style="flex:1;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">${EXPAND_SVG}전후 비교</button>` : '';
    // 이벤트는 내려받을 파일이 없다.
    const btnDlHtml = it.cat === 'event' ? '' : `<button data-act="download" data-tip="다운로드" aria-label="다운로드" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-border);background:var(--ant-bg);color:var(--ant-text);cursor:pointer;display:flex;align-items:center;justify-content:center;">${DL_SVG}</button>`;
    const annoCount = annotations.filter((a) => (ANNOTATION_ADMIN || a.visibility === 'public') && annoItemOf(a) && annoItemOf(a).id === it.id).length;
    const annoChipHtml = annoCount > 0 ? `<div style="display:flex;align-items:center;gap:4px;margin:-2px 0 12px;color:var(--ant-primary);font-size:11.5px;font-weight:600;">${PIN_SVG}메모 ${annoCount}건</div>` : '';
    const html = `<div style="width:236px;font-family:var(--ant-font-sans);">
      ${isTileItem(it) ? tilePreviewHtml(it, 150, true) : thumbHtml(it, CAT_MAP, true)}
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${c.color};"></span>
          <span style="font-size:11px;color:var(--ant-text-secondary);font-weight:600;">${c.label}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--ant-text);margin-bottom:7px;line-height:1.3;">${itemName(it)}</div>
        ${projNote}
        <div style="margin-bottom:10px;">${metaRows}</div>
        ${annoChipHtml}
        <div style="display:flex;gap:8px;">
          ${btn3D}
          ${btnPanoLargeHtml}
          ${btnVideoLargeHtml}
          ${btnCompareHtml}
          ${btnDlHtml}
          <button data-act="detail" style="flex:1;height:32px;border-radius:7px;border:none;background:var(--ant-primary);color:#fff;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;">상세보기 →</button>
        </div>
      </div></div>`;
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 16, maxWidth: '280px', anchor: 'bottom' })
      .setLngLat(lngLat).setHTML(html).addTo(map);
    detailPopupRef.current = popup;
    const rootEl = popup.getElement();
    const btnD = rootEl.querySelector('[data-act="detail"]');
    const btnDl = rootEl.querySelector('[data-act="download"]');
    if (btnD) btnD.addEventListener('click', () => { popup.remove(); openDrawer(it); });
    if (btnDl) btnDl.addEventListener('click', () => showToast('다운로드 시작: ' + it.title + ' (' + it.size + ')'));
    const btnCmp = rootEl.querySelector('[data-act="event-compare"]');
    if (btnCmp) btnCmp.addEventListener('click', () => { popup.remove(); openEventCompare(it); });
    const btn3d = rootEl.querySelector('[data-act="show3d"]');
    if (btn3d) btn3d.addEventListener('click', () => show3DOnMap(it, { reopenPopup: true }));
    const btnPanoLarge = rootEl.querySelector('[data-act="pano-large"]');
    if (btnPanoLarge) {
      btnPanoLarge.addEventListener('click', () => {
        const frame = rootEl.querySelector('.sams-gframe-real');
        const idx = frame ? parseInt(frame.dataset.idx, 10) || 0 : 0;
        openPanoViewer(it.panoImages || it.images, idx, it.panoImages ? '파노라마' : '이미지');
      });
    }
    const btnVideoLarge = rootEl.querySelector('[data-act="video-large"]');
    if (btnVideoLarge) btnVideoLarge.addEventListener('click', () => openVideoViewer(it));
    popup.on('close', () => {
      if (stateRef.current.activeId) setFS(stateRef.current.activeId, 'active', false);
      patch({ activeId: null });
    });
    startTurntables(popup);
    // 3D 타일 항목: 팝업 안의 작은 3D 지도(팝업을 닫으면 정리)
    if (isTileItem(it)) {
      const disposePv = mountLivePreview(rootEl, it);
      popup.on('close', disposePv);
    }
    wireGallery(rootEl, it);
    wireTooltips(rootEl);
  };

  const onMarkerEnter = (id) => {
    setFS(id, 'hover', true);
    patch({ hoveredId: id });
    // The active item already has its detail popup open — showing the hover
    // preview on top of it just duplicates the same card.
    if (id === stateRef.current.activeId) return;
    const it = itemById(id);
    if (it) showHoverCard(it);
  };
  const onMarkerLeave = () => {
    if (stateRef.current.hoveredId) setFS(stateRef.current.hoveredId, 'hover', false);
    patch({ hoveredId: null });
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
  };

  const onItemEnter = (it, e) => {
    setFS(it.id, 'hover', true);
    const p = { hoveredId: it.id };
    // Skip the hover preview for the item whose detail popup is already open
    // — otherwise both cards show at once.
    if (it.id === stateRef.current.activeId) { patch(p); return; }
    // 목록에서 오버한 항목이 지도 화면 밖(또는 미리보기 카드가 잘릴 가장자리·오른쪽 패널 뒤)에 있으면 지도를 움직여 보이게 한다.
    // 카드는 마커 위에 뜨므로 마커를 화면 중앙보다 조금 아래에 두고, 이미 충분히 안쪽에 있으면 움직이지 않는다.
    const map0 = mapRef.current;
    if (it.lat != null) {
      const ll = markerLngLat(it);
      if (map0) {
        const c = map0.getCanvas();
        const pad = map0.getPadding();
        const pt = map0.project(ll);
        const w = c.clientWidth; const h = c.clientHeight;
        const inView = pt.x > pad.left + 120 && pt.x < w - pad.right - 120 && pt.y > pad.top + 240 && pt.y < h - pad.bottom - 60;
        if (!inView) map0.easeTo({ center: ll, offset: [0, 80], duration: 600 });
      }
      showHoverCard(it);
      p.docHover = null;
    } else {
      // 좌표가 없는 문서류는 목록 옆 카드로 보여준다.
      const r = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
      p.docHover = { id: it.id, top: r ? Math.max(64, Math.min(r.top, window.innerHeight - 190)) : 120 };
    }
    patch(p);
  };
  const onItemLeave = (it) => {
    setFS(it.id, 'hover', false);
    patch({ hoveredId: null, docHover: null });
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
  };
  // 드로어의 연관된 데이터 — 누르면 드로어를 그대로 둔 채 지도만 그 아이템으로
  // 옮기고 미리보기 카드를 띄운다. 상세로 넘어가는 건 행 오른쪽 › 버튼이 맡는다.
  const previewRelated = (it) => {
    const map = mapRef.current;
    if (!map) return;
    previewIdRef.current = it.id;
    if (it.lat != null) {
      map.flyTo({ center: markerLngLat(it), zoom: Math.max(map.getZoom(), 17), duration: 650 });
      openDetail(it, false, { keepDrawer: true });
    } else if (it.projectLat != null) {
      map.flyTo({ center: [it.projectLng, it.projectLat], zoom: Math.max(map.getZoom(), 16.4), duration: 650 });
      openDetail(it, true, { keepDrawer: true });
    } else {
      previewIdRef.current = null;
      showToast('위치 정보가 없는 자료입니다');
    }
  };

  const onItemClick = (it) => {
    const map = mapRef.current;
    if (it.lat != null || it.projectLat != null) {
      openDrawer(it);
    } else {
      showToast('위치 정보 없음 — Detail 화면으로 이동합니다');
    }
  };

  // ── 기본 3D 지도의 공간 표시(라벨 + 사이트 폴리곤) ─────────────────────
  // 아무것도 선택되지 않은 기본 3D 지도에서만 보인다. 항목을 고르거나 3D 렌더링·비교에 들어가면 숨긴다.
  function initSpaceSites(map) {
    const sites = buildSpaceSites();
    // 안쪽 흰 선(line-offset)이 항상 폴리곤 안쪽으로 가도록 바깥 고리를 시계 반대 방향으로 맞춘다.
    const ccw = (ring) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return a > 0 ? ring : [...ring].reverse(); };
    const features = sites.filter((s) => s.ring).map((s) => ({ type: 'Feature', properties: { name: s.name, wide: s.name === '성수 클러스터' }, geometry: { type: 'Polygon', coordinates: [ccw(s.ring)] } }));
    map.addSource('space-sites', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({ id: 'space-sites-fill', type: 'fill', source: 'space-sites', paint: { 'fill-color': '#2f6bff', 'fill-opacity': ['case', ['get', 'wide'], 0.03, 0.1] } }, 'footprint-fill');
    map.addLayer({ id: 'space-sites-line', type: 'line', source: 'space-sites', paint: { 'line-color': '#2f6bff', 'line-opacity': 0.95, 'line-width': 3 } }, 'footprint-fill');
    // 위성·3D 지도 위에서 파란 선이 묻히지 않도록, 파란 선 안쪽에 딱 붙여(간격 0) 반투명 흰 선을 한 줄 더 긋는다. (+ 오프셋이 폴리곤 안쪽)
    map.addLayer({ id: 'space-sites-inner', type: 'line', source: 'space-sites', paint: { 'line-color': '#ffffff', 'line-opacity': 0.6, 'line-width': 2, 'line-offset': 2.5 } }, 'footprint-fill');
    const labels = sites.map((s) => {
      const el = document.createElement('div');
      el.textContent = s.name;
      el.style.cssText = 'color:#1d4ed8;font:700 12px/16px var(--ant-font-sans, sans-serif);white-space:nowrap;pointer-events:none;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 4px #fff;';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map);
      return { el, marker, name: s.name };
    });
    spaceSitesRef.current = { labels };
    syncSpaceSites();
    map.on('zoom', syncSpaceSites);
  }
  function syncSpaceSites() {
    const map = mapRef.current; const ref = spaceSitesRef.current;
    if (!map || !ref) return;
    const st = stateRef.current;
    // 아무것도 선택되지 않았으면 모든 사이트를, 항목을 골라 상세를 보는 중이면 그 사이트만(영역이 잡히게) 보여준다.
    const sel = st.drawerId ? itemById(st.drawerId) : null;
    const browsing = st.basemap === '3d' && !st.three3DActive && !st.compareOpen && map.getZoom() >= 13;
    const onAll = browsing && !st.drawerId && !st.activeId;
    const onOne = browsing && !!sel;
    const vis = onAll || onOne ? 'visible' : 'none';
    const filter = onOne ? ['==', ['get', 'name'], sel.space] : null;
    ['space-sites-fill', 'space-sites-line', 'space-sites-inner'].forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, 'visibility', vis);
      map.setFilter(id, filter);
    });
    // 위의 점선 취득 범위(footprint)와 겹쳐 보이지 않게, 공간 표시가 켜져 있을 때는 숨긴다.
    ['footprint-fill', 'footprint-line'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', onAll || onOne ? 'none' : 'visible'); });
    ref.labels.forEach((l) => { l.el.style.display = onAll || (onOne && l.name === sel.space) ? 'block' : 'none'; });
  }
  useEffect(() => { syncSpaceSites(); }, [state.basemap, state.three3DActive, state.compareOpen, state.drawerId, state.activeId]);

  function updateMapControls(v) {
    const map = mapRef.current;
    if (!map || !nav3DRef.current) return;
    const wants3D = v === '3d';
    const has3D = map.hasControl(nav3DRef.current);
    if (wants3D && !has3D) {
      if (navTopRef.current && map.hasControl(navTopRef.current)) map.removeControl(navTopRef.current);
      map.addControl(nav3DRef.current, 'bottom-right');
      if (viewCtlRef.current) map.addControl(viewCtlRef.current, 'bottom-right');
    } else if (!wants3D && has3D) {
      if (viewCtlRef.current && map.hasControl(viewCtlRef.current)) map.removeControl(viewCtlRef.current);
      map.removeControl(nav3DRef.current);
      if (navTopRef.current && !map.hasControl(navTopRef.current)) map.addControl(navTopRef.current, 'bottom-right');
    }
  }

  function setBasemap(v) {
    patch({ basemap: v });
    const map = mapRef.current;
    if (!map) return;
    const imagery = v === 'satellite' || v === '3d';
    map.setLayoutProperty('light-tiles', 'visibility', imagery ? 'none' : 'visible');
    map.setLayoutProperty('sat-tiles', 'visibility', imagery ? 'visible' : 'none');
    map.setLayoutProperty('satref-tiles', 'visibility', imagery ? 'visible' : 'none');
    if (map.getLayer('sams-3d')) {
      map.setLayoutProperty('sams-3d', 'visibility', v === 'light' ? 'none' : 'visible');
    }
    try {
      if (v === '3d') {
        map.setTerrain({ source: 'terrain', exaggeration: 1.15 });
        if (map.getPitch() < 45) map.easeTo({ pitch: 55, duration: 800 });
      } else if (!stateRef.current.three3DActive) {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      } else {
        map.setTerrain(null);
      }
    } catch { /* noop */ }
    updateMapControls(v);
  }

  const toggleCat = (k) => patch((s) => ({ activeCats: { ...s.activeCats, [k]: !s.activeCats[k] } }));
  const toggleYearSel = (k) => patch((s) => ({ yearSel: { ...s.yearSel, [k]: !s.yearSel[k] } }));
  const togglePeriodSel = (k) => patch((s) => ({ periodSel: { ...s.periodSel, [k]: !s.periodSel[k] } }));
  const toggleSiteSel = (k) => patch((s) => ({ siteSel: { ...s.siteSel, [k]: !s.siteSel[k] } }));
  const resetFilters = () => patch({ keyword: '', activeCats: {}, yearSel: {}, periodSel: {}, siteSel: {}, project: '전체 프로젝트', epsg: '좌표계 전체', boundsFilter: false });

  const toggleCompare = () => {
    // 비교를 열 때는 열려 있던 오른쪽 상세 패널과 지도 팝업을 닫는다.
    if (!stateRef.current.compareOpen) {
      if (stateRef.current.drawerId) closeDrawer();
      if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
      if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    }
    patch((s) => ({ compareOpen: !s.compareOpen }));
  };

  // 이벤트의 '전후 비교'로 열린 경우, 닫으면 그 이벤트 드로어로 되돌아간다.
  const closeCompare = () => {
    patch({ compareOpen: false });
    if (drawerReturnRef.current) {
      const id = drawerReturnRef.current;
      drawerReturnRef.current = null;
      const back = itemById(id);
      if (back) openDrawer(back);
    }
  };

  const beginSwipe = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const move = (ev) => {
      const el = document.getElementById('cmp-swipe');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = ev.clientX != null ? ev.clientX : ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0;
      let pct = ((cx - r.left) / r.width) * 100;
      pct = Math.max(4, Math.min(96, pct));
      patch({ swipeX: pct });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const selectProject = (v) => {
    const prevProject = stateRef.current.project;
    const p = { project: v };
    if (v !== prevProject) {
      // Switching projects tears down any 3D render tied to the previous
      // project's items. (시점 비교 is project-independent now, so it stays
      // open across project switches.)
      if (stateRef.current.three3DActive) p.three3DActive = false;
      const map = mapRef.current;
      if (map && map.getLayer('sams-3d')) map.removeLayer('sams-3d');
    }
    patch(p);
  };

  // ── Map lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      center: [PROJECT_LOC.lng, PROJECT_LOC.lat],
      zoom: 14.6,
      maxZoom: 20,
      attributionControl: { compact: true },
      style: buildMainStyle(),
    });
    mapRef.current = map;
    // Without a listener, MapLibre's default behavior is to console.error the
    // raw error object for any unhandled tile/glyph/source failure (e.g. a
    // transient aborted tile fetch, or a missing font weight on the demo
    // glyph server) — expected, non-fatal noise for a tile-based map. Log it
    // quietly instead so real problems are still visible without alarming spam.
    map.on('error', (e) => {
      console.warn('[maplibre]', e?.error?.message || e?.error || e);
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    navTopRef.current = map._controls[map._controls.length - 1];
    nav3DRef.current = new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true });
    viewCtlRef.current = createViewCubeControl();

    map.on('load', () => {
      addAssetLayers(map);
      layersReadyRef.current = true;
      const geo = computeFiltered(stateRef.current).filter((i) => i.lat != null);
      lastSigRef.current = geo.map((i) => i.id).join(',');
      pushMapData(geo);
      // 첫 화면부터 3D 지도(위성+지형, 기울인 시점)로 연다.
      if (stateRef.current.basemap === '3d') setBasemap('3d');
      initSpaceSites(map);
      // 처음 화면은 프로젝트 영역(모든 사이트의 폴리곤)이 한눈에 들어오게 맞춘다.
      // 멀리 떨어진 사이트(역삼·판교 등)까지 넣으면 성수가 점으로 보이므로, 첫 사이트(성수 클러스터)에서 5km 안의 사이트로 맞춘다.
      const base = SITES.find((x) => x.center);
      const near = (x) => !!x.center && !!base && Math.hypot((x.center[0] - base.center[0]) * 88.7, (x.center[1] - base.center[1]) * 111) < 5;
      const pts = SITES.filter((x) => x.polygon && near(x)).flatMap((x) => x.polygon);
      if (pts.length) {
        const b = pts.reduce((bb, q) => bb.extend(q), new maplibregl.LngLatBounds(pts[0], pts[0]));
        map.fitBounds(b, { padding: 48, pitch: 55, maxZoom: 16, duration: 0 });
      }
    });

    ['unclustered', 'event-flags'].forEach((layerId) => {
      map.on('mouseenter', layerId, (e) => { map.getCanvas().style.cursor = 'pointer'; onMarkerEnter(e.features[0].id); });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; onMarkerLeave(); });
      map.on('click', layerId, (e) => { const hit = itemById(e.features[0].id); if (hit) openDrawerRef.current(hit); });
    });
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('click', 'clusters', (e) => {
      const f = e.features[0];
      map.getSource('assets').getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
        map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.4, duration: 500 });
      });
    });
    map.on('moveend', () => {
      const b = map.getBounds();
      patch({ mapBounds: { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() } });
    });

    let ro;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => map.resize()); ro.observe(el); }

    return () => {
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push filtered geo data to the map whenever the filter-affecting state changes.
  useEffect(() => {
    if (!layersReadyRef.current) return;
    const geo = computeFiltered(state).filter((i) => i.lat != null);
    const sig = geo.map((i) => i.id).join(',');
    if (sig !== lastSigRef.current) { lastSigRef.current = sig; pushMapData(geo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.keyword, state.activeCats, state.yearSel, state.periodSel, state.siteSel, state.project, state.epsg, state.boundsFilter, state.mapBounds]);

  // While the 3D viewer is up the marker dots (clusters + 미리보기 points) would
  // float over the real-data render, so hide them and bring them back on exit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    const v = state.three3DActive ? 'none' : 'visible';
    ['clusters', 'cluster-count', 'pt-halo', 'unclustered', 'event-flags'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
    });
    if (state.three3DActive && hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
  }, [state.three3DActive]);

  // 메모 오버레이 + 3D 모델 표면 피킹.
  // 클릭 한 번으로 모델 표면의 위치·고도를 함께 잡는다(lib/pick3d). 모델을 못 맞히면 지면(고도 0)으로 대체.
  const [annoMenu, setAnnoMenu] = useState(null);
  // 지금 3D로 열린 모델이 속한 공간 — 메모는 공간에 묶여 그 공간의 모든 시기에서 보인다.
  const [annoSpace, setAnnoSpace] = useState(null);
  const annoSpaceRef = useRef(null);
  annoSpaceRef.current = annoSpace;
  // 지금 3D 로 보고 있는 자료(= 메모가 붙는 시기)
  const [annoItemId, setAnnoItemId] = useState(null);
  const annoItemIdRef = useRef(null);
  annoItemIdRef.current = annoItemId;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const overlay = createAnnotationOverlay(map, {
      onPick: (a) => {
        setAnnoDraft(null); setAnnoAdd(false); setAnnoMenu(null); setAnnoViewId(a.id);
        map.easeTo({ center: [a.lng, a.lat], duration: 600 });
      },
      onDraftDrag: (patchObj) => setAnnoDraft((d) => (d ? { ...d, ...patchObj } : d)),
    });
    annoLayerRef.current = overlay;
    const clampAlt = (v) => Math.max(0, Math.min(ALT_MAX, Math.round(v * 10) / 10));
    const surface = (px, py, ll) => pickSurface(map, px, py) || pickGround(map, px, py) || { lng: ll.lng, lat: ll.lat, alt: 0, ground: true };
    const readout = (p) => `X ${p.lng.toFixed(5)} · Y ${p.lat.toFixed(5)} · 고도 ${Math.round(p.alt)}m${p.ground ? ' (지면)' : ''}`;
    let raf = 0; let lastMove = null;
    const onMove = (e) => {
      if (!annoAddRef.current) return;
      lastMove = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!annoAddRef.current || !lastMove) return;
        const p = surface(lastMove.point.x, lastMove.point.y, lastMove.lngLat);
        overlay.setGhost(p, readout(p));
      });
    };
    const onClick = (e) => {
      if (!annoAddRef.current) return;
      const p = surface(e.point.x, e.point.y, e.lngLat);
      overlay.setGhost(null);
      setAnnoViewId(null);
      setAnnoDraft((d) => (d ? { ...d, lng: p.lng, lat: p.lat, alt: clampAlt(p.alt) } : blankAnnotation(p.lng, p.lat, clampAlt(p.alt), annoSpaceRef.current, annoItemIdRef.current)));
      setAnnoAdd(false); // 한 번 찍으면 끝 — 이후엔 핀을 끌거나 'X,Y좌표 수정'
    };
    // 오른쪽 클릭 메뉴: 위치 지정 모드를 따로 켜지 않아도 그 자리에 바로 등록.
    const cc = map.getCanvasContainer();
    let downAt = null;
    const onDown = (ev) => { if (ev.button === 2) downAt = [ev.clientX, ev.clientY]; };
    const onCtx = (ev) => {
      ev.preventDefault();
      const moved = downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 4;
      downAt = null;
      if (moved || !ANNOTATION_ADMIN || !stateRef.current.three3DActive) return;
      const b = map.getCanvas().getBoundingClientRect();
      const px = ev.clientX - b.left; const py = ev.clientY - b.top;
      const p = surface(px, py, map.unproject([px, py]));
      setAnnoMenu({ x: px, y: py, p: { lng: p.lng, lat: p.lat, alt: clampAlt(p.alt) }, ground: !!p.ground });
    };
    map.on('mousemove', onMove); map.on('click', onClick);
    cc.addEventListener('mousedown', onDown); cc.addEventListener('contextmenu', onCtx);
    return () => {
      map.off('mousemove', onMove); map.off('click', onClick);
      cc.removeEventListener('mousedown', onDown); cc.removeEventListener('contextmenu', onCtx);
      cancelAnimationFrame(raf);
      overlay.destroy(); annoLayerRef.current = null;
    };
  }, []);

  // 공간이 같은 메모만(공간 정보가 없는 예전 기록은 어디서나) — 같은 공간의 어느 시기 모델을 열어도 따라온다.
  const annoUserList = annotations.filter((a) => (ANNOTATION_ADMIN || a.visibility === 'public') && ((!a.space && !a.itemId) || (annoItemOf(a) && annoItemOf(a).id === annoItemId)));
  useEffect(() => {
    const layer = annoLayerRef.current;
    if (!layer) return;
    layer.setData(state.three3DActive ? annoUserList.filter((a) => a.lng != null && annoVisible[annotationType(a)] && !(annoDraft && annoDraft.id === a.id)) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, annoVisible, annoSpace, annoItemId, state.three3DActive, annoDraft && annoDraft.id]);
  useEffect(() => {
    const layer = annoLayerRef.current;
    if (layer) layer.setDraft(state.three3DActive && annoDraft && annoDraft.lng != null ? annoDraft : null);
  }, [annoDraft, state.three3DActive]);
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = annoAdd ? 'crosshair' : '';
    const layer = annoLayerRef.current;
    if (layer) { layer.setPicking(annoAdd); if (!annoAdd) layer.setGhost(null); }
  }, [annoAdd]);
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key !== 'Escape') return;
      setAnnoMenu(null);
      if (annoAddRef.current) setAnnoAdd(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!state.three3DActive) { setAnnoAdd(false); setAnnoDraft(null); setAnnoViewId(null); setAnnoMenu(null); }
  }, [state.three3DActive]);

  const startAnnoAdd = () => {
    if (annoAdd || annoDraft) { setAnnoAdd(false); setAnnoDraft(null); return; }
    setAnnoViewId(null);
    setAnnoAdd(true);
    showToast('3D 모델 표면을 눌러 위치를 정하세요 · 높이는 자동으로 입력됩니다');
  };
  // 상세 패널의 [메모]: 이 3D 자료를 열고 곧바로 위치 지정 모드로 들어간다.
  const memoPendingRef = useRef(null);
  const startMemoFor = (it) => {
    if (!(it.tilesetUrl || it.meshUrl || it.pointCloudUrl)) {
      // 3D 데이터가 없는 자료: 위치(좌표) 지정 없이 메모만 입력한다.
      closeDrawer();
      setAnnoSpace(it.space || null); setAnnoItemId(it.id);
      setAnnoViewId(null); setAnnoAdd(false);
      setAnnoDraft(blankAnnotation(null, null, null, it.space, it.id));
      return;
    }
    closeDrawer();
    drawerReturnRef.current = it.id;
    memoPendingRef.current = it.id;
    show3DOnMap(it);
  };
  useEffect(() => {
    if (!state.three3DActive || !memoPendingRef.current || memoPendingRef.current !== annoItemId) return;
    memoPendingRef.current = null;
    setAnnoViewId(null); setAnnoDraft(null); setAnnoAdd(true);
    showToast('3D 모델 표면을 눌러 메모 위치를 정하세요 · 높이는 자동으로 입력됩니다');
  }, [state.three3DActive, annoItemId]);
  // 위치 없는 메모를 입력·열람하던 중이면 닫을 때 그 자료의 상세 패널로 돌아간다.
  const backToDrawer = (a) => { if (a && a.lng == null) { const o = annoItemOf(a); if (o) openDrawer(o); } };
  const cancelAnno = () => { const d = annoDraft; setAnnoDraft(null); setAnnoAdd(false); backToDrawer(d); };
  const addAnnoAt = (p) => { setAnnoMenu(null); setAnnoViewId(null); setAnnoAdd(false); setAnnoDraft(blankAnnotation(p.lng, p.lat, p.alt, annoSpace, annoItemId)); };
  const saveAnno = (a) => {
    const { isNew, ...rec } = a;
    if (!rec.itemId) { const own = annoItemOf(rec); if (own) rec.itemId = own.id; }
    if (!saveAnnotation(rec)) { showToast('저장 공간이 부족합니다 · 사진 수를 줄여 주세요'); return; }
    setAnnoDraft(null); setAnnoAdd(false);
    if (rec.lng == null) backToDrawer(rec); else setAnnoViewId(rec.id);
    showToast(isNew ? '메모를 등록했습니다' : '메모를 수정했습니다');
  };
  // 미리보기: 핀을 찍은 뒤 옆(수평에 가까운 시점)에서 고도를 확인한다. 줄기가 화면에 들어오도록 줌을 고도에 맞춘다.
  const previewAnno = () => {
    const map = mapRef.current;
    if (!map || !annoDraft) return;
    setAnnoAdd(false);
    const mpp = (Math.max(annoDraft.alt, 10) * 0.98) / 300;
    const zoom = Math.max(16.5, Math.min(19.5, Math.log2((78271.517 * Math.cos((annoDraft.lat * Math.PI) / 180)) / mpp)));
    map.easeTo({ center: [annoDraft.lng, annoDraft.lat], zoom, pitch: 78, duration: 800 });
  };
  const toggleAnnoPick = () => {
    if (!annoAdd) showToast('모델 표면을 눌러 새 위치를 지정하세요 · 높이도 함께 바뀝니다');
    setAnnoAdd((v) => !v);
  };
  const editAnno = (a) => { setAnnoViewId(null); setAnnoAdd(false); setAnnoDraft({ ...a }); };
  const removeAnno = (a) => ask(`"${a.title}" 메모를 삭제할까요?`, () => { deleteAnnotation(a.id); setAnnoViewId(null); backToDrawer(a); showToast('메모를 삭제했습니다'); });
  const annoCounts = annoUserList.reduce((m, a) => { const t = annotationType(a); m[t] = (m[t] || 0) + 1; return m; }, {});
  const annoViewing = annoViewId ? annotations.find((a) => a.id === annoViewId) : null;

  // ── 2D 지도·목록·검색에서 메모으로 들어가는 길 ───────────────────
  // 메모는 3D에서만 그린다. 2D에서는 "있다"는 신호(배지·칩·검색 결과)만 보여 주고, 누르면 그 공간의 3D로 연다.
  const openSpace3D = async (space) => {
    // 그 공간에서 메모가 가장 많이 붙은 시기의 3D 로 연다(없으면 대표 3D 자료).
    const counts = {};
    annotations.filter((a) => (ANNOTATION_ADMIN || a.visibility === 'public') && a.space === space).forEach((a) => { const o = annoItemOf(a); if (o) counts[o.id] = (counts[o.id] || 0) + 1; });
    const bestId = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
    const it = (bestId && itemById(bestId)) || threeDItemForSpace(space);
    if (!it) { showToast('이 공간은 3D로 열 수 있는 자료가 없습니다'); return; }
    await show3DOnMap(it);
  };
  const openAnnotationIn3D = async (a) => {
    const map = mapRef.current;
    if (!map) return;
    if (a.lng == null) { // 위치 없는 메모: 3D 없이 메모 카드만 연다.
      const o = annoItemOf(a);
      closeDrawer(); if (o) { setAnnoSpace(o.space || null); setAnnoItemId(o.id); }
      setAnnoDraft(null); setAnnoAdd(false); setAnnoViewId(a.id);
      return;
    }
    const target = annoItemOf(a);
    if (!target) { showToast('이 메모가 붙은 3D 자료를 찾을 수 없습니다'); return; }
    if (!(stateRef.current.three3DActive && annoItemIdRef.current === target.id)) {
      // 오른쪽 패널에서 메모를 눌러 3D 로 들어가면 패널은 닫고(3D 위에 겹치지 않게), '3D 렌더링 닫기'에서 그 자료의 패널로 돌아온다.
      if (stateRef.current.drawerId) { const id = stateRef.current.drawerId; closeDrawer(); drawerReturnRef.current = id; }
      await show3DOnMap(target);
    }
    setAnnoDraft(null); setAnnoAdd(false); setAnnoMenu(null); setAnnoViewId(a.id);
    map.easeTo({ center: [a.lng, a.lat], zoom: Math.max(map.getZoom(), 18), duration: 700 });
  };
  const openSpace3DRef = useRef(openSpace3D);
  const openDrawerRef = useRef(openDrawer);
  openDrawerRef.current = openDrawer;
  openSpace3DRef.current = openSpace3D;

  // 메모는 3D 모델(자료) 안에 속한다 — 목록(시기·공간)·지도 배지에는 올리지 않고, 해당 자료의 상세 패널과 3D 뷰어에서만 보인다.

  // ── Compare mode maps ──────────────────────────────────────────
  // 시점 비교는 같은 장소의 서로 다른 시기를 견주는 것이다. A 를 고르면 B 후보는 그 사이트의 다른 3D 자료로 좁힌다.
  // 처음에는 3D 자료가 가장 많은 사이트(성수 클러스터)의 가장 이른/늦은 시기로 연다.
  function resolveCompare(idA, idB) {
    const nodes = comparableNodes();
    if (!nodes.length) return { a: null, b: null, candidatesB: [] };
    const bySite = {};
    nodes.forEach((n) => { const k = n.item.space; (bySite[k] = bySite[k] || []).push(n); });
    const richest = Object.values(bySite).sort((x, y) => y.length - x.length)[0];
    const def = richest.length >= 2 ? [richest[0], richest[richest.length - 1]] : [nodes[0], nodes[nodes.length - 1]];
    const a = nodes.find((n) => n.id === idA) || def[0];
    const same = nodes.filter((n) => n.item.space === a.item.space);
    const candidatesB = same.length >= 2 ? same : nodes;
    const b = candidatesB.find((n) => n.id === idB && n.id !== a.id) || [...candidatesB].reverse().find((n) => n.id !== a.id) || candidatesB[0];
    return { a, b, candidatesB };
  }

  function makeCmpMap(id, node, center) {
    const el = document.getElementById(id);
    if (!el || !node) return null;
    const ll = cmpNodeLngLat(node);
    const map = new maplibregl.Map({ container: el, style: buildCompareStyle(), center: center || ll, zoom: 18, pitch: 60, bearing: -22, maxPitch: 75, attributionControl: { compact: true } });
    map.on('error', (e) => {
      console.warn('[maplibre:compare]', e?.error?.message || e?.error || e);
    });
    map.on('load', async () => {
      try { map.setTerrain({ source: 'terrain', exaggeration: 1.15 }); } catch { /* noop */ }
      if (node.item && node.item.tilesetUrl) {
        addTilesLayer(maplibregl, map, { url: node.item.tilesetUrl, lngLat: ll, probe: node.item.probe, cacheMB: 256 });
      } else if (node.item && node.item.meshUrl) {
        const { positions, colors, indices } = await loadMeshAsset(node.item.meshUrl, node.item.align);
        addRealMeshLayer(maplibregl, map, ll, positions, colors, indices, { followTerrain: !!(node.item.align && node.item.align.groundY != null) });
      } else if (node.item && node.item.pointCloudUrl) {
        const { positions, colors } = await loadPointCloud(node.item.pointCloudUrl);
        addRealPointCloudLayer(maplibregl, map, ll, positions, colors);
      } else if (node.pc) {
        add3DLayer(maplibregl, map, node.pc.color, ll, Math.round(node.pc.count * 1.1 + 2600), node.pc.H * 7);
      }
    });
    return map;
  }

  function syncMaps(a, b) {
    const link = (src, dst) => src.on('move', () => {
      if (cmpLockRef.current) return;
      cmpLockRef.current = true;
      dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), pitch: src.getPitch(), bearing: src.getBearing() });
      cmpLockRef.current = false;
    });
    link(a, b); link(b, a);
  }

  function destroyCompareMaps() {
    [cmpMapARef.current, cmpMapBRef.current].forEach((m) => { if (m) { try { m.remove(); } catch { /* noop */ } } });
    cmpMapARef.current = null; cmpMapBRef.current = null;
  }

  async function initCompareMaps() {
    if (!document.getElementById('cmp-map-a')) return;
    const ok = await ensureThree();
    if (!ok) { showToast('3D 엔진을 불러오지 못했습니다'); return; }
    const { a: nodeA, b: nodeB } = resolveCompare(stateRef.current.compareA, stateRef.current.compareB);
    if (!nodeA || !nodeB) return;
    const centerA = cmpNodeLngLat(nodeA);
    cmpMapARef.current = makeCmpMap('cmp-map-a', nodeA, centerA);
    cmpMapBRef.current = makeCmpMap('cmp-map-b', nodeB, centerA);
    if (cmpMapARef.current && cmpMapBRef.current) syncMaps(cmpMapARef.current, cmpMapBRef.current);
  }

  useEffect(() => {
    if (state.compareOpen) {
      const csig = state.compareA + '|' + state.compareB;
      if (csig !== cmpSigRef.current) {
        cmpSigRef.current = csig;
        destroyCompareMaps();
        requestAnimationFrame(() => initCompareMaps());
      }
    } else if (cmpSigRef.current != null) {
      cmpSigRef.current = null;
      destroyCompareMaps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.compareOpen, state.compareA, state.compareB]);

  useEffect(() => () => { clearTimeout(toastTimerRef.current); destroyCompareMaps(); }, []);

  // 관리 페이지에서 "지도에서 자세히 보기"로 건너온 요청 — 해당 아이템의 드로어를
  // 열고 지도를 맞춘 뒤, 3D 실데이터까지 요청됐으면 바로 렌더링한다.
  // 상세보기를 열면 왼쪽 목록에서 그 항목이 접힌 묶음 안이어도 펼쳐서 보이는 곳으로 스크롤한다.
  useEffect(() => {
    const id = state.drawerId;
    if (!id) return;
    const di = itemById(id);
    if (di) {
      const gk = state.groupBy === 'space' ? `space:${di.space}` : `time:${di.period ? 'p|' + di.period : `d|${di.date}|${di.title}`}`;
      setCollapsed((prev) => { if (!prev.has(gk)) return prev; const n = new Set(prev); n.delete(gk); return n; });
    }
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-row-id="${id}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [state.drawerId]);

  // 상세 패널 상단의 3D 미리보기: 3D 타일이 있는 자료는 천천히 도는 작은 3D 지도를 올리고, 패널을 닫거나 다른 자료로 바꾸면 정리한다.
  // 컨테이너 안은 React 가 다시 그리지 않도록 비워 두고 여기서 채운다(스냅샷이 저장될 때 지도가 지워지지 않게).
  useEffect(() => {
    const it = state.drawerId ? itemById(state.drawerId) : null;
    if (!it || !isTileItem(it)) return undefined;
    let dispose = null;
    const t = setTimeout(() => {
      const box = document.querySelector('.sams-drawer-pv');
      if (!box) return;
      box.innerHTML = tilePreviewHtml(it, 180, true);
      dispose = mountLivePreview(box, it);
    }, 30);
    return () => { clearTimeout(t); if (dispose) dispose(); };
  }, [state.drawerId]);

  // 선택한 항목은 지도에서도 눈에 띄게 표시한다: 그 항목의 위치에 큰 마커와 이름표를 올린다(클러스터 숫자에 묻히지 않게).
  const selMarkerRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (selMarkerRef.current) { selMarkerRef.current.remove(); selMarkerRef.current = null; }
    const it = state.drawerId && !state.compareOpen ? itemById(state.drawerId) : null;
    if (!map || !it || it.lat == null) return undefined;
    const color = CAT_MAP[it.cat].color;
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;';
    el.innerHTML = `<div style="position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 5px ${color}44,0 2px 8px rgba(0,0,0,0.45);"></div>`
      + `<div style="position:absolute;left:0;bottom:20px;transform:translateX(-50%);padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.88);color:#fff;font:700 12px/16px var(--ant-font-sans, sans-serif);white-space:nowrap;">${itemName(it)}</div>`;
    selMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(markerLngLat(it)).addTo(map);
    return () => { if (selMarkerRef.current) { selMarkerRef.current.remove(); selMarkerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.drawerId, state.compareOpen]);

  const focusAtRef = useRef(0);
  useEffect(() => {
    if (!focus || !focus.focusItem || focus.at === focusAtRef.current) return;
    focusAtRef.current = focus.at;
    const it = itemById(focus.focusItem);
    if (!it) return;
    openDrawer(it);
    if (focus.render3D && (it.meshUrl || it.pointCloudUrl)) {
      closeDrawer();
      drawerReturnRef.current = it.id;
      show3DOnMap(it);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // The management page can rename or delete the collection currently used as
  // the filter — fall back to 전체 프로젝트 when the selection no longer exists.
  useEffect(() => {
    if (state.project !== '전체 프로젝트' && !PROJECTS.includes(state.project)) {
      patch({ project: '전체 프로젝트' });
    }
  });

  // ── Derived render data ────────────────────────────────────────
  const s = state;
  const filtered = computeFiltered(s);
  // Group results either by acquisition month (newest first) — so simultaneous
  // multi-space campaigns read as one block — or by target space, so repeated
  // acquisitions of the same place stack together.
  // 왼쪽 목록 행에 붙는 자료별 메모 건수
  const memoCountById = {};
  annotations.forEach((a) => { if (!ANNOTATION_ADMIN && a.visibility !== 'public') return; const o = annoItemOf(a); if (o) memoCountById[o.id] = (memoCountById[o.id] || 0) + 1; });
  const listGroups = (() => {
    if (s.groupBy === 'space') {
      const m = new Map();
      for (const it of filtered) {
        if (!m.has(it.space)) m.set(it.space, []);
        m.get(it.space).push(it);
      }
      return [...m.entries()]
        .map(([key, items]) => {
          const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
          return { key, icon: 'IconEnvironmentOutlined', label: key, meta: `${sorted.length}건`, items: sorted };
        })
        // Site 순서는 엑셀 사이트 표(성수 클러스터, HQ, C1 …)를 따른다.
        .sort((a, b) => { const ia = SITES.findIndex((x) => x.name === a.key); const ib = SITES.findIndex((x) => x.name === b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    }
    // 시기는 엑셀 '시기' 표의 성수 클러스터 1~4차다. 아이템 날짜가 속한 시기로 묶고(기간 밖이면 가장 가까운 시기),
    // 시기에 속하지 않는 자료(날짜 없음 등)는 아이템 이름으로 따로 둔다.
    const m = new Map();
    for (const it of filtered) {
      const key = it.period ? `p|${it.period}` : `d|${it.date}|${it.title}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(it);
    }
    return [...m.entries()]
      .map(([key, items]) => {
        const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
        const per = items[0].period ? PERIODS.find((p) => p.name === items[0].period) : null;
        return {
          key,
          icon: 'IconCalendarOutlined',
          label: items[0].period || items[0].title,
          meta: per ? `${per.start.slice(0, 7).replace('-', '.')} ~ ${per.end.slice(0, 7).replace('-', '.')}` : items[0].date,
          sortKey: per ? per.start : items[0].date,
          items: sorted,
        };
      })
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  })();
  const activeCatKeys = Object.keys(s.activeCats).filter((k) => s.activeCats[k]);
  const hasFilters = !!(s.keyword || activeCatKeys.length || Object.values(s.yearSel).some(Boolean) || Object.values(s.periodSel).some(Boolean) || Object.values(s.siteSel).some(Boolean) || s.project !== '전체 프로젝트' || s.epsg !== '좌표계 전체' || s.boundsFilter);
  const catCounts = computeCatCounts(s);

  let boundsNotice = '';
  if (s.boundsFilter) {
    const outCount = ITEMS.filter((i) => i.lat != null).length - filtered.filter((i) => i.lat != null).length;
    boundsNotice = '현재 지도 범위에 맞춰 필터링 중' + (outCount > 0 ? ' · 범위 밖 ' + outCount + '건 숨김' : '');
  }

  const cmpNodesAll = comparableNodes();
  const hasCompare = cmpNodesAll.length >= 2;
  const { a: cmpNodeA, b: cmpNodeB, candidatesB: cmpCandidatesB } = resolveCompare(s.compareA, s.compareB);

  let docHoverItem = null;
  if (s.docHover) docHoverItem = itemById(s.docHover.id);

  return (
    <div
      className="ant-app"
      style={{
        height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ant-bg-layout)', color: 'var(--ant-text)', overflow: 'hidden',
        '--ant-primary': '#0958d9', '--ant-primary-hover': '#1677ff', '--ant-primary-active': '#003eb3',
      }}
    >
      {/* Header */}
      <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 44, padding: '0 20px', background: 'var(--ant-bg)', borderBottom: '1px solid var(--ant-border-secondary)', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <Logo onClick={() => onNavigate('explorer')} />
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%', flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--ant-text-heading)', background: '#ECEEFC' }}>데이터 탐색</div>
          <div onClick={() => onNavigate('manage')} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--ant-text-secondary)', cursor: 'pointer' }}>데이터 관리</div>
          {!!focus && (
            <button onClick={() => onNavigate('manage')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', marginLeft: 4, borderRadius: 15, border: '1px solid var(--ant-primary)', background: 'rgba(22,119,255,0.07)', color: 'var(--ant-primary)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'flex', transform: 'rotate(90deg)' }}><Icon name="IconDownOutlined" size={10} /></span>
              데이터 관리로 돌아가기
            </button>
          )}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            title="로그아웃"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 8 }}
          >
            <Icon name="IconLogoutOutlined" size={16} />LOGOUT
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left panel */}
        <aside style={{ width: PANEL_WIDTH, flex: 'none', background: 'var(--ant-bg)', borderRight: '1px solid var(--ant-border-secondary)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--ant-border-secondary)', flex: 'none', background: 'linear-gradient(120deg, #F1F2F4 0%, #EBECEF 50%, #E4E5E8 100%)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)' }}>Project</span>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <select value={s.project} onChange={(e) => selectProject(e.target.value)} style={{ width: '100%', height: 32, border: '1px solid var(--ant-border)', borderRadius: 8, padding: '0 32px 0 12px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'var(--ant-bg)', appearance: 'none', cursor: 'pointer', outline: 'none' }}>
                    {PROJECTS.map((p) => <option key={p} value={p}>{p === '전체 프로젝트' ? '전체 Project' : p}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ant-text-tertiary)', display: 'flex' }}><Icon name="IconDownOutlined" size={11} /></span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <span style={{ position: 'absolute', left: 8, display: 'flex', color: 'var(--ant-text-tertiary)', pointerEvents: 'none' }}>
                    <Icon name="IconSearchOutlined" size={14} />
                  </span>
                  <input
                    value={s.keyword}
                    onChange={(e) => patch({ keyword: e.target.value })}
                    placeholder="이름 · 제목 검색"
                    style={{ width: '100%', height: 32, padding: '0 28px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--ant-text)' }}
                  />
                  {!!s.keyword && (
                    <span onClick={() => patch({ keyword: '' })} style={{ position: 'absolute', right: 8, color: 'var(--ant-text-tertiary)', display: 'flex', cursor: 'pointer' }}>
                      <Icon name="IconCloseCircleOutlined" size={14} />
                    </span>
                  )}
                </div>
                <button onClick={() => patch({ advOpen: !s.advOpen })} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px', border: 'none', borderRadius: 8, background: 'transparent', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--ant-text-secondary)' }}>
                  세부 검색
                  {(Object.values(s.periodSel).some(Boolean) || Object.values(s.siteSel).some(Boolean)) && !s.advOpen && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ant-primary)' }} />
                  )}
                  <span style={{ display: 'flex', transform: s.advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                    <Icon name="IconDownOutlined" size={10} />
                  </span>
                </button>
              </div>
              {!s.advOpen && (() => {
                // 세부 검색을 접어 둔 동안 걸려 있는 필터를 칩으로 보여 주고, ×로 하나씩 풀 수 있다.
                const applied = [
                  ...Object.keys(s.siteSel).filter((k) => s.siteSel[k]).map((k) => ({ key: 's:' + k, label: k, off: () => toggleSiteSel(k) })),
                  ...Object.keys(s.periodSel).filter((k) => s.periodSel[k]).map((k) => ({ key: 'p:' + k, label: k, off: () => togglePeriodSel(k) })),
                  ...Object.keys(s.activeCats).filter((k) => s.activeCats[k]).map((k) => ({ key: 'c:' + k, label: (CAT_MAP[k] || {}).label || k, off: () => toggleCat(k) })),
                ];
                if (!applied.length) return null;
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
                    {applied.map((a) => (
                      <span key={a.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 4px 0 8px', borderRadius: 11, fontSize: 11, fontWeight: 600, color: 'var(--ant-primary)', background: 'var(--ant-primary-bg)', border: '1px solid var(--ant-primary)' }}>
                        {a.label}
                        <span onClick={a.off} title="필터 해제" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 2 }}><Icon name="IconCloseOutlined" size={9} /></span>
                      </span>
                    ))}
                  </div>
                );
              })()}
              {s.advOpen && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ant-text-secondary)', marginBottom: 5, fontWeight: 700 }}>
                    사이트 <span style={{ color: 'var(--ant-text-quaternary)', fontWeight: 500 }}>· 복수 선택</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button onClick={() => patch({ siteSel: {} })} style={mchip(!Object.values(s.siteSel).some(Boolean))}>전체</button>
                    {SITES.map((st) => (
                      <button key={st.name} onClick={() => toggleSiteSel(st.name)} style={mchip(!!s.siteSel[st.name])}>{st.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {s.advOpen && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ant-text-secondary)', marginBottom: 5, fontWeight: 700 }}>
                    시기 <span style={{ color: 'var(--ant-text-quaternary)', fontWeight: 500 }}>· 복수 선택</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button onClick={() => patch({ periodSel: {} })} style={mchip(!Object.values(s.periodSel).some(Boolean))}>전체</button>
                    {PERIODS.map((p) => (
                      <button key={p.name} onClick={() => togglePeriodSel(p.name)} style={mchip(!!s.periodSel[p.name])}>{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {s.advOpen && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ant-text-secondary)', marginBottom: 5, fontWeight: 700 }}>데이터 유형</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FILTER_CHIPS.map((c) => {
                    const on = !!s.activeCats[c.key];
                    const count = catCounts[c.key];
                    return (
                  <button key={c.key} onClick={() => toggleCat(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 9px', borderRadius: 20, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500, border: `1px solid ${on ? c.color : 'transparent'}`, background: on ? c.color + '14' : 'var(--ant-bg)', color: on ? c.color : 'var(--ant-text-secondary)' }}>
                    {c.key === 'event' ? <FlagGlyph color={c.color} size={16} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flex: 'none' }} />}
                    {c.label}
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 1, color: on ? c.color : 'var(--ant-text-tertiary)', opacity: count === 0 ? 0.45 : 1 }}>{count}</span>
                  </button>
                    );
                  })}
                </div>
                </div>
              )}
            </div>

          </div>

          {s.project !== '전체 프로젝트' && (
            <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--ant-border-secondary)', flex: 'none', background: 'var(--ant-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.project}</span>
              </div>
              {COLLECTIONS[s.project]?.desc && (
                <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ant-text-secondary)' }}>{COLLECTIONS[s.project].desc}</div>
              )}
            </div>
          )}

          <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--ant-border-secondary)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>결과 {filtered.length}건</span>
            <div style={{ position: 'relative', display: 'inline-flex', height: 28, padding: 2, borderRadius: 14, background: 'var(--ant-fill-quaternary)', border: '1px solid var(--ant-border-secondary)', boxSizing: 'border-box' }}>
              {[['space', '사이트별'], ['time', '시기별']].map(([key, label]) => {
                const on = s.groupBy === key;
                return (
                  <button key={key} onClick={() => patch({ groupBy: key })} style={{ height: 22, margin: 0, padding: '0 12px', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 11, boxSizing: 'border-box', border: 'none', background: on ? 'var(--ant-bg)' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.14)' : 'none', color: on ? 'var(--ant-text)' : 'var(--ant-text-tertiary)', transition: 'color .2s, background .2s, box-shadow .2s' }}>
                    {label}
                  </button>
                );
              })}
            </div>
            {hasFilters && <button onClick={resetFilters} style={{ fontSize: 11, color: 'var(--ant-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>필터 초기화</button>}
            {hasCompare && (
              <button onClick={toggleCompare} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${s.compareOpen ? 'var(--ant-primary)' : 'var(--ant-border)'}`, background: s.compareOpen ? 'var(--ant-primary)' : 'var(--ant-bg)', color: s.compareOpen ? '#fff' : 'var(--ant-text-secondary)' }}>
                시점 비교
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 16px' }}>
            {!!boundsNotice && <div style={{ fontSize: 11, color: 'var(--ant-warning)', background: 'var(--ant-warning-bg)', border: '1px solid var(--ant-warning-border)', borderRadius: 6, padding: '6px 9px', margin: '4px 4px 8px' }}>{boundsNotice}</div>}
            {listGroups.map((g) => {
              const groupKey = `${s.groupBy}:${g.key}`;
              const isOpen = !collapsed.has(groupKey);
              return (
              <div key={g.key} style={{ marginBottom: 12 }}>
                <div onClick={() => toggleGroup(groupKey)} title={isOpen ? '접기' : '펼치기'}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 4px', cursor: 'pointer', borderRadius: 8 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--ant-primary)' }}>
                    <Icon name={g.icon} size={14} />
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ant-primary)' }}>{g.label}</span>
                  {g.meta && <span style={{ fontSize: 11, color: 'var(--ant-text-quaternary)' }}>{g.meta}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', color: 'var(--ant-text-quaternary)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .18s' }}>
                    <Icon name="IconDownOutlined" size={10} />
                  </span>
                </div>
                <div style={{ marginLeft: 12, paddingLeft: 8, borderLeft: '2px solid var(--ant-border-secondary)', display: isOpen ? 'block' : 'none' }}>
                  {g.items.map((it) => {
                    const c = CAT_MAP[it.cat];
                    const isActive = s.activeId === it.id || s.drawerId === it.id;
                    const isHover = s.hoveredId === it.id;
                    let rowBg = 'transparent';
                    if (isActive) { rowBg = '#ECEEFC'; }
                    else if (isHover) { rowBg = 'var(--ant-fill-quaternary)'; }
                    const noGeo = it.lat == null;
                    const memoN = memoCountById[it.id] || 0;
                    return (
                      <div key={it.id} data-row-id={it.id} onMouseEnter={(e) => onItemEnter(it, e)} onMouseLeave={() => onItemLeave(it)} onClick={() => onItemClick(it)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px', borderRadius: 8, cursor: 'pointer', background: rowBg, marginBottom: 4 }}>
                        {it.cat === 'event' ? <div style={{ width: 28, height: 28, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FlagGlyph color={c.color} size={26} /></div> : (
                        <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color, boxShadow: `0 1px 3px ${c.color}55` }}>
                          <Icon name={c.icon} size={15} />
                        </div>)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.groupBy === 'space' ? it.title : itemName(it)}</span>
                            {memoN > 0 && (
                              <span title={`메모 ${memoN}건`} style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--ant-primary)' }}>
                                <span style={{ display: 'flex' }} dangerouslySetInnerHTML={{ __html: MEMO_SVG.replace(/width="14" height="14"/, 'width="16" height="16"') }} />{memoN}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ant-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[it.date, it.size, it.extra].filter((v) => v && v !== '—').join(' · ')}
                          </div>
                        </div>
                        <span style={{ flex: 'none', display: 'flex', alignItems: 'center', color: noGeo ? 'var(--ant-text-quaternary)' : c.color + '88' }}>
                          <Icon name={noGeo ? 'IconFileSearchOutlined' : 'IconEnvironmentOutlined'} size={13} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </aside>

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, background: '#eaeef2' }}>
          <div ref={mapElRef} id="sams-map" style={{ position: 'absolute', inset: 0 }} />

          {/* Item detail drawer */}
          {(() => {
            const dit = s.drawerId && !s.compareOpen ? itemById(s.drawerId) : null; // 비교 모드에서는 오른쪽 패널을 숨긴다
            const dc = dit ? CAT_MAP[dit.cat] : null;
            // Same per-type naming/icon as the map preview popup buttons.
            const viewMeta = !dit ? null
              : dit.cat === 'event' && dit.compare ? { label: '전후 비교', svg: EXPAND_SVG }
              : dit.meshUrl || dit.pointCloudUrl || dit.tilesetUrl ? { label: '3D 렌더링', svg: CUBE_SVG }
              : dit.videoUrl ? { label: '영상재생하기', svg: PLAY_SVG }
              : (dit.panoImages && dit.panoImages.length) || (dit.images && dit.images.length) ? { label: '크게 보기', svg: EXPAND_SVG }
              : null;
            // 연관된 데이터 = 같은 공간의 아이템 + 파생 관계(원본/파생)로 연결된
            // 아이템. 연결 편집은 데이터 관리 페이지에서 한다.
            const sameSpace = dit ? ITEMS.filter((i) => i.id !== dit.id && i.space === dit.space) : [];
            const relKind = (id) => (dit && originIdsOf(dit.id).includes(id) ? 'origin' : dit && derivedIdsOf(dit.id).includes(id) ? 'derived' : null);
            const linked = dit ? [...originIdsOf(dit.id), ...derivedIdsOf(dit.id)].map(itemById).filter(Boolean).filter((i) => !sameSpace.some((ss) => ss.id === i.id)) : [];
            const related = [...sameSpace, ...linked];
            const thread = dit ? comments[dit.id] || [] : [];
            const addComment = () => {
              const t = commentDraft.trim();
              if (!t || !dit) return;
              setComments((c) => ({ ...c, [dit.id]: [...(c[dit.id] || []), { author: '나', date: new Date().toISOString().slice(0, 10), text: t }] }));
              setCommentDraft('');
            };
            const removeComment = (idx) => {
              if (!dit) return;
              ask('이 코멘트를 삭제할까요?', () => {
                setComments((c) => ({ ...c, [dit.id]: (c[dit.id] || []).filter((_, i) => i !== idx) }));
              });
            };
            return (
              <div style={{ position: 'absolute', top: 12, right: 12, width: 360, maxHeight: 'calc(100% - 24px)', zIndex: 30, background: 'rgba(255,255,255,0.90)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 16, border: '1px solid var(--ant-border-secondary)', boxShadow: '0 8px 28px rgba(0,0,0,0.16)', overflow: 'hidden', transform: dit ? 'translateX(0)' : 'translateX(calc(100% + 24px))', transition: 'transform .28s cubic-bezier(.4,0,.2,1)', display: 'flex', flexDirection: 'column', pointerEvents: dit ? 'auto' : 'none' }}>
                {dit && (
                  <>
                                        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--ant-border-secondary)', flex: 'none', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {dit.cat === 'event' ? <FlagGlyph color={dc.color} size={28} /> : (
                        <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: dc.color }}>
                          <Icon name={dc.icon} size={15} />
                        </div>)}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: 'var(--ant-text)', wordBreak: 'keep-all' }}>{itemName(dit)}</span>
                        <button onClick={closeDrawer} aria-label="닫기" style={{ flex: 'none', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ant-text-secondary)', cursor: 'pointer' }}>
                          <Icon name="IconCloseOutlined" size={14} />
                        </button>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ant-text-tertiary)' }}>
                        {dc.label} · {dit.date}
                      </div>
                      {isTileItem(dit) && <div className="sams-drawer-pv" key={'pv-' + dit.id} style={{ height: 180, marginTop: 12, borderRadius: 12, overflow: 'hidden', background: '#0b1118' }} />}
                      <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 4 }}>
                        {viewMeta && (
                          <button onClick={() => viewRealData(dit)} style={{ flex: 1, minWidth: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 64, padding: '0 8px', borderRadius: 12, border: 'none', background: '#F3F4FD', color: 'var(--ant-primary)', fontSize: 11.5, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E6FA'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F4FD'; }}>
                            <span style={{ display: 'flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: viewMeta.svg }} />
                            {viewMeta.label}
                          </button>
                        )}
                        {isTileItem(dit) && (
                          <button onClick={() => { closeDrawer(); patch({ compareA: dit.id, compareB: null, compareOpen: true }); }} style={{ flex: 1, minWidth: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 64, padding: '0 8px', borderRadius: 12, border: 'none', background: '#F3F4FD', color: 'var(--ant-primary)', fontSize: 11.5, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E6FA'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F4FD'; }}>
                            <span style={{ display: 'flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: COMPARE_SVG }} />
                            시점 비교
                          </button>
                        )}
                        {(
                          <button onClick={() => startMemoFor(dit)} style={{ flex: 1, minWidth: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 64, padding: '0 8px', borderRadius: 12, border: 'none', background: '#F3F4FD', color: 'var(--ant-primary)', fontSize: 11.5, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E6FA'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F4FD'; }}>
                            <span style={{ display: 'flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: MEMO_SVG }} />
                            메모 작성
                          </button>
                        )}
                        {dit.cat !== 'event' && (
                        <button onClick={() => showToast(`다운로드 시작: ${dit.title} (${dit.size})`)} style={{ flex: 1, minWidth: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 64, padding: '0 8px', borderRadius: 12, border: 'none', background: '#F3F4FD', color: 'var(--ant-primary)', fontSize: 11.5, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E6FA'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#F3F4FD'; }}>
                          <span style={{ display: 'flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: DL_SVG }} />
                          다운로드
                        </button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 20px', background: 'linear-gradient(120deg, #F1F2F4 0%, #EBECEF 50%, #E4E5E8 100%)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', marginBottom: 8 }}>상세 설명</div>
                      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', padding: 12 }}>
                        {dit.detail && dit.detail.length ? (
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <tbody>
                              {dit.detail.map(([k, v]) => (
                                <tr key={k}>
                                  <td style={{ padding: '4px 0', color: 'var(--ant-text-tertiary)', width: 88, verticalAlign: 'top' }}>{k}</td>
                                  <td style={{ padding: '4px 0', color: 'var(--ant-text)', wordBreak: 'break-all', lineHeight: 1.5 }}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <>
                          {dit.desc && <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ant-text)' }}>{dit.desc}</div>}
                        <table style={{ width: '100%', marginTop: dit.desc ? 12 : 0, fontSize: 12, borderCollapse: 'collapse' }}>
                          <tbody>
                            {[['위치', dit.site], ['취득일', dit.date], ['크기', dit.size], ['규모', dit.extra], ['좌표계', dit.epsg && dit.epsg !== '—' ? `EPSG:${dit.epsg}` : ''], ['좌표값', dit.lat != null ? `${dit.lat.toFixed(6)}, ${dit.lng.toFixed(6)}` : '']].filter(([, v]) => v).map(([k, v]) => (
                              <tr key={k}>
                                <td style={{ padding: '4px 0', color: 'var(--ant-text-tertiary)', width: 64, verticalAlign: 'top' }}>{k}</td>
                                <td style={{ padding: '4px 0', color: 'var(--ant-text)' }}>{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                          </>
                        )}
                      </div>

                      {(() => {
                        // 이 3D 자료 안에 속한 메모(자료 = 취득 시기마다 따로 붙는다)
                        const mine = annotations.filter((x) => (ANNOTATION_ADMIN || x.visibility === 'public') && annoItemOf(x) && annoItemOf(x).id === dit.id);
                        if (!mine.length) return null;
                        return (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', margin: '20px 0 8px' }}>메모 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {mine.length}건</span></div>
                            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', padding: 4 }}>
                              {mine.map((x) => {
                                const t = ANNO_TYPES[annotationType(x)];
                                return (
                                  <div key={x.id} onClick={() => openAnnotationIn3D(x)} title={x.lng == null ? '메모 보기' : '3D에서 보기'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', borderRadius: 8, cursor: 'pointer' }}
                                    onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                                    onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}>
                                    <img src={t.poi} alt={t.label} width={24} height={24} draggable={false} style={{ flex: 'none', display: 'block' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title}</div>
                                      <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[t.label, `고도 ${x.alt}m`, x.tags.join(' ')].filter(Boolean).join(' · ')}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}

                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', margin: '20px 0 8px' }}>담긴 Project</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {itemCollections(dit).map((cn) => {
                          const on = s.project === cn;
                          return (
                            <button key={cn} onClick={() => selectProject(on ? '전체 프로젝트' : cn)} title={COLLECTIONS[cn]?.desc || cn}
                              style={{ height: 28, padding: '0 12px', borderRadius: 14, border: `1px solid ${on ? 'var(--ant-primary)' : 'var(--ant-border)'}`, background: on ? 'var(--ant-primary)' : 'var(--ant-bg)', color: on ? '#fff' : 'var(--ant-text)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                              {cn}
                            </button>
                          );
                        })}
                      </div>

                      {thread.length > 0 && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', margin: '20px 0 8px' }}>코멘트 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {thread.length}건</span></div>
                      )}
                      {thread.map((cm, i) => (
                        <div key={i} style={{ padding: '8px 12px', borderRadius: 12, background: '#fff', border: '1px solid var(--ant-border-secondary)', marginBottom: 8 }}
                          onMouseEnter={(e) => { const x = e.currentTarget.querySelector('[data-cm-del]'); if (x) x.style.opacity = '1'; }}
                          onMouseLeave={(e) => { const x = e.currentTarget.querySelector('[data-cm-del]'); if (x) x.style.opacity = '0'; }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ant-text)' }}>{cm.author}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--ant-text-quaternary)' }}>{cm.date}</span>
                            <span data-cm-del onClick={() => removeComment(i)} title="코멘트 삭제"
                              style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: 4, margin: -4, color: 'var(--ant-text-quaternary)', cursor: 'pointer', opacity: 0, transition: 'opacity .15s' }}>
                              <Icon name="IconCloseOutlined" size={10} />
                            </span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--ant-text-secondary)' }}>{cm.text}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--ant-border-secondary)', flex: 'none', display: 'flex', gap: 8 }}>
                      <input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        // 한글 입력은 마지막 글자가 조합 중일 때도 Enter 가 먼저 들어온다.
                        // 그대로 등록하면 조합이 뒤늦게 확정되며 끝 글자가 한 번 더 남는다.
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment(); }}
                        placeholder="코멘트 입력"
                        style={{ flex: 1, minWidth: 0, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--ant-text)' }}
                      />
                      <button onClick={addComment} style={{ flex: 'none', height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--ant-primary)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>등록</button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 4, display: 'flex', background: 'var(--ant-bg)', borderRadius: 9, padding: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: '1px solid var(--ant-border-secondary)' }}>
            {[['3d', '3D', 'IconBoxPlotOutlined'], ['light', '일반지도', 'IconEnvironmentOutlined'], ['satellite', '위성', null]].map(([key, label, icon]) => {
              const on = s.basemap === key;
              return (
                <button key={key} onClick={() => setBasemap(key)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 12px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--ant-primary)' : 'transparent', color: on ? '#fff' : 'var(--ant-text-secondary)' }}>
                  {icon ? <Icon name={icon} size={14} /> : (
                    // 위성: 14px 에서도 선이 뭉개지지 않도록 굵은 선(stroke)으로 그린 지구본
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ display: 'block', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19" /><path d="M12 2.5c3 2.6 4.4 5.8 4.4 9.5S15 18.9 12 21.5c-3-2.6-4.4-5.8-4.4-9.5S9 5.1 12 2.5z" />
                    </svg>
                  )}{label}
                </button>
              );
            })}
          </div>

          {!s.three3DActive && (
            <button onClick={() => patch({ boundsFilter: !s.boundsFilter })} style={{ position: 'absolute', top: 12, left: 12, zIndex: 4, display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: `1px solid ${s.boundsFilter ? 'var(--ant-primary)' : 'var(--ant-border-secondary)'}`, background: s.boundsFilter ? 'var(--ant-primary)' : 'var(--ant-bg)', color: s.boundsFilter ? '#fff' : 'var(--ant-text-secondary)' }}>
              <Icon name="IconBorderOuterOutlined" size={14} />이 지역으로 검색
            </button>
          )}

          {s.three3DActive && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 6, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(15,20,28,0.82)', backdropFilter: 'blur(6px)', color: '#fff', padding: '7px 8px 7px 14px', borderRadius: 10, boxShadow: '0 6px 22px rgba(0,0,0,0.35)' }}>
              <span title="지도 위 3D 렌더링" style={{ width: 7, height: 7, borderRadius: '50%', background: '#4096ff', boxShadow: '0 0 8px #4096ff', cursor: 'help' }} />
              <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.three3DTitle}</span>
              <button onClick={hide3D} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 11px', border: 'none', borderRadius: 7, background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Icon name="IconCloseOutlined" size={11} />3D 렌더링 닫기
              </button>
              {ANNOTATION_ADMIN && (
                <button onClick={startAnnoAdd} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 26, padding: '0 11px', border: 'none', borderRadius: 7, background: annoAdd || annoDraft ? '#1677ff' : 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>{annoAdd ? '위치 지정 중…' : annoDraft ? '입력 취소' : '메모 추가'}
                </button>
              )}
            </div>
          )}

          {s.three3DActive && annoMenu && (
            <div onMouseDown={() => setAnnoMenu(null)} onContextMenu={(ev) => { ev.preventDefault(); setAnnoMenu(null); }} style={{ position: 'absolute', inset: 0, zIndex: 9 }}>
              <div onMouseDown={(ev) => ev.stopPropagation()} style={{ position: 'absolute', left: annoMenu.x, top: annoMenu.y, background: '#fff', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.25)', padding: 4, minWidth: 190, fontFamily: 'var(--ant-font-sans)' }}>
                <button onClick={() => addAnnoAt(annoMenu.p)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }} onMouseEnter={(ev) => { ev.currentTarget.style.background = '#e6f4ff'; }} onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#383f43' }}>여기에 메모 추가</span>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>고도 {Math.round(annoMenu.p.alt)}m{annoMenu.ground ? ' · 지면' : ' · 모델 표면'}</span>
                </button>
              </div>
            </div>
          )}
          {s.three3DActive && <AnnotationLayerPanel counts={annoCounts} visible={annoVisible} onToggle={(k) => setAnnoVisible((v) => ({ ...v, [k]: !v[k] }))} />}
          {(s.three3DActive || (annoDraft && annoDraft.lng == null)) && annoDraft && <AnnotationEditor key={annoDraft.id} draft={annoDraft} onChange={(patchObj) => setAnnoDraft((d) => ({ ...d, ...patchObj }))} onSave={saveAnno} onCancel={cancelAnno} picking={annoAdd} onPickCoord={toggleAnnoPick} onPreview={previewAnno} />}
          {(s.three3DActive || (annoViewing && annoViewing.lng == null)) && !annoDraft && annoViewing && <AnnotationView key={annoViewing.id} a={annoViewing} admin={ANNOTATION_ADMIN} onClose={() => { const v = annoViewing; setAnnoViewId(null); backToDrawer(v); }} onEdit={() => editAnno(annoViewing)} onDelete={() => removeAnno(annoViewing)} onOpenImages={openPanoViewer} />}

          {s.compareOpen && cmpNodeA && cmpNodeB && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 6, background: '#0b0f16' }}>
              <div id="cmp-swipe" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                <div id="cmp-map-a" style={{ position: 'absolute', inset: 0 }} />
                <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${s.swipeX}%)` }}>
                  <div id="cmp-map-b" style={{ position: 'absolute', inset: 0 }} />
                </div>
                <div onPointerDown={beginSwipe} style={{ position: 'absolute', top: 0, bottom: 0, left: `${s.swipeX}%`, width: 0, zIndex: 4, cursor: 'ew-resize', touchAction: 'none' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1.5, width: 3, background: 'rgba(255,255,255,0.92)', boxShadow: '0 0 8px rgba(0,0,0,0.45)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: -19, width: 38, height: 38, transform: 'translateY(-50%)', borderRadius: '50%', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ant-primary)' }}>
                    <Icon name="IconSwapRightOutlined" size={19} />
                  </div>
                </div>
                <button onClick={closeCompare} style={{ position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 13px', border: 'none', borderRadius: 8, background: 'rgba(15,20,28,0.85)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <Icon name="IconCloseOutlined" size={13} />비교 닫기
                </button>
                <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--ant-primary)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>A</span>
                  <select value={cmpNodeA.id} onChange={(e) => patch({ compareA: e.target.value })} style={{ height: 32, maxWidth: 320, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'rgba(255,255,255,0.96)', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                    {cmpNodesAll.map((n) => <option key={n.id} value={n.id}>{cmpNodeName(n)}</option>)}
                  </select>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{cmpPtsLabel(cmpNodeA)}</span>
                </div>
                <div style={{ position: 'absolute', top: 14, left: `calc(${s.swipeX}% + 14px)`, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#722ed1', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>B</span>
                  <select value={cmpNodeB.id} onChange={(e) => patch({ compareB: e.target.value })} style={{ height: 32, maxWidth: 320, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'rgba(255,255,255,0.96)', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                    {cmpCandidatesB.map((n) => <option key={n.id} value={n.id}>{cmpNodeName(n)}</option>)}
                  </select>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{cmpPtsLabel(cmpNodeB)}</span>
                </div>
              </div>
            </div>
          )}

          {SHOW_LEGEND && (
            <div style={{ position: 'absolute', bottom: 22, left: 12, zIndex: 4, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: '1px solid var(--ant-border-secondary)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.4 }}>데이터 유형</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {CATS.map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ant-text-secondary)' }}>
                    {c.key === 'event' ? <FlagGlyph color={c.color} size={16} /> : <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flex: 'none', boxShadow: `0 0 0 2px ${c.color}22` }} />}{c.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 22, right: 12, zIndex: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, padding: '5px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
            <span style={{ display: 'flex', opacity: 0.85 }}><Icon name="IconAimOutlined" size={12} /></span>
            마커에 올려 미리보기 · 클릭해 상세
          </div>
        </div>
      </div>

      {docHoverItem && (() => {
        const c = CAT_MAP[docHoverItem.cat];
        const left = PANEL_WIDTH + 8;
        return (
          <div style={{ position: 'fixed', left, top: s.docHover.top, width: 252, zIndex: 40, background: 'var(--ant-bg-elevated)', border: '1px solid var(--ant-border-secondary)', borderRadius: 12, boxShadow: 'var(--ant-shadow)', padding: '12px 13px', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <div style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color, boxShadow: `0 1px 3px ${c.color}55` }}>
                <Icon name={c.icon} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemName(docHoverItem)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)', marginTop: 2 }}>{docHoverItem.date} · {docHoverItem.size}</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ant-text-secondary)', lineHeight: 1.55, borderTop: '1px solid var(--ant-border-secondary)', paddingTop: 9 }}>{docHoverItem.desc}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ant-text-tertiary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'flex' }}><Icon name="IconFileSearchOutlined" size={11} /></span>위치 정보 없음 · 클릭 시 상세로 이동
            </div>
          </div>
        );
      })()}

      <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 50, display: s.toast ? 'flex' : 'none', alignItems: 'center', gap: 8, background: 'var(--ant-bg-elevated)', color: 'var(--ant-text)', border: '1px solid var(--ant-border-secondary)', boxShadow: 'var(--ant-shadow)', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500, animation: 'sams-toast-in .25s ease' }}>
        <span style={{ display: 'flex', color: 'var(--ant-primary)' }}><Icon name="IconRightCircleOutlined" size={15} /></span>{s.toast || ''}
      </div>

      {panoViewer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,10,16,0.94)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', flex: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{panoViewer.label} {panoViewer.index + 1} / {panoViewer.images.length}</span>
            <button onClick={closePanoViewer} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 13px', border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              <Icon name="IconCloseOutlined" size={13} />닫기
            </button>
          </div>
          <div
            ref={panoScrollRef}
            onPointerDown={beginPanoDrag}
            style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', cursor: 'grab', touchAction: 'pan-x' }}
          >
            <img
              src={panoViewer.images[panoViewer.index]}
              draggable={false}
              alt=""
              style={{ height: '86vh', width: 'auto', maxWidth: 'none', userSelect: 'none', pointerEvents: 'none', margin: '0 auto', display: 'block' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '12px 0 6px', flex: 'none' }}>
            <button onClick={() => panoViewerStep(-1)} title="이전 사진" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, minWidth: 56, textAlign: 'center' }}>{panoViewer.index + 1} / {panoViewer.images.length}</span>
            <button onClick={() => panoViewerStep(1)} title="다음 사진" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 11, padding: '0 0 14px', flex: 'none' }}>드래그해서 좌우로 이동 · ← → 키로 다음 사진</div>
        </div>
      )}

      {videoViewer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,10,16,0.94)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', flex: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{videoViewer.title}</span>
            <button onClick={closeVideoViewer} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 13px', border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
              <Icon name="IconCloseOutlined" size={13} />닫기
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video
              src={videoViewer.url}
              controls
              autoPlay
              style={{ maxHeight: '86vh', maxWidth: '92vw', display: 'block', margin: '0 auto', background: '#000' }}
            />
          </div>
        </div>
      )}
    
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  );
}
