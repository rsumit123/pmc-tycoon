import { Link } from "react-router-dom";
import type { AdversaryBase } from "../../lib/types";
import { useCampaignStore } from "../../store/campaignStore";

export interface AdversaryBaseSheetProps {
  base: AdversaryBase | null;
  onClose: () => void;
  campaignId?: number;
}

const TIER_BADGE: Record<string, string> = {
  high:   "border-emerald-700 text-emerald-300 bg-emerald-900/30",
  medium: "border-sky-700 text-sky-300 bg-sky-900/30",
  low:    "border-slate-700 text-slate-300 bg-slate-800/50",
};

export function AdversaryBaseSheet({ base, onClose, campaignId }: AdversaryBaseSheetProps) {
  const posture = useCampaignStore((s) => s.posture);
  if (!base) return null;
  const s = base.latest_sighting;
  const offensiveUnlocked = posture?.offensive_unlocked ?? false;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto shadow-2xl"
      role="dialog"
      aria-label={`${base.name} recon sheet`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{base.name}</h3>
          <p className="text-xs opacity-70">
            {base.faction} · {base.tier} base
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="close"
          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >×</button>
      </div>

      {s === null ? (
        <p className="mt-4 text-xs opacity-60">
          Not currently covered by any ISR drone orbit. Base a Tapas, Heron TP, or MQ-9B within range
          to start collecting sightings.
        </p>
      ) : (
        <div className="mt-4 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase opacity-60">Fidelity</span>
            <span className={`px-1.5 py-0.5 rounded border text-[10px] ${TIER_BADGE[s.tier] ?? TIER_BADGE.low}`}>
              {s.tier}
            </span>
            <span className="opacity-60">· as of {s.year}-Q{s.quarter}</span>
          </div>

          {s.tier === "low" && s.count_range && (
            <p>Estimated airframes: <strong>{s.count_range[0]}–{s.count_range[1]}</strong></p>
          )}
          {s.tier === "medium" && (
            <>
              {s.count_range && (
                <p>Estimated airframes: <strong>{s.count_range[0]}–{s.count_range[1]}</strong></p>
              )}
              {s.platforms && s.platforms.length > 0 && (
                <p>Platforms observed: {s.platforms.join(", ")}</p>
              )}
            </>
          )}
          {s.tier === "high" && s.platforms_detailed && (
            <>
              <p>Force composition:</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {Object.entries(s.platforms_detailed).map(([pid, n]) => (
                  <li key={pid}><span className="font-mono">{n}×</span> {pid}</li>
                ))}
              </ul>
              {s.readiness && (
                <p>Readiness signal: <strong className="uppercase">{s.readiness}</strong></p>
              )}
            </>
          )}

          {s.covering_drones.length > 0 && (
            <p className="opacity-60 text-[11px] mt-3">
              Source drones: {s.covering_drones.join(", ")}
            </p>
          )}
        </div>
      )}

      {offensiveUnlocked && campaignId !== undefined && base.is_covered && (
        <Link
          to={`/campaign/${campaignId}/ops?tab=strike&target=${base.id}`}
          onClick={onClose}
          className="block mt-4 w-full text-center bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-3 py-2 rounded"
        >
          🎯 Plan strike on this base →
        </Link>
      )}
    </div>
  );
}
