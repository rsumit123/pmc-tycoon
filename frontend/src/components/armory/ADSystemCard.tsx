import type { ADSystemUnlock } from "../../lib/types";

export function ADSystemCard({ a, onInstall }: { a: ADSystemUnlock; onInstall: () => void }) {
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
        Install cost: ₹{a.install_cost_cr.toLocaleString("en-US")} cr
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >Install at base</button>
    </div>
  );
}
