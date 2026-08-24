import { useState } from 'react';
import Explorer from './pages/Explorer';
import DataManagement from './pages/DataManagement';

export default function App() {
  // 두 화면 모두 mount를 유지한다. 관리에서 지도로 건너갔다 돌아와도 편집 중이던
  // 아이템·입력·스크롤이 그대로 남아 있어야 왕복이 끊기지 않는다.
  const [page, setPage] = useState('explorer');
  const [managedOnce, setManagedOnce] = useState(false);
  // 화면을 건너갈 때 "이 아이템을 열어라"를 실어 보내는 값. 탐색으로 가면 드로어를,
  // 관리로 가면 해당 아이템 편집기를 연다. at 은 같은 아이템을 다시 눌러도
  // 요청이 새로 도착한 것으로 구분하기 위한 것.
  const [focus, setFocus] = useState(null);
  const [manageFocus, setManageFocus] = useState(null);

  const navigate = (name, payload = null) => {
    if (name === 'manage') setManagedOnce(true);
    const req = payload && payload.focusItem ? { ...payload, at: Date.now() } : null;
    setFocus(name === 'explorer' ? req : null);
    setManageFocus(name === 'manage' ? req : null);
    setPage(name);
  };

  return (
    <>
      <div style={{ display: page === 'explorer' ? 'block' : 'none', height: '100vh' }}>
        <Explorer onNavigate={navigate} focus={focus} />
      </div>
      {managedOnce && (
        <div style={{ display: page === 'manage' ? 'block' : 'none', height: '100vh' }}>
          <DataManagement onNavigate={navigate} focus={manageFocus} />
        </div>
      )}
    </>
  );
}
