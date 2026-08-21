import { useState } from 'react';
import Explorer from './pages/Explorer';
import DataManagement from './pages/DataManagement';

export default function App() {
  // Explorer stays mounted while the management page is shown so the map,
  // filters, and scroll position survive a round-trip to 데이터 관리.
  const [page, setPage] = useState({ name: 'explorer', payload: null });
  const navigate = (name, payload = null) => setPage({ name, payload });

  return (
    <>
      <div style={{ display: page.name === 'explorer' ? 'block' : 'none', height: '100vh' }}>
        <Explorer onNavigate={navigate} />
      </div>
      {page.name === 'manage' && <DataManagement onNavigate={navigate} initialCollection={page.payload} />}
    </>
  );
}
