import type { VignetteOutcome } from "../../lib/types";

export function ADContributionPanel({ outcome }: { outcome: VignetteOutcome }) {
  const rows = outcome.ad_contributions ?? [];
  if (rows.length === 0) return null;
  const totalKills = rows.reduce((a, r) => a + r.kills, 0);
  const totalFired = rows.reduce((a, r) => a + r.interceptors_fired, 0);
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-sm font-bold mb-2 flex items-baseline justify-between">
        <span>🛡 AD Performance</span>
        <span className="text-xs opacity-60 font-normal">
          {totalKills} intercepts / {totalFired} interceptors fired
        </span>
      </h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left opacity-60 border-b border-slate-800">
            <th className="py-1 pr-2 font-medium">System</th>
            <th className="py-1 px-2 font-medium">Base</th>
            <th className="py-1 px-2 font-medium text-right">Fired</th>
            <th className="py-1 pl-2 font-medium text-right">Kills</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.battery_id ?? i} className="border-b border-slate-900/60">
              <td className="py-1 pr-2 font-semibold">{r.system}</td>
              <td className="py-1 px-2 opacity-80">{r.base_name}</td>
              <td className="py-1 px-2 text-right">{r.interceptors_fired}</td>
              <td className="py-1 pl-2 text-right text-emerald-300">{r.kills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
