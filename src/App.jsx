import { useState } from 'react';
import Explorer from './pages/Explorer';
import DataManagement from './pages/DataManagement';

export default function App() {
  // 두 화면 모두 mount를 유지한다. 관리에서 지도로 건너갔다 돌아와도 편집 중이던
  // 아이템·입력·스크롤이 그대로 남아 있어야 왕복이 끊기지 않는다.
  const [page, setPage] = useState('explorer');
  const [managedOnce, setManagedOnce] = useState(false);
  // 관리에서 건너온 경우에만 채워지는 값 — 탐색 화면이 해당 아이템을 열고,
  // 돌아가는 길(‹ 데이터 관리로 돌아가기)을 띄운다.
  const [focus, setFocus] = useState(null);

  const navigate = (name, payload = null) => {
    if (name === 'manage') setManagedOnce(true);
    setFocus(name === 'explorer' && payload && payload.focusItem ? { ...payload, at: Date.now() } : null);
    setPage(name);
  };

  return (
    <>
      <div style={{ display: page === 'explorer' ? 'block' : 'none', height: '100vh' }}>
        <Explorer onNavigate={navigate} focus={focus} />
      </div>
      {managedOnce && (
        <div style={{ display: page === 'manage' ? 'block' : 'none', height: '100vh' }}>
          <DataManagement onNavigate={navigate} />
        </div>
      )}
    </>
  );
}
