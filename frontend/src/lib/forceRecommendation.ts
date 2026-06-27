import type { PlanningState, VignetteCommitPayload, ROE } from "./types";

function estimateAdversaryCount(planning: PlanningState): number {
  const obs = planning.adversary_force_observed;
  if (obs && obs.length) {
    return Math.round(
      obs.reduce((sum, o) => {
        if (o.count_range) return sum + (o.count_range[0] + o.count_range[1]) / 2;
        if (typeof o.count === "number") return sum + o.count;
        return sum;
      }, 0),
    );
  }
  return (planning.adversary_force || []).reduce((s, a) => s + (a.count || 0), 0);
}

function advHasAirDefense(planning: PlanningState): boolean {
  const obs = planning.adversary_force_observed;
  if (obs && obs.length) return obs.some((o) => o.role === "air_defense");
  return (planning.adversary_force || []).some((a) => a.role === "air_defense");
}

/** A sensible default force package the player can then tweak. Advisory only. */
export function recommendPackage(planning: PlanningState): VignetteCommitPayload {
  const target = Math.ceil(estimateAdversaryCount(planning) * 1.5);
  const candidates = (planning.eligible_squadrons || [])
    .filter((s) => s.range_tier === "A" && s.readiness_pct >= 50)
    .sort((a, b) => b.readiness_pct - a.readiness_pct || b.airframes_available - a.airframes_available);

  const squadrons: { squadron_id: number; airframes: number }[] = [];
  let committed = 0;
  for (const s of candidates) {
    if (committed >= target) break;
    squadrons.push({ squadron_id: s.squadron_id, airframes: s.airframes_available });
    committed += s.airframes_available;
  }

  const opts = planning.roe_options || [];
  const roe: ROE = (opts as string[]).includes("weapons_free")
    ? ("weapons_free" as ROE)
    : ((opts[0] as ROE) ?? ("weapons_free" as ROE));

  return {
    squadrons,
    support: {
      awacs: (planning.awacs_covering?.length ?? 0) > 0,
      tanker: false,
      sead_package: advHasAirDefense(planning),
    },
    roe,
  };
}

export interface OddsEstimate {
  label: "Strong favorite" | "Even" | "Risky";
  reason: string;
}

/** Transparent client-side odds estimate (force ratio + detection edge). Advisory. */
export function estimateOdds(planning: PlanningState, value: VignetteCommitPayload): OddsEstimate {
  const committed = (value.squadrons || []).reduce((s, x) => s + (x.airframes || 0), 0);
  if (committed === 0) return { label: "Risky", reason: "No fighters committed" };
  const adv = estimateAdversaryCount(planning);
  const ratio = committed / Math.max(1, adv);
  const tier = planning.intel_quality?.tier;
  const detectionEdge =
    (value.support.awacs && (planning.awacs_covering?.length ?? 0) > 0) ||
    tier === "high" || tier === "perfect";
  const ratioStr = `${committed} vs ~${adv}`;
  if (ratio >= 1.8 || (ratio >= 1.4 && detectionEdge)) {
    return { label: "Strong favorite", reason: detectionEdge ? `${ratioStr} + detection edge` : ratioStr };
  }
  if (ratio >= 0.9) return { label: "Even", reason: ratioStr };
  return { label: "Risky", reason: `Outnumbered (${ratioStr})` };
}
