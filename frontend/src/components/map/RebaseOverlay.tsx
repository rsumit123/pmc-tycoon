import type { BaseMarker, BaseSquadronSummary } from "../../lib/types";

export interface RebaseOverlayProps {
  squadron: BaseSquadronSummary | null;
  bases: BaseMarker[];
  currentBaseId: number;
  onRebase: (squadronId: number, targetBaseId: number) => void;
  onCancel: () => void;
}

export function RebaseOverlay({ squadron, bases, currentBaseId, onRebase, onCancel }: RebaseOverlayProps) {
  if (!squadron) return null;

  const targets = bases.filter((b) => b.id !== currentBaseId);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-900/95 border-t border-amber-600 rounded-t-2xl p-4 max-h-[50vh] overflow-y-auto">
      <div className="flex items-baseline justify-between pb-3">
        <div>
          <h3 className="text-base font-bold">Rebase {squadron.name}</h3>
          <p className="text-xs opacity-60">Select destination base</p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {targets.map((b) => (
          <button
            key={b.id}
            onClick={() => onRebase(squadron.id, b.id)}
            className="text-left bg-slate-800 hover:bg-slate-700 rounded-lg p-3"
          >
            <p className="font-semibold text-sm">{b.name}</p>
            <p className="text-xs opacity-60">
              {b.lat.toFixed(1)}°N, {b.lon.toFixed(1)}°E • {b.squadrons.length} sqn
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
