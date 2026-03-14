import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse,
  Users,
  Crosshair,
  FlaskConical,
  Shield,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/hangar', label: 'Hangar', icon: Warehouse },
  { path: '/personnel', label: 'Personnel', icon: Users },
  { path: '/contracts', label: 'Contracts', icon: Crosshair },
  { path: '/research', label: 'R&D', icon: FlaskConical },
];

export const Sidebar = ({ currentPath }: { currentPath: string }) => {
  return (
    <aside className="w-56 h-full bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">
              PMC Tycoon
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
              Command Center
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-2">
        <div className="space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = currentPath === path;
            return (
              <Link
                key={path}
                to={path}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                  }
                `}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span>{label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-800/60">
        <div className="text-xs text-gray-600 text-center">v0.1.0</div>
      </div>
    </aside>
  );
};
