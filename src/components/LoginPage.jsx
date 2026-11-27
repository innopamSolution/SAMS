import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import { login } from '../lib/auth';

const field = { display: 'block', width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: 'var(--ant-text)', background: 'var(--ant-bg)', outline: 'none' };

// 첫 화면. 저장소 서버가 있으면 로그인해야만 앱을 볼 수 있다. 로그인에 성공하면 App 이 알아서 본 화면으로 바꾼다.
export default function LoginPage() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(null);
  const pwRef = useRef(null);
  useEffect(() => { idRef.current && idRef.current.focus(); }, []);
  const can = !!id.trim() && !!pw && !busy;
  const submit = async () => {
    if (!can) return;
    setBusy(true); setErr('');
    const r = await login(id.trim(), pw);
    if (!r.ok) { setBusy(false); setErr(r.message); setPw(''); pwRef.current && pwRef.current.focus(); }
  };
  const border = `1px solid ${err ? 'var(--ant-error, #ff4d4f)' : 'var(--ant-border)'}`;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', background: 'var(--ant-bg-layout)', fontFamily: 'var(--ant-font-sans)' }}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ width: 360, maxWidth: '100%', background: 'var(--ant-bg)', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: 32, boxSizing: 'border-box' }}>
        <Logo />
        <div style={{ marginTop: 24, fontSize: 18, fontWeight: 700, color: 'var(--ant-text)' }}>로그인</div>
        <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--ant-text-secondary)' }}>아이디와 비밀번호를 입력해 주세요.</div>
        <input ref={idRef} type="text" value={id} onChange={(e) => { setId(e.target.value); setErr(''); }}
          placeholder="아이디" autoComplete="username" aria-label="아이디" autoCapitalize="none" spellCheck={false}
          style={{ ...field, marginTop: 20, border }} />
        <input ref={pwRef} type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }}
          placeholder="비밀번호" autoComplete="current-password" aria-label="비밀번호"
          style={{ ...field, marginTop: 8, border }} />
        <div role="alert" style={{ minHeight: 20, marginTop: 4, fontSize: 12, color: 'var(--ant-error, #ff4d4f)' }}>{err}</div>
        <button type="submit" disabled={!can} style={{ width: '100%', height: 40, marginTop: 8, borderRadius: 8, border: 'none', background: 'var(--ant-primary)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: can ? 'pointer' : 'default', opacity: can ? 1 : 0.5 }}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </div>
  );
}
