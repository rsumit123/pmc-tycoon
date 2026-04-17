// frontend/src/components/vignette/ForceCommitter.tsx
import type { PlanningState, VignetteCommitPayload, ROE } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";

export interface ForceCommitterProps {
  planning: PlanningState;
  value: VignetteCommitPayload;
  onChange: (next: VignetteCommitPayload) => void;
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

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Squadrons</h3>
        <ul className="flex flex-col gap-2">
          {planning.eligible_squadrons.map((sq) => {
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
                  <div className="text-xs opacity-70 truncate">
                    {sq.base_name} • {sq.distance_km} km • {sq.readiness_pct}% ready • {sq.airframes_available} airframes
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
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Support</h3>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.awacs} onChange={(e) => setSupport("awacs", e.target.checked)} />
            AWACS
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.tanker} onChange={(e) => setSupport("tanker", e.target.checked)} />
            Tanker
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.sead_package} onChange={(e) => setSupport("sead_package", e.target.checked)} />
            SEAD package
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Rules of Engagement</h3>
        <select
          aria-label="ROE"
          value={value.roe}
          onChange={(e) => setROE(e.target.value as ROE)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          {planning.roe_options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      </section>
    </div>
  );
}
