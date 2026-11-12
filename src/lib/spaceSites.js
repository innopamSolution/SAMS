// 기본 3D 지도(선택된 것이 없는 상태)에서 보여주는 공간 표시 — 사이트 폴리곤과 사이트명 라벨.
// 사이트와 폴리곤은 Spatial Log 엑셀 '프로젝트' 시트의 사이트 표(geojson)에서 온다(data/spatiallog.js 가 SITES 를 채운다).
import { SITES } from '../data/explorerData';

export function buildSpaceSites() {
  return SITES.filter((s) => s.polygon && s.center).map((s) => ({ name: s.name, lng: s.center[0], lat: s.center[1], ring: s.polygon }));
}
