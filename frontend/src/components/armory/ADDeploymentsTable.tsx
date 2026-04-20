import { useMemo, useState } from "react";
import type { ADBattery, BaseMarker } from "../../lib/types";

const AD_SYSTEM_NAMES: Record<string, string> = {
  s400: "S-400 Triumf",
  long_range_sam: "Indigenous Long-Range SAM",
  project_kusha: "Project Kusha BMD",
  mrsam_air: "MR-SAM (Barak-8)",
  akash_ng: "Akash-NG",
  qrsam: "QRSAM",
  vshorads: "VSHORADS",
};

type SortMode = "system" | "base";

export function ADDeploymentsTable({
  adBatteries, bases,
}: {
  adBatteries: ADBattery[];
  bases: BaseMarker[];
}) {
  const [sortMode, setSortMode] = useState<SortMode>("system");
  const basesById = useMemo(() => Object.fromEntries(bases.map((b) => [b.id, b])), [bases]);

  const rows = useMemo(() => {
    const enriched = adBatteries.map((b) => ({
      id: b.id,
      systemId: b.system_id,
      systemName: AD_SYSTEM_NAMES[b.system_id] ?? b.system_id,
      baseName: basesById[b.base_id]?.name ?? `base-${b.base_id}`,
      coverageKm: b.coverage_km,
      installedLabel: `${b.installed_year} Q${b.installed_quarter}`,
    }));
    if (sortMode === "system") {
      enriched.sort((a, b) => a.systemName.localeCompare(b.systemName) || a.baseName.localeCompare(b.baseName));
    } else {
      enriched.sort((a, b) => a.baseName.localeCompare(b.baseName) || a.systemName.localeCompare(b.systemName));
    }
    return enriched;
  }, [adBatteries, basesById, sortMode]);

  if (rows.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No AD batteries deployed.</p>
        <p className="text-xs opacity-50 mt-1">
          Install systems onto bases using the cards above.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-80">
          Deployments ({rows.length})
        </h3>
        <div className="flex gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => setSortMode("system")}
            className={[
              "rounded px-2 py-0.5 border",
              sortMode === "system"
                ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                : "bg-slate-800 border-slate-700 text-slate-300",
            ].join(" ")}
          >By system</button>
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
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left opacity-60 border-b border-slate-800">
              <th className="py-1 pr-2 font-medium">System</th>
              <th className="py-1 px-2 font-medium">Base</th>
              <th className="py-1 px-2 font-medium text-right">Coverage</th>
              <th className="py-1 pl-2 font-medium text-right">Installed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-900/60">
                <td className="py-1 pr-2 font-semibold">{r.systemName}</td>
                <td className="py-1 px-2 truncate max-w-[14rem]">{r.baseName}</td>
                <td className="py-1 px-2 text-right font-mono opacity-80">{r.coverageKm} km</td>
                <td className="py-1 pl-2 text-right font-mono opacity-80">{r.installedLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
