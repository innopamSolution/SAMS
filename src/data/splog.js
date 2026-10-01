// Spatial Log API 에서 실제 데이터를 받아 SAMS 구조로 옮긴다.
//
// 대응 관계
//   메뉴(성수클러스터)        → 컬렉션
//   메뉴 하위 item(HQ, C01 …) → 공간
//   item 의 node             → 아이템(데이터) 한 건
//   node.type REAL·PLAN      → 3D 모델,  EVENT → 이벤트
//   EVENT 의 prevNode/nextNode → 전후 비교 대상
//
// 같은 node 가 여러 공간에 걸쳐 있으므로(예: '성수클러스터 1차' 는 모든 건물에
// 포함) node 를 기준으로 한 건만 만들고, 공간은 그 node 를 품은 곳 중
// 전체보기를 뺀 하나로 정한다.

import { ITEMS, PROJECTS, COLLECTIONS, MEMBERSHIP, DERIVATIONS, CAT_MAP } from './explorerData';

export const SPLOG_API = 'https://1.splog.dev.innopam.kr/api/menus';

// ── 좌표 ────────────────────────────────────────────────
// viewpoint.position 은 지구중심 직교좌표(ECEF)의 카메라 위치다. 카메라가
// 비스듬히 내려다보므로 위치를 그대로 쓰면 대상에서 수백 m 벗어난다.
// 시선 방향으로 지면까지 투영해 실제 바라보는 지점을 구한다.
const A = 6378137.0;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const E2 = (A * A - B * B) / (A * A);
const EP2 = (A * A - B * B) / (B * B);

function ecefToGeodetic([x, y, z]) {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * A, p * B);
  const lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3);
  const lng = Math.atan2(y, x);
  const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return { lat, lng, alt: p / Math.cos(lat) - N };
}

function viewpointTarget(viewpoint) {
  if (!viewpoint || !viewpoint.position) return null;
  const { lat, lng, alt } = ecefToGeodetic(viewpoint.position);
  const { heading = 0, pitch = -Math.PI / 2 } = viewpoint.orientation || {};
  const down = Math.abs(pitch);
  // 거의 수직으로 내려다보면 카메라 바로 아래가 대상이다.
  const ground = down > 1.4 ? 0 : alt / Math.tan(down);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(lat);
  return {
    lng: +((lng * 180) / Math.PI + (ground * Math.sin(heading)) / mPerDegLng).toFixed(6),
    lat: +((lat * 180) / Math.PI + (ground * Math.cos(heading)) / mPerDegLat).toFixed(6),
  };
}

// ── 표 읽기 ─────────────────────────────────────────────
function tableOf(node) {
  const rows = node.content?.items?.[0]?.table || [];
  return Object.fromEntries(rows.map(([k, v]) => [k, v]));
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '').trim();
}

function firstLink(html) {
  const m = String(html || '').match(/href='([^']+)'/) || String(html || '').match(/href="([^"]+)"/);
  return m ? m[1] : null;
}

// ── 로컬 3D 자료 연결 ───────────────────────────────────
// 원본의 3D 자료는 Cesium 3D Tiles 라 SAMS 뷰어가 직접 읽지 못한다.
// 다만 같은 대상·같은 회차를 담은 변환본이 이미 있어, 해당 칸에 이어 붙인다.
// 키는 '회차 이름|공간' — 클러스터 전체 회차는 건물마다 따로 있으므로
// 자료가 가리키는 그 건물에만 붙는다.
const local = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');

const LOCAL_ASSETS = {
  // /models/2023/Region16_KP-E/emart_04 — 이마트 본관 실측
  'HQ_1차|HQ(이마트)': { pointCloudUrl: local('/data/emart-pointcloud.bin'), extent: [90, 60, 20] },
  // /models/3d-tiles-merged/2023 중 HQ 구간
  '성수클러스터 1차|HQ(이마트)': { meshUrl: local('/data/hq-mesh.bin'), extent: [90, 60, 20] },
  // /models/Manual/K-HQ — 설계(계획) 모델
  'SD100%|HQ(이마트)': { meshUrl: local('/data/k-hq-model.bin'), extent: [90, 60, 20] },
  // /models/2023/Region_20_Samyang — 삼양비즈니스폼 실측
  'C03_1차|C03(삼양비지네스폼)': { meshUrl: local('/data/samyang-mesh.bin'), extent: [70, 50, -12] },
};

