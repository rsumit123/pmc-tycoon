import { useMemo } from "react";
import type { MissileUnlock, HangarSquadron } from "../../lib/types";

export interface MissileEquipModalProps {
  missile: MissileUnlock;
  squadrons: HangarSquadron[];
  onClose: () => void;
  onPick: (squadronId: number) => void;
}

export function MissileEquipModal({ missile, squadrons, onClose, onPick }: MissileEquipModalProps) {
  const eligible = useMemo(
    () => squadrons.filter((s) => missile.eligible_platforms.includes(s.platform_id)),
    [squadrons, missile],
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Equip {missile.name.replace(/_/g, " ")}</h2>
          <button onClick={onClose} aria-label="close" className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {eligible.length === 0 ? (
            <p className="text-xs opacity-70">No eligible squadrons — this missile is compatible with platforms you don't currently operate.</p>
          ) : eligible.map((sq) => (
            <button
              key={sq.id}
              onClick={() => { onPick(sq.id); onClose(); }}
              className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-3"
            >
              <div className="text-sm font-semibold">{sq.name}</div>
              <div className="text-[10px] opacity-60">
                {sq.platform_name} · {sq.base_name} · {sq.strength} airframes
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Current: {sq.loadout.join(" · ") || "—"}
              </div>
            </button>
          ))}
          <p className="text-[10px] opacity-60 italic pt-2">
            Rollout takes 3 quarters. During rollout the squadron keeps its current loadout.
          </p>
        </div>
      </div>
    </div>
  );
}
