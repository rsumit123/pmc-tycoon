import { useState } from "react";
import type { HangarSquadron, BaseMarker } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { shortBaseName } from "./SquadronRow";

export interface SquadronSplitModalProps {
  squadron: HangarSquadron;
  bases: BaseMarker[];
  onClose: () => void;
  onSplit: (squadronId: number, airframes: number, targetBaseId: number) => Promise<void>;
}

export function SquadronSplitModal({ squadron, bases, onClose, onSplit }: SquadronSplitModalProps) {
  const maxSplit = Math.max(1, squadron.strength - 1);
  const [airframes, setAirframes] = useState<number>(Math.min(1, maxSplit));
  const [targetBaseId, setTargetBaseId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const otherBases = bases.filter((b) => b.id !== squadron.base_id);

  const handleSubmit = async () => {
    if (targetBaseId === null) return;
    setSubmitting(true);
    try {
      await onSplit(squadron.id, airframes, targetBaseId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">Split {squadron.name}</h2>
            <p className="text-xs opacity-70 truncate">
              Current: {squadron.strength} airframes at {shortBaseName(squadron.base_name)}
            </p>
          </div>
          <button onClick={onClose} aria-label="close" className="text-slate-400 hover:text-slate-200 flex-shrink-0">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded p-3">
            <label className="text-xs opacity-70 block mb-2">Airframes to move</label>
            <div className="flex items-center gap-3">
              <Stepper
                value={airframes}
                onChange={setAirframes}
                step={1}
                min={1}
                max={maxSplit}
              />
              <div className="text-xs opacity-80">
                <div>→ new squadron: {airframes}</div>
                <div className="opacity-60">← {squadron.name}: {squadron.strength - airframes}</div>
              </div>
            </div>
            <p className="text-[10px] opacity-60 mt-2">
              Max {maxSplit} (at least 1 airframe must stay with the parent squadron — use Rebase to move everyone).
            </p>
          </div>

          <div>
            <label className="text-xs opacity-70 block mb-2">Destination base</label>
            {otherBases.length === 0 ? (
              <p className="text-xs opacity-60">No other bases available.</p>
            ) : (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {otherBases.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setTargetBaseId(b.id)}
                    className={[
                      "w-full text-left rounded-lg p-3 border text-xs transition-colors",
                      targetBaseId === b.id
                        ? "bg-amber-600/20 border-amber-500"
                        : "bg-slate-800 border-slate-700 hover:border-slate-500",
                    ].join(" ")}
                  >
                    <div className="font-semibold text-sm">{b.name}</div>
                    <div className="opacity-60 text-[10px]">
                      {b.squadrons.length} sqn stationed
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={submitting || targetBaseId === null}
            onClick={handleSubmit}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold text-sm rounded py-2.5"
          >
            {submitting ? "Splitting…" : "Split squadron →"}
          </button>
          <p className="text-[10px] opacity-60 italic text-center">
            New squadron keeps readiness + loadout. XP stays with parent.
          </p>
        </div>
      </div>
    </div>
  );
}
