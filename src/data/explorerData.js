export const CATS = [
  { key: 'pointcloud', label: '포인트클라우드', color: '#e5484d', icon: 'IconDotChartOutlined' },
  { key: 'model3d', label: '3D 모델', color: '#8a5cd6', icon: 'IconBuildOutlined' },
  { key: 'ortho', label: '정사영상', color: '#3cbcbc', icon: 'IconBorderOuterOutlined' },
  { key: 'image', label: '이미지', color: '#4a90e2', icon: 'IconPictureOutlined' },
  { key: 'pano', label: '파노라마', color: '#f2a244', icon: 'IconGlobalOutlined' },
  { key: 'video', label: '영상', color: '#e662a6', icon: 'IconVideoCameraOutlined' },
  { key: 'document', label: '문서', color: '#a0a0a0', icon: 'IconFileTextOutlined' },
];

export const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.key, c]));

export const PROJECT_LOC = {
  lng: 127.0537,
  lat: 37.54028,
  name: '성수동, 서울',
  project: 'K-Seongsu Project',
};

export const ITEMS = [
  { id: 'e1', title: 'HQ(이마트)', cat: 'pointcloud', date: '2023-09-08', size: '496MB', extra: '20.0M pts', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: 'RealityCapture · LAS 1.2 · Point Format 2(RGB)', pointCloudUrl: '/data/emart-pointcloud.bin' },
  { id: 'e2', title: 'HQ(이마트) 3D', cat: 'model3d', date: '2023-09-08', size: '65.1MB', extra: '390.7K vertex', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: 'RealityCapture · OBJ 메시 · 정점 컬러(텍스처 없음)', meshUrl: '/data/hq-mesh.bin' },
  { id: 'e3', title: 'HQ 옥상 전경 파노라마', cat: 'pano', date: '2025-01-15', size: '4.1MB', extra: '16장', status: 'published', epsg: '5186', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0537, lat: 37.54028, desc: '옥상 현장 촬영 · 16컷 그룹', panoImages: Array.from({ length: 16 }, (_, i) => `/uploads/pano/pano-${String(i + 1).padStart(2, '0')}.jpg`) },
  { id: 'e4', title: '현장 실측 보고서', cat: 'document', date: '2025-01-20', size: 'PDF · 42쪽', extra: '', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat, desc: '스캔 · 모델링 결과 종합 정리' },
  { id: 'e5', title: 'HQ 매뉴얼', cat: 'model3d', date: '2024-09-06', size: '18.5MB', extra: '734.9K vertex', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: PROJECT_LOC.lng, lat: PROJECT_LOC.lat, desc: 'Rhinoceros 8 · COLLADA 설계 모델 · 정점 컬러(텍스처 없음)', meshUrl: '/data/k-hq-model.bin' },
  { id: 'e6', title: '삼양비즈니스폼 3D 모델', cat: 'model3d', date: '2026-07-14', size: '14.9MB', extra: '568.7K vertex', status: 'published', epsg: '—', site: '성수동, 서울', project: 'K-Seongsu Project', lng: 127.0574941, lat: 37.5397025, desc: 'Cesium 3D Tiles · 텍스처 베이크 정점 컬러', meshUrl: '/data/samyang-mesh.bin' },
];

export const PROJECTS = ['프로젝트 선택', 'K-Seongsu Project'];
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
