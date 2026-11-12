// Spatial Log 엑셀(+ 외장하드 폴더)에서 만든 public/data/spatiallog.json 을 앱 구조로 옮긴다.
// JSON 은 scripts/import-spatiallog.py 가 만든다(사이트·폴리곤·시기·이벤트·공간 데이터 아이템·자산).
//
// 대응 관계
//   사이트(성수 클러스터, HQ, C1 …)  → 공간(space) · 사이트 폴리곤
//   공간 데이터 아이템               → 아이템(데이터) 한 건. 자산(드론 사진·포인트클라우드·타일드 메시 …)을 품는다
//   시기 1~4차                        → 아이템 날짜가 속한 기간(없으면 가장 가까운 시기)
//   이벤트                            → 이벤트 아이템
import { applyStoredStatus } from '../lib/itemStatus';
import { ITEMS, PROJECTS, COLLECTIONS, MEMBERSHIP, DERIVATIONS, SITES, PERIODS } from './explorerData';

const asset = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');
const norm = (s) => String(s || '').replace(/\s+/g, '');

const fmtGB = (gb) => (gb == null ? '' : gb >= 1 ? `${+gb.toFixed(2)}GB` : `${Math.round(gb * 1024)}MB`);

function periodOf(date) {
  if (!date || !PERIODS.length) return null;
  const hit = PERIODS.find((p) => date >= p.start && date <= p.end);
  if (hit) return hit;
  // '시기' 탭의 헤더는 1~4차뿐이라, 기간 밖의 자료는 가장 가까운 시기에 붙인다.
  return date < PERIODS[0].start ? PERIODS[0] : PERIODS[PERIODS.length - 1];
}

const dateRange = (it) => {
  const s = it.start || it.date; const e = it.end;
  return e && e !== s ? `${s} ~ ${e}` : s || '';
};

function assetRow(a) {
  const meta = [a.format, a.fileType, fmtGB(a.gb), a.count != null ? `${a.count}개` : ''].filter(Boolean).join(' · ');
  const state = a.tileset ? ' · 3D 보기 가능' : a.available ? ' · 파일 있음' : a.path || a.name ? ' · 파일 추후 전달' : '';
  return [a.detail || a.format, (meta || '—') + state];
}

export async function loadSpatialLogData() {
  const res = await fetch(asset('data/spatiallog.json'), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`spatiallog.json ${res.status}`);
  const j = await res.json();

  const projectName = j.project.name;
  SITES.splice(0, SITES.length, ...j.sites);
  PERIODS.splice(0, PERIODS.length, ...j.periods);
  const siteByKey = Object.fromEntries(j.sites.map((s) => [s.key, s]));

  const items = j.items.map((x) => {
    const site = siteByKey[x.site];
    const [lng, lat] = (site && site.center) || [null, null];
    const tileAsset = x.assets.find((a) => a.tileset);
    const per = periodOf(x.date);
    const totalGB = x.assets.reduce((t, a) => t + (a.gb || 0), 0);
    const methods = [...new Set(x.assets.map((a) => a.method).filter(Boolean))].join(', ');
    return {
      id: x.id,
      title: x.title,
      cat: x.cat,
      date: x.date || '',
      space: x.siteName,
      project: projectName,
      size: totalGB ? fmtGB(totalGB) : '',
      extra: x.assets.map((a) => a.detail.replace(/(드론|지상)\s*/, '').replace(/\s*모델$/, '')).join(' · '),
      status: 'published',
      epsg: '—',
      site: '성수동, 서울',
      lng, lat,
      desc: x.assets.map((a) => a.detail).join(' · '),
      period: per ? per.name : null,
      tilesetUrl: tileAsset ? new URL(asset(tileAsset.tileset), window.location.href).href : null, // 타일 렌더러는 절대 주소가 필요하다
      groundH: tileAsset && tileAsset.groundH != null ? tileAsset.groundH : null,
      probe: site && site.polygon ? site.polygon : null,
      assets: x.assets,
      detail: [
        ['공간', x.siteName],
        ['취득 시기', dateRange(x)],
        methods ? ['취득 방식', methods] : null,
        ...x.assets.map(assetRow),
      ].filter((r) => r && r[1]),
    };
  });

  // 이벤트: 해당 사이트의 날짜 지점. 전/후 비교 대상은 같은 사이트의 3D 자료 중 날짜가 가장 가까운 앞·뒤.
  const threeD = items.filter((i) => i.tilesetUrl);
  const events = j.events.map((e, n) => {
    const site = siteByKey[e.site];
    const [lng, lat] = (site && site.center) || [null, null];
    const mine = threeD.filter((i) => norm(i.space) === e.site).sort((a, b) => a.date.localeCompare(b.date));
    const before = [...mine].reverse().find((i) => i.date <= e.date);
    const after = mine.find((i) => i.date > e.date);
    return {
      id: `ev-${n + 1}`,
      title: e.title,
      cat: 'event',
      date: e.date,
      space: site ? site.name : e.site,
      project: projectName,
      size: '',
      extra: before && after ? '전후 비교' : '',
      status: 'published',
      epsg: '—',
      site: '성수동, 서울',
      lng, lat,
      period: (periodOf(e.date) || {}).name || null,
      desc: e.desc || `${site ? site.name : e.site} · ${e.title}`,
      compare: before && after ? { beforeId: before.id, afterId: after.id, beforeLabel: '이전', afterLabel: '이후' } : null,
      detail: [['공간', site ? site.name : e.site], ['날짜', e.date]],
    };
  });

  const all = [...items, ...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  applyStoredStatus(all); // 관리 화면에서 바꾼 공개 여부
  ITEMS.splice(0, ITEMS.length, ...all);

  PROJECTS.splice(0, PROJECTS.length, '전체 프로젝트', projectName);
  Object.keys(COLLECTIONS).forEach((k) => delete COLLECTIONS[k]);
  COLLECTIONS[projectName] = { desc: `${projectName} · 사이트별 공간 데이터(드론·LiDAR·타일드 메시 등)를 시기별로 모은 아카이브입니다.` };
  Object.keys(MEMBERSHIP).forEach((k) => delete MEMBERSHIP[k]);
  all.forEach((i) => { MEMBERSHIP[i.id] = [projectName]; });
  Object.keys(DERIVATIONS).forEach((k) => delete DERIVATIONS[k]);

  return { count: all.length, sites: j.sites.length, annotations: j.annotations };
}
