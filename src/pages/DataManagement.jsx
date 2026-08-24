import { useState } from 'react';
import Icon from '../components/Icon';
import { CATS, CAT_MAP, ITEMS, PROJECTS, COLLECTIONS, MEMBERSHIP, PROJECT_LOC, itemCollections, DERIVATIONS, originIdsOf, derivedIdsOf } from '../data/explorerData';

// 데이터 관리: 콜렉션(생성·수정·삭제)과 데이터 아이템(등록·콜렉션 연결·삭제)
// 관리. Explorer가 읽는 동일한 라이브 모듈 데이터(ITEMS / PROJECTS /
// COLLECTIONS / MEMBERSHIP)를 편집하므로 탐색 화면에 즉시 반영된다.

const collNames = () => PROJECTS.filter((p) => p !== '전체 프로젝트');

// 업로드 1단계에서 보여줄 유형별 안내 (확장자 · 업로드 단위).
const TYPE_HINTS = {
  pointcloud: { exts: 'LAS · LAZ · E57', unit: '스캔 1회분이 아이템 1개가 됩니다.' },
  model3d: { exts: 'OBJ · GLB · 3D Tiles(ZIP)', unit: '모델 1개가 아이템 1개가 됩니다. 3D Tiles는 ZIP으로 올립니다.' },
  ortho: { exts: 'GeoTIFF', unit: '정사영상 1장이 아이템 1개가 됩니다.' },
  image: { exts: 'JPG · PNG', unit: '함께 올린 사진은 촬영 1회분으로 묶여 아이템 1개가 됩니다.' },
  pano: { exts: 'JPG (등장방형)', unit: '한 지점의 컷 묶음이 아이템 1개가 됩니다.' },
  video: { exts: 'MP4 · MOV', unit: '영상 1편이 아이템 1개가 됩니다. 자막(SRT)은 함께 묶입니다.' },
  document: { exts: 'PDF · DOCX', unit: '문서 1부가 아이템 1개가 됩니다.' },
};

// 업로드 3단계 분석 파이프라인 — 사람이 읽는 말이 앞, 모듈 이름은 뒤.
const PIPE = [
  { id: 'bundle', label: '파일을 아이템으로 묶는 중' },
  { id: 'detect', label: '선택한 유형 확인 중' },
  { id: 'extract', label: '파일에서 메타데이터 읽는 중' },
  { id: 'inherit', label: '콜렉션 기본값 채우는 중' },
  { id: 'suggest', label: '연관 아이템 찾는 중' },
  { id: 'thumbnail', label: '미리보기 만드는 중' },
];

// 대량 데이터에서 아이템을 찾기 위한 간단한 검색 매처 (제목·공간·유형).
function itemMatches(it, q) {
  if (!q) return true;
  const k = q.trim().toLowerCase();
  if (!k) return true;
  return (
    it.title.toLowerCase().includes(k)
    || (it.space || '').toLowerCase().includes(k)
    || (CAT_MAP[it.cat]?.label || '').toLowerCase().includes(k)
  );
}

function makeCollDraft(name) {
  if (!name) return { orig: null, name: '', desc: '', members: Object.fromEntries(ITEMS.map((i) => [i.id, false])) };
  return {
    orig: name,
    name,
    desc: COLLECTIONS[name]?.desc || '',
    members: Object.fromEntries(ITEMS.map((i) => [i.id, itemCollections(i).includes(name)])),
  };
}

function makeItemDraft(id) {
  if (!id) {
    return { orig: null, title: '', desc: '', cat: 'image', fileName: null, fileSize: null, colls: Object.fromEntries(collNames().map((n) => [n, false])) };
  }
  const it = ITEMS.find((i) => i.id === id);
  return {
    orig: id,
    title: it.title,
    desc: it.desc || '',
    cat: it.cat,
    fileName: null,
    fileSize: null,
    colls: Object.fromEntries(collNames().map((n) => [n, itemCollections(it).includes(n)])),
  };
}

function fmtSize(bytes) {
  if (bytes == null) return null;
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  return Math.max(1, Math.round(bytes / 1024)) + 'KB';
}

