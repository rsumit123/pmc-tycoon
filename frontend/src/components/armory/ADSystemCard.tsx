import { Link } from "react-router-dom";
import type { ADSystemUnlock } from "../../lib/types";

export interface ADSystemCardProps {
  a: ADSystemUnlock;
  installedBaseNames: string[];
  totalBases: number;
  /** Campaign id for the deep-link into Acquisitions. */
  campaignId: number;
  /** Kept for backwards-compat; no longer used since install happens via Acquisitions. */
  onInstall?: () => void;
}

export function ADSystemCard({ a, installedBaseNames, totalBases, campaignId }: ADSystemCardProps) {
  const installedCount = installedBaseNames.length;
  const linkTo = `/campaign/${campaignId}/procurement?tab=acquisitions&view=offers&focus_ad=${a.target_id}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold">{a.name}</div>
        <span className="text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded whitespace-nowrap">UNLOCKED</span>
      </div>
      <p className="text-xs opacity-80">{a.description}</p>
      <div className="mt-1.5 text-[11px] font-mono opacity-70">
        Coverage {a.coverage_km}km · Max PK {(a.max_pk * 100).toFixed(0)}%
      </div>
      <div className="mt-1.5 text-[11px] opacity-80">
        Install cost: ₹{a.install_cost_cr.toLocaleString("en-US")} cr (+ interceptor stock)
      </div>
      <div className="mt-1.5 text-[11px]">
        <span className="opacity-70">Installed at </span>
        <span className="font-mono font-semibold">{installedCount}</span>
        <span className="opacity-70"> / {totalBases} bases</span>
        {installedCount > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {installedBaseNames.map((n) => (
              <span
                key={n}
                className="text-[10px] bg-emerald-950/40 border border-emerald-900/60 text-emerald-200 rounded px-1.5 py-0.5"
              >✓ {n}</span>
            ))}
          </div>
        )}
      </div>
      <Link
        to={linkTo}
        className="mt-2 w-full block text-center bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >
        Procure via Acquisitions →
      </Link>
    </div>
  );
}
