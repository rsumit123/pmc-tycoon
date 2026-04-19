import type { VignetteOutcome } from "../../lib/types";

export function MunitionsExpended({ outcome }: { outcome: VignetteOutcome }) {
  const rows = outcome.munitions_expended ?? [];
  if (rows.length === 0) return null;
  const total = outcome.munitions_cost_total_cr ?? 0;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-sm font-bold mb-2 flex items-baseline justify-between">
        <span>💸 Munitions Expended</span>
        <span className="text-xs opacity-60 font-normal">
          Billed to O&amp;M on commit
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left opacity-60 border-b border-slate-800">
              <th className="py-1 pr-2 font-medium">Weapon</th>
              <th className="py-1 px-2 font-medium text-right">Fired</th>
              <th className="py-1 px-2 font-medium text-right">Hits</th>
              <th className="py-1 px-2 font-medium text-right">Hit %</th>
              <th className="py-1 px-2 font-medium text-right">₹/shot</th>
              <th className="py-1 pl-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hitPct = r.fired > 0 ? Math.round((r.hits / r.fired) * 100) : 0;
              const wasted = r.fired > 0 && r.hits === 0;
              return (
                <tr key={r.weapon} className="border-b border-slate-900/60">
                  <td className="py-1 pr-2 font-mono uppercase">{r.weapon}</td>
                  <td className="py-1 px-2 text-right">{r.fired}</td>
                  <td className={`py-1 px-2 text-right ${wasted ? "text-rose-400" : ""}`}>{r.hits}</td>
                  <td className={`py-1 px-2 text-right ${wasted ? "text-rose-400" : "opacity-80"}`}>{hitPct}%</td>
                  <td className="py-1 px-2 text-right opacity-80">₹{r.unit_cost_cr}</td>
                  <td className="py-1 pl-2 text-right font-semibold">
                    ₹{r.total_cost_cr.toLocaleString("en-US")}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700">
              <td className="py-1.5 pr-2 font-bold" colSpan={5}>Total deducted from treasury</td>
              <td className="py-1.5 pl-2 text-right font-bold text-amber-300">
                ₹{total.toLocaleString("en-US")} cr
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.some((r) => r.fired > 0 && r.hits === 0) && (
        <p className="text-[10px] text-rose-300 mt-2">
          ⚠ Red rows are munitions fired with zero hits — usually a loadout
          mismatch (e.g. R-77 vs low-RCS targets). Consider re-equipping via
          Armory before the next similar engagement.
        </p>
      )}
    </section>
  );
}
