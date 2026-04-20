import type { CampaignTotals } from "../../lib/types";

export function TotalsRibbon({ totals }: { totals: CampaignTotals }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Sorties", value: String(totals.total_sorties) },
    { label: "Kills", value: String(totals.total_kills) },
    { label: "Losses", value: String(totals.total_losses) },
    {
      label: "Munitions ₹cr",
      value: totals.total_munitions_cost_cr.toLocaleString("en-US"),
    },
    {
      label: "Cost / Kill",
      value: totals.avg_cost_per_kill_cr == null
        ? "—"
        : `₹${totals.avg_cost_per_kill_cr.toLocaleString("en-US")} cr`,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-900 border border-slate-800 rounded-lg p-3">
      {items.map((i) => (
        <div key={i.label} className="text-center">
          <div className="text-[10px] uppercase opacity-60">{i.label}</div>
          <div className="text-sm font-mono font-semibold">{i.value}</div>
        </div>
      ))}
    </div>
  );
}
