import type { WeaponStat } from "../../lib/types";

const COST_PER_KILL_WARN_CR = 100;  // highlight threshold

function Row({ w }: { w: WeaponStat }) {
  const cpk = w.cost_per_kill_cr;
  const warn = cpk != null && cpk >= COST_PER_KILL_WARN_CR;
  return (
    <tr className="border-b border-slate-900/60">
      <td className="py-1 pr-2 font-mono uppercase">{w.weapon_id}</td>
      <td className="py-1 px-2 text-right">{w.fired}</td>
      <td className="py-1 px-2 text-right text-emerald-300">{w.hits}</td>
      <td className="py-1 px-2 text-right">{w.hit_rate_pct}%</td>
      <td className="py-1 px-2 text-right font-mono">{w.avg_pk.toFixed(2)}</td>
      <td className="py-1 px-2 text-right font-mono">
        ₹{w.total_cost_cr.toLocaleString("en-US")}
      </td>
      <td className={`py-1 px-2 text-right font-mono ${warn ? "text-rose-400 font-semibold" : ""}`}>
        {cpk == null ? "—" : `₹${cpk.toLocaleString("en-US")}`}
      </td>
      <td className="py-1 pl-2 font-mono opacity-80">{w.top_target_platform ?? "—"}</td>
    </tr>
  );
}

function Table({ rows, title }: { rows: WeaponStat[]; title: string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-80">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left opacity-60 border-b border-slate-800">
              <th className="py-1 pr-2 font-medium">Weapon</th>
              <th className="py-1 px-2 font-medium text-right">Fired</th>
              <th className="py-1 px-2 font-medium text-right">Hits</th>
              <th className="py-1 px-2 font-medium text-right">Hit%</th>
              <th className="py-1 px-2 font-medium text-right">Avg PK</th>
              <th className="py-1 px-2 font-medium text-right">Total ₹</th>
              <th className="py-1 px-2 font-medium text-right">₹ / Kill</th>
              <th className="py-1 pl-2 font-medium">Top target</th>
            </tr>
          </thead>
          <tbody>{rows.map((w) => <Row key={w.weapon_id} w={w} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function WeaponTable({ weapons }: { weapons: WeaponStat[] }) {
  if (weapons.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No weapons fired yet.</p>
        <p className="text-xs opacity-50 mt-1">
          Weapon stats appear after your first committed engagement.
        </p>
      </div>
    );
  }
  const a2a = weapons.filter((w) => w.weapon_class.startsWith("a2a") && w.fired > 0);
  const strike = weapons.filter((w) => !w.weapon_class.startsWith("a2a"));
  return (
    <div className="space-y-4">
      <Table rows={a2a} title="Air-to-Air" />
      {strike.length > 0 && <Table rows={strike} title="Strike Munitions (not yet used in A2A vignettes)" />}
    </div>
  );
}
