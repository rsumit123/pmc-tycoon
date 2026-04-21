import { useMemo, useState } from "react";
import type { BaseMarker, MissileStock } from "../../lib/types";

type SortMode = "base" | "weapon";

export function MissileDepotTable({
  missileStocks, bases,
}: {
  missileStocks: MissileStock[];
  bases: BaseMarker[];
}) {
  const [sortMode, setSortMode] = useState<SortMode>("base");
  const basesById = useMemo(() => Object.fromEntries(bases.map((b) => [b.id, b])), [bases]);

  const rows = useMemo(() => {
    const enriched = missileStocks.map((s) => ({
      id: s.id,
      weaponId: s.weapon_id,
      baseName: basesById[s.base_id]?.name ?? `base-${s.base_id}`,
      stock: s.stock,
    }));
    if (sortMode === "base") {
      enriched.sort((a, b) =>
        a.baseName.localeCompare(b.baseName) || a.weaponId.localeCompare(b.weaponId),
      );
    } else {
      enriched.sort((a, b) =>
        a.weaponId.localeCompare(b.weaponId) || a.baseName.localeCompare(b.baseName),
      );
    }
    return enriched;
  }, [missileStocks, basesById, sortMode]);

  if (rows.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No missile stock tracked yet.</p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-80">
          Missile Depots ({rows.length})
        </h3>
        <div className="flex gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => setSortMode("base")}
            className={[
              "rounded px-2 py-0.5 border",
              sortMode === "base"
                ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                : "bg-slate-800 border-slate-700 text-slate-300",
            ].join(" ")}
          >By base</button>
          <button
            type="button"
            onClick={() => setSortMode("weapon")}
            className={[
              "rounded px-2 py-0.5 border",
              sortMode === "weapon"
                ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                : "bg-slate-800 border-slate-700 text-slate-300",
            ].join(" ")}
          >By weapon</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left opacity-60 border-b border-slate-800">
              <th className="py-1 pr-2 font-medium">Base</th>
              <th className="py-1 px-2 font-medium">Weapon</th>
              <th className="py-1 pl-2 font-medium text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-900/60">
                <td className="py-1 pr-2 font-semibold">{r.baseName}</td>
                <td className="py-1 px-2">{r.weaponId}</td>
                <td className="py-1 pl-2 text-right font-mono text-emerald-300">{r.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
