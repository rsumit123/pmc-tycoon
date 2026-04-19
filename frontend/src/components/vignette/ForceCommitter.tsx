// frontend/src/components/vignette/ForceCommitter.tsx
import type { PlanningState, VignetteCommitPayload, ROE } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";

// Platforms that are NOT combat aircraft — they're activated via Support toggles, not committed as squadrons.
const SUPPORT_PLATFORM_IDS = new Set<string>([
  "netra_aewc", "phalcon_a50", "netra_aewc_mk2",
  "il78_tanker", "il78mki",
  "tapas_uav", "ghatak_ucav",
]);

export interface ForceCommitterProps {
  planning: PlanningState;
  value: VignetteCommitPayload;
  onChange: (next: VignetteCommitPayload) => void;
}

function estimateAdvTotal(planning: PlanningState): number {
  if (planning.adversary_force_observed?.length) {
    return planning.adversary_force_observed.reduce((sum, o) => {
      if (o.count != null) return sum + o.count;
      if (o.count_range) return sum + (o.count_range[0] + o.count_range[1]) / 2;
      return sum;
    }, 0);
  }
  return planning.adversary_force.reduce((s, f) => s + f.count, 0);
}

export function ForceCommitter({ planning, value, onChange }: ForceCommitterProps) {
  const toggleSquadron = (sqid: number, available: number, checked: boolean) => {
    const rest = value.squadrons.filter((s) => s.squadron_id !== sqid);
    const next = checked ? [...rest, { squadron_id: sqid, airframes: available }] : rest;
    onChange({ ...value, squadrons: next });
  };

  const setAirframes = (sqid: number, n: number) => {
    const next = value.squadrons.map((s) => s.squadron_id === sqid ? { ...s, airframes: n } : s);
    onChange({ ...value, squadrons: next });
  };

  const setSupport = (k: "awacs" | "tanker" | "sead_package", v: boolean) => {
    onChange({ ...value, support: { ...value.support, [k]: v } });
  };

  const setROE = (roe: ROE) => onChange({ ...value, roe });

  const totalCommitted = value.squadrons.reduce((a, b) => a + b.airframes, 0);
  const advTotal = Math.max(1, Math.round(estimateAdvTotal(planning)));
  const overcommit = totalCommitted > advTotal * 2;
  const awacsCovering = planning.awacs_covering ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* PROMOTED: Support section first */}
      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Support Assets</h3>
        <div className="space-y-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            {awacsCovering.length > 0 ? (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value.support.awacs}
                  onChange={(e) => setSupport("awacs", e.target.checked)}
                />
                <span className="flex-1">
                  <span className="font-semibold">AWACS</span>
                  <span className="block text-xs opacity-70 mt-0.5">
                    {awacsCovering[0].base_name} • {awacsCovering[0].distance_km}km • +5% missile PK
                  </span>
                </span>
              </label>
            ) : (
              <div className="text-xs">
                <div className="font-semibold text-slate-400">AWACS <span className="text-red-400">unavailable</span></div>
                <div className="opacity-60 mt-0.5">
                  No AWACS squadrons cover this AO. Consider rebasing a Netra squadron.
                </div>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm bg-slate-900 border border-slate-800 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={value.support.tanker}
              onChange={(e) => setSupport("tanker", e.target.checked)} />
            <span className="flex-1">
              <span className="font-semibold">Tanker (IL-78)</span>
              <span className="block text-xs opacity-70 mt-0.5">Extends combat radius for committed squadrons</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm bg-slate-900 border border-slate-800 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={value.support.sead_package}
              onChange={(e) => setSupport("sead_package", e.target.checked)} />
            <span className="flex-1">
              <span className="font-semibold">SEAD package</span>
              <span className="block text-xs opacity-70 mt-0.5">Suppresses enemy AD threat</span>
            </span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Squadrons</h3>
        <p className="text-[10px] opacity-60 mb-2">
          Only combat squadrons are committable here. AWACS, tankers, and ISR drones are activated via the <span className="font-semibold">Support Assets</span> section above.
        </p>
        <ul className="flex flex-col gap-2">
          {planning.eligible_squadrons
            .filter((sq) => !SUPPORT_PLATFORM_IDS.has(sq.platform_id))
            .map((sq) => {
            const checked = value.squadrons.some((s) => s.squadron_id === sq.squadron_id);
            const picked = value.squadrons.find((s) => s.squadron_id === sq.squadron_id);
            return (
              <li
                key={sq.squadron_id}
                className={[
                  "border rounded-lg p-3 flex items-center gap-3",
                  sq.in_range ? "border-slate-700 bg-slate-900" : "border-slate-800 bg-slate-950 opacity-50",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  aria-label={sq.name}
                  checked={checked}
                  disabled={!sq.in_range}
                  onChange={(e) => toggleSquadron(sq.squadron_id, sq.airframes_available, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{sq.name}</div>
                  <div className="text-[11px] opacity-80 truncate mt-0.5">
                    ✈ <span className="font-semibold">{sq.platform_id.replace(/_/g, " ").toUpperCase()}</span>
                    {sq.loadout.length > 0 && (
                      <span className="opacity-70"> · {sq.loadout.join(" · ")}</span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-60 truncate mt-0.5">
                    📍 {sq.base_name} • {sq.distance_km} km • {sq.readiness_pct}% ready • {sq.airframes_available} airframes
                    {!sq.in_range && <span className="ml-2 text-red-400">out of range</span>}
                  </div>
                </div>
                {checked && picked && (
                  <Stepper
                    value={picked.airframes}
                    min={1}
                    max={sq.airframes_available}
                    step={1}
                    onChange={(n) => setAirframes(sq.squadron_id, n)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {overcommit && (
          <p className="text-xs text-amber-400 mt-2 border border-amber-800 bg-amber-950/30 rounded p-2">
            ⚠ Heavy overcommitment ({totalCommitted} vs ~{advTotal} enemy). All committed squadrons lose extra readiness even if they don't engage.
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Rules of Engagement</h3>
        <select
          aria-label="ROE"
          value={value.roe}
          onChange={(e) => setROE(e.target.value as ROE)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          {planning.roe_options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      </section>
    </div>
  );
}