// ── 매핑 ────────────────────────────────────────────────
// 노드(성수클러스터 1차 …)는 '시기', 메뉴 하위 항목(HQ·C01 …)은 '공간'이다.
// 한 회차가 여러 건물을 덮으므로 (공간 × 시기) 한 칸을 아이템 한 건으로 만든다.
// 전체보기 항목은 건물이 아니므로 제외한다 — 그 노드들은 건물 쪽에 이미 있다.
function isOverviewEntry(entry) {
  return entry.code === 'SV_SUNGSU_OVERVIEW' || /전체/.test(entry.label || '');
}

function buildFromMenus(menus) {
  const items = [];
  const collections = {};
  const membership = {};
  const derivations = {};

  const timelineMenus = menus.filter((m) => (m.items || []).some((it) => (it.menuItemNodes || []).length));

  timelineMenus.forEach((menu) => {
    collections[menu.label] = { desc: `${menu.label} · Spatial Log 에서 불러온 컬렉션입니다.` };

    (menu.items || []).forEach((entry) => {
      if (isOverviewEntry(entry)) return;
      const coord = viewpointTarget(entry.viewpoint) || {};
      const nodeIds = new Set((entry.menuItemNodes || []).map((min) => min.node && min.node.id).filter(Boolean));
      // 같은 건물 안에서만 전/후를 잇는다 — 그 건물 타임라인에 없는 회차는 가리키지 않는다.
      const idIn = (nodeId) => (nodeIds.has(nodeId) ? `${entry.code}-n${nodeId}` : null);

      (entry.menuItemNodes || []).forEach((min) => {
        const node = min.node;
        if (!node) return;
        const t = tableOf(node);
        const isEvent = node.type === 'EVENT';
        const gb = t['용량(GB)'];
        const hasSize = gb && !/^0+\.?0*$/.test(gb);
        const count = t['수량(개수)'];

        // 실제 값이 있는 것만 담는다. 없는 자리는 '—' 대신 비워 둔다.
        const extra = [];
        if (node.type === 'PLAN') extra.push('계획모델');
        else if (node.type === 'REAL') extra.push('실측모델');
        if (t['파일 형식']) extra.push(String(t['파일 형식']).toUpperCase());
        if (count) extra.push(`${count}개`);

        const item = {
          id: `${entry.code}-n${node.id}`,
          title: node.name,
          cat: isEvent ? 'event' : 'model3d',
          date: `${node.yyyy}-${node.mm}-${node.dd}`,
          space: entry.label,
          project: menu.label,
          size: hasSize ? `${gb}GB` : '',
          extra: extra.join(' · '),
          status: 'published',
          epsg: '—',
          site: '성수동, 서울',
          lng: coord.lng ?? null,
          lat: coord.lat ?? null,
          desc: stripTags(t['내용']) || '',
          tilesetPath: node.tilesets?.[0]?.path || null,
          downloadUrl: firstLink(t['다운로드 링크']),
        };

        const extraAsset = LOCAL_ASSETS[`${node.name}|${entry.label}`];
        if (extraAsset) Object.assign(item, extraAsset);

        if (isEvent && node.prevNode && node.nextNode) {
          const before = idIn(node.prevNode.id);
          const after = idIn(node.nextNode.id);
          if (before && after) {
            item.compare = { beforeId: before, afterId: after, beforeLabel: node.prevNode.name, afterLabel: node.nextNode.name };
          }
        }
        items.push(item);
      });
    });
  });

  items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  items.forEach((it) => { membership[it.id] = [it.project]; });

  return { items, collections, membership, derivations, projects: Object.keys(collections) };
}

// ── 적용 ────────────────────────────────────────────────
// 기존 모듈 객체의 '내용만' 갈아끼운다. 화면들은 지금처럼 같은 참조를 보므로
// 구조를 건드리지 않고 데이터 출처만 바뀐다.
export async function loadSplogData() {
  const res = await fetch(SPLOG_API);
  if (!res.ok) throw new Error(`Spatial Log API ${res.status}`);
  const json = await res.json();
  const menus = json?.result?.menus || [];
  const { items, collections, membership, derivations, projects } = buildFromMenus(menus);
  if (!items.length) throw new Error('불러온 아이템이 없습니다');

  ITEMS.splice(0, ITEMS.length, ...items);
  PROJECTS.splice(0, PROJECTS.length, '전체 프로젝트', ...projects);
  Object.keys(COLLECTIONS).forEach((k) => delete COLLECTIONS[k]);
  Object.assign(COLLECTIONS, collections);
  Object.keys(MEMBERSHIP).forEach((k) => delete MEMBERSHIP[k]);
  Object.assign(MEMBERSHIP, membership);
  Object.keys(DERIVATIONS).forEach((k) => delete DERIVATIONS[k]);
  Object.assign(DERIVATIONS, derivations);

  return { count: items.length, collections: projects, types: Object.keys(CAT_MAP) };
}
