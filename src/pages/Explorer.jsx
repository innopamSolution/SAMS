import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import Icon from '../components/Icon';
import {
  CATS, CAT_MAP, ITEMS, PROJECTS, EPSGS, TIMELINE, TL_CATS, PROJECT_LOC, structLngLat,
} from '../data/explorerData';
import { buildMainStyle, buildCompareStyle, addAssetLayers } from '../lib/mapStyles';
import { add3DLayer, addRealPointCloudLayer, addRealMeshLayer } from '../lib/three3d';
import { loadPointCloud } from '../lib/pointCloudAsset';
import { loadMeshAsset } from '../lib/meshAsset';
import {
  thumbHtml, statusChipHtml, wireGallery, startTurntables, wireTooltips, ensureThree, DL_SVG, CUBE_SVG, EXPAND_SVG,
} from '../lib/popupHelpers';

const PANEL_WIDTH = 372;
const SHOW_LEGEND = true;

const YEARS = ['2024', '2023', '2022', '2021'];

const initialState = {
  keyword: '',
  activeCats: {},
  selectedNodeId: null,
  hoveredNodeId: null,
  compareOpen: false,
  compareA: 't1',
  compareB: 't5',
  swipeX: 50,
  timelineOn: false,
  statusSel: {},
  yearSel: {},
  project: '프로젝트 선택',
  epsg: '좌표계 전체',
  boundsFilter: false,
  mapBounds: null,
  hoveredId: null,
  docHover: null,
  activeId: null,
  three3DActive: false,
  three3DTitle: '',
  basemap: 'light',
  toast: null,
};

