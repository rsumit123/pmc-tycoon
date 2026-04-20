import type { FactionStat } from "../../lib/types";

export function FactionSummary({ factions }: { factions: FactionStat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {factions.map((f) => {
        const rateColor = f.win_rate_pct >= 50 ? "text-emerald-300" : "text-rose-300";
        return (
          <div key={f.faction} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-semibold">vs {f.faction}</span>
              <span className="text-[10px] opacity-60">{f.sorties} sortie{f.sorties === 1 ? "" : "s"}</span>
            </div>
            {f.sorties === 0 ? (
              <p className="text-xs opacity-60 italic">No engagements yet</p>
            ) : (
              <>
                <div className="text-xs">
                  <span className="opacity-70">Record: </span>
                  <span className="font-mono">{f.wins}W · {f.losses}L</span>
                  <span className={`ml-2 font-semibold ${rateColor}`}>{f.win_rate_pct}%</span>
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Avg exchange: <span className="font-mono">
                    {f.avg_exchange_ratio == null ? "—" : `${f.avg_exchange_ratio}:1`}
                  </span>
                </div>
                <div className="text-[11px] opacity-80">
                  Avg munitions: <span className="font-mono">
                    ₹{f.avg_munitions_cost_cr.toLocaleString("en-US")} cr
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
