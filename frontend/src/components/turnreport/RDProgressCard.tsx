import { Link } from "react-router-dom";
import type { RDMilestoneSummary } from "../../lib/types";

export function RDProgressCard({
  milestone,
  campaignId,
}: {
  milestone: RDMilestoneSummary;
  campaignId?: number;
}) {
  const { kind } = milestone;
  const icon =
    kind === "breakthrough"
      ? "🟢"
      : kind === "setback"
        ? "🔴"
        : kind === "completed"
          ? "✅"
          : kind === "underfunded"
            ? "⚠"
            : "🟡";
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const isCompletion = kind === "completed";

  return (
    <div
      className={[
        "border rounded-lg p-3",
        isCompletion
          ? "bg-emerald-950/30 border-emerald-700"
          : "bg-slate-900 border-slate-800",
      ].join(" ")}
    >
      <div className="text-xs opacity-80">
        {icon} {label} — <span className="font-semibold">{milestone.program_id}</span>
      </div>
      {milestone.progress_pct != null && (
        <div className="text-xs opacity-60 mt-1">{milestone.progress_pct}% complete</div>
      )}
      {isCompletion && campaignId && (
        <Link
          to={`/campaign/${campaignId}/armory`}
          className="text-xs text-amber-400 hover:text-amber-300 underline mt-1 inline-block"
        >
          Equip in Armory →
        </Link>
      )}
    </div>
  );
}
