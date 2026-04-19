import type { HangarSquadron } from "../../lib/types";

function readinessColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SquadronRow({ sq, onClick }: { sq: HangarSquadron; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-lg p-3 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{sq.name}</div>
          <div className="text-[10px] opacity-60 truncate">
            {sq.platform_name} &bull; {sq.base_name} &bull; {sq.strength} airframes
          </div>
        </div>
        {sq.ace_name && (
          <span className="text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">
            &#11088; {sq.ace_name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${readinessColor(sq.readiness_pct)}`}
            style={{ width: `${Math.min(100, sq.readiness_pct)}%` }}
          />
        </div>
        <span className="text-[10px] opacity-80 w-8 text-right">{sq.readiness_pct}%</span>
      </div>
      <div className="mt-1.5 text-[10px] opacity-70 break-words">
        Loadout: {sq.loadout.join(" \u00b7 ") || "\u2014"}
      </div>
      {onClick && (
        <div className="mt-1 text-[10px] text-amber-400/70">Tap for options \u2192</div>
      )}
    </button>
  );
}
