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
  { path: '/', label: 'HQ', icon: LayoutDashboard },
  { path: '/hangar', label: 'Hangar', icon: Warehouse },
  { path: '/personnel', label: 'Personnel', icon: Users },
  { path: '/contracts', label: 'Operations', icon: Crosshair },
  { path: '/research', label: 'R&D', icon: FlaskConical },
];

export const Sidebar = ({ currentPath }: { currentPath: string }) => {
  return (
    <aside className="w-56 h-full flex flex-col" style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,168,67,0.15)' }}>
            <Shield className="w-5 h-5" style={{ color: 'var(--color-amber)' }} />
          </div>
          <div>
            <h1 className="font-display text-base tracking-wider" style={{ color: 'var(--color-text)' }}>
              PMC TYCOON
            </h1>
            <p className="text-[10px] font-display tracking-widest mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              COMMAND CENTER
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: isActive ? 'rgba(212,168,67,0.1)' : 'transparent',
                  color: isActive ? 'var(--color-amber)' : 'var(--color-text-secondary)',
                }}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="font-display tracking-wider text-xs">{label.toUpperCase()}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-amber)' }} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div className="text-xs font-data text-center" style={{ color: 'var(--color-text-muted)' }}>v0.2.0</div>
      </div>
    </aside>
  );
};
