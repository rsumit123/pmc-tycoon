import type { HangarSquadron } from "../../lib/types";
import { shortBaseName } from "./SquadronRow";

export interface SquadronDetailSheetProps {
  squadron: HangarSquadron | null;
  onClose: () => void;
  onRebaseStart: () => void;
}

function readinessColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SquadronDetailSheet({ squadron, onClose, onRebaseStart }: SquadronDetailSheetProps) {
  if (!squadron) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{squadron.name}</h2>
            <p className="text-xs opacity-70 truncate">
              {squadron.call_sign} &bull; {squadron.platform_name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            className="text-slate-400 hover:text-slate-200 ml-2 flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="opacity-60">Location</div>
              <div className="font-semibold truncate">📍 {shortBaseName(squadron.base_name)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="opacity-60">Airframes</div>
              <div className="font-semibold">{squadron.strength}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="opacity-60">XP</div>
              <div className="font-semibold">{squadron.xp}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="opacity-60">Ace</div>
              <div className="font-semibold truncate">{squadron.ace_name ?? "—"}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="opacity-60">Readiness</span>
              <span className="font-semibold">{squadron.readiness_pct}%</span>
            </div>
            <div className="h-2 rounded bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${readinessColor(squadron.readiness_pct)}`}
                style={{ width: `${Math.min(100, squadron.readiness_pct)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-xs opacity-60 mb-1">Loadout</div>
            <div className="text-xs break-words">
              {squadron.loadout.length > 0
                ? squadron.loadout.join(" · ")
                : <span className="opacity-50">— no weapons —</span>}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => { onRebaseStart(); onClose(); }}
              className="w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-sm rounded py-2"
            >
              Rebase squadron →
            </button>
            <p className="text-[10px] opacity-60 italic mt-2 text-center">
              To equip a new missile, open Armory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
