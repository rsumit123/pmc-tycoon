import type { MissileUnlock } from "../../lib/types";
import { useCampaignStore } from "../../store/campaignStore";
import { WEAPON_CLASS_META } from "../../lib/weaponClass";

export function MissileCard({ m, onEquip }: { m: MissileUnlock; onEquip: () => void }) {
  const weaponsById = useCampaignStore((s) => s.weaponsById);
  const unitCost = weaponsById[m.target_id]?.unit_cost_cr;
  const meta = WEAPON_CLASS_META[m.weapon_class ?? "a2a_bvr"];
  const isStrike = meta.role === "strike";
  return (
    <div className={[
      "border rounded-lg p-3",
      isStrike ? "bg-slate-900/70 border-sky-900/60" : "bg-slate-900 border-slate-800",
    ].join(" ")}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold">{m.name.replace(/_/g, " ")}</div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${meta.badgeClass}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-xs opacity-80">{m.description}</p>
      <div className="mt-1.5 text-[11px] font-mono opacity-70">
        NEZ {m.nez_km}km · Max {m.max_range_km}km
        {unitCost != null && <> · <span className="text-amber-300">₹{unitCost} cr/shot</span></>}
      </div>
      <div className="mt-1.5 text-[10px] opacity-60 break-words">
        Eligible: {m.eligible_platforms.join(", ")}
      </div>
      {isStrike && (
        <p className="mt-1.5 text-[10px] text-sky-300 italic">
          Strike-class munition — equipped airframes keep their A2A loadout; this does not fire in air-to-air vignettes.
        </p>
      )}
      <button
        type="button"
        onClick={onEquip}
        className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >Equip on squadron</button>
    </div>
  );
}
