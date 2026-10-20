// Static asset paths must be resolved against Vite's configured base path
// (e.g. '/SAMS/' when deployed as a GitHub Pages project site) rather than
// hardcoded as root-absolute — otherwise fetch()/<img> requests 404 once the
// app isn't served from the domain root.
const asset = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');

export const CATS = [
  { key: 'pointcloud', label: '포인트클라우드', color: '#ed4046', icon: 'IconCatPointCloud' },
  { key: 'model3d', label: '3D 모델', color: '#8856dc', icon: 'IconCatModel3D' },
  { key: 'ortho', label: '정사영상', color: '#36c2c2', icon: 'IconCatOrtho' },
  { key: 'image', label: '이미지', color: '#428fea', icon: 'IconCatImage' },
  { key: 'pano', label: '파노라마', color: '#fba33b', icon: 'IconCatPano' },
  { key: 'video', label: '영상', color: '#ed5ba6', icon: 'IconCatVideo' },
  { key: 'document', label: '문서', color: '#a0a0a0', icon: 'IconCatDocument' },
];

export const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.key, c]));

export const PROJECT_LOC = {
  lng: 127.0537,
  lat: 37.54028,
  name: '성수동, 서울',
  project: 'K-Seongsu Project',
};

export const ITEMS = [
  { id: 'e1', extent: [90, 60, 20], space: 'HQ(이마트)', title: 'HQ(이마트)', cat: 'pointcloud', date: '2023-09-08', size: '496MB', extra: '20.0M pts', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: 'RealityCapture · LAS 1.2 · Point Format 2(RGB)', pointCloudUrl: asset('/data/emart-pointcloud.bin') },
  { id: 'e2', extent: [90, 60, 20], space: 'HQ(이마트)', title: 'HQ(이마트) 3D', cat: 'model3d', date: '2023-09-08', size: '65.1MB', extra: '390.7K vertex', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: 'RealityCapture · OBJ 메시 · 정점 컬러(텍스처 없음)', meshUrl: asset('/data/hq-mesh.bin') },
  { id: 'e3', extent: [32, 32, 0], space: 'HQ(이마트)', title: 'HQ 옥상 전경 파노라마', cat: 'pano', date: '2025-01-15', size: '4.1MB', extra: '16장', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: '옥상 현장 촬영 · 16컷 그룹', panoImages: Array.from({ length: 16 }, (_, i) => asset(`/uploads/pano/pano-${String(i + 1).padStart(2, '0')}.jpg`)) },
  { id: 'e4', space: 'HQ(이마트)', title: 'HQ 현장 실측 보고서', cat: 'document', date: '2025-01-20', size: 'PDF · 42쪽', extra: '', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat, desc: '스캔 · 모델링 결과 종합 정리' },
  { id: 'e5', extent: [90, 60, 20], space: 'HQ(이마트)', title: 'HQ 매뉴얼', cat: 'model3d', date: '2024-09-06', size: '18.5MB', extra: '734.9K vertex', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: PROJECT_LOC.lng, lat: PROJECT_LOC.lat, desc: 'Rhinoceros 8 · COLLADA 설계 모델 · 정점 컬러(텍스처 없음)', meshUrl: asset('/data/k-hq-model.bin') },
  { id: 'e6', extent: [70, 50, -12], space: '삼양비즈니스폼', title: '삼양비즈니스폼 3D', cat: 'model3d', date: '2026-07-14', size: '14.9MB', extra: '568.7K vertex', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0574941, lat: 37.5397025, desc: 'Cesium 3D Tiles · 텍스처 베이크 정점 컬러', meshUrl: asset('/data/samyang-mesh.bin') },
  { id: 'e7', extent: [160, 110, 8], space: '현대테라스타워', collections: ['K-Seongsu Project', 'hanil-drone-2024'], title: '현대테라스타워 드론 영상', cat: 'video', date: '2025-03-18', size: '28.1MB', extra: '0:24', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.053644, lat: 37.543983, desc: 'DJI 드론 촬영 · H.264 MP4 · 3840x2160 → 1920x1080 웹 최적화', videoUrl: asset('/uploads/video/hyundai-terrace-drone.mp4') },
  { id: 'e8', extent: [120, 80, -5], space: '메가박스', collections: ['K-Seongsu Project', 'hanil-drone-2024'], title: '메가박스 촬영', cat: 'image', date: '2025-03-19', size: '2.3MB', extra: '3장', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.045252, lat: 37.541770, desc: 'DJI 드론 촬영 · JPEG 3매 · 1920px 웹 최적화', images: [asset('/uploads/image/megabox-01.jpg'), asset('/uploads/image/megabox-02.jpg'), asset('/uploads/image/megabox-03.jpg')] },
];

