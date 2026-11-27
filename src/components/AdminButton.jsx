import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { AUTH_REQUIRED, useAdmin, adminId, login, logout } from '../lib/auth';

// 헤더 오른쪽의 로그인·로그아웃 버튼. 저장소 서버가 없으면(개발 서버·정적 배포) 로그인 개념이 없어 예전 모양 그대로 둔다.
export default function AdminButton() {
  const admin = useAdmin();
  const [open, setOpen] = useState(false);
  const style = { display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 8 };
  return (
    <>
      {AUTH_REQUIRED && !admin ? (
        <button onClick={() => setOpen(true)} title="로그인" style={style}>
          <Icon name="IconLogoutOutlined" size={16} />로그인
        </button>
      ) : (
        <button onClick={logout} title={AUTH_REQUIRED ? `${adminId()} 로그아웃` : '로그아웃'} style={style}>
          {AUTH_REQUIRED && <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--ant-text-tertiary)' }}>{adminId()}</span>}
          <Icon name="IconLogoutOutlined" size={16} />LOGOUT
        </button>
      )}
      {open && !admin && <LoginDialog onClose={() => setOpen(false)} />}
      {open && admin && <Closer onClose={() => setOpen(false)} />}
    </>
  );
}

// 로그인에 성공하면 창을 닫는다.
function Closer({ onClose }) { useEffect(() => { onClose(); }, [onClose]); return null; }

const field = { display: 'block', width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'var(--ant-bg)', outline: 'none' };

function LoginDialog({ onClose }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(null);
  const pwRef = useRef(null);
  useEffect(() => { idRef.current && idRef.current.focus(); }, []);
  const submit = async () => {
    if (!id.trim() || !pw || busy) return;
    setBusy(true); setErr('');
    const r = await login(id.trim(), pw);
    setBusy(false);
    if (!r.ok) { setErr(r.message); setPw(''); pwRef.current && pwRef.current.focus(); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,20,28,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 320, maxWidth: '100%', background: 'var(--ant-bg)', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.24)', padding: 24, fontFamily: 'var(--ant-font-sans)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ant-text)' }}>로그인</div>
        <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--ant-text-secondary)' }}>메모와 데이터를 저장하려면 로그인하세요.</div>
        <input ref={idRef} type="text" value={id} onChange={(e) => { setId(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { if (pw) submit(); else pwRef.current && pwRef.current.focus(); } if (e.key === 'Escape') onClose(); }}
          placeholder="아이디" autoComplete="username" aria-label="아이디" autoCapitalize="none" spellCheck={false}
          style={{ ...field, marginTop: 16, border: `1px solid ${err ? 'var(--ant-error, #ff4d4f)' : 'var(--ant-border)'}` }} />
        <input ref={pwRef} type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="비밀번호" autoComplete="current-password" aria-label="비밀번호"
          style={{ ...field, marginTop: 8, border: `1px solid ${err ? 'var(--ant-error, #ff4d4f)' : 'var(--ant-border)'}` }} />
        <div style={{ minHeight: 20, marginTop: 4, fontSize: 12, color: 'var(--ant-error, #ff4d4f)' }}>{err}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid var(--ant-border)', background: 'var(--ant-bg)', color: 'var(--ant-text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
          <button onClick={submit} disabled={!id.trim() || !pw || busy} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--ant-primary)', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: !id.trim() || !pw || busy ? 'default' : 'pointer', opacity: !id.trim() || !pw || busy ? 0.5 : 1 }}>{busy ? '확인 중…' : '로그인'}</button>
        </div>
      </div>
    </div>
  );
}
