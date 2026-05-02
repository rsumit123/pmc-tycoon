import type { StrikeBaseDamageState } from "../../lib/types";

export function DamageAssessmentPanel({ damage }: { damage: StrikeBaseDamageState }) {
  const shelterCapped = Math.min(100, damage.shelter_loss_pct);
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase opacity-70">🎯 Battle Damage Assessment</h3>
      <ul className="space-y-2 text-xs">
        <li>
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="opacity-70">Shelters</span>
            <span className="font-mono">−{damage.shelter_loss_pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-rose-600" style={{ width: `${shelterCapped}%` }} />
          </div>
        </li>
        <li className="flex items-baseline justify-between gap-2">
          <span className="opacity-70">Runway</span>
          <span className={[
            "font-mono",
            damage.runway_disabled_quarters_remaining > 0 ? "text-amber-300" : "opacity-60",
          ].join(" ")}>
            {damage.runway_disabled_quarters_remaining > 0
              ? `${damage.runway_disabled_quarters_remaining}Q disabled`
              : "operational"}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-2">
          <span className="opacity-70">AD batteries</span>
          <span className={[
            "font-mono",
            damage.ad_destroyed ? "text-rose-300" : "opacity-60",
          ].join(" ")}>
            {damage.ad_destroyed ? "DESTROYED" : "intact"}
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-2">
          <span className="opacity-70">Garrisoned airframes</span>
          <span className={[
            "font-mono",
            damage.garrisoned_loss > 0 ? "text-rose-300" : "opacity-60",
          ].join(" ")}>
            {damage.garrisoned_loss > 0 ? `−${damage.garrisoned_loss}` : "0"}
          </span>
        </li>
      </ul>
      <p className="text-[10px] opacity-60 italic">
        Damage decays each quarter (auto-repair ~25%/Q). AD batteries take ~8Q to be replaced.
      </p>
    </section>
  );
}