export default function DataManagement({ onNavigate, initialCollection }) {
  const initial = initialCollection && initialCollection !== '전체 프로젝트' ? initialCollection : collNames()[0] || null;
  const [tab, setTab] = useState('collections');
  const [selected, setSelected] = useState(initial);
  const [draft, setDraft] = useState(() => makeCollDraft(initial));
  const [itemSel, setItemSel] = useState(ITEMS[0]?.id || null);
  const [itemDraft, setItemDraft] = useState(() => makeItemDraft(ITEMS[0]?.id || null));
  const [toast, setToast] = useState(null);
  const [, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2200);
  };

  // ── 콜렉션 ──────────────────────────────────────────────
  const pick = (name) => { setSelected(name); setDraft(makeCollDraft(name)); setCollAdd(false); setCollItemQuery(''); };
  const startNew = () => { setSelected(null); setDraft(makeCollDraft(null)); setCollAdd(false); setCollItemQuery(''); };
  const memberCount = (name) => ITEMS.filter((i) => itemCollections(i).includes(name)).length;
  const draftCount = Object.values(draft.members).filter(Boolean).length;

  const saveColl = () => {
    const name = draft.name.trim();
    if (!name) { showToast('콜렉션 이름을 입력하세요'); return; }
    if (name !== draft.orig && PROJECTS.includes(name)) { showToast('같은 이름의 콜렉션이 이미 있습니다'); return; }
    if (draft.orig == null) {
      PROJECTS.push(name);
      COLLECTIONS[name] = { desc: draft.desc };
    } else {
      if (name !== draft.orig) {
        const i = PROJECTS.indexOf(draft.orig);
        if (i >= 0) PROJECTS[i] = name;
        COLLECTIONS[name] = COLLECTIONS[draft.orig] || {};
        delete COLLECTIONS[draft.orig];
      }
      COLLECTIONS[name] = { ...(COLLECTIONS[name] || {}), desc: draft.desc };
    }
    ITEMS.forEach((it) => {
      const cur = (MEMBERSHIP[it.id] || []).filter((n) => n !== draft.orig && n !== name);
      MEMBERSHIP[it.id] = draft.members[it.id] ? [...cur, name] : cur;
    });
    setSelected(name);
    setDraft(makeCollDraft(name));
    bump();
    showToast('저장되었습니다');
  };

  const deleteColl = () => {
    if (draft.orig == null) { pick(collNames()[0] || null); return; }
    if (!window.confirm(`"${draft.orig}" 콜렉션을 삭제할까요?\n담긴 아이템 자체는 삭제되지 않습니다.`)) return;
    const i = PROJECTS.indexOf(draft.orig);
    if (i >= 0) PROJECTS.splice(i, 1);
    delete COLLECTIONS[draft.orig];
    ITEMS.forEach((it) => { MEMBERSHIP[it.id] = (MEMBERSHIP[it.id] || []).filter((n) => n !== draft.orig); });
    const next = collNames()[0] || null;
    setSelected(next);
    setDraft(makeCollDraft(next));
    bump();
    showToast('콜렉션이 삭제되었습니다');
  };

  // ── 데이터 아이템 ────────────────────────────────────────
  const [linkAdd, setLinkAdd] = useState(null);
  const [itemEditMode, setItemEditMode] = useState(true);
  const [linkQuery, setLinkQuery] = useState('');
  const [collItemQuery, setCollItemQuery] = useState('');
  const [collAdd, setCollAdd] = useState(false);
  const [sideQuery, setSideQuery] = useState('');
  const pickItem = (id) => {
    if (itemDraft.orig == null && upFiles.length > 0) {
      if (!window.confirm('업로드를 취소하시겠습니까?')) return;
      clearInterval(window.__samsUpTimer);
    }
    setItemSel(id); setItemDraft(makeItemDraft(id)); setLinkAdd(null); setLinkQuery('');
    setItemEditMode(true);
  };
  const startUpload = () => {
    setItemSel(null); setItemDraft(makeItemDraft(null)); setLinkAdd(null); setLinkQuery('');
    setUpStep('type'); setUpFiles([]); setUpPct(0); setUpDone(0);
    clearInterval(window.__samsUpTimer);
  };

  // ── 업로드 플로우 (유형 → 파일 → 분석 → 검수) ─────────
  const [upStep, setUpStep] = useState('type');
  const [upFiles, setUpFiles] = useState([]);
  const [upPct, setUpPct] = useState(0);
  const [upDone, setUpDone] = useState(0);

  const onFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const files = arr.map((f) => ({ name: f.name, bytes: f.size, size: fmtSize(f.size) }));
    setUpFiles(files);
    if (!itemDraft.title.trim()) {
      setItemDraft((d) => ({ ...d, title: arr[0].name.replace(/\.[^.]+$/, '') }));
    }
  };
  const upTotalSize = () => fmtSize(upFiles.reduce((n, f) => n + (f.bytes || 0), 0));

  const startAnalyze = () => {
    setUpStep('run'); setUpPct(0); setUpDone(0);
    clearInterval(window.__samsUpTimer);
    let pct = 0; let done = 0; let phase = 0;
    const t = setInterval(() => {
      if (phase === 0) {
        pct = Math.min(100, pct + 4);
        setUpPct(pct);
        if (pct >= 100) phase = 1;
      } else if (done < PIPE.length) {
        done += 1;
        setUpDone(done);
      } else {
        clearInterval(t);
        setUpStep('review');
      }
    }, 90);
    window.__samsUpTimer = t;
  };
  const cancelAnalyze = () => { clearInterval(window.__samsUpTimer); setUpStep('input'); setUpPct(0); setUpDone(0); };

  // 업로드에서 나가는 명시적 통로 — 진행 중이면 pickItem의 가드가 확인을 받는다.
  const exitUpload = () => pickItem(ITEMS[0]?.id || null);

  const registerUpload = () => {
    const title = itemDraft.title.trim();
    if (!title) { showToast('아이템 제목을 입력하세요'); return; }
    const linked = collNames().filter((n) => itemDraft.colls[n]);
    const id = 'u' + Math.random().toString(36).slice(2, 8);
    ITEMS.push({
      id, space: '미지정', title, cat: itemDraft.cat,
      date: new Date().toISOString().slice(0, 10),
      size: upTotalSize(), extra: upFiles.length > 1 ? `${upFiles.length} files` : '', status: 'draft', epsg: '—',
      site: PROJECT_LOC.name, project: linked[0] || PROJECT_LOC.project,
      lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat,
      desc: itemDraft.desc || `${upFiles[0]?.name || ''} 업로드`,
    });
    MEMBERSHIP[id] = linked;
    pickItem(id);
    bump();
    showToast('아이템이 등록되었습니다');
  };

  // 아이템 간 파생 관계 연결 — 즉시 적용
  const linkItem = (id, otherId, kind) => {
    if (kind === 'origin') DERIVATIONS[id] = [...(DERIVATIONS[id] || []), otherId];
    else DERIVATIONS[otherId] = [...(DERIVATIONS[otherId] || []), id];
    setLinkAdd(null);
    setLinkQuery('');
    bump();
  };
  const unlinkItem = (id, otherId, kind) => {
    if (kind === 'origin') DERIVATIONS[id] = (DERIVATIONS[id] || []).filter((x) => x !== otherId);
    else DERIVATIONS[otherId] = (DERIVATIONS[otherId] || []).filter((x) => x !== id);
    bump();
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setItemDraft((d) => ({ ...d, fileName: f.name, fileSize: fmtSize(f.size), title: d.title || f.name.replace(/\.[^.]+$/, '') }));
  };

  const saveItem = () => {
    const title = itemDraft.title.trim();
    if (!title) { showToast('아이템 제목을 입력하세요'); return; }
    const linked = collNames().filter((n) => itemDraft.colls[n]);
    if (itemDraft.orig == null) {
      if (!itemDraft.fileName) { showToast('업로드할 파일을 선택하세요'); return; }
      const id = 'u' + Math.random().toString(36).slice(2, 8);
      ITEMS.push({
        id, space: '미지정', title, cat: itemDraft.cat,
        date: new Date().toISOString().slice(0, 10),
        size: itemDraft.fileSize || '—', extra: '', status: 'draft', epsg: '—',
        site: PROJECT_LOC.name, project: linked[0] || PROJECT_LOC.project,
        lng: null, lat: null, projectLng: PROJECT_LOC.lng, projectLat: PROJECT_LOC.lat,
        desc: itemDraft.desc || `${itemDraft.fileName} 업로드`,
      });
      MEMBERSHIP[id] = linked;
      pickItem(id);
      showToast('아이템이 등록되었습니다');
    } else {
      const it = ITEMS.find((i) => i.id === itemDraft.orig);
      it.title = title;
      it.desc = itemDraft.desc;
      setItemDraft(makeItemDraft(it.id));
      setItemEditMode(true);
      showToast('저장되었습니다');
    }
    bump();
  };

  const deleteItem = () => {
    if (itemDraft.orig == null) { pickItem(ITEMS[0]?.id || null); return; }
    const it = ITEMS.find((i) => i.id === itemDraft.orig);
    if (!window.confirm(`"${it.title}" 아이템을 삭제할까요?`)) return;
    const idx = ITEMS.findIndex((i) => i.id === it.id);
    if (idx >= 0) ITEMS.splice(idx, 1);
    delete MEMBERSHIP[it.id];
    const next = ITEMS[0]?.id || null;
    pickItem(next);
    bump();
    showToast('아이템이 삭제되었습니다');
  };

  // ── 공용 스타일 ─────────────────────────────────────────
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', marginBottom: 8 };
  const field = { width: '100%', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--ant-text)' };
  const primaryBtn = { height: 36, padding: '0 24px', borderRadius: 8, border: 'none', background: 'var(--ant-primary)', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
  const ghostBtn = { height: 36, padding: '0 24px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
  const dangerBtn = { height: 36, padding: '0 24px', borderRadius: 8, border: '1px solid var(--ant-error, #ff4d4f)', background: 'var(--ant-bg)', color: 'var(--ant-error, #ff4d4f)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };

  const statusChip = (st) => (
    <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 600, padding: '0 6px', borderRadius: 20, lineHeight: '16px', color: st === 'published' ? 'var(--ant-success)' : 'var(--ant-warning)', background: st === 'published' ? 'var(--ant-success-bg)' : 'var(--ant-warning-bg)', border: `1px solid ${st === 'published' ? 'var(--ant-success-border)' : 'var(--ant-warning-border)'}` }}>
      {st === 'published' ? 'Pub' : 'Draft'}
    </span>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--ant-bg-layout)', color: 'var(--ant-text)', overflow: 'hidden', fontFamily: 'var(--ant-font-sans)' }}>
      {/* Header */}
      <header style={{ height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 44, padding: '0 20px', background: 'var(--ant-bg)', borderBottom: '1px solid var(--ant-border-secondary)', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
          <svg height="25.2" width="107.1" viewBox="0 0 415 98" fill="none" aria-label="SAMS">
            <path d="M48.997 93.3424C47.6729 94.0572 45.7649 94.2845 44.381 93.5407L6.26612 73.0328C4.88681 72.289 4.08681 71.0741 4.02704 69.8469C3.97187 68.7188 4.7121 67.1361 5.93508 66.475L18.6339 59.5908L6.19715 52.8719C5.05233 52.2521 4.16957 51.0165 4.06382 50.0538C3.9213 48.7893 4.40865 47.1364 5.65462 46.467L19.3373 39.0663L5.5029 31.3061C2.84544 29.8144 4.06842 26.1615 6.41324 24.893L43.7511 4.70731C45.535 3.74038 47.6775 3.7817 49.42 4.72797L87.4429 25.3599C89.3004 26.7896 89.7234 30.145 87.4521 31.3846L73.5257 38.9961L87.59 46.7521C90.0084 48.0868 88.9877 51.5951 86.8958 52.7314L74.4039 59.5206L86.5096 66.1196C87.8843 66.8676 88.8084 67.913 88.9372 69.3303C89.0429 70.4873 88.482 72.041 87.0889 72.7931L48.997 93.3382V93.3424ZM48.8361 65.1816L77.8659 49.5331L45.0568 31.9177C43.1442 30.8929 42.5741 28.9508 43.5764 27.2111C44.2568 26.0293 46.7212 24.6078 48.5649 25.5996L66.1556 35.0498L78.1142 28.4879L48.2568 12.3642C47.158 11.5874 45.981 11.6122 44.8131 12.2444L14.8776 28.459L47.8936 46.2687C50.0545 47.434 51.0154 49.1364 50.0085 51.1612C49.2177 52.7438 46.5373 53.8099 44.5649 52.7603L26.6063 43.1613L14.9649 49.4587L44.2246 65.1651C45.6269 66.2891 47.1488 66.0866 48.8315 65.1775L48.8361 65.1816ZM15.1489 69.5452L44.7396 85.578C45.8614 86.1524 47.0476 86.1896 48.1878 85.64L77.7878 69.6237L66.9188 63.5205L48.6936 73.2848C46.997 73.8385 45.2039 73.7848 43.6637 73.008L26.1097 63.5453L15.1397 69.5411L15.1489 69.5452Z" fill="var(--ant-text-heading)" />
            <path d="M170.347 73.2403C167.758 73.9678 165.113 74.5579 162.533 74.563L136.884 74.6444C134.096 74.6545 131.277 74.1509 128.703 73.4082C122.731 71.6785 120.604 65.9401 121.179 59.8456L131.791 59.8965C131.578 62.8521 133.368 64.9684 136.156 65.1007C145.054 65.5229 153.906 65.4212 162.813 65.1007C166.232 64.9735 168.384 63.0251 168.414 59.8456C168.445 56.8594 166.247 54.7126 162.854 54.4887L136.502 52.7438C133.343 52.5352 130.291 51.9146 127.472 50.6987C120.981 47.8957 120.365 40.8956 121.403 33.9668C122.568 26.2138 129.629 23.3955 137.301 23.3955H162.935C165.459 23.3955 168.023 23.7974 170.363 24.4384C176.335 26.0765 178.243 31.998 177.841 37.9755L167.295 37.945C167.305 34.8062 165.489 32.8273 162.849 32.8273L136.675 32.8374C133.765 32.8374 131.969 34.7502 131.649 37.4109C131.298 40.3258 132.9 42.8339 136.075 43.073L158.662 44.7924C167.29 45.4487 176.986 45.9778 178.579 55.552C179.85 63.1879 178.106 71.0731 170.347 73.2454V73.2403Z" fill="var(--ant-text-heading)" />
            <path d="M249.276 74.6447L224.928 34.2114L200.82 74.6295L188.956 74.5939L219.017 24.0063L231.018 24.0521L241.268 41.3894L261.19 74.604L249.276 74.6447Z" fill="var(--ant-text-heading)" />
            <path d="M225.081 74.3344C229.144 74.3344 232.437 71.0409 232.437 66.9782C232.437 62.9155 229.144 59.6221 225.081 59.6221C221.018 59.6221 217.725 62.9155 217.725 66.9782C217.725 71.0409 221.018 74.3344 225.081 74.3344Z" fill="var(--ant-text-heading)" />
            <path d="M332.308 74.6445L332.273 39.3187L311.705 64.7345L302.767 64.7244L281.904 39.3085L281.858 74.614L271.19 74.619L271.205 23.9399L282.855 23.9806L307.274 54.2548L331.235 23.9959L342.864 23.9603L342.88 74.614L332.308 74.6445Z" fill="var(--ant-text-heading)" />
            <path d="M391.419 74.6293H369.824C366.731 74.6344 363.608 74.2172 360.713 73.4389C354.695 71.8211 352.629 66.3015 352.95 59.8H363.76C363.516 62.6946 365.256 64.9584 368.237 65.0805C377.506 65.4723 386.729 65.5129 395.927 64.9076C398.531 64.7346 400.083 62.8014 400.348 60.4868C400.719 57.2716 398.72 54.7229 395.306 54.4991L368.542 52.7287C361.227 52.2454 354.262 49.9104 353.199 42.4525C352.253 35.8289 353.174 28.3456 359.171 25.4713C362.041 24.0977 365.286 23.3702 368.557 23.3702L395.449 23.355C397.834 23.355 400.236 23.7772 402.459 24.408C408.228 26.036 410.09 31.6574 409.942 37.8994H399.198C399.478 35.0505 397.697 32.8071 394.894 32.802L368.695 32.7765C365.551 32.7765 363.648 35.0149 363.567 37.8638C363.491 40.6312 365.129 42.834 368.105 43.063L384.77 44.3398L400.577 45.9322C404.677 46.3442 408.324 49.071 409.769 52.9678C411.214 56.8646 411.244 61.5398 410.059 65.6452C407.867 73.2608 399.564 74.6445 391.409 74.6445L391.419 74.6293Z" fill="var(--ant-text-heading)" />
          </svg>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, height: '100%', flex: 'none' }}>
          <div onClick={() => onNavigate('explorer')} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--ant-text-secondary)', cursor: 'pointer' }}>데이터 탐색</div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--ant-text-heading)', background: '#ECEEFC' }}>데이터 관리</div>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button title="로그아웃" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 8 }}>
            <Icon name="IconLogoutOutlined" size={16} />LOGOUT
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 좌측: 탭 + 목록 */}
        <aside style={{ width: 300, flex: 'none', background: 'var(--ant-bg)', borderRight: '1px solid var(--ant-border-secondary)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 8, display: 'flex', color: 'var(--ant-text-tertiary)', pointerEvents: 'none' }}>
                <Icon name="IconSearchOutlined" size={14} />
              </span>
              <input value={sideQuery} onChange={(e) => setSideQuery(e.target.value)} placeholder="콜렉션 · 아이템 검색"
                style={{ width: '100%', height: 32, padding: '0 28px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--ant-text)' }} />
              {!!sideQuery && (
                <span onClick={() => setSideQuery('')} style={{ position: 'absolute', right: 8, color: 'var(--ant-text-tertiary)', display: 'flex', cursor: 'pointer' }}>
                  <Icon name="IconCloseCircleOutlined" size={14} />
                </span>
              )}
            </div>
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ant-border-secondary)', display: 'flex', gap: 8 }}>
            {[['collections', `콜렉션 ${collNames().length}`], ['items', `아이템 ${ITEMS.length}`]].map(([key, lbl]) => {
              const on = tab === key;
              return (
                <button key={key} onClick={() => setTab(key)} style={{ flex: 1, height: 32, borderRadius: 8, border: 'none', background: on ? '#ECEEFC' : 'transparent', color: on ? 'var(--ant-text-heading)' : 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {lbl}
                </button>
              );
            })}
          </div>

          {tab === 'collections' && (
            <>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={startNew} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: '1px solid var(--ant-primary)', background: 'var(--ant-bg)', color: 'var(--ant-primary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                  + 새 콜렉션
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                {collNames().filter((name) => {
                  const k = sideQuery.trim().toLowerCase();
                  return !k || name.toLowerCase().includes(k) || (COLLECTIONS[name]?.desc || '').toLowerCase().includes(k);
                }).map((name) => {
                  const on = selected === name && draft.orig != null;
                  return (
                    <div key={name} onClick={() => pick(name)} style={{ padding: '12px', borderRadius: 8, cursor: 'pointer', background: on ? '#ECEEFC' : 'transparent', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ant-text-tertiary)' }}>아이템 {memberCount(name)}건</div>
                    </div>
                  );
                })}
                {draft.orig == null && (
                  <div style={{ padding: '12px', borderRadius: 8, background: '#ECEEFC' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-primary)' }}>{draft.name.trim() || '새 콜렉션'}</div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ant-text-tertiary)' }}>작성 중 · 아이템 {draftCount}건</div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'items' && (
            <>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={startUpload} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: '1px solid var(--ant-primary)', background: 'var(--ant-bg)', color: 'var(--ant-primary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                  + 업로드
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                {ITEMS.filter((it) => itemMatches(it, sideQuery)).map((it) => {
                  const c = CAT_MAP[it.cat];
                  const on = itemSel === it.id && itemDraft.orig != null;
                  return (
                    <div key={it.id} onClick={() => pickItem(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: on ? '#ECEEFC' : 'transparent', marginBottom: 4 }}>
                      <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color }}>
                        <Icon name={c.icon} size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</span>
                          {statusChip(it.status)}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11, color: 'var(--ant-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.label} · {it.date} · {it.size}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {itemDraft.orig == null && (
                  <div style={{ padding: '12px', borderRadius: 8, background: '#ECEEFC' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-primary)' }}>{itemDraft.title.trim() || '새 아이템 등록'}</div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--ant-text-tertiary)' }}>작성 중{itemDraft.fileName ? ` · ${itemDraft.fileName}` : ''}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* 우측: 편집기 */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {tab === 'collections' && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 40px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{draft.orig == null ? '새 콜렉션 만들기' : draft.orig}</div>

              <div style={label}>제목</div>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="콜렉션 이름"
                style={{ ...field, height: 36, padding: '0 12px' }} />

              <div style={{ ...label, marginTop: 20 }}>설명</div>
              <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="콜렉션 설명" rows={3}
                style={{ ...field, padding: '8px 12px', resize: 'vertical', lineHeight: 1.6 }} />

              <div style={{ ...label, marginTop: 20 }}>담긴 아이템 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {draftCount}건</span></div>
              {(() => {
                const members = ITEMS.filter((it) => draft.members[it.id]);
                return (
                  <>
                    {members.length > 0 && (
                      <div style={{ background: 'var(--ant-bg)', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', padding: 4, maxHeight: 320, overflowY: 'auto', marginBottom: 8 }}>
                        {members.map((it) => {
                          const c = CAT_MAP[it.cat];
                          return (
                            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8 }}>
                              <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color }}>
                                <Icon name={c.icon} size={14} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--ant-text-tertiary)' }}>{c.label} · {it.date} · {it.size}</div>
                              </div>
                              <span onClick={() => setDraft({ ...draft, members: { ...draft.members, [it.id]: false } })} title="콜렉션에서 제외"
                                style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '4px', color: 'var(--ant-text-tertiary)', cursor: 'pointer' }}>
                                <Icon name="IconCloseOutlined" size={12} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!collAdd && (
                      <button onClick={() => { setCollAdd(true); setCollItemQuery(''); }} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: '1px dashed var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                        + 아이템 추가
                      </button>
                    )}
                    {collAdd && (() => {
                      const candidates = ITEMS.filter((it) => !draft.members[it.id]);
                      const matched = candidates.filter((it) => itemMatches(it, collItemQuery));
                      const shown = matched.slice(0, 50);
                      return (
                        <div style={{ background: 'var(--ant-bg)', border: '1px solid var(--ant-border)', borderRadius: 12, padding: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)' }}>추가할 아이템을 선택하세요 · 후보 {candidates.length}건</span>
                            <button onClick={() => { setCollAdd(false); setCollItemQuery(''); }} style={{ height: 24, padding: '0 8px', border: 'none', background: 'transparent', color: 'var(--ant-text-tertiary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
                          </div>
                          <input autoFocus value={collItemQuery} onChange={(e) => setCollItemQuery(e.target.value)} placeholder="제목 · 공간 · 유형 검색"
                            style={{ ...field, height: 32, padding: '0 12px', marginBottom: 8 }} />
                          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                            {shown.map((it) => {
                              const c = CAT_MAP[it.cat];
                              return (
                                <div key={it.id} onClick={() => setDraft({ ...draft, members: { ...draft.members, [it.id]: true } })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, cursor: 'pointer' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                  <div style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color }}>
                                    <Icon name={c.icon} size={12} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)' }}>{c.label} · {it.date} · {it.size}</div>
                                  </div>
                                  <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: 'var(--ant-primary)' }}>추가</span>
                                </div>
                              );
                            })}
                            {matched.length === 0 && <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--ant-text-tertiary)' }}>검색 결과가 없습니다.</div>}
                          </div>
                          {matched.length > 50 && (
                            <div style={{ padding: '8px 8px 0', fontSize: 11, color: 'var(--ant-text-tertiary)', borderTop: '1px solid var(--ant-border-secondary)' }}>
                              외 {matched.length - 50}건 — 검색어로 더 좁혀보세요.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                <button onClick={saveColl} style={primaryBtn}>{draft.orig == null ? '생성' : '저장'}</button>
                <button onClick={() => pick(selected || collNames()[0])} style={ghostBtn}>되돌리기</button>
                {draft.orig != null && <button onClick={deleteColl} style={{ ...dangerBtn, marginLeft: 'auto' }}>콜렉션 삭제</button>}
              </div>
            </div>
          )}

          {tab === 'items' && itemDraft.orig != null && (
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ITEMS.find((i) => i.id === itemDraft.orig)?.title || '아이템'}
                </span>
                {itemEditMode && (
                  <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: 'var(--ant-primary)', background: 'rgba(22,119,255,0.08)', padding: '2px 8px', borderRadius: 10 }}>편집모드</span>
                )}
                {!itemEditMode && (
                  <button onClick={() => setItemEditMode(true)} style={{ flex: 'none', height: 28, padding: '0 16px', borderRadius: 14, border: '1px solid var(--ant-primary)', background: 'var(--ant-bg)', color: 'var(--ant-primary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                    편집
                  </button>
                )}
              </div>

              {itemEditMode ? (
                <>
                  <div style={label}>제목</div>
                  <input value={itemDraft.title} onChange={(e) => setItemDraft({ ...itemDraft, title: e.target.value })} placeholder="아이템 제목"
                    style={{ ...field, height: 36, padding: '0 12px' }} />

                  <div style={{ ...label, marginTop: 20 }}>설명</div>
                  <textarea value={itemDraft.desc} onChange={(e) => setItemDraft({ ...itemDraft, desc: e.target.value })} placeholder="아이템 설명" rows={3}
                    style={{ ...field, padding: '8px 12px', resize: 'vertical', lineHeight: 1.6 }} />
                </>
              ) : (
                <>
                  <div style={label}>설명</div>
                  <div style={{ background: 'var(--ant-bg)', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', padding: '12px 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--ant-text)' }}>
                    {itemDraft.desc || <span style={{ color: 'var(--ant-text-tertiary)' }}>설명이 없습니다.</span>}
                  </div>
                </>
              )}

              {itemDraft.orig != null && (() => {
                const it = ITEMS.find((i) => i.id === itemDraft.orig);
                if (!it) return null;
                const c = CAT_MAP[it.cat];
                return (
                  <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 12, background: 'var(--ant-bg)', border: '1px solid var(--ant-border-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color }}>
                      <Icon name={c.icon} size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ant-text-secondary)' }}>
                      {c.label} · {it.date} · {it.size}{it.extra ? ` · ${it.extra}` : ''} · {it.status === 'published' ? 'Published' : 'Draft'}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const it = ITEMS.find((i) => i.id === itemDraft.orig);
                const colls = it ? itemCollections(it) : [];
                if (colls.length === 0) return null;
                return (
                  <>
                    <div style={{ ...label, marginTop: 20 }}>연결된 콜렉션 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {colls.length}개 · 콜렉션 탭에서 편집</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {colls.map((n) => (
                        <span key={n} onClick={() => { setTab('collections'); pick(n); }} title="콜렉션 탭에서 열기"
                          style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 12px', borderRadius: 14, border: '1px solid var(--ant-border)', background: 'var(--ant-fill-quaternary)', color: 'var(--ant-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          {n}
                        </span>
                      ))}
                    </div>
                  </>
                );
              })()}

              {itemDraft.orig != null && (() => {
                const id = itemDraft.orig;
                const rows = [
                  ...originIdsOf(id).map((x) => ({ it: ITEMS.find((i) => i.id === x), kind: 'origin' })),
                  ...derivedIdsOf(id).map((x) => ({ it: ITEMS.find((i) => i.id === x), kind: 'derived' })),
                ].filter((r) => r.it);
                const candidates = ITEMS.filter((i) => i.id !== id && !originIdsOf(id).includes(i.id) && !derivedIdsOf(id).includes(i.id));
                return (
                  <>
                    <div style={{ ...label, marginTop: 20 }}>연결된 아이템 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {rows.length}건 · 즉시 적용</span></div>
                    {rows.length > 0 && (
                      <div style={{ background: 'var(--ant-bg)', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', padding: 4, marginBottom: 8 }}>
                        {rows.map(({ it, kind }) => {
                          const rc = CAT_MAP[it.cat];
                          return (
                            <div key={kind + it.id} onClick={() => pickItem(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                              <div style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: rc.color }}>
                                <Icon name={rc.icon} size={12} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)' }}>{it.date} · {it.size}</div>
                              </div>
                              <span style={{ flex: 'none', fontSize: 10, fontWeight: 600, padding: '0 8px', lineHeight: '18px', borderRadius: 9, background: kind === 'origin' ? 'var(--ant-fill-quaternary)' : 'rgba(22,119,255,0.08)', color: kind === 'origin' ? 'var(--ant-text-secondary)' : 'var(--ant-primary)' }}>
                                {kind === 'origin' ? '원본' : '파생'}
                              </span>
                              {itemEditMode && (
                                <span onClick={(e) => { e.stopPropagation(); unlinkItem(id, it.id, kind); }} title="연결 해제"
                                  style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--ant-text-tertiary)', cursor: 'pointer' }}>
                                  <Icon name="IconCloseOutlined" size={10} />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {itemEditMode && linkAdd == null && candidates.length > 0 && (
                        <>
                          <button onClick={() => setLinkAdd('origin')} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: '1px dashed var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>+ 원본 연결</button>
                          <button onClick={() => setLinkAdd('derived')} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: '1px dashed var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>+ 파생 연결</button>
                        </>
                      )}
                      {linkAdd != null && (() => {
                        const matched = candidates.filter((cd) => itemMatches(cd, linkQuery));
                        const shown = matched.slice(0, 50);
                        return (
                          <div style={{ width: '100%', background: 'var(--ant-bg)', border: '1px solid var(--ant-border)', borderRadius: 12, padding: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)' }}>{linkAdd === 'origin' ? '이 아이템의 원본을 선택하세요' : '이 아이템에서 파생된 아이템을 선택하세요'}</span>
                              <button onClick={() => { setLinkAdd(null); setLinkQuery(''); }} style={{ height: 24, padding: '0 8px', border: 'none', background: 'transparent', color: 'var(--ant-text-tertiary)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
                            </div>
                            <input autoFocus value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="제목 · 공간 · 유형 검색"
                              style={{ ...field, height: 32, padding: '0 12px', marginBottom: 8 }} />
                            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                              {shown.map((cd) => {
                                const cc = CAT_MAP[cd.cat];
                                return (
                                  <div key={cd.id} onClick={() => linkItem(id, cd.id, linkAdd)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, cursor: 'pointer' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                    <div style={{ width: 24, height: 24, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: cc.color }}>
                                      <Icon name={cc.icon} size={12} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cd.title}</div>
                                      <div style={{ fontSize: 11, color: 'var(--ant-text-tertiary)' }}>{cc.label} · {cd.date} · {cd.size}</div>
                                    </div>
                                  </div>
                                );
                              })}
                              {matched.length === 0 && <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--ant-text-tertiary)' }}>검색 결과가 없습니다.</div>}
                            </div>
                            {matched.length > 50 && (
                              <div style={{ padding: '8px 8px 0', fontSize: 11, color: 'var(--ant-text-tertiary)', borderTop: '1px solid var(--ant-border-secondary)' }}>
                                외 {matched.length - 50}건 — 검색어로 더 좁혀보세요.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}

              {itemEditMode && (
                <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                  <button onClick={deleteItem} style={dangerBtn}>아이템 삭제</button>
                  <button onClick={() => pickItem(itemSel || ITEMS[0]?.id || null)} style={{ ...ghostBtn, marginLeft: 'auto' }}>취소</button>
                  <button onClick={saveItem} style={primaryBtn}>저장</button>
                </div>
              )}
            </div>
          )}

          {tab === 'items' && itemDraft.orig == null && (() => {
            const order = ['type', 'input', 'run', 'review'];
            const cur = order.indexOf(upStep);
            const stepLbl = { type: '유형', input: '파일', run: '분석', review: '검수' };
            const ty = CAT_MAP[itemDraft.cat];
            const hint = TYPE_HINTS[itemDraft.cat] || { exts: '', unit: '' };
            const groupBox = { background: 'var(--ant-bg)', borderRadius: 12, border: '1px solid var(--ant-border-secondary)', overflow: 'hidden' };
            const foot = { fontSize: 12, color: 'var(--ant-text-tertiary)', lineHeight: 1.5, padding: '8px 16px 0' };
            return (
              <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 40px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>아이템 업로드</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  {order.map((k, i) => {
                    const done = i < cur; const now = i === cur;
                    return (
                      <span key={k} onClick={done && upStep !== 'run' ? () => setUpStep(k) : undefined}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: now ? 700 : 500, color: now ? 'var(--ant-text)' : done ? 'var(--ant-text-secondary)' : 'var(--ant-text-quaternary)', cursor: done && upStep !== 'run' ? 'pointer' : 'default' }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, background: done ? 'var(--ant-success)' : now ? 'var(--ant-primary)' : 'var(--ant-fill-quaternary)', color: done || now ? '#fff' : 'var(--ant-text-secondary)' }}>{done ? '✓' : i + 1}</span>
                        {stepLbl[k]}
                        {i < order.length - 1 && <span style={{ color: 'var(--ant-text-quaternary)', margin: '0 4px' }}>›</span>}
                      </span>
                    );
                  })}
                  <button onClick={exitUpload} style={{ marginLeft: 'auto', height: 28, padding: '0 12px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>업로드 취소</button>
                </div>

                {upStep === 'type' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', padding: '8px 0 4px' }}>무엇을 업로드하나요?</div>
                    <div style={{ fontSize: 13, color: 'var(--ant-text-secondary)', paddingBottom: 16 }}>한 번에 한 가지 유형만 올립니다.</div>
                    <div style={groupBox}>
                      {CATS.map((c, i) => (
                        <button key={c.key} onClick={() => { setItemDraft({ ...itemDraft, cat: c.key }); setUpFiles([]); setUpStep('input'); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--ant-border-secondary)', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ant-fill-quaternary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: c.color }}>
                            <Icon name={c.icon} size={14} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ant-text)' }}>{c.label}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ant-text-tertiary)', marginTop: 2 }}>{TYPE_HINTS[c.key]?.exts}</span>
                          </span>
                          <span style={{ flex: 'none', color: 'var(--ant-text-quaternary)', fontSize: 14 }}>›</span>
                        </button>
                      ))}
                    </div>
                    <div style={foot}>유형을 고르면 무엇을 어떤 단위로 올리는지 알려드립니다.</div>
                  </>
                )}

                {upStep === 'input' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 12px' }}>
                      <span style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: ty.color }}>
                        <Icon name={ty.icon} size={14} />
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{ty.label}</span>
                      <button onClick={() => setUpStep('type')} style={{ height: 28, padding: '0 8px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ant-primary)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>변경</button>
                    </div>
                    {upFiles.length === 0 ? (
                      <>
                        <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 16px', borderRadius: 16, border: '2px dashed var(--ant-primary-border, #91caff)', background: 'rgba(22,119,255,0.03)', cursor: 'pointer' }}>
                          <span style={{ fontSize: 28, color: 'var(--ant-primary)', lineHeight: 1 }}>+</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ant-text)' }}>여기에 놓으세요</span>
                          <span style={{ fontSize: 12, color: 'var(--ant-text-tertiary)' }}>{hint.exts}</span>
                          <span style={{ marginTop: 8, height: 32, padding: '0 16px', display: 'inline-flex', alignItems: 'center', borderRadius: 16, background: 'var(--ant-primary)', color: '#fff', fontSize: 12.5, fontWeight: 600 }}>파일 선택</span>
                          <input type="file" multiple onChange={(e) => onFiles(e.target.files)} style={{ display: 'none' }} />
                        </label>
                        <div style={foot}><b style={{ color: 'var(--ant-text-secondary)' }}>{hint.unit}</b><br />다른 종류의 파일은 등록 전에 목록에서 확인하고 제외됩니다.</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ant-text-secondary)', margin: '4px 0 8px' }}>놓은 파일 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {upFiles.length}개 · {upTotalSize()}</span></div>
                        <div style={{ ...groupBox, maxHeight: 280, overflowY: 'auto' }}>
                          {upFiles.slice(0, 8).map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--ant-border-secondary)' }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                              <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--ant-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{f.size}</span>
                            </div>
                          ))}
                          {upFiles.length > 8 && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ant-text-tertiary)', borderTop: '1px solid var(--ant-border-secondary)' }}>외 {upFiles.length - 8}개</div>}
                        </div>
                        <div style={foot}>{upFiles.length}개 파일 → <b style={{ color: 'var(--ant-text-secondary)' }}>아이템 1개</b>로 등록됩니다.</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                          <button onClick={() => setUpFiles([])} style={ghostBtn}>다시 선택</button>
                          <button onClick={startAnalyze} style={primaryBtn}>분석 시작</button>
                        </div>
                      </>
                    )}
                  </>
                )}

                {upStep === 'run' && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', padding: '8px 0 4px' }}>업로드 중</div>
                    <div style={{ fontSize: 13, color: 'var(--ant-text-secondary)', paddingBottom: 16 }}>{upFiles.length}개 파일 · {upTotalSize()}</div>
                    <div style={{ ...groupBox, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{upPct}%</span>
                        <span style={{ fontSize: 12, color: 'var(--ant-text-tertiary)' }}>{upPct < 100 ? '스토리지로 전송 중' : '전송 완료'}</span>
                      </div>
                      <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'var(--ant-fill-quaternary)', overflow: 'hidden' }}>
                        <div style={{ width: `${upPct}%`, height: '100%', borderRadius: 3, background: 'var(--ant-primary)', transition: 'width .1s linear' }} />
                      </div>
                    </div>
                    <div style={{ height: 12 }} />
                    <div style={groupBox}>
                      {PIPE.map((pp, i) => {
                        const done = i < upDone; const now = i === upDone && upPct >= 100;
                        return (
                          <div key={pp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--ant-border-secondary)', opacity: done || now ? 1 : 0.45 }}>
                            <span style={{ flex: 'none', width: 18, textAlign: 'center', fontSize: 13, color: done ? 'var(--ant-success)' : 'var(--ant-text-quaternary)' }}>{done ? '✓' : now ? '●' : '○'}</span>
                            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ant-text)' }}>{pp.label} <i style={{ fontStyle: 'normal', fontWeight: 400, fontSize: 11, color: 'var(--ant-text-quaternary)', marginLeft: 4 }}>{pp.id}</i></span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={foot}>실패한 단계가 있어도 등록은 멈추지 않습니다 — 채우지 못한 값은 검수 화면에 표시됩니다.</div>
                    <div style={{ display: 'flex', marginTop: 20 }}>
                      <button onClick={cancelAnalyze} style={ghostBtn}>취소</button>
                    </div>
                  </>
                )}

                {upStep === 'review' && (() => {
                  const linkedCnt = collNames().filter((n) => itemDraft.colls[n]).length;
                  const fromFiles = 9;
                  const fromColl = linkedCnt > 0 ? 3 : 0;
                  const needs = (itemDraft.title.trim() ? 0 : 1) + (itemDraft.desc.trim() ? 0 : 1);
                  const total = fromFiles + fromColl + needs;
                  const pct = Math.round(((fromFiles + fromColl) / total) * 100);
                  return (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', padding: '8px 0 4px' }}>검수</div>
                      <div style={{ fontSize: 13, color: 'var(--ant-text-secondary)', paddingBottom: 16 }}>등록 전에 읽어낸 값을 확인하고 비어 있는 것만 채우면 됩니다.</div>
                      <div style={{ ...groupBox, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 700 }}>{pct}%</span>
                          <span style={{ fontSize: 12, color: 'var(--ant-text-tertiary)' }}>자동으로 채워졌습니다</span>
                        </div>
                        <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'var(--ant-fill-quaternary)', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${(fromFiles / total) * 100}%`, background: 'var(--ant-success)' }} />
                          <div style={{ width: `${(fromColl / total) * 100}%`, background: 'var(--ant-primary)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--ant-text-tertiary)' }}>
                          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--ant-success)', marginRight: 4 }} />파일에서 {fromFiles}</span>
                          {fromColl > 0 && <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--ant-primary)', marginRight: 4 }} />콜렉션에서 {fromColl}</span>}
                          {needs > 0 && <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--ant-warning)', marginRight: 4 }} />직접 입력 {needs}</span>}
                        </div>
                      </div>

                      <div style={{ ...label, marginTop: 20 }}>제목 {!itemDraft.title.trim() && <span style={{ color: 'var(--ant-warning)' }}>· 필요</span>}</div>
                      <input value={itemDraft.title} onChange={(e) => setItemDraft({ ...itemDraft, title: e.target.value })} placeholder="아이템 제목"
                        style={{ ...field, height: 36, padding: '0 12px' }} />

                      <div style={{ ...label, marginTop: 20 }}>설명 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· 선택</span></div>
                      <textarea value={itemDraft.desc} onChange={(e) => setItemDraft({ ...itemDraft, desc: e.target.value })} placeholder="6개월 뒤에 못 알아볼 것 같으면 한 줄 남겨두세요" rows={2}
                        style={{ ...field, padding: '8px 12px', resize: 'vertical', lineHeight: 1.6 }} />

                      <div style={{ ...label, marginTop: 20 }}>콜렉션 연결 <span style={{ fontWeight: 500, color: 'var(--ant-text-quaternary)' }}>· {linkedCnt}개 · 없어도 등록됩니다</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {collNames().map((n) => {
                          const on = !!itemDraft.colls[n];
                          return (
                            <button key={n} onClick={() => setItemDraft({ ...itemDraft, colls: { ...itemDraft.colls, [n]: !on } })}
                              style={{ height: 28, padding: '0 12px', borderRadius: 14, border: `1px solid ${on ? 'var(--ant-primary)' : 'var(--ant-border)'}`, background: on ? 'var(--ant-primary)' : 'var(--ant-bg)', color: on ? '#fff' : 'var(--ant-text)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                              {n}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                        <button onClick={registerUpload} style={primaryBtn}>등록</button>
                        <button onClick={() => setUpStep('input')} style={ghostBtn}>뒤로</button>
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: 'rgba(15,20,28,0.88)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 16px', borderRadius: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
