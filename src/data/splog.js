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

// ── 매핑 ────────────────────────────────────────────────
function buildFromMenus(menus) {
  const items = [];
  const collections = {};
  const membership = {};
  const derivations = {};
  const spaceCoord = {};
  const nodeSpaces = new Map(); // node.id → 그 노드를 품은 공간 이름들
  const nodeById = new Map();

  // 타임라인 메뉴만 아이템을 만든다. 쇼케이스·포인트클러스터 메뉴는
  // 노드가 없어 SAMS 의 아이템 개념과 맞지 않는다.
  const timelineMenus = menus.filter((m) => (m.items || []).some((it) => (it.menuItemNodes || []).length));

  timelineMenus.forEach((menu) => {
    collections[menu.label] = {
      desc: `${menu.label} · Spatial Log 에서 불러온 컬렉션입니다.`,
    };

    (menu.items || []).forEach((entry) => {
      const target = viewpointTarget(entry.viewpoint);
      if (target) spaceCoord[entry.label] = target;
      const isOverview = !(entry.menuItemNodes || []).length
        || entry.code === 'SV_SUNGSU_OVERVIEW'
        || /전체/.test(entry.label);

      (entry.menuItemNodes || []).forEach((min) => {
        const node = min.node;
        if (!node) return;
        nodeById.set(node.id, node);
        if (!nodeSpaces.has(node.id)) nodeSpaces.set(node.id, new Set());
        if (!isOverview) nodeSpaces.get(node.id).add(entry.label);
      });
    });
  });

  const menuOf = (nodeId) => {
    const m = timelineMenus.find((menu) => (menu.items || []).some((entry) => (entry.menuItemNodes || []).some((min) => min.node && min.node.id === nodeId)));
    return m ? m.label : timelineMenus[0]?.label;
  };
  const overviewCoord = () => spaceCoord['k-성수 전체'] || Object.values(spaceCoord)[0] || null;

  nodeById.forEach((node, nodeId) => {
    const t = tableOf(node);
    const spaces = [...(nodeSpaces.get(nodeId) || [])];
    // 여러 공간에 걸친 노드는 표의 '장소'를 쓰고, 그것도 없으면 전체로 둔다.
    const space = spaces.length === 1 ? spaces[0] : (t['장소'] || '성수클러스터 전체');
    const coord = spaceCoord[space] || overviewCoord() || {};
    const isEvent = node.type === 'EVENT';
    const gb = t['용량(GB)'];
    const hasSize = gb && !/^0+\.?0*$/.test(gb);
    const format = t['파일 형식'];
    const count = t['수량(개수)'];
    const download = firstLink(t['다운로드 링크']);

    const extra = [];
    if (node.type === 'PLAN') extra.push('계획모델');
    else if (node.type === 'REAL') extra.push('실측모델');
    if (format) extra.push(String(format).toUpperCase());
    if (count) extra.push(`${count}개`);

    items.push({
      id: `n${nodeId}`,
      title: node.name,
      cat: isEvent ? 'event' : 'model3d',
      date: `${node.yyyy}-${node.mm}-${node.dd}`,
      space,
      project: menuOf(nodeId),
      size: hasSize ? `${gb}GB` : '—',
      extra: extra.join(' · '),
      status: 'published',
      epsg: '—',
      site: '성수동, 서울',
      lng: coord.lng ?? null,
      lat: coord.lat ?? null,
      desc: stripTags(t['내용']) || (isEvent ? `${node.name} · 전후 자료를 비교해 변화를 확인합니다.` : node.name),
      // Cesium 3D Tiles 경로 — SAMS 뷰어가 직접 읽지는 못하고 출처 표시용이다.
      tilesetPath: node.tilesets?.[0]?.path || null,
      downloadUrl: download,
    });

    if (isEvent && node.prevNode && node.nextNode) {
      items[items.length - 1].compare = {
        beforeId: `n${node.prevNode.id}`,
        afterId: `n${node.nextNode.id}`,
        beforeLabel: '이전',
        afterLabel: '이후',
      };
    }
  });

  // 날짜 순으로 정리해 시기별 묶음이 자연스럽게 읽히도록 한다.
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
