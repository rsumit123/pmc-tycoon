import { useMemo } from "react";
import type { EligibleSquadron, VignetteCommitPayload, WeaponMeta } from "../../lib/types";

// The resolver fires up to 3 rounds (R1 BVR 120km, R2 BVR 50km, WVR 15km).
// Average airframes see ~2–2.5 missile launches across the combat.
// weapons_tight throttles to ~60%; visual_id_required skips BVR (≈ 1 shot WVR).
const EST_SHOTS_WEAPONS_FREE = 2.5;
const EST_SHOTS_WEAPONS_TIGHT = 1.5;
const EST_SHOTS_VID = 1.0;

function shotsPerAirframe(roe: string): number {
  if (roe === "weapons_tight") return EST_SHOTS_WEAPONS_TIGHT;
  if (roe === "visual_id_required") return EST_SHOTS_VID;
  return EST_SHOTS_WEAPONS_FREE;
}

function avgLoadoutCost(loadout: string[], weaponsById: Record<string, WeaponMeta>): number {
  if (loadout.length === 0) return 0;
  // Only A2A weapons actually fire in vignette combat — strike munitions are
  // carried (armory-equipped) but excluded from air-to-air engagement, so
  // they shouldn't inflate the pre-commit munitions estimate.
  const prices = loadout
    .map((w) => weaponsById[w])
    .filter((m): m is WeaponMeta => m != null && m.class.startsWith("a2a"))
    .map((m) => m.unit_cost_cr);
  if (prices.length === 0) return 0;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

export interface MunitionsEstimateProps {
  payload: VignetteCommitPayload;
  eligibleSquadrons: EligibleSquadron[];
  weaponsById: Record<string, WeaponMeta>;
  quarterlyGrantCr: number;
  treasuryCr: number;
}

export function MunitionsEstimate({
  payload, eligibleSquadrons, weaponsById, quarterlyGrantCr, treasuryCr,
}: MunitionsEstimateProps) {
  const { estimateCr, lineItems } = useMemo(() => {
    const shots = shotsPerAirframe(payload.roe);
    const byId = Object.fromEntries(eligibleSquadrons.map((s) => [s.squadron_id, s]));
    const items: Array<{ name: string; airframes: number; shots: number; avgCost: number; total: number }> = [];
    let total = 0;
    for (const c of payload.squadrons) {
      const sq = byId[c.squadron_id];
      if (!sq) continue;
      const avgCost = avgLoadoutCost(sq.loadout, weaponsById);
      if (avgCost === 0) continue;
      const line = Math.round(c.airframes * shots * avgCost);
      total += line;
      items.push({
        name: sq.name || sq.platform_id,
        airframes: c.airframes,
        shots,
        avgCost,
        total: line,
      });
    }
    return { estimateCr: total, lineItems: items };
  }, [payload, eligibleSquadrons, weaponsById]);

  if (estimateCr === 0) return null;

  const pctOfGrant = quarterlyGrantCr > 0 ? estimateCr / quarterlyGrantCr : 0;
  // Thresholds: <8% green, 8–20% amber, >20% red.
  const tier: "low" | "med" | "high" = pctOfGrant < 0.08 ? "low" : pctOfGrant < 0.20 ? "med" : "high";
  const tierStyles = {
    low: { bar: "bg-emerald-500", border: "border-emerald-700", text: "text-emerald-300" },
    med: { bar: "bg-amber-500", border: "border-amber-700", text: "text-amber-300" },
    high: { bar: "bg-rose-500", border: "border-rose-700", text: "text-rose-300" },
  }[tier];

  // Bar fill: scale to 25% of grant so the bar maxes out around the "very
  // expensive" threshold. Clamped to [0, 1].
  const barFill = Math.min(1, pctOfGrant / 0.25);

  const treasuryAfter = treasuryCr - estimateCr;
  const treasuryStrain = treasuryAfter < 0;

  return (
    <section className={`border rounded-lg p-3 bg-slate-900 ${tierStyles.border}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold">💸 Estimated Munitions Bill</h3>
        <span className={`text-sm font-bold font-mono ${tierStyles.text}`}>
          ₹{estimateCr.toLocaleString("en-US")} cr
        </span>
      </div>
      <div className="relative h-2.5 bg-slate-800 rounded overflow-hidden">
        <div
          className={`h-full ${tierStyles.bar} transition-all duration-200`}
          style={{ width: `${barFill * 100}%` }}
        />
      </div>
      <div className="text-[10px] opacity-60 mt-1.5 flex justify-between gap-2">
        <span>{Math.round(pctOfGrant * 100)}% of quarterly grant</span>
        <span>
          Treasury after: <span className={treasuryStrain ? "text-rose-300 font-semibold" : ""}>
            ₹{treasuryAfter.toLocaleString("en-US")} cr
          </span>
        </span>
      </div>
      {treasuryStrain && (
        <p className="text-[10px] text-rose-300 mt-1">
          ⚠ Estimate exceeds current treasury — combat will still resolve, but expect a deficit next turn.
        </p>
      )}
      {lineItems.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] opacity-60 cursor-pointer select-none hover:opacity-100">
            Breakdown ({lineItems.length} squadron{lineItems.length === 1 ? "" : "s"})
          </summary>
          <ul className="text-[10px] opacity-80 mt-1 space-y-0.5">
            {lineItems.map((li, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{li.name}</span>
                <span className="font-mono flex-shrink-0">
                  {li.airframes} × {li.shots.toFixed(1)} × ₹{Math.round(li.avgCost)} = ₹{li.total.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[9px] opacity-50 mt-1 italic">
            Estimate assumes {shotsPerAirframe(payload.roe).toFixed(1)} avg launches per airframe under {payload.roe.replace(/_/g, " ")}.
            Actual bill depends on ROE, detection, and enemy count.
          </p>
        </details>
      )}
    </section>
  );
}
