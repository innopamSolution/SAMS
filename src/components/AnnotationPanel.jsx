import { useRef, useState } from 'react';
import { ALT_MAX, DESC_MAX, ANNO_TYPES, annotationType, readImageFile } from '../lib/annotations';

// Figma "어노테이션 입력" (2.2.2.1.1) popup + a read-only card for the POI detail.
const ACCENT = '#1677ff'; // app primary (--ant-primary)
const shell = {
  position: 'absolute', right: 12, top: 60, zIndex: 8, width: 420, maxHeight: 'calc(100% - 72px)', overflowY: 'auto', boxSizing: 'border-box',
  background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 4px 10px rgba(0,0,0,0.12)', fontFamily: 'var(--ant-font-sans)', color: '#383f43',
  display: 'flex', flexDirection: 'column', gap: 12,
};
const label = { fontSize: 13, fontWeight: 500, color: '#454545', letterSpacing: '-0.26px', lineHeight: 1.5 };
const input = { width: '100%', boxSizing: 'border-box', height: 40, border: '1px solid #f0f0f0', borderRadius: 3, padding: '0 15px', fontSize: 14, fontFamily: 'inherit', color: '#383f43', outline: 'none', background: '#fff' };
const pillBtn = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 999, border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, fontSize: 13, fontWeight: 400, fontFamily: 'inherit', lineHeight: 1, cursor: 'pointer' };

const Close = ({ onClick }) => (
  <button onClick={onClick} aria-label="닫기" style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: '#262626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
  </button>
);
const Plus = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
);
const XSmall = ({ onClick, label: l }) => (
  <button onClick={onClick} aria-label={l} style={{ width: 30, height: 30, flex: 'none', border: 'none', background: 'none', cursor: 'pointer', color: '#595959', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2L2 10" /></svg>
  </button>
);
const Thumb = ({ src, onDelete, style, onClick }) => (
  <div style={{ position: 'relative', border: '1px solid #bfbfbf', borderRadius: 8, overflow: 'hidden', background: '#f5f5f5', ...style }}>
    <img src={src} alt="" onClick={onClick} draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: onClick ? 'zoom-in' : 'default' }} />
    {onDelete && (
      <button onClick={onDelete} aria-label="삭제" style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(38,38,38,0.8)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
      </button>
    )}
  </div>
);

export const MAX_TAGS = 5;
export const parseTags = (text) => (text || '').split(/\s+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : '#' + t)).slice(0, MAX_TAGS);

