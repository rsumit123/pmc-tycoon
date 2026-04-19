import { useState } from "react";
import type { BaseMarker, BaseSquadronSummary } from "../../lib/types";

export interface RebaseOverlayProps {
  squadron: BaseSquadronSummary | null;
  bases: BaseMarker[];
  currentBaseId: number;
  onRebase: (squadronId: number, targetBaseId: number) => void | Promise<void>;
  onCancel: () => void;
}

export function RebaseOverlay({ squadron, bases, currentBaseId, onRebase, onCancel }: RebaseOverlayProps) {
  const [pendingBaseId, setPendingBaseId] = useState<number | null>(null);

  if (!squadron) return null;

  const targets = bases.filter((b) => b.id !== currentBaseId);
  const busy = pendingBaseId !== null;

  const handleClick = async (baseId: number) => {
    if (busy) return;
    setPendingBaseId(baseId);
    try {
      await onRebase(squadron.id, baseId);
    } finally {
      setPendingBaseId(null);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-900/95 border-t border-amber-600 rounded-t-2xl p-4 max-h-[50vh] overflow-y-auto">
      <div className="flex items-baseline justify-between pb-3">
        <div>
          <h3 className="text-base font-bold">Rebase {squadron.name}</h3>
          <p className="text-xs opacity-60">
            {busy ? "Rebasing…" : "Select destination base"}
          </p>
        </div>
        <button
          onClick={onCancel}
          disabled={busy}
          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {targets.map((b) => {
          const thisPending = pendingBaseId === b.id;
          return (
            <button
              key={b.id}
              onClick={() => handleClick(b.id)}
              disabled={busy}
              className={[
                "text-left rounded-lg p-3 transition-colors",
                thisPending
                  ? "bg-amber-700/60 border border-amber-500"
                  : "bg-slate-800 hover:bg-slate-700",
                busy && !thisPending ? "opacity-40" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                {thisPending && (
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                )}
                <p className="font-semibold text-sm">{b.name}</p>
              </div>
              <p className="text-xs opacity-60">
                {b.lat.toFixed(1)}°N, {b.lon.toFixed(1)}°E • {b.squadrons.length} sqn
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
