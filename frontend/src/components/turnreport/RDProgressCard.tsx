import type { RDMilestoneSummary } from "../../lib/types";

export function RDProgressCard({ milestone }: { milestone: RDMilestoneSummary }) {
  const { kind } = milestone;
  const icon = kind === "breakthrough" ? "🟢" : kind === "setback" ? "🔴" : kind === "completed" ? "✅" : kind === "underfunded" ? "⚠" : "🟡";
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="text-xs opacity-80">{icon} {label} — <span className="font-semibold">{milestone.program_id}</span></div>
      {milestone.progress_pct != null && (
        <div className="text-xs opacity-60 mt-1">{milestone.progress_pct}% complete</div>
      )}
    </div>
  );
}
