import type { HangarSquadron } from "../../lib/types";

function readinessColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function shortBaseName(name: string): string {
  return name
    .replace(/ Air Force Station.*$/i, "")
    .replace(/ AFB$/i, "")
    .replace(/ AFS$/i, "")
    .trim();
}

export function SquadronRow({ sq, onClick }: { sq: HangarSquadron; onClick?: () => void }) {
  const city = shortBaseName(sq.base_name);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-lg p-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{sq.name}</div>
          <div className="text-[10px] opacity-60 truncate mt-0.5">
            {sq.platform_name} &bull; {sq.strength} airframes
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] bg-sky-950 border border-sky-800 text-sky-200 px-1.5 py-0.5 rounded whitespace-nowrap">
            📍 {city}
          </span>
          {sq.ace_name && (
            <span className="text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">
              &#11088; {sq.ace_name}
            </span>
          )}
        </div>
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
      {sq.pending_upgrades && sq.pending_upgrades.length > 0 && (
        <div className="mt-1 text-[10px] text-amber-300 bg-amber-950/30 border border-amber-800 rounded px-1.5 py-0.5">
          🔧 Equipping: {sq.pending_upgrades.map((u) =>
            `${u.weapon_id} (${u.completion_year} Q${u.completion_quarter})`
          ).join(", ")}
        </div>
      )}
      {onClick && (
        <div className="mt-1 text-[10px] text-amber-400/70">Tap for options →</div>
      )}
    </button>
  );
}
