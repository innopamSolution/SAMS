import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { hasVWorld, searchPlaces, SEARCH_AREA_NAME } from '../lib/vworld';

// 지도 왼쪽 위 장소찾기(브이월드). 장소·도로명·지번을 한 목록으로 보여 주고, 고르면 onPick({ lng, lat, title }) 로 알린다.
export default function PlaceSearch({ onPick, onClear, picked }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hi, setHi] = useState(-1);
  const seqRef = useRef(0);
  const boxRef = useRef(null);

  // 입력이 멈추면(0.3초) 검색한다. 늦게 도착한 이전 응답은 버린다.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setItems([]); setErr(''); setBusy(false); return undefined; }
    const my = ++seqRef.current;
    setBusy(true);
    const t = setTimeout(() => {
      searchPlaces(text)
        .then((r) => { if (my !== seqRef.current) return; setItems(r); setErr(''); setHi(-1); })
        .catch((e) => { if (my !== seqRef.current) return; setItems([]); setErr(e.message || '검색에 실패했습니다'); })
        .finally(() => { if (my === seqRef.current) setBusy(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // 바깥을 누르면 목록을 닫는다.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!hasVWorld) return null;

  const pick = (o) => {
    setQ(o.title); setOpen(false);
    onPick({ lng: o.lng, lat: o.lat, title: o.title });
  };
  const clear = () => { seqRef.current++; setQ(''); setItems([]); setErr(''); setOpen(false); onClear(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { const o = items[hi >= 0 ? hi : 0]; if (o) pick(o); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const showList = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, width: 280 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 8px 0 12px', borderRadius: 9, background: 'var(--ant-bg)', border: '1px solid var(--ant-border-secondary)', boxShadow: '0 2px 10px rgba(0,0,0,0.14)', boxSizing: 'border-box' }}>
        <span style={{ display: 'flex', flex: 'none', color: 'var(--ant-primary)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
        </span>
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={`${SEARCH_AREA_NAME} 장소·주소 찾기`} aria-label="장소·주소 찾기"
          style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--ant-text)' }} />
        {(q || picked) && (
          <button onClick={clear} title="지우기" aria-label="지우기" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: 'none', borderRadius: 11, background: 'var(--ant-fill-quaternary)', color: 'var(--ant-text-tertiary)', cursor: 'pointer', padding: 0 }}>
            <Icon name="IconCloseOutlined" size={10} />
          </button>
        )}
      </div>
      {showList && (
        <div style={{ marginTop: 4, maxHeight: 320, overflowY: 'auto', borderRadius: 9, background: 'var(--ant-bg)', border: '1px solid var(--ant-border-secondary)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: 4 }}>
          {busy && !items.length && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ant-text-tertiary)' }}>찾는 중…</div>}
          {!busy && err && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ant-error, #cf1322)' }}>{err}</div>}
          {!busy && !err && !items.length && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ant-text-tertiary)' }}>검색 결과가 없습니다 ({SEARCH_AREA_NAME} 안에서만 찾습니다)</div>}
          {items.map((o, i) => (
            <div key={`${o.id}-${i}`} onClick={() => pick(o)} onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 8px', borderRadius: 7, cursor: 'pointer', background: i === hi ? 'var(--ant-fill-quaternary)' : 'transparent' }}>
              <span style={{ flex: 'none', marginTop: 1, minWidth: 34, textAlign: 'center', fontSize: 10, fontWeight: 600, lineHeight: '16px', borderRadius: 4, padding: '0 4px', color: 'var(--ant-primary)', background: '#ECEEFC' }}>{o.kind}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ant-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.title}</span>
                {o.sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--ant-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
