import type { HangarPlatformSummary } from "../../lib/types";

export function PlatformSummaryCard({
  s, onClick,
}: { s: HangarPlatformSummary; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-lg p-3 transition-colors"
    >
      <div className="text-sm font-semibold">{s.platform_name}</div>
      <div className="text-[10px] opacity-60 mt-0.5">
        {s.squadron_count} sqn{s.squadron_count === 1 ? "" : "s"} &bull; {s.total_airframes} airframes
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${Math.min(100, s.avg_readiness_pct)}%` }}
          />
        </div>
        <span className="text-[10px] opacity-80 w-8 text-right">{s.avg_readiness_pct}%</span>
      </div>
      {onClick && (
        <div className="mt-1 text-[10px] text-amber-400/70">Tap to view squadrons &rarr;</div>
      )}
    </button>
  );
}
