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
  lng: 129.33205,
  lat: 35.7903,
  name: '경주 불국사',
  project: '2024 경주 불국사 정밀실측',
};

export const ITEMS = [
  { id: 'a1', title: '다보탑 LiDAR 스캔', cat: 'pointcloud', date: '2024-03-12', size: '2.1GB', extra: '15.2M pts', status: 'published', epsg: '5186', site: '경주 불국사 · 다보탑', project: PROJECT_LOC.project, lng: 129.33232, lat: 35.79016, desc: 'Leica RTC360 · 밀도 248 pts/m²' },
  { id: 'a2', title: '석가탑 LiDAR 스캔', cat: 'pointcloud', date: '2024-03-12', size: '1.9GB', extra: '13.8M pts', status: 'published', epsg: '5186', site: '경주 불국사 · 석가탑', project: PROJECT_LOC.project, lng: 129.33178, lat: 35.79014, desc: 'Leica RTC360 · 밀도 233 pts/m²' },
  { id: 'a3', title: '대웅전 LiDAR 스캔', cat: 'pointcloud', date: '2024-03-12', size: '4.3GB', extra: '31.5M pts', status: 'published', epsg: '5186', site: '경주 불국사 · 대웅전', project: PROJECT_LOC.project, lng: 129.33206, lat: 35.79052, desc: 'Leica RTC360 · 밀도 260 pts/m²' },
  { id: 'a4', title: '다보탑 포토그래메트리 모델', cat: 'model3d', date: '2024-03-15', size: '856MB', extra: '1.2M vertex', status: 'published', epsg: '5186', site: '경주 불국사 · 다보탑', project: PROJECT_LOC.project, lng: 129.33238, lat: 35.79022, desc: 'Metashape · 텍스처드 메시' },
  { id: 'a5', title: '석가탑 3D 모델', cat: 'model3d', date: '2024-03-15', size: '720MB', extra: '0.9M vertex', status: 'draft', epsg: '—', site: '경주 불국사 · 석가탑', project: PROJECT_LOC.project, lng: 129.33172, lat: 35.7902, desc: '좌표계 미확인 · 생성 방법 미입력' },
  { id: 'a6', title: '불국사 드론 정사영상', cat: 'ortho', date: '2024-03-12', size: '3.2GB', extra: 'GSD 1.4cm', status: 'published', epsg: '5186', site: '경주 불국사 · 전역', project: PROJECT_LOC.project, lng: 129.332, lat: 35.79034, desc: 'DJI M300 · 정사보정 완료' },
  { id: 'a7', title: '다보탑 근접 이미지셋', cat: 'image', date: '2024-03-13', size: '1.1GB', extra: '450장', status: 'published', epsg: '5186', site: '경주 불국사 · 다보탑', project: PROJECT_LOC.project, lng: 129.33226, lat: 35.7901, desc: 'DSLR 근접 촬영 세트' },
  { id: 'a8', title: '석가탑 근접 이미지셋', cat: 'image', date: '2024-03-13', size: '980MB', extra: '412장', status: 'published', epsg: '5186', site: '경주 불국사 · 석가탑', project: PROJECT_LOC.project, lng: 129.33184, lat: 35.79008, desc: 'DSLR 근접 촬영 세트' },
  { id: 'a9', title: '대웅전 파노라마', cat: 'pano', date: '2024-03-14', size: '340MB', extra: '8K 구면', status: 'published', epsg: '5186', site: '경주 불국사 · 대웅전', project: PROJECT_LOC.project, lng: 129.33212, lat: 35.7906, desc: 'Insta360 Pro · 실내외 12스테이션' },
  { id: 'a10', title: '불국사 드론 영상', cat: 'video', date: '2024-03-12', size: '2.7GB', extra: '4K · 6분', status: 'published', epsg: '5186', site: '경주 불국사 · 전역', project: PROJECT_LOC.project, lng: 129.33258, lat: 35.79046, desc: 'DJI M300 · 상공 궤도 촬영' },
  { id: 'd1', title: '정밀실측 보고서', cat: 'document', date: '2024-04-15', size: 'PDF · 156쪽', extra: '', status: 'published', epsg: '—', site: '경주 불국사', project: PROJECT_LOC.project, lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat, desc: '측량 성과 종합 보고서' },
  { id: 'd2', title: '현장 조사 일지', cat: 'document', date: '2024-04-08', size: 'PDF · 24쪽', extra: '', status: 'published', epsg: '—', site: '경주 불국사', project: PROJECT_LOC.project, lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat, desc: '일자별 취득 기록' },
  { id: 'd3', title: '문화재청 허가서', cat: 'document', date: '2024-04-12', size: 'PDF · 3쪽', extra: '', status: 'draft', epsg: '—', site: '—', project: '(미지정)', lng: null, lat: null, projectLng: null, projectLat: null, desc: '문서 제목 미입력 · 위치 미지정' },
  { id: 'e1', title: 'E-mart 매장 포인트클라우드 스캔', cat: 'pointcloud', date: '2023-09-08', size: '496MB', extra: '20.0M pts', status: 'published', epsg: '5186', site: '이마트 매장 (서울)', project: '2023 이마트 매장 포인트클라우드', lng: 127.0537, lat: 37.54028, desc: 'RealityCapture · LAS 1.2 · Point Format 2(RGB)', pointCloudUrl: '/data/emart-pointcloud.bin' },
];

export const PROJECTS = ['프로젝트 선택', '2024 경주 불국사 정밀실측', '2023 이마트 매장 포인트클라우드'];
export const EPSGS = ['좌표계 전체', 'EPSG:5186', 'EPSG:5187'];

export const TIMELINE = [
  { id: 't1', date: '2023.05', label: '다보탑 1차 스캔', cat: 'actual', struct: '다보탑', pc: { pts: '8.1M', size: '1.4GB', density: '132/m²', count: 1700, H: 1.42, color: '#f5222d' } },
  { id: 't2', date: '2023.09', label: '석가탑 1차 스캔', cat: 'actual', struct: '석가탑', pc: { pts: '7.4M', size: '1.3GB', density: '121/m²', count: 1600, H: 1.5, color: '#f5222d' } },
  { id: 't3', date: '2023.11', label: '정사영상 1차', cat: 'actual', struct: '전역' },
  { id: 't4', date: '2024.01', label: '보수 착수', cat: 'event' },
  { id: 't5', date: '2024.03', label: '다보탑 정밀 스캔', cat: 'actual', struct: '다보탑', pc: { pts: '15.2M', size: '2.1GB', density: '248/m²', count: 5200, H: 1.5, color: '#f5222d' } },
  { id: 't6', date: '2024.03', label: '대웅전 스캔', cat: 'actual', struct: '대웅전', pc: { pts: '31.5M', size: '4.3GB', density: '260/m²', count: 5600, H: 1.2, color: '#f5222d' } },
  { id: 't7', date: '2024.04', label: '보고서 발간', cat: 'event' },
  { id: 't8', date: '2024.05', label: '복원 계획모델', cat: 'plan', struct: '다보탑' },
];

export const TL_CATS = {
  actual: { label: '실측모델', color: '#1677ff' },
  plan: { label: '계획모델', color: '#722ed1' },
  event: { label: '이벤트', color: '#fa8c16' },
};

export const STRUCT_LNGLAT = {
  다보탑: [129.33232, 35.79016],
  석가탑: [129.33178, 35.79014],
  대웅전: [129.33206, 35.79052],
};

export function structLngLat(struct) {
  return STRUCT_LNGLAT[struct] || [PROJECT_LOC.lng, PROJECT_LOC.lat];
}