// The real-world coverage rectangle of an item's data, as a closed GeoJSON
// ring. Built from `extent: [widthM, heightM, bearingDeg]` around the item's
// anchor coordinate; items without extent (documents 등) return null.
export function footprintRing(it) {
  if (!it.extent || it.lat == null) return null;
  const [w, h, bearing = 0] = it.extent;
  const rad = (-bearing * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((it.lat * Math.PI) / 180);
  const ring = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
    const rx = x * Math.cos(rad) - y * Math.sin(rad);
    const ry = x * Math.sin(rad) + y * Math.cos(rad);
    return [it.lng + rx / mPerDegLng, it.lat + ry / mPerDegLat];
  });
  ring.push(ring[0]);
  return ring;
}

export const PROJECTS = ['전체 프로젝트', 'K-Seongsu Project', 'hanil-drone-2024'];

// Seed comments shown in the item detail drawer (keyed by item id).
export const SEED_COMMENTS = {
  e1: [
    { author: '김측량', date: '2023-09-12', text: '북측 파사드 일부 반사 노이즈가 있어 재스캔 검토가 필요합니다.' },
    { author: '박모델', date: '2023-09-14', text: '노이즈 구간은 e2 메시 생성 시 필터링 처리했습니다.' },
  ],
  e2: [
    { author: '박모델', date: '2023-09-20', text: '정점 컬러 기반이라 근접 시 텍스처 해상도 한계가 있습니다.' },
  ],
  e7: [
    { author: '이드론', date: '2025-03-18', text: '풍속 8m/s 조건에서 촬영. 후반부 짐벌 미세 흔들림 있음.' },
  ],
};

// 아이템 간 파생 관계 (item id → 원본이 되는 item id 목록). 메시·보고서처럼
// 다른 데이터에서 파생된 산출물의 계보를 기록하며, 드로어에서 런타임 편집된다.
export const DERIVATIONS = {
  e2: ['e1'],
  e4: ['e1', 'e2'],
};

export function originIdsOf(id) {
  return DERIVATIONS[id] || [];
}

export function derivedIdsOf(id) {
  return Object.keys(DERIVATIONS).filter((k) => (DERIVATIONS[k] || []).includes(id));
}

// Collection metadata shown in the results-panel header when one is selected.
export const COLLECTIONS = {
  'K-Seongsu Project': {
    desc: '성수동 일대 디지털트윈 구축 컬렉션. 실측 포인트클라우드·3D 모델·드론 영상·현장 문서를 시기별로 통합 관리합니다.',
  },
  'hanil-drone-2024': {
    desc: '한일엔지니어링 드론 촬영 컬렉션. 2024-2025년 정기 드론 취득 영상·이미지를 모았습니다.',
  },
};

// Live, editable collection membership (item id → collection names). Seeded
// from each item's collections field (or its primary project); the collection
// edit panel mutates this at runtime.
export const MEMBERSHIP = Object.fromEntries(ITEMS.map((i) => [i.id, (i.collections || [i.project]).slice()]));

// Every collection an item belongs to.
export function itemCollections(it) {
  return MEMBERSHIP[it.id] || [it.project];
}
export const EPSGS = ['좌표계 전체', 'EPSG:5186', 'EPSG:5187'];

export const TIMELINE = [];

export const TL_CATS = {
  actual: { label: '실측모델', color: '#1677ff' },
  plan: { label: '계획모델', color: '#722ed1' },
  event: { label: '이벤트', color: '#fa8c16' },
};

export const STRUCT_LNGLAT = {};

export function structLngLat(struct) {
  return STRUCT_LNGLAT[struct] || [PROJECT_LOC.lng, PROJECT_LOC.lat];
}
