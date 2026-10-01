import { useEffect, useState } from 'react';
import Explorer from './pages/Explorer';
import DataManagement from './pages/DataManagement';
import { loadSplogData } from './data/splog';

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

  // 데이터는 Spatial Log API 에서 받아온다. 받아오기 전에 화면을 그리면
  // 지도·목록이 빈 상태로 자리를 잡아버려서, 다 받은 뒤에 띄운다.
  const [load, setLoad] = useState({ state: 'loading', error: null });

  useEffect(() => {
    let alive = true;
    loadSplogData()
      .then(() => { if (alive) setLoad({ state: 'ready', error: null }); })
      .catch((e) => { if (alive) setLoad({ state: 'error', error: String(e.message || e) }); });
    return () => { alive = false; };
  }, []);

  const navigate = (name, payload = null) => {
    if (name === 'manage') setManagedOnce(true);
    const req = payload && payload.focusItem ? { ...payload, at: Date.now() } : null;
    setFocus(name === 'explorer' ? req : null);
    setManageFocus(name === 'manage' ? req : null);
    setPage(name);
  };

  if (load.state !== 'ready') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ant-bg-layout)', fontFamily: 'var(--ant-font-sans)' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ant-text)' }}>
            {load.state === 'loading' ? '데이터를 불러오는 중' : '데이터를 불러오지 못했습니다'}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: 'var(--ant-text-secondary)' }}>
            {load.state === 'loading' ? 'Spatial Log' : load.error}
          </div>
        </div>
      </div>
    );
  }

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
