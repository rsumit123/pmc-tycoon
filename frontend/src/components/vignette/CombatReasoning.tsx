import { useMemo } from "react";
import type {
  EventTraceEntry,
  PlanningState,
  VignetteOutcome,
  VignetteCommitPayload,
} from "../../lib/types";

export interface CombatReasoningProps {
  eventTrace: EventTraceEntry[];
  planningState: PlanningState;
  outcome: VignetteOutcome;
  committedForce: VignetteCommitPayload;
}

interface Factor {
  icon: string;
  label: string;
  detail: string;
  impact: "positive" | "negative" | "neutral";
}

const VLO_PLATFORMS = new Set(["j20a", "j35a", "f35", "f22"]);

function analyzeFactors(
  eventTrace: EventTraceEntry[],
  planningState: PlanningState,
  outcome: VignetteOutcome,
  committedForce: VignetteCommitPayload
): Factor[] {
  const factors: Factor[] = [];

  // 1. Detection advantage
  const detectionEvent = eventTrace.find((e) => e.kind === "detection");
  if (detectionEvent) {
    const advantage = detectionEvent.advantage as string;
    const indRadar = detectionEvent.ind_radar_km as number | undefined;
    const advRadar = detectionEvent.adv_radar_km as number | undefined;
    if (advantage === "ind") {
      factors.push({
        icon: "🟢",
        label: "Detection Advantage",
        detail: `Indian radars detected the adversary first${indRadar != null && advRadar != null ? ` (IND ${indRadar} km vs ADV ${advRadar} km)` : ""}. First-look advantage enables early BVR shots.`,
        impact: "positive",
      });
    } else if (advantage === "adv") {
      factors.push({
        icon: "🔴",
        label: "Detection Disadvantage",
        detail: `Adversary radars detected our force first${indRadar != null && advRadar != null ? ` (ADV ${advRadar} km vs IND ${indRadar} km)` : ""}. Enemy had BVR initiative before we could respond.`,
        impact: "negative",
      });
    } else {
      factors.push({
        icon: "🟡",
        label: "Mutual Detection",
        detail: `Both sides detected each other simultaneously${indRadar != null && advRadar != null ? ` (IND ${indRadar} km, ADV ${advRadar} km)` : ""}. No first-look advantage.`,
        impact: "neutral",
      });
    }
  }

  // 2. Adversary stealth
  const stealthPlatforms = planningState.adversary_force.filter((f) =>
    VLO_PLATFORMS.has(f.platform_id)
  );
  if (stealthPlatforms.length > 0) {
    const names = stealthPlatforms.map((f) => f.platform_id.toUpperCase()).join(", ");
    const totalStealth = stealthPlatforms.reduce((sum, f) => sum + f.count, 0);
    factors.push({
      icon: "🔴",
      label: "Adversary Stealth Platforms",
      detail: `Enemy deployed ${totalStealth} VLO platform(s): ${names}. Stealth reduces our radar detection range and missile PK, making BVR engagement significantly harder.`,
      impact: "negative",
    });
  }

  // 3. Numbers mismatch
  const indAirframes = committedForce.squadrons.reduce((sum, s) => sum + s.airframes, 0);
  const advAirframes = planningState.adversary_force.reduce((sum, f) => sum + f.count, 0);
  const ratio = indAirframes / Math.max(advAirframes, 1);
  if (ratio >= 1.5) {
    factors.push({
      icon: "🟢",
      label: "Numerical Superiority",
      detail: `We committed ${indAirframes} airframes vs ${advAirframes} adversary aircraft (${ratio.toFixed(1)}:1 ratio). Numerical advantage increases salvo opportunities.`,
      impact: "positive",
    });
  } else if (ratio <= 0.75) {
    factors.push({
      icon: "🔴",
      label: "Numerical Inferiority",
      detail: `We committed ${indAirframes} airframes against ${advAirframes} adversary aircraft (${ratio.toFixed(1)}:1 ratio). Outnumbered forces face saturated defenses and reduced salvo options.`,
      impact: "negative",
    });
  } else {
    factors.push({
      icon: "🟡",
      label: "Balanced Numbers",
      detail: `${indAirframes} Indian airframes vs ${advAirframes} adversary aircraft — roughly matched in size. Outcome depends on quality and tactics.`,
      impact: "neutral",
    });
  }

  // 4. AWACS support
  if (committedForce.support.awacs) {
    factors.push({
      icon: "🟢",
      label: "AWACS Support",
      detail: "AWACS was deployed, boosting missile PK by ~5% and improving cueing accuracy for BVR engagement.",
      impact: "positive",
    });
  } else {
    factors.push({
      icon: "🔴",
      label: "No AWACS Support",
      detail: "AWACS was not deployed. Without airborne radar, detection range and missile PK were reduced — especially critical against VLO or low-flying threats.",
      impact: "negative",
    });
  }

  // 5. ROE impact
  const roe = committedForce.roe;
  if (roe === "visual_id_required") {
    factors.push({
      icon: "🔴",
      label: "ROE: Visual ID Required",
      detail: "Visual identification ROE was in effect. BVR rounds were skipped — forcing the engagement into close-range WVR where our BVR missile advantage is neutralized.",
      impact: "negative",
    });
  } else if (roe === "weapons_tight") {
    factors.push({
      icon: "🟡",
      label: "ROE: Weapons Tight",
      detail: "Weapons Tight ROE applied a PK penalty on BVR shots due to strict positive ID requirements before firing. Reduced kill probability in the long-range phase.",
      impact: "negative",
    });
  } else {
    factors.push({
      icon: "🟢",
      label: "ROE: Weapons Free",
      detail: "Weapons Free ROE allowed unrestricted BVR engagement — maximum missile effectiveness at long range.",
      impact: "positive",
    });
  }

  // 6. BVR skip detection
  const bvrSkip = eventTrace.find((e) => e.kind === "vid_skip_bvr");
  if (bvrSkip) {
    const reason = bvrSkip.reason as string | undefined;
    factors.push({
      icon: "🔴",
      label: "BVR Phase Skipped",
      detail: `BVR round was bypassed${reason ? `: ${reason}` : ""}. The engagement jumped to visual range where our longer-ranged missiles provided no advantage.`,
      impact: "negative",
    });
  }

  // 7. Missile effectiveness — average PK comparison
  const indLaunches = eventTrace.filter(
    (e) => (e.kind === "bvr_launch" || e.kind === "wvr_launch") && e.side === "ind"
  );
  const advLaunches = eventTrace.filter(
    (e) => (e.kind === "bvr_launch" || e.kind === "wvr_launch") && e.side === "adv"
  );

  if (indLaunches.length > 0 && advLaunches.length > 0) {
    const avgIndPk =
      indLaunches.reduce((sum, e) => sum + ((e.pk as number) ?? 0), 0) / indLaunches.length;
    const avgAdvPk =
      advLaunches.reduce((sum, e) => sum + ((e.pk as number) ?? 0), 0) / advLaunches.length;
    const diff = avgIndPk - avgAdvPk;

    if (diff >= 0.05) {
      factors.push({
        icon: "🟢",
        label: "Missile Effectiveness",
        detail: `Indian missiles averaged ${(avgIndPk * 100).toFixed(0)}% PK vs adversary ${(avgAdvPk * 100).toFixed(0)}% PK. Superior weapon effectiveness.`,
        impact: "positive",
      });
    } else if (diff <= -0.05) {
      factors.push({
        icon: "🔴",
        label: "Missile Effectiveness",
        detail: `Adversary missiles averaged ${(avgAdvPk * 100).toFixed(0)}% PK vs our ${(avgIndPk * 100).toFixed(0)}% PK. Enemy weapons were more lethal in this engagement.`,
        impact: "negative",
      });
    } else {
      factors.push({
        icon: "🟡",
        label: "Missile Effectiveness",
        detail: `Both sides had similar missile PK — Indian ${(avgIndPk * 100).toFixed(0)}% vs adversary ${(avgAdvPk * 100).toFixed(0)}%. Outcome driven by other factors.`,
        impact: "neutral",
      });
    }
  }

  // 8. Overall result — exchange ratio
  const indLost = outcome.ind_airframes_lost;
  const advLost = outcome.adv_airframes_lost;
  const objectiveMet = outcome.objective_met;

  if (objectiveMet && indLost === 0) {
    factors.push({
      icon: "🟢",
      label: "Result: Decisive Victory",
      detail: `Objective achieved with zero friendly losses. ${advLost} adversary aircraft destroyed. Textbook engagement.`,
      impact: "positive",
    });
  } else if (objectiveMet) {
    const exchangeRatio = advLost / Math.max(indLost, 1);
    factors.push({
      icon: "🟢",
      label: "Result: Objective Met",
      detail: `Mission success — objective achieved. Exchange ratio: ${advLost} adversary lost vs ${indLost} friendly lost (${exchangeRatio.toFixed(1)}:1). Costly but effective.`,
      impact: "positive",
    });
  } else if (indLost === 0 && advLost === 0) {
    factors.push({
      icon: "🟡",
      label: "Result: No Decision",
      detail: "Objective not met but no aircraft were lost on either side. Engagement was inconclusive.",
      impact: "neutral",
    });
  } else {
    const exchangeRatio = indLost / Math.max(advLost, 1);
    factors.push({
      icon: "🔴",
      label: "Result: Objective Failed",
      detail: `Mission failed — objective not achieved. We lost ${indLost} airframes vs ${advLost} adversary losses (${exchangeRatio.toFixed(1)}:1 loss ratio against us). Review force composition and ROE.`,
      impact: "negative",
    });
  }

  return factors;
}

const IMPACT_CLASS: Record<Factor["impact"], string> = {
  positive: "border-emerald-700 bg-emerald-950 text-emerald-100",
  negative: "border-red-700 bg-red-950 text-red-100",
  neutral: "border-slate-600 bg-slate-800 text-slate-200",
};

export function CombatReasoning({
  eventTrace,
  planningState,
  outcome,
  committedForce,
}: CombatReasoningProps) {
  const factors = useMemo(
    () => analyzeFactors(eventTrace, planningState, outcome, committedForce),
    [eventTrace, planningState, outcome, committedForce]
  );

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mt-4">
      <h3 className="text-sm font-bold mb-3 text-slate-300">Combat Analysis</h3>
      <div className="space-y-2">
        {factors.map((f, i) => (
          <div key={i} className={`rounded-lg p-3 text-xs border ${IMPACT_CLASS[f.impact]}`}>
            <div className="font-semibold mb-1">
              {f.icon} {f.label}
            </div>
            <div className="opacity-80 leading-relaxed">{f.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
