import Icon from './Icon';
import { AUTH_REQUIRED, adminId, logout } from '../lib/auth';

// 헤더 오른쪽의 로그아웃 버튼. 저장소 서버가 있으면 로그인해야 앱이 보이므로 이 버튼은 항상 로그인한 상태에서만 나타난다(로그인은 첫 화면에서 한다).
// 서버가 없으면(개발 서버·정적 배포) 로그인 개념이 없어 예전 모양 그대로 둔다.
export default function AdminButton() {
  const style = { display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--ant-text-secondary)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', letterSpacing: 0.3, cursor: 'pointer', borderRadius: 8 };
  return (
    <button onClick={logout} title={AUTH_REQUIRED ? `${adminId()} 로그아웃` : '로그아웃'} style={style}>
      {AUTH_REQUIRED && <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--ant-text-tertiary)' }}>{adminId()}</span>}
      <Icon name="IconLogoutOutlined" size={16} />LOGOUT
    </button>
  );
}
