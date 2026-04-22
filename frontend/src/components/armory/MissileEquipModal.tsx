import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MissileUnlock, HangarSquadron, MissileStock } from "../../lib/types";

export interface MissileEquipModalProps {
  missile: MissileUnlock;
  squadrons: HangarSquadron[];
  missileStocks?: MissileStock[];
  campaignId?: number;
  onClose: () => void;
  onPick: (squadronId: number) => Promise<void> | void;
}

export function MissileEquipModal({
  missile, squadrons, missileStocks = [], campaignId, onClose, onPick,
}: MissileEquipModalProps) {
  const [pendingId, setPendingId] = useState<number | null>(null);

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
          ) : eligible.map((sq) => {
            const alreadyPending = (sq.pending_upgrades ?? []).some((u) => u.weapon_id === missile.target_id);
            const isSaving = pendingId === sq.id;
            const disabled = alreadyPending || isSaving;
            return (
              <button
                key={sq.id}
                onClick={async () => {
                  if (disabled) return;
                  setPendingId(sq.id);
                  try {
                    await onPick(sq.id);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={disabled}
                className={[
                  "w-full text-left border rounded-lg p-3 transition-colors",
                  alreadyPending
                    ? "bg-slate-950 border-amber-800/50 opacity-70 cursor-not-allowed"
                    : isSaving
                      ? "bg-slate-800 border-amber-600 cursor-wait"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold truncate">{sq.name}</div>
                  {alreadyPending ? (
                    <span className="text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                      🔧 queued
                    </span>
                  ) : isSaving ? (
                    <span className="text-[10px] bg-amber-700 text-white px-1.5 py-0.5 rounded whitespace-nowrap animate-pulse">
                      queuing…
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] opacity-60">
                  {sq.platform_name} · {sq.base_name} · {sq.strength} airframes
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">
                  Current: {sq.loadout.join(" · ") || "—"}
                </div>
                {(() => {
                  const depot = missileStocks.find(
                    (s) => s.base_id === sq.base_id && s.weapon_id === missile.target_id,
                  )?.stock ?? 0;
                  if (depot > 0) {
                    return (
                      <div className="text-[10px] mt-1 text-emerald-300">
                        Depot at {sq.base_name}: <span className="font-mono">{depot}</span> rounds
                      </div>
                    );
                  }
                  return (
                    <div className="text-[10px] mt-1 text-rose-300 leading-snug">
                      ⚠ Depot at {sq.base_name}: <span className="font-mono">0</span> rounds. Squadron cannot fire this missile in combat until you procure a batch.
                      {campaignId !== undefined && (
                        <Link
                          to={`/campaign/${campaignId}/procurement?tab=acquisitions&view=offers&offer=missiles&missile=${missile.target_id}&base=${sq.base_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block mt-0.5 text-amber-400 hover:text-amber-300 underline"
                        >
                          Procure at Acquisitions →
                        </Link>
                      )}
                    </div>
                  );
                })()}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-sm py-2"
          >Done</button>
          <div className="text-[10px] opacity-70 space-y-1 pt-2 border-t border-slate-800">
            <p className="italic opacity-80">How equip works:</p>
            <p>• Rollout takes 3 quarters. Squadron keeps its current loadout during rollout.</p>
            <p>• A squadron can carry <span className="font-semibold">one missile of each class</span> (BVR, WVR, ARM, strike). Same-class equip <span className="font-semibold">replaces</span> the older one (astra_mk3 ← astra_mk2).</p>
            <p>• Different classes <span className="font-semibold">stack</span>: a Rafale can carry astra_mk3 (BVR) + mica_ir (WVR) + brahmos_ng (strike) at once.</p>
            <p>• Equipping <span className="font-semibold">does not stock missiles</span> — procure a batch via Acquisitions → Missile Batches so the base depot has rounds to fire.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
