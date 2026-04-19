import { Link } from "react-router-dom";
import type { RDMilestoneSummary } from "../../lib/types";

export interface UnlockBannerProps {
  campaignId: number;
  completions: RDMilestoneSummary[];
}

export function UnlockBanner({ campaignId, completions }: UnlockBannerProps) {
  const completed = completions.filter((m) => m.kind === "completed");
  if (completed.length === 0) return null;

  return (
    <section className="border-2 border-amber-500 rounded-lg p-4 bg-gradient-to-br from-amber-900/40 to-slate-900">
      <h2 className="text-sm font-bold text-amber-200 mb-2">
        🎉 {completed.length} R&D {completed.length === 1 ? "Program" : "Programs"} Complete
      </h2>
      <ul className="space-y-1 text-xs">
        {completed.map((m, i) => (
          <li key={i} className="text-amber-100">
            • {m.program_id}
          </li>
        ))}
      </ul>
      <Link
        to={`/campaign/${campaignId}/armory`}
        className="mt-3 inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs rounded px-4 py-2"
      >
        Open Armory →
      </Link>
    </section>
  );
}
