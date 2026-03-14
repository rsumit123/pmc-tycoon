import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components/layout/BottomNav';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/pages/Dashboard';
import { Hangar } from './components/pages/Hangar';
import { Personnel } from './components/pages/Personnel';
import { Contracts } from './components/pages/Contracts';
import { RAndD } from './components/pages/RAndD';
import { BattlePage } from './components/battle/BattlePage';

function AppShell() {
  const location = useLocation();
  const isBattle = location.pathname.startsWith('/battle');

  // Battle screens are fullscreen — no nav
  if (isBattle) {
    return (
      <Routes>
        <Route path="/battle/new" element={<BattlePage />} />
        <Route path="/battle/:battleId" element={<BattlePage />} />
      </Routes>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-gray-950 text-gray-100 overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar currentPath={location.pathname} />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hangar" element={<Hangar />} />
            <Route path="/personnel" element={<Personnel />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/research" element={<RAndD />} />
          </Routes>
        </div>

        <div className="lg:hidden">
          <BottomNav currentPath={location.pathname} />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
