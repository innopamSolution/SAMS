// 관리자 로그인(아이디·비밀번호). 저장소 서버(VITE_STORE_API_URL)가 있을 때만 쓰고, 없으면(개발 서버·정적 배포) 예전처럼 모두 관리자로 본다.
// 로그인하면 서버가 표(토큰)를 주고, 이 브라우저에 저장해 두었다가 저장소 요청마다 붙인다. 서버가 쓰기를 허용하는지는 서버가 이 표로 다시 확인한다.
import { useSyncExternalStore } from 'react';

const EXTERNAL = (import.meta.env.VITE_STORE_API_URL || '').trim();
export const AUTH_REQUIRED = !!EXTERNAL;
const base = EXTERNAL.replace(/\/?$/, '/');
const KEY = 'sams.admin.token';

const expired = (t) => { try { return JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp <= Date.now(); } catch { return true; } };
function readToken() {
  try { const t = localStorage.getItem(KEY) || ''; return t && !expired(t) ? t : ''; } catch { return ''; }
}
let token = AUTH_REQUIRED ? readToken() : '';
let admin = AUTH_REQUIRED ? !!token : true;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export const getToken = () => token;
// 로그인한 관리자 아이디(표 안에 들어 있다. 화면에 보여 주는 용도일 뿐, 권한은 서버가 표를 확인해서 정한다).
export function adminId() { try { return JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).id || ''; } catch { return ''; } }
export const isAdmin = () => admin;
export const useAdmin = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, isAdmin);
// 로그인·로그아웃으로 관리자 여부가 바뀔 때 알려 준다(메모 목록을 다시 받는 데 쓴다).
export function onAdminChange(fn) { subs.add(fn); return () => subs.delete(fn); }

export async function login(id, password) {
  if (!AUTH_REQUIRED) return { ok: true };
  try {
    const r = await fetch(base + 'login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return { ok: false, message: j.error || '로그인하지 못했습니다' };
    token = j.token; admin = true;
    try { localStorage.setItem(KEY, token); } catch { /* 저장 못 해도 이 탭에서는 로그인 상태 */ }
    emit();
    return { ok: true };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했습니다' };
  }
}

export function logout() {
  if (!AUTH_REQUIRED) return;
  token = ''; admin = false;
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  emit();
}
