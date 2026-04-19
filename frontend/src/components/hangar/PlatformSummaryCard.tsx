import type { HangarPlatformSummary } from "../../lib/types";

export function PlatformSummaryCard({ s }: { s: HangarPlatformSummary }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
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
    </div>
  );
}
