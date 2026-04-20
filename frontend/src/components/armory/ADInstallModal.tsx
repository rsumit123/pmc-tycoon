import type { ADSystemUnlock, BaseMarker, ADBattery } from "../../lib/types";

export interface ADInstallModalProps {
  system: ADSystemUnlock;
  bases: BaseMarker[];
  adBatteries: ADBattery[];
  onClose: () => void;
  onPick: (baseId: number) => void;
  budgetAvailable: number;
}

export function ADInstallModal({
  system, bases, adBatteries, onClose, onPick, budgetAvailable,
}: ADInstallModalProps) {
  const canAfford = budgetAvailable >= system.install_cost_cr;

  // Map base_id → batteries already installed there (any system)
  const byBase: Record<number, ADBattery[]> = {};
  for (const b of adBatteries) (byBase[b.base_id] ??= []).push(b);

  // Sort: uninstalled for this system first, then by name
  const sortedBases = [...bases].sort((a, b) => {
    const aInstalled = (byBase[a.id] ?? []).some((bat) => bat.system_id === system.target_id);
    const bInstalled = (byBase[b.id] ?? []).some((bat) => bat.system_id === system.target_id);
    if (aInstalled !== bInstalled) return aInstalled ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Install {system.name}</h2>
          <button onClick={onClose} aria-label="close" className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {!canAfford && (
            <div className="bg-rose-950/40 border border-rose-800 rounded p-2 text-xs text-rose-300">
              ⚠ Insufficient budget. Need ₹{system.install_cost_cr.toLocaleString("en-US")} cr, have ₹{budgetAvailable.toLocaleString("en-US")} cr.
            </div>
          )}
          <p className="text-[11px] opacity-70">
            Choose a base. Coverage radius: {system.coverage_km}km. One battery of this system per base — install at another base for more coverage.
          </p>
          {sortedBases.map((b) => {
            const batteriesHere = byBase[b.id] ?? [];
            const thisInstalled = batteriesHere.find((bat) => bat.system_id === system.target_id);
            const otherSystems = batteriesHere.filter((bat) => bat.system_id !== system.target_id);
            const disabled = !canAfford || !!thisInstalled;
            return (
              <button
                key={b.id}
                onClick={() => { if (!disabled) { onPick(b.id); onClose(); } }}
                disabled={disabled}
                className={[
                  "w-full text-left border rounded-lg p-3 transition-colors",
                  thisInstalled
                    ? "bg-emerald-950/30 border-emerald-900/60 cursor-not-allowed"
                    : disabled
                      ? "bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold">{b.name}</div>
                  {thisInstalled && (
                    <span className="text-[10px] bg-emerald-900/60 text-emerald-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                      ✓ Installed {thisInstalled.installed_year} Q{thisInstalled.installed_quarter}
                    </span>
                  )}
                </div>
                <div className="text-[10px] opacity-60">
                  {b.lat.toFixed(2)}°N, {b.lon.toFixed(2)}°E
                </div>
                {otherSystems.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {otherSystems.map((bat) => (
                      <span
                        key={bat.id}
                        className="text-[10px] bg-slate-900/60 border border-slate-700 text-slate-300 rounded px-1.5 py-0.5"
                      >{bat.system_id.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