export function AnnotationEditor({ draft, onChange, onSave, onCancel, picking, onPickCoord, onPreview }) {
  const photoRef = useRef(null);
  const panoRef = useRef(null);
  const tagRef = useRef(null);
  const [tagText, setTagText] = useState(draft.tags.join(' '));
  const urls = draft.urls.length ? draft.urls : [''];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const addFiles = async (kind, files) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const urls = await Promise.all(Array.from(files).map((f) => readImageFile(f, kind === 'panos' ? 2048 : 1280)));
      onChange({ [kind]: [...draft[kind], ...urls] });
    } catch { setError('이미지를 읽지 못했습니다'); }
    setBusy(false);
  };
  const type = ANNO_TYPES[annotationType(draft)];
  const save = () => {
    if (!draft.title.trim()) { setError('제목을 입력하세요'); return; }
    setError('');
    onSave({ ...draft, title: draft.title.trim(), tags: parseTags(tagText), urls: draft.urls.map((u) => u.trim()).filter(Boolean) });
  };
  const setAlt = (v) => onChange({ alt: Math.max(0, Math.min(ALT_MAX, Number.isFinite(+v) ? +v : 0)) });

  return (
    <div style={shell} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#000', letterSpacing: '-0.4px', lineHeight: 1.4 }}>{draft.isNew ? '어노테이션 입력' : '어노테이션 수정'}</span>
        <Close onClick={onCancel} />
      </div>

      <div style={{ display: 'flex', gap: 40, height: 131 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={label}>고도</span>
          <span style={{ fontSize: 12, lineHeight: 1.5, color: '#8c8c8c', fontVariantNumeric: 'tabular-nums' }}>X {draft.lng.toFixed(5)}<br />Y {draft.lat.toFixed(5)}</span>
          <span style={{ fontSize: 11, lineHeight: 1.4, color: ACCENT }}>핀을 끌어서<br />위치·높이 조정</span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 20, paddingRight: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, justifyContent: 'center', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, width: 95, height: 40, boxSizing: 'border-box', padding: '0 15px', border: '1px solid #f0f0f0', borderRadius: 3 }}>
              <input type="number" min={0} max={ALT_MAX} value={draft.alt} onChange={(e) => setAlt(e.target.value)} aria-label="고도(m)" style={{ width: 0, flex: 1, border: 'none', outline: 'none', textAlign: 'right', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: ACCENT, background: 'transparent', MozAppearance: 'textfield' }} />
              <span style={{ fontSize: 14, fontWeight: 400, color: '#383f43' }}>m</span>
            </div>
            <button onClick={onPreview} title="핀을 찍은 뒤 옆에서 높이를 확인합니다" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', border: 'none', borderRadius: 4, background: '#fff', color: ACCENT, fontSize: 14, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', lineHeight: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></svg>미리보기
            </button>
            <button onClick={onPickCoord} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 12px', border: 'none', borderRadius: 4, background: picking ? '#e6f4ff' : '#fff', color: ACCENT, fontSize: 14, fontWeight: 400, fontFamily: 'inherit', cursor: 'pointer', lineHeight: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></svg>{picking ? '지도를 눌러 선택' : 'X,Y좌표 수정'}
            </button>
          </div>
          <input type="range" min={0} max={ALT_MAX} step={1} value={draft.alt} onChange={(e) => setAlt(e.target.value)} aria-label="고도 슬라이더" style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 131, width: 42, accentColor: ACCENT, cursor: 'pointer', margin: 0 }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={label}>제목</span>
        <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={40} style={{ ...input, borderColor: error && !draft.title.trim() ? '#ff4d4f' : '#f0f0f0' }} />
        {error && <span style={{ fontSize: 12, color: '#ff4d4f' }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={label}>설명</span>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{draft.desc.length}/{DESC_MAX}</span>
        </div>
        <textarea value={draft.desc} onChange={(e) => onChange({ desc: e.target.value.slice(0, DESC_MAX) })} placeholder="100자 이내로 작성해 주세요." style={{ ...input, height: 120, padding: '11px 15px', resize: 'none', lineHeight: 1.4 }} />
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={() => { if (tagRef.current) tagRef.current.focus(); setTagText((t) => (t.trim() ? t : '#')); }} style={pillBtn}><Plus />태그</button>
        <button onClick={() => urls.length < 5 && onChange({ urls: [...urls, ''] })} style={pillBtn}><Plus />URL</button>
        <button onClick={() => photoRef.current && photoRef.current.click()} style={pillBtn}><Plus />사진</button>
        <button onClick={() => panoRef.current && panoRef.current.click()} style={pillBtn}><Plus />파노라마</button>
        <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles('photos', e.target.files); e.target.value = ''; }} />
        <input ref={panoRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles('panos', e.target.files); e.target.value = ''; }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input ref={tagRef} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="#태그를 입력해주세요. (최대 5개)" style={input} />
        <XSmall label="태그 지우기" onClick={() => setTagText('')} />
      </div>
      {urls.map((u, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input value={u} onChange={(e) => onChange({ urls: urls.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="URL을 입력하세요." style={input} />
          <XSmall label="URL 지우기" onClick={() => onChange({ urls: urls.length > 1 ? urls.filter((_, j) => j !== i) : [''] })} />
        </div>
      ))}

      {draft.photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {draft.photos.map((p, i) => <Thumb key={i} src={p} style={{ width: 120, height: 120 }} onDelete={() => onChange({ photos: draft.photos.filter((_, j) => j !== i) })} />)}
        </div>
      )}
      {draft.panos.map((p, i) => <Thumb key={i} src={p} style={{ width: '100%', height: 120 }} onDelete={() => onChange({ panos: draft.panos.filter((_, j) => j !== i) })} />)}
      {busy && <span style={{ fontSize: 12, color: '#8c8c8c' }}>이미지 불러오는 중…</span>}
      <span style={{ fontSize: 12, color: '#8c8c8c' }}>
        유형: <b style={{ color: type.color }}>{type.label}</b> · 사진을 넣으면 사진, 파노라마를 넣으면 파노라마로 표시됩니다.
      </span>
      {draft.space && <span style={{ fontSize: 12, color: '#8c8c8c' }}>공간: <b style={{ color: ACCENT }}>{draft.space}</b> · 이 공간의 모든 시기 모델에서 보입니다.</span>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onCancel} style={{ height: 38, padding: '0 12px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#595959', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {[['public', '공개'], ['private', '비공개']].map(([v, l]) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#383f43', cursor: 'pointer' }}>
              <input type="radio" name="anno-vis" checked={draft.visibility === v} onChange={() => onChange({ visibility: v })} style={{ accentColor: ACCENT, margin: 0, width: 18, height: 18 }} />{l}
            </label>
          ))}
          <button onClick={save} disabled={busy} style={{ height: 38, padding: '0 12px', borderRadius: 4, border: 'none', background: ACCENT, color: '#fff', fontSize: 14, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>저장</button>
        </div>
      </div>
    </div>
  );
}

// 사진·파노라마가 여러 장이면 좌우로 넘겨 보는 슬라이더 (Figma 1810:11958).
function MediaSlider({ images, onOpen }) {
  const [i, setI] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const n = images.length;
  const go = (d) => setI((v) => (v + d + n) % n);
  const down = (e) => { if (n < 2) return; startX.current = e.clientX; setDragging(true); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ } };
  const move = (e) => { if (dragging) setDragX(e.clientX - startX.current); };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > 50) go(dragX < 0 ? 1 : -1);
    setDragX(0);
  };
  const arrow = (side, d) => (
    <button
      onClick={() => go(d)}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={side === 'l' ? '이전' : '다음'}
      style={{ position: 'absolute', top: '50%', [side === 'l' ? 'left' : 'right']: 8, transform: 'translateY(-50%)', width: 32, height: 32, padding: 0, border: 'none', background: 'none', color: '#fff', opacity: 0.8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={side === 'l' ? 'M15 4l-8 8 8 8' : 'M9 4l8 8-8 8'} /></svg>
    </button>
  );
  return (
    <div
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'relative', height: 280, background: '#232222', borderRadius: 8, overflow: 'hidden', userSelect: 'none', touchAction: 'pan-y', flex: 'none' }}
    >
      <div style={{ display: 'flex', height: '100%', transform: `translateX(calc(${-i * 100}% + ${dragX}px))`, transition: dragging ? 'none' : 'transform .3s ease' }}>
        {images.map((src, k) => (
          <div key={k} style={{ flex: '0 0 100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={src} alt="" draggable={false} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
          </div>
        ))}
      </div>
      <button
        onClick={() => onOpen(i)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="크게 보기"
        style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, padding: 0, border: 'none', borderRadius: '50%', background: '#262626', color: '#fff', opacity: 0.8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14L21 3" /></svg>
      </button>
      {n > 1 && arrow('l', -1)}
      {n > 1 && arrow('r', 1)}
      {n > 1 && (
        <span style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.5)', borderRadius: 999, padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>{i + 1} / {n}</span>
      )}
    </div>
  );
}

const outlineBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 4, border: '1px solid #bfbfbf', background: '#fff', color: '#000', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' };

export function AnnotationView({ a, admin, onClose, onEdit, onDelete, onOpenImages }) {
  const type = ANNO_TYPES[annotationType(a)];
  const kinds = [['pano', '파노라마', a.panos], ['photo', '사진', a.photos]].filter(([, , list]) => list.length > 0);
  const [tab, setTab] = useState(a.photos.length ? 'photo' : 'pano');
  const current = kinds.find(([k]) => k === tab) || kinds[0];
  return (
    <div style={{ ...shell, width: 480, maxWidth: 'calc(100% - 24px)' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {kinds.length > 0 ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 'none', background: '#fcfcfc', borderRadius: 4, padding: '3px 6px' }}>
              {kinds.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ padding: '4px 8px', border: 'none', borderRadius: 4, background: current[0] === k ? ACCENT : 'transparent', color: current[0] === k ? '#fff' : '#595959', fontSize: 12, fontWeight: 500, letterSpacing: '-0.24px', fontFamily: 'inherit', cursor: 'pointer', lineHeight: 1.5 }}>{l}</button>
              ))}
            </div>
          ) : (
            <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#fff', background: type.color, borderRadius: 999, padding: '2px 8px' }}>{type.label}</span>
          )}
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1f1f1f', letterSpacing: '-0.32px', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
        </div>
        <Close onClick={onClose} />
      </div>
      {current && <MediaSlider key={current[0]} images={current[2]} onOpen={(idx) => onOpenImages(current[2], idx, current[1])} />}
      <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: '#454545', letterSpacing: '-0.24px' }}>
        {a.desc && <div style={{ whiteSpace: 'pre-wrap' }}>{a.desc}</div>}
        {a.tags.length > 0 && <div style={{ fontWeight: 700 }}>{a.tags.join(' ')}</div>}
        {a.urls.map((u) => (
          <div key={u}><a href={u} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 400, color: ACCENT, wordBreak: 'break-all' }}>{u}</a></div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#8c8c8c' }}>고도 {a.alt} m · {a.visibility === 'public' ? '공개' : '비공개'}</span>
        {admin && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onDelete} style={outlineBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>삭제
            </button>
            <button onClick={onEdit} style={outlineBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" /></svg>수정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Layer filter (Figma "annotation_layer") — styled like the 3D status bar so it reads as part of the same UI.
export function AnnotationLayerPanel({ counts, visible, onToggle }) {
  return (
    <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, background: 'rgba(15,20,28,0.82)', backdropFilter: 'blur(6px)', borderRadius: 10, boxShadow: '0 6px 22px rgba(0,0,0,0.35)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--ant-font-sans)' }}>
      {Object.entries(ANNO_TYPES).map(([k, t]) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={visible[k]} onChange={() => onToggle(k)} style={{ width: 14, height: 14, margin: 0, accentColor: 'var(--ant-primary)', cursor: 'pointer' }} />
          <span style={{ position: 'relative', width: 22, height: 20, flex: 'none' }}>
            <img src={t.layerIcon} alt="" draggable={false} style={{ position: 'absolute', left: -3, top: -1, width: 28, height: 28, maxWidth: 'none' }} />
          </span>
          <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap' }}>
            {t.label} <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>{counts[k] || 0}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
