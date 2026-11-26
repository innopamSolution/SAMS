// 브이월드(국토교통부) 지도 타일 · 장소찾기.
// 인증키는 .env.local 의 VITE_VWORLD_KEY (없으면 기존 OSM/Esri 지도로 대신한다).
// 타일은 CORS 를 허용하지만 검색 API 는 허용하지 않아서, 검색은 JSONP(callback) 로 부른다.
export const VWORLD_KEY = String(import.meta.env.VITE_VWORLD_KEY || '').trim();
export const hasVWorld = !!VWORLD_KEY;

// layer: Base(일반) · Satellite(위성) · Hybrid(지명·경계, 투명)
export const vworldTiles = (layer) => [`https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/${layer}/{z}/{y}/{x}.${layer === 'Satellite' ? 'jpeg' : 'png'}`];

let seq = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__vw${Date.now().toString(36)}${++seq}`;
    const s = document.createElement('script');
    const done = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error('시간이 초과되었습니다')); }, 8000);
    window[cb] = (d) => { done(); resolve(d); };
    s.onerror = () => { done(); reject(new Error('네트워크 오류')); };
    s.src = `${url}&callback=${cb}`;
    document.head.appendChild(s);
  });
}

// 검색 범위: 성동구(성수가 속한 구)만. 행정구역 경계(시군구)를 한 번 받아 와서, 그 안의 결과만 남긴다.
// 경계를 못 받으면 대략의 사각 범위로만 좁힌다.
export const SEARCH_AREA_NAME = '성동구';
const SEARCH_AREA_CODE = '11200';
const FALLBACK_BBOX = [127.008, 37.528, 127.074, 37.573];
let areaPromise = null;
function loadArea() {
  if (!areaPromise) {
    const q = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LT_C_ADSIGG_INFO', key: VWORLD_KEY, format: 'json', errorformat: 'json', geometry: 'true', crs: 'EPSG:4326', attrFilter: `sig_cd:=:${SEARCH_AREA_CODE}`, size: '1' });
    areaPromise = jsonp(`https://api.vworld.kr/req/data?${q}`).then((d) => {
      const fc = d && d.response && d.response.result && d.response.result.featureCollection;
      const g = fc && fc.features && fc.features[0] && fc.features[0].geometry;
      if (!g) throw new Error('경계 없음');
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; // [폴리곤][고리][점]
      return { polys, bbox: fc.bbox || FALLBACK_BBOX };
    }).catch(() => { areaPromise = null; return { polys: null, bbox: FALLBACK_BBOX }; });
  }
  return areaPromise;
}
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inArea = (area, x, y) => !area.polys || area.polys.some((rings) => inRing(x, y, rings[0]) && !rings.slice(1).some((h) => inRing(x, y, h)));

function call(params) {
  const q = new URLSearchParams({ service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: '8', page: '1', format: 'json', errorformat: 'json', key: VWORLD_KEY, ...params });
  return jsonp(`https://api.vworld.kr/req/search?${q}`).then((d) => {
    const r = d && d.response;
    if (!r) throw new Error('응답 오류');
    if (r.status === 'NOT_FOUND') return [];
    if (r.status !== 'OK') throw new Error((r.error && r.error.text) || '검색 오류');
    return (r.result && r.result.items) || [];
  });
}

// 장소(상호·시설) + 도로명주소 + 지번주소를 한꺼번에 찾아 하나의 목록으로 합친다.
// → [{ id, title, sub, kind, lng, lat }]
export async function searchPlaces(query) {
  const text = String(query || '').trim();
  if (!hasVWorld || text.length < 2) return [];
  const settle = (p) => p.catch((e) => ({ error: e }));
  const area = await loadArea();
  const bbox = area.bbox.join(',');
  const [place, road, parcel] = await Promise.all([
    settle(call({ type: 'place', query: text, bbox, size: '15' })),
    settle(call({ type: 'address', category: 'road', query: text, bbox, size: '15' })),
    settle(call({ type: 'address', category: 'parcel', query: text, bbox, size: '15' })),
  ]);
  const all = [place, road, parcel];
  if (all.every((r) => r && r.error)) throw place.error; // 셋 다 실패하면 오류로 알린다
  const out = [];
  const seen = new Set();
  const push = (o) => { const k = `${o.title}|${o.lng.toFixed(5)}|${o.lat.toFixed(5)}`; if (seen.has(k)) return; seen.add(k); out.push(o); };
  const addPlaces = () => {
    for (const it of Array.isArray(place) ? place : []) {
      push({ id: it.id, title: it.title, sub: [it.category, it.address && (it.address.road || it.address.parcel)].filter(Boolean).join(' · '), kind: '장소', lng: +it.point.x, lat: +it.point.y });
    }
  };
  const addAddresses = () => {
    for (const [list, kind] of [[road, '도로명'], [parcel, '지번']]) {
      for (const it of Array.isArray(list) ? list : []) {
        const a = it.address || {};
        push({ id: it.id, title: kind === '도로명' ? a.road : a.parcel, sub: kind === '도로명' ? a.parcel : a.road, kind, lng: +it.point.x, lat: +it.point.y });
      }
    }
  };
  // 숫자가 들어 있으면(번지·건물번호) 주소 검색일 가능성이 높아 주소 결과를 먼저 보여 준다.
  if (/\d/.test(text)) { addAddresses(); addPlaces(); } else { addPlaces(); addAddresses(); }
  return out.filter((o) => Number.isFinite(o.lng) && Number.isFinite(o.lat) && inArea(area, o.lng, o.lat)).slice(0, 12);
}
