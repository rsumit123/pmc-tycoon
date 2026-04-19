import type { MissileUnlock } from "../../lib/types";

export function MissileCard({ m, onEquip }: { m: MissileUnlock; onEquip: () => void }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold">{m.name.replace(/_/g, " ")}</div>
        <span className="text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded whitespace-nowrap">UNLOCKED</span>
      </div>
      <p className="text-xs opacity-80">{m.description}</p>
      <div className="mt-1.5 text-[11px] font-mono opacity-70">
        NEZ {m.nez_km}km · Max {m.max_range_km}km
      </div>
      <div className="mt-1.5 text-[10px] opacity-60 break-words">
        Eligible: {m.eligible_platforms.join(", ")}
      </div>
      <button
        type="button"
        onClick={onEquip}
        className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >Equip on squadron</button>
    </div>
  );
}
