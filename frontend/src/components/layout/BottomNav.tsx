import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse,
  Crosshair,
  FlaskConical,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'HQ', icon: LayoutDashboard },
  { path: '/hangar', label: 'Hangar', icon: Warehouse },
  { path: '/contracts', label: 'Ops', icon: Crosshair },
  { path: '/research', label: 'R&D', icon: FlaskConical },
];

export const BottomNav = ({ currentPath }: { currentPath: string }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 pb-safe z-50">
      <div className="flex items-center justify-around px-2 h-16">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = currentPath === path;
          return (
            <Link
              key={path}
              to={path}
              className={`
                flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[64px] transition-all
                ${isActive
                  ? 'text-emerald-400'
                  : 'text-gray-500 active:text-gray-300'
                }
              `}
            >
              <div className={`
                p-1.5 rounded-xl transition-all
                ${isActive ? 'bg-emerald-500/15' : ''}
              `}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : ''}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
