import type { ADSystemUnlock, BaseMarker } from "../../lib/types";

export interface ADInstallModalProps {
  system: ADSystemUnlock;
  bases: BaseMarker[];
  onClose: () => void;
  onPick: (baseId: number) => void;
  budgetAvailable: number;
}

export function ADInstallModal({ system, bases, onClose, onPick, budgetAvailable }: ADInstallModalProps) {
  const canAfford = budgetAvailable >= system.install_cost_cr;
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
            Choose a base to install the battery. Coverage radius: {system.coverage_km}km.
          </p>
          {bases.map((b) => (
            <button
              key={b.id}
              onClick={() => { onPick(b.id); onClose(); }}
              disabled={!canAfford}
              className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-[10px] opacity-60">
                {b.lat.toFixed(2)}°N, {b.lon.toFixed(2)}°E
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
