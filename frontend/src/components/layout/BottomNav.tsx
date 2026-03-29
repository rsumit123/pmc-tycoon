import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse,
  Shield,
  Crosshair,
  FlaskConical,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'HQ', icon: LayoutDashboard },
  { path: '/hangar', label: 'Hangar', icon: Warehouse },
  { path: '/barracks', label: 'Forces', icon: Shield },
  { path: '/contracts', label: 'Ops', icon: Crosshair },
  { path: '/research', label: 'R&D', icon: FlaskConical },
];

export const BottomNav = ({ currentPath }: { currentPath: string }) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 backdrop-blur-lg pb-safe z-50"
      style={{ background: 'rgba(21,24,32,0.95)', borderTop: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-around px-1 h-14">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = currentPath === path;
          return (
            <Link
              key={path}
              to={path}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[56px] transition-all"
              style={{ color: isActive ? 'var(--color-amber)' : 'var(--color-text-muted)' }}
            >
              <div
                className="p-1.5 rounded-xl transition-all"
                style={{ background: isActive ? 'rgba(212,168,67,0.1)' : 'transparent' }}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-display tracking-wider">
                {label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