function computeFiltered(s) {
  const kw = s.keyword.trim().toLowerCase();
  const cats = Object.keys(s.activeCats).filter((k) => s.activeCats[k]);
  const ss = Object.keys(s.statusSel).filter((k) => s.statusSel[k]);
  const ys = Object.keys(s.yearSel).filter((k) => s.yearSel[k]);
  let list = ITEMS.filter((i) => {
    if (cats.length && !cats.includes(i.cat)) return false;
    if (ss.length && !ss.includes(i.status)) return false;
    if (ys.length && !ys.some((y) => i.date.startsWith(y))) return false;
    if (s.project !== '프로젝트 선택' && i.project !== s.project) return false;
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
  const ss = Object.keys(s.statusSel).filter((k) => s.statusSel[k]);
  const ys = Object.keys(s.yearSel).filter((k) => s.yearSel[k]);
  const kw = s.keyword.trim().toLowerCase();
  const counts = {};
  CATS.forEach((c) => { counts[c.key] = 0; });
  ITEMS.forEach((i) => {
    if (ss.length && !ss.includes(i.status)) return;
    if (ys.length && !ys.some((y) => i.date.startsWith(y))) return;
    if (s.project !== '프로젝트 선택' && i.project !== s.project) return;
    if (kw && !(i.title + ' ' + i.site + ' ' + i.project + ' ' + i.desc).toLowerCase().includes(kw)) return;
    if (counts[i.cat] != null) counts[i.cat]++;
  });
  return counts;
}

function mchip(active) {
  return {
    display: 'inline-flex', alignItems: 'center', height: 27, padding: '0 12px', borderRadius: 20,
    fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500, transition: 'all .15s',
    border: active ? '1px solid var(--ant-primary)' : '1px solid transparent',
    background: active ? 'var(--ant-primary-bg)' : 'var(--ant-bg)',
    color: active ? 'var(--ant-primary)' : 'var(--ant-text-secondary)',
  };
}

function itemById(id) { return ITEMS.find((i) => i.id === id); }

// Every project's timeline is derived from its own geo-tagged ITEMS, sorted
// by date. TIMELINE is kept as a legacy hook for a hand-authored pc/compare
// dataset (currently empty) — real projects don't need it.
function itemToTimelineNode(it) {
  return { id: it.id, date: it.date.replace(/-/g, '.'), label: it.title, cat: 'actual', struct: null, item: it };
}

function projectTimeline(project) {
  const itemNodes = ITEMS
    .filter((i) => i.project === project && i.lat != null)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(itemToTimelineNode);
  if (itemNodes.length) return itemNodes;
  return project === PROJECT_LOC.project ? TIMELINE : [];
}

// Same shape as projectTimeline, but built only from items that survive the
// active list filters — so the timeline reflects what's actually visible in
// the results list rather than every geo-tagged item in the project.
function filteredProjectTimeline(filteredItems, project) {
  const itemNodes = filteredItems
    .filter((i) => i.project === project && i.lat != null)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(itemToTimelineNode);
  if (itemNodes.length) return itemNodes;
  return project === PROJECT_LOC.project ? TIMELINE : [];
}

// A node is "comparable" (can be rendered as a 3D side in 시점 비교) if it
// either carries the legacy procedural pc stats, or points at real scan
// data (point cloud / mesh) via its backing item.
function isComparableNode(n) {
  return !!(n.pc || (n.item && (n.item.pointCloudUrl || n.item.meshUrl)));
}

function comparableNodesFor(project) {
  return projectTimeline(project).filter(isComparableNode);
}

function cmpNodeLngLat(node) {
  return node.item ? [node.item.lng, node.item.lat] : structLngLat(node.struct);
}

function cmpPtsLabel(node) {
  return node.pc ? node.pc.pts : node.item.extra;
}

export default function Explorer() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = (p) => setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));

  // Full-screen panorama lightbox — independent of the main state object
  // since drag-to-pan interaction doesn't need to flow through it.
  const [panoViewer, setPanoViewer] = useState(null);
  const panoScrollRef = useRef(null);
  const openPanoViewer = (images, index) => setPanoViewer({ images, index });
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

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const hoverPopupRef = useRef(null);
  const detailPopupRef = useRef(null);
  const layersReadyRef = useRef(false);
  const lastSigRef = useRef('');
  const toastTimerRef = useRef(null);
  const navTopRef = useRef(null);
  const nav3DRef = useRef(null);
  const tlPrevBaseRef = useRef(null);
  const prev3DRef = useRef(null);
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
  };

  const pushMapData = (geo) => {
    const src = mapRef.current && mapRef.current.getSource('assets');
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: geo.map((i) => ({
        type: 'Feature', id: i.id,
        geometry: { type: 'Point', coordinates: [i.lng, i.lat] },
        properties: { id: i.id, color: CAT_MAP[i.cat].color },
      })),
    });
  };

  const showHoverCard = (it) => {
    const map = mapRef.current;
    if (!map) return;
    const c = CAT_MAP[it.cat];
    if (hoverPopupRef.current) hoverPopupRef.current.remove();
    const html = `<div style="width:214px;font-family:var(--ant-font-sans);">
      ${thumbHtml(it, CAT_MAP)}
      <div style="padding:9px 11px 10px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
          <span style="font-size:13px;font-weight:700;color:var(--ant-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.title}</span>
          ${statusChipHtml(it.status)}
        </div>
        <div style="font-size:11px;color:var(--ant-text-secondary);">${it.site}</div>
        <div style="font-size:11px;color:var(--ant-text-tertiary);margin-top:2px;">${it.date} · ${it.size}</div>
      </div></div>`;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16, maxWidth: '240px', anchor: 'bottom' })
      .setLngLat([it.lng, it.lat]).setHTML(html).addTo(map);
    hoverPopupRef.current = popup;
    startTurntables(popup);
  };

  // In timeline mode the node dots on the panel are the only way to pick a
  // point in time, so the map's own clusters/markers are just visual noise —
  // hide them for as long as the timeline stays on.
  const updateClusterVisibility = () => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    const hide = stateRef.current.timelineOn && stateRef.current.project !== '프로젝트 선택';
    ['clusters', 'cluster-count', 'pt-halo', 'unclustered'].forEach((l) => {
      try { map.setLayoutProperty(l, 'visibility', hide ? 'none' : 'visible'); } catch { /* noop */ }
    });
  };

  const hide3D = () => {
    const map = mapRef.current;
    if (map) {
      if (map.getLayer('sams-3d')) map.removeLayer('sams-3d');
      map.easeTo({ pitch: 0, bearing: 0, zoom: 16, duration: 900 });
    }
    patch({ three3DActive: false, three3DTitle: '' });
    setBasemap('light');
    updateClusterVisibility();
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
    patch({ three3DActive: true, three3DTitle: it.title + ' · 실측 데이터' });
  };

  const renderRealMeshAt = async (it) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat = [it.lng, it.lat];
    const ok = await ensureThree();
    if (!ok) { showToast('3D 엔진을 불러오지 못했습니다'); return; }
    showToast('실측 3D 메시 데이터를 불러오는 중…');
    const { positions, colors, indices } = await loadMeshAsset(it.meshUrl);
    if (stateRef.current.basemap !== '3d') setBasemap('3d');
    addRealMeshLayer(maplibregl, map, lngLat, positions, colors, indices);
    map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 16.8), pitch: 55, duration: 900 });
    patch({ three3DActive: true, three3DTitle: it.title + ' · 실측 메시' });
  };

  const show3DOnMap = async (it) => {
    const map = mapRef.current;
    if (!map) return;
    const lngLat = it.lat != null ? [it.lng, it.lat] : it.projectLat != null ? [it.projectLng, it.projectLat] : null;
    if (!lngLat) { showToast('위치 정보가 없어 지도에 3D를 표시할 수 없습니다'); return; }
    if (detailPopupRef.current) { detailPopupRef.current.remove(); detailPopupRef.current = null; }
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    if (it.meshUrl && it.lat != null) { await renderRealMeshAt(it); return; }
    if (it.pointCloudUrl && it.lat != null) { await renderRealPointCloudAt(it); return; }
    await render3DAt(lngLat, it.title, CAT_MAP[it.cat].color, 4600, 10.4);
  };

  const openDetail = (it, anchoredToProject) => {
    const map = mapRef.current;
    if (!it || !map) return;
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null; }
    if (detailPopupRef.current) detailPopupRef.current.remove();
    if (stateRef.current.activeId) setFS(stateRef.current.activeId, 'active', false);
    if (it.lat != null) setFS(it.id, 'active', true);
    patch({ activeId: it.id });
    const c = CAT_MAP[it.cat];
    const lngLat = it.lat != null ? [it.lng, it.lat] : [it.projectLng, it.projectLat];
    const meta = [];
    meta.push(['위치', it.site]);
    meta.push(['취득일', it.date]);
    meta.push(['크기', it.size]);
    if (it.epsg && it.epsg !== '—') meta.push(['좌표계', 'EPSG:' + it.epsg]);
    if (it.extra) meta.push(['규모', it.extra]);
    const metaRows = meta.map((m) => `<div style="display:flex;font-size:11.5px;line-height:1.7;"><span style="width:52px;color:var(--ant-text-tertiary);flex:none;">${m[0]}</span><span style="color:var(--ant-text);font-weight:500;">${m[1]}</span></div>`).join('');
    const projNote = anchoredToProject ? `<div style="display:flex;gap:6px;align-items:flex-start;font-size:10.5px;color:var(--ant-warning);background:var(--ant-warning-bg);border:1px solid var(--ant-warning-border);border-radius:6px;padding:5px 8px;margin:0 0 8px;">이 문헌은 좌표가 없어 프로젝트 위치에 표시됩니다.</div>` : '';
    const can3D = it.cat === 'pointcloud' || it.cat === 'model3d';
    const btn3D = can3D ? `<button data-act="show3d" data-tip="지도에서 3D 렌더링" aria-label="지도에서 3D 렌더링" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;">${CUBE_SVG}</button>` : '';
    const canPanoLarge = it.cat === 'pano' && it.panoImages && it.panoImages.length > 0;
    const btnPanoLargeHtml = canPanoLarge ? `<button data-act="pano-large" data-tip="크게 보기" aria-label="크게 보기" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-primary);background:var(--ant-primary-bg);color:var(--ant-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;">${EXPAND_SVG}</button>` : '';
    const html = `<div style="width:236px;font-family:var(--ant-font-sans);">
      ${thumbHtml(it, CAT_MAP, true)}
      <div style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${c.color};"></span>
          <span style="font-size:11px;color:var(--ant-text-secondary);font-weight:600;">${c.label}</span>
          <span style="margin-left:auto;">${statusChipHtml(it.status)}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--ant-text);margin-bottom:7px;line-height:1.3;">${it.title}</div>
        ${projNote}
        <div style="margin-bottom:10px;">${metaRows}</div>
        <div style="display:flex;gap:6px;">
          ${btn3D}
          ${btnPanoLargeHtml}
          <button data-act="download" data-tip="다운로드" aria-label="다운로드" style="flex:none;width:34px;height:32px;border-radius:7px;border:1px solid var(--ant-border);background:var(--ant-bg);color:var(--ant-text);cursor:pointer;display:flex;align-items:center;justify-content:center;">${DL_SVG}</button>
          <button data-act="detail" style="flex:1;height:32px;border-radius:7px;border:none;background:var(--ant-primary);color:#fff;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;">자세히 보기 →</button>
        </div>
      </div></div>`;
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 16, maxWidth: '280px', anchor: 'bottom' })
      .setLngLat(lngLat).setHTML(html).addTo(map);
    detailPopupRef.current = popup;
    const rootEl = popup.getElement();
    const btnD = rootEl.querySelector('[data-act="detail"]');
    const btnDl = rootEl.querySelector('[data-act="download"]');
    if (btnD) btnD.addEventListener('click', () => showToast('Detail 화면으로 이동: ' + it.title));
    if (btnDl) btnDl.addEventListener('click', () => showToast('다운로드 시작: ' + it.title + ' (' + it.size + ')'));
    const btn3d = rootEl.querySelector('[data-act="show3d"]');
    if (btn3d) btn3d.addEventListener('click', () => show3DOnMap(it));
    const btnPanoLarge = rootEl.querySelector('[data-act="pano-large"]');
    if (btnPanoLarge) {
      btnPanoLarge.addEventListener('click', () => {
        const frame = rootEl.querySelector('.sams-gframe-real');
        const idx = frame ? parseInt(frame.dataset.idx, 10) || 0 : 0;
        openPanoViewer(it.panoImages, idx);
      });
    }
    popup.on('close', () => {
      if (stateRef.current.activeId) setFS(stateRef.current.activeId, 'active', false);
      patch({ activeId: null });
    });
    startTurntables(popup);
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
    if (it.lat != null) { showHoverCard(it); p.docHover = null; }
    else {
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
  const onItemClick = (it) => {
    const map = mapRef.current;
    if (it.lat != null) {
      map && map.flyTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 17.2), duration: 650 });
      openDetail(it);
    } else if (it.projectLat != null) {
      map && map.flyTo({ center: [it.projectLng, it.projectLat], zoom: Math.max(map.getZoom(), 16.4), duration: 650 });
      openDetail(it, true);
    } else {
      showToast('위치 정보 없음 — Detail 화면으로 이동합니다');
    }
  };

  function updateMapControls(v) {
    const map = mapRef.current;
    if (!map || !nav3DRef.current) return;
    const wants3D = v === '3d';
    const has3D = map.hasControl(nav3DRef.current);
    if (wants3D && !has3D) {
      if (navTopRef.current && map.hasControl(navTopRef.current)) map.removeControl(navTopRef.current);
      map.addControl(nav3DRef.current, 'bottom-right');
    } else if (!wants3D && has3D) {
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
  const toggleStatusSel = (k) => patch((s) => ({ statusSel: { ...s.statusSel, [k]: !s.statusSel[k] } }));
  const toggleYearSel = (k) => patch((s) => ({ yearSel: { ...s.yearSel, [k]: !s.yearSel[k] } }));
  const resetFilters = () => patch({ keyword: '', activeCats: {}, statusSel: {}, yearSel: {}, project: '프로젝트 선택', epsg: '좌표계 전체', boundsFilter: false });

  const onSelectNode = (nd) => {
    if (nd.item) {
      // Timeline nodes are a faster path than the list/marker entry points:
      // point cloud & mesh items render straight into 3D (re-clicking the
      // same node toggles it off), panorama items jump straight to the large
      // viewer — no popup detour in between. The timeline panel itself stays
      // put through all of this (its visibility no longer depends on 3D state).
      const it = nd.item;
      const map = mapRef.current;
      if (it.cat === 'pano' && it.panoImages && it.panoImages.length) {
        patch({ selectedNodeId: nd.id });
        if (map && it.lat != null) map.flyTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 17), duration: 700 });
        openPanoViewer(it.panoImages, 0);
        return;
      }
      if ((it.meshUrl || it.pointCloudUrl) && it.lat != null) {
        if (state.three3DActive && state.selectedNodeId === nd.id) {
          hide3D();
          patch({ selectedNodeId: null });
          return;
        }
        patch({ selectedNodeId: nd.id });
        show3DOnMap(it);
        return;
      }
      patch({ selectedNodeId: nd.id });
      if (map) map.flyTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 17), duration: 700 });
      openDetail(it);
      return;
    }
    patch({ selectedNodeId: nd.id });
    const ll = structLngLat(nd.struct);
    if (nd.pc) {
      render3DAt(ll, nd.date + ' · ' + nd.label, nd.pc.color, Math.round(nd.pc.count * 1.1 + 2600), nd.pc.H * 7);
    } else {
      const map = mapRef.current;
      if (map) map.flyTo({ center: ll, zoom: Math.max(map.getZoom(), 16.5), duration: 700 });
      showToast(nd.date + ' · ' + nd.label);
    }
  };

  const toggleTimeline = () => {
    const on = !stateRef.current.timelineOn;
    patch({ timelineOn: on });
    if (on) { tlPrevBaseRef.current = stateRef.current.basemap; setBasemap('3d'); }
    else {
      if (tlPrevBaseRef.current) { setBasemap(tlPrevBaseRef.current); tlPrevBaseRef.current = null; }
      const map = mapRef.current;
      if (map && map.getLayer('sams-3d')) map.removeLayer('sams-3d');
      patch({ selectedNodeId: null });
    }
  };

  const toggleCompare = () => patch((s) => ({ compareOpen: !s.compareOpen }));

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

  const onProjectChange = (e) => {
    const v = e.target.value;
    const prevProject = stateRef.current.project;
    const p = { project: v };
    if (v !== prevProject) {
      // Switching projects invalidates any timeline node/compare selection
      // and 3D render tied to the previous project's own timeline dataset.
      p.compareOpen = false;
      p.selectedNodeId = null;
      if (stateRef.current.three3DActive) p.three3DActive = false;
      const map = mapRef.current;
      if (map && map.getLayer('sams-3d')) map.removeLayer('sams-3d');
      if (v === '프로젝트 선택' && stateRef.current.timelineOn) {
        p.timelineOn = false;
        if (tlPrevBaseRef.current) { setBasemap(tlPrevBaseRef.current); tlPrevBaseRef.current = null; }
      }
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

    map.on('load', () => {
      addAssetLayers(map);
      layersReadyRef.current = true;
      const geo = computeFiltered(stateRef.current).filter((i) => i.lat != null);
      lastSigRef.current = geo.map((i) => i.id).join(',');
      pushMapData(geo);
      updateClusterVisibility();
    });

    map.on('mouseenter', 'unclustered', (e) => { map.getCanvas().style.cursor = 'pointer'; onMarkerEnter(e.features[0].id); });
    map.on('mouseleave', 'unclustered', () => { map.getCanvas().style.cursor = ''; onMarkerLeave(); });
    map.on('click', 'unclustered', (e) => { openDetail(itemById(e.features[0].id)); });
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
  }, [state.keyword, state.activeCats, state.statusSel, state.yearSel, state.project, state.epsg, state.boundsFilter, state.mapBounds]);

  // ── Compare mode maps ──────────────────────────────────────────
  function cmpNode(id, project, fallback) {
    const nodes = comparableNodesFor(project);
    if (!nodes.length) return null;
    return nodes.find((n) => n.id === id) || (fallback === 'last' ? nodes[nodes.length - 1] : nodes[0]);
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
      if (node.item && node.item.meshUrl) {
        const { positions, colors, indices } = await loadMeshAsset(node.item.meshUrl);
        addRealMeshLayer(maplibregl, map, ll, positions, colors, indices);
      } else if (node.item && node.item.pointCloudUrl) {
        const { positions, colors } = await loadPointCloud(node.item.pointCloudUrl);
        addRealPointCloudLayer(maplibregl, map, ll, positions, colors);
      } else {
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
    const project = stateRef.current.project;
    const nodeA = cmpNode(stateRef.current.compareA, project, 'first');
    const nodeB = cmpNode(stateRef.current.compareB, project, 'last');
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

  useEffect(() => { updateClusterVisibility(); }, [state.timelineOn, state.project]);

  useEffect(() => () => { clearTimeout(toastTimerRef.current); destroyCompareMaps(); }, []);

  // ── Derived render data ────────────────────────────────────────
  const s = state;
  const filtered = computeFiltered(s);
  const activeCatKeys = Object.keys(s.activeCats).filter((k) => s.activeCats[k]);
  const hasFilters = !!(s.keyword || activeCatKeys.length || Object.values(s.statusSel).some(Boolean) || Object.values(s.yearSel).some(Boolean) || s.project !== '프로젝트 선택' || s.epsg !== '좌표계 전체' || s.boundsFilter);
  const catCounts = computeCatCounts(s);

  let boundsNotice = '';
  if (s.boundsFilter) {
    const outCount = ITEMS.filter((i) => i.lat != null).length - filtered.filter((i) => i.lat != null).length;
    boundsNotice = '현재 지도 범위에 맞춰 필터링 중' + (outCount > 0 ? ' · 범위 밖 ' + outCount + '건 숨김' : '');
  }

  const activeTimeline = filteredProjectTimeline(filtered, s.project);
  const timelineVisible = s.timelineOn && !s.compareOpen && s.project !== '프로젝트 선택' && activeTimeline.length > 0;
  const timelineProject = s.project !== '프로젝트 선택' ? s.project : '전체 데이터';
  const cmpNodesAll = comparableNodesFor(s.project);
  const timelineHasCompare = cmpNodesAll.length >= 2;
  const cmpNodeA = cmpNode(s.compareA, s.project, 'first');
  const cmpNodeB = cmpNode(s.compareB, s.project, 'last');

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none" aria-label="SAMS">
            <circle cx="46" cy="16" r="3" fill="#4096ff" /><circle cx="38" cy="13" r="2.3" fill="#0958d9" /><circle cx="30" cy="13" r="2.3" fill="#0958d9" /><circle cx="22" cy="15" r="3" fill="#0958d9" /><circle cx="18" cy="21" r="2.3" fill="#4096ff" /><circle cx="20" cy="27" r="2.3" fill="#0958d9" /><circle cx="27" cy="30" r="3" fill="#0958d9" /><circle cx="35" cy="32" r="2.3" fill="#0958d9" /><circle cx="42" cy="35" r="2.3" fill="#4096ff" /><circle cx="45" cy="41" r="3" fill="#0958d9" /><circle cx="42" cy="47" r="2.3" fill="#0958d9" /><circle cx="34" cy="50" r="2.3" fill="#0958d9" /><circle cx="26" cy="50" r="3" fill="#4096ff" /><circle cx="18" cy="48" r="2.3" fill="#0958d9" /><circle cx="30" cy="20" r="2.3" fill="#0958d9" /><circle cx="24" cy="21" r="3" fill="#0958d9" /><circle cx="38" cy="19" r="2.3" fill="#4096ff" /><circle cx="24" cy="44" r="2.3" fill="#0958d9" /><circle cx="38" cy="43" r="3" fill="#0958d9" /><circle cx="31" cy="42" r="2.3" fill="#0958d9" /><circle cx="31" cy="26" r="2.3" fill="#4096ff" /><circle cx="31" cy="37" r="3" fill="#0958d9" />
          </svg>
          <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: 'var(--ant-text-heading)' }}>SAMS</span>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%', flex: 'none' }}>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ant-primary)' }}>Explorer</div>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 15, fontWeight: 600, color: 'var(--ant-text-secondary)', cursor: 'pointer' }}>Project</div>
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 15, fontWeight: 600, color: 'var(--ant-text-secondary)', cursor: 'pointer' }}>Upload</div>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className={`hsearch${s.keyword ? ' open' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="hsearch-field">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  className="hsearch-input"
                  value={s.keyword}
                  onChange={(e) => patch({ keyword: e.target.value })}
                  placeholder="이름 · 제목 · 키워드 검색"
                />
                {!!s.keyword && (
                  <span onClick={() => patch({ keyword: '' })} style={{ position: 'absolute', right: 2, color: 'var(--ant-text-tertiary)', display: 'flex', cursor: 'pointer' }}>
                    <Icon name="IconCloseCircleOutlined" size={14} />
                  </span>
                )}
              </div>
            </div>
            <button
              className="hsearch-btn"
              onClick={() => document.querySelector('.hsearch-input')?.focus()}
              title="검색"
            >
              <Icon name="IconSearchOutlined" size={20} />
            </button>
          </div>
          <button
            title="로그아웃"
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 8 }}
          >
            <Icon name="IconLogoutOutlined" size={16} />LOGOUT
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left panel */}
        <aside style={{ width: PANEL_WIDTH, flex: 'none', background: 'var(--ant-bg)', borderRight: '1px solid var(--ant-border-secondary)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--ant-border-secondary)', flex: 'none', backgroundColor: '#EBECEF' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ant-text-secondary)', marginBottom: 5, fontWeight: 700 }}>상태</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => patch({ statusSel: {} })} style={mchip(!Object.values(s.statusSel).some(Boolean))}>전체</button>
                  {[['published', 'Published'], ['draft', 'Draft']].map(([k, label]) => (
                    <button key={k} onClick={() => toggleStatusSel(k)} style={mchip(!!s.statusSel[k])}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ant-text-secondary)', marginBottom: 5, fontWeight: 700 }}>
                  기간 <span style={{ color: 'var(--ant-text-quaternary)', fontWeight: 500 }}>· 복수 선택</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => patch({ yearSel: {} })} style={mchip(!Object.values(s.yearSel).some(Boolean))}>전체</button>
                  {YEARS.map((y) => (
                    <button key={y} onClick={() => toggleYearSel(y)} style={mchip(!!s.yearSel[y])}>{y}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', marginTop: 12 }}>
              <select value={s.project} onChange={onProjectChange} style={{ width: '100%', height: 34, border: '1px solid var(--ant-border)', borderRadius: 'var(--ant-radius)', padding: '0 32px 0 11px', fontSize: 13, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'var(--ant-bg)', appearance: 'none', cursor: 'pointer', outline: 'none' }}>
                {PROJECTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ant-text-tertiary)', display: 'flex' }}><Icon name="IconDownOutlined" size={11} /></span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {CATS.map((c) => {
                const on = !!s.activeCats[c.key];
                const count = catCounts[c.key];
                return (
                  <button key={c.key} onClick={() => toggleCat(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: 20, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500, border: `1px solid ${on ? c.color : 'transparent'}`, background: on ? c.color + '14' : 'var(--ant-bg)', color: on ? c.color : 'var(--ant-text-secondary)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flex: 'none' }} />
                    {c.label}
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 1, color: on ? c.color : 'var(--ant-text-tertiary)', opacity: count === 0 ? 0.45 : 1 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '9px 16px', borderBottom: '1px solid var(--ant-border-secondary)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>결과 {filtered.length}건</span>
            {hasFilters && <button onClick={resetFilters} style={{ fontSize: 11, color: 'var(--ant-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>필터 초기화</button>}
            {s.project !== '프로젝트 선택' && (
              <button onClick={toggleTimeline} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${s.timelineOn ? 'var(--ant-primary)' : 'var(--ant-border)'}`, background: s.timelineOn ? 'var(--ant-primary)' : 'var(--ant-bg)', color: s.timelineOn ? '#fff' : 'var(--ant-text-secondary)' }}>
                <Icon name="IconCalendarOutlined" size={14} />타임라인
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 16px' }}>
            {!!boundsNotice && <div style={{ fontSize: 11, color: 'var(--ant-warning)', background: 'var(--ant-warning-bg)', border: '1px solid var(--ant-warning-border)', borderRadius: 6, padding: '6px 9px', margin: '4px 4px 8px' }}>{boundsNotice}</div>}
            {filtered.map((it) => {
              const c = CAT_MAP[it.cat];
              const isActive = s.activeId === it.id;
              const isHover = s.hoveredId === it.id;
              let rowBg = 'transparent', rowBorder = '1px solid transparent';
              if (isActive) { rowBg = 'var(--ant-primary-bg)'; rowBorder = '1px solid var(--ant-primary-border)'; }
              else if (isHover) { rowBg = 'var(--ant-fill-quaternary)'; rowBorder = '1px solid var(--ant-border-secondary)'; }
              const noGeo = it.lat == null;
              return (
                <div key={it.id} onMouseEnter={(e) => onItemEnter(it, e)} onMouseLeave={() => onItemLeave(it)} onClick={() => onItemClick(it)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', background: rowBg, border: rowBorder, marginBottom: 2 }}>
                  <div style={{ width: 29, height: 29, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color, boxShadow: `0 1px 3px ${c.color}55` }}>
                    <Icon name={c.icon} size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                      <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, padding: '0 6px', borderRadius: 20, lineHeight: '16px', color: it.status === 'published' ? 'var(--ant-success)' : 'var(--ant-warning)', background: it.status === 'published' ? 'var(--ant-success-bg)' : 'var(--ant-warning-bg)', border: `1px solid ${it.status === 'published' ? 'var(--ant-success-border)' : 'var(--ant-warning-border)'}` }}>
                        {it.status === 'published' ? 'Pub' : 'Draft'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ant-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.date} · {it.size}{it.extra ? ` · ${it.extra}` : ''}
                    </div>
                  </div>
                  <span style={{ flex: 'none', display: 'flex', alignItems: 'center', color: noGeo ? 'var(--ant-text-quaternary)' : c.color + '88' }}>
                    <Icon name={noGeo ? 'IconFileSearchOutlined' : 'IconEnvironmentOutlined'} size={13} />
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Map area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, background: '#eaeef2' }}>
          <div ref={mapElRef} id="sams-map" style={{ position: 'absolute', inset: 0 }} />

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 4, display: 'flex', background: 'var(--ant-bg)', borderRadius: 9, padding: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: '1px solid var(--ant-border-secondary)' }}>
            {[['light', '일반지도', 'IconEnvironmentOutlined'], ['satellite', '위성', 'IconGlobalOutlined'], ['3d', '3D', 'IconBoxPlotOutlined']].map(([key, label, icon]) => {
              const on = s.basemap === key;
              return (
                <button key={key} onClick={() => setBasemap(key)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 12px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--ant-primary)' : 'transparent', color: on ? '#fff' : 'var(--ant-text-secondary)' }}>
                  <Icon name={icon} size={14} />{label}
                </button>
              );
            })}
          </div>

          {!s.three3DActive && !timelineVisible && (
            <button onClick={() => patch({ boundsFilter: !s.boundsFilter })} style={{ position: 'absolute', top: 12, left: 12, zIndex: 4, display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: `1px solid ${s.boundsFilter ? 'var(--ant-primary)' : 'var(--ant-border-secondary)'}`, background: s.boundsFilter ? 'var(--ant-primary)' : 'var(--ant-bg)', color: s.boundsFilter ? '#fff' : 'var(--ant-text-secondary)' }}>
              <Icon name="IconBorderOuterOutlined" size={14} />이 지역으로 검색
            </button>
          )}

          {timelineVisible && (
            <div style={{ position: 'absolute', top: 56, left: 12, right: 12, zIndex: 9, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)', border: '1px solid var(--ant-border-secondary)', borderRadius: 12, boxShadow: '0 4px 18px rgba(0,0,0,0.12)', padding: '10px 18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ display: 'flex', color: 'var(--ant-primary)' }}><Icon name="IconCalendarOutlined" size={16} /></span>
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{timelineProject}</span>
                <span style={{ fontSize: 11, color: 'var(--ant-text-tertiary)', whiteSpace: 'nowrap' }}>시계열 · 노드 클릭 시 지도에 실측 3D 표시</span>
                {timelineHasCompare && (
                  <button onClick={toggleCompare} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 13px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', color: 'var(--ant-primary)' }}><Icon name="IconSwapRightOutlined" size={14} /></span>시점 비교
                  </button>
                )}
              </div>
              <div style={{ position: 'relative', height: 84, margin: '0 52px' }}>
                <div style={{ position: 'absolute', top: '50%', left: -10, right: -10, height: 2, borderRadius: 3, background: 'var(--ant-border)', transform: 'translateY(-50%)' }} />
                {activeTimeline.map((n, i) => {
                  const leftPct = activeTimeline.length > 1 ? (i / (activeTimeline.length - 1)) * 100 : 50;
                  const above = i % 2 === 0;
                  const c = TL_CATS[n.cat].color;
                  const active = s.selectedNodeId === n.id;
                  const hovered = s.hoveredNodeId === n.id;
                  const emph = active || hovered;
                  return (
                    <div key={n.id} style={{ position: 'absolute', left: `${leftPct}%`, top: 0, height: '100%', zIndex: active ? 3 : emph ? 2 : 1 }}>
                      <div style={{ position: 'absolute', left: 0, [above ? 'bottom' : 'top']: 'calc(50% + 18px)', transform: 'translateX(-50%)', minWidth: 76, maxWidth: 120, textAlign: 'center', pointerEvents: 'none', padding: active ? '4px 9px' : '2px 4px', borderRadius: 8, background: active ? '#fff' : 'transparent', boxShadow: active ? '0 2px 10px rgba(0,0,0,0.14)' : 'none', transition: 'all .2s' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.2, color: active ? c : emph ? 'var(--ant-text)' : 'var(--ant-text-secondary)', transition: 'color .2s' }}>{n.date}</div>
                        <div style={{ fontSize: 10.5, lineHeight: 1.25, marginTop: 1, color: active ? 'var(--ant-text-secondary)' : 'var(--ant-text-tertiary)', fontWeight: active ? 600 : 500, transition: 'color .2s' }}>{n.label}</div>
                      </div>
                      <div style={{ position: 'absolute', left: 0, transform: 'translateX(-50%)', width: 2, [above ? 'bottom' : 'top']: '50%', height: 14, background: active ? c : 'transparent', transition: 'background .2s' }} />
                      <button
                        onClick={() => onSelectNode(n)}
                        onMouseEnter={() => patch({ hoveredNodeId: n.id })}
                        onMouseLeave={() => patch({ hoveredNodeId: null })}
                        style={{ position: 'absolute', top: '50%', left: 0, transform: `translate(-50%,-50%) scale(${active ? 1 : emph ? 0.92 : 0.8})`, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: active ? c + '22' : 'transparent', boxShadow: active ? `0 0 0 2px ${c},0 2px 10px ${c}55` : 'none', transition: 'all .2s cubic-bezier(.4,0,.2,1)' }}
                      >
                        <span style={{ width: active ? 11 : 9, height: active ? 11 : 9, borderRadius: '50%', background: active || emph ? c : 'var(--ant-bg)', border: `2px solid ${active ? '#fff' : c}`, boxShadow: active ? 'none' : '0 1px 3px rgba(0,0,0,0.18)', transition: 'all .2s' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {s.three3DActive && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15,20,28,0.82)', backdropFilter: 'blur(6px)', color: '#fff', padding: '7px 8px 7px 14px', borderRadius: 10, boxShadow: '0 6px 22px rgba(0,0,0,0.35)' }}>
              <span title="지도 위 3D 렌더링" style={{ width: 7, height: 7, borderRadius: '50%', background: '#4096ff', boxShadow: '0 0 8px #4096ff', cursor: 'help' }} />
              <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.three3DTitle}</span>
              <button onClick={hide3D} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 11px', border: 'none', borderRadius: 7, background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Icon name="IconCloseOutlined" size={11} />3D 렌더링 닫기
              </button>
            </div>
          )}

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
                <button onClick={() => patch({ compareOpen: false })} style={{ position: 'absolute', top: 14, right: 14, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', border: 'none', borderRadius: 8, background: 'rgba(15,20,28,0.85)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <Icon name="IconCloseOutlined" size={13} />비교 닫기
                </button>
                <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--ant-primary)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>A</span>
                  <select value={cmpNodeA.id} onChange={(e) => patch({ compareA: e.target.value })} style={{ height: 32, maxWidth: 210, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'rgba(255,255,255,0.96)', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                    {cmpNodesAll.map((n) => <option key={n.id} value={n.id}>{n.date} · {n.label}</option>)}
                  </select>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{cmpPtsLabel(cmpNodeA)}</span>
                </div>
                <div style={{ position: 'absolute', top: 14, left: `calc(${s.swipeX}% + 14px)`, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#722ed1', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>B</span>
                  <select value={cmpNodeB.id} onChange={(e) => patch({ compareB: e.target.value })} style={{ height: 32, maxWidth: 210, border: 'none', borderRadius: 8, padding: '0 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'rgba(255,255,255,0.96)', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                    {cmpNodesAll.map((n) => <option key={n.id} value={n.id}>{n.date} · {n.label}</option>)}
                  </select>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{cmpPtsLabel(cmpNodeB)}</span>
                </div>
              </div>
            </div>
          )}

          {SHOW_LEGEND && (
            <div style={{ position: 'absolute', bottom: 22, left: 12, zIndex: 4, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', border: '1px solid var(--ant-border-secondary)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.4 }}>데이터 유형</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px' }}>
                {CATS.map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--ant-text-secondary)' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flex: 'none', boxShadow: `0 0 0 2px ${c.color}22` }} />{c.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 22, right: 12, zIndex: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, padding: '5px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <div style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color, boxShadow: `0 1px 3px ${c.color}55` }}>
                <Icon name={c.icon} size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{docHoverItem.title}</span>
                  <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, padding: '0 7px', borderRadius: 20, lineHeight: '16px', color: docHoverItem.status === 'published' ? 'var(--ant-success)' : 'var(--ant-warning)', background: docHoverItem.status === 'published' ? 'var(--ant-success-bg)' : 'var(--ant-warning-bg)', border: `1px solid ${docHoverItem.status === 'published' ? 'var(--ant-success-border)' : 'var(--ant-warning-border)'}` }}>
                    {docHoverItem.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)', marginTop: 2 }}>{docHoverItem.date} · {docHoverItem.size}</div>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ant-text-secondary)', lineHeight: 1.55, borderTop: '1px solid var(--ant-border-secondary)', paddingTop: 9 }}>{docHoverItem.desc}</div>
            <div style={{ fontSize: 10.5, color: 'var(--ant-text-tertiary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
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
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>파노라마 {panoViewer.index + 1} / {panoViewer.images.length}</span>
            <button onClick={closePanoViewer} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px', border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '12px 0 6px', flex: 'none' }}>
            <button onClick={() => panoViewerStep(-1)} title="이전 사진" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, minWidth: 56, textAlign: 'center' }}>{panoViewer.index + 1} / {panoViewer.images.length}</span>
            <button onClick={() => panoViewerStep(1)} title="다음 사진" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 11, padding: '0 0 14px', flex: 'none' }}>드래그해서 좌우로 이동 · ← → 키로 다음 사진</div>
        </div>
      )}
    </div>
  );
}
