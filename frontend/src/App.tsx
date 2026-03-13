import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { BottomNav } from './components/layout/BottomNav';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/pages/Dashboard';
import { Hangar } from './components/pages/Hangar';
import { Contracts } from './components/pages/Contracts';
import { RAndD } from './components/pages/RAndD';

function AppShell() {
  const location = useLocation();

  return (
    <div className="flex h-[100dvh] bg-gray-950 text-gray-100 overflow-hidden">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar currentPath={location.pathname} />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hangar" element={<Hangar />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/research" element={<RAndD />} />
          </Routes>
        </div>

        {/* Mobile bottom nav - hidden on desktop */}
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
