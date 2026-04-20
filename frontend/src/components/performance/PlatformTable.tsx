import type { PlatformStat } from "../../lib/types";

export function PlatformTable({ platforms }: { platforms: PlatformStat[] }) {
  if (platforms.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No combat yet.</p>
        <p className="text-xs opacity-50 mt-1">
          Platform stats appear after you commit squadrons to a vignette.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left opacity-60 border-b border-slate-800">
            <th className="py-1 pr-2 font-medium">Platform</th>
            <th className="py-1 px-2 font-medium text-right">Sorties</th>
            <th className="py-1 px-2 font-medium text-right">K</th>
            <th className="py-1 px-2 font-medium text-right">L</th>
            <th className="py-1 px-2 font-medium text-right">K:D</th>
            <th className="py-1 px-2 font-medium text-right">Win%</th>
            <th className="py-1 px-2 font-medium text-right">First-shot</th>
            <th className="py-1 pl-2 font-medium">Top wpn</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((p) => {
            const kdDisplay = p.kd_ratio == null
              ? (p.kills > 0 ? "∞" : "—")
              : p.kd_ratio.toFixed(2);
            return (
              <tr key={p.platform_id} className="border-b border-slate-900/60">
                <td className="py-1 pr-2 font-semibold truncate max-w-[12rem]">{p.platform_name}</td>
                <td className="py-1 px-2 text-right">{p.sorties}</td>
                <td className="py-1 px-2 text-right text-emerald-300">{p.kills}</td>
                <td className="py-1 px-2 text-right text-rose-300">{p.losses}</td>
                <td className="py-1 px-2 text-right font-mono">{kdDisplay}</td>
                <td className="py-1 px-2 text-right">{p.win_contribution_pct}%</td>
                <td className="py-1 px-2 text-right">{p.first_shot_pct}%</td>
                <td className="py-1 pl-2 font-mono opacity-80">{p.top_weapon ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
