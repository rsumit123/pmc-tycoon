import type { VignetteOutcome } from "../../lib/types";

function computeGrade(outcome: VignetteOutcome): { letter: string; color: string } {
  if (!outcome.objective_met) return { letter: "F", color: "text-red-400" };
  const adv = Math.max(1, outcome.adv_airframes_lost);
  const ratio = outcome.ind_airframes_lost / adv;
  if (ratio < 0.5) return { letter: "A", color: "text-emerald-400" };
  if (ratio < 1.0) return { letter: "B", color: "text-emerald-300" };
  if (ratio < 2.0) return { letter: "C", color: "text-amber-300" };
  return { letter: "D", color: "text-red-300" };
}

export interface HeroOutcomeBannerProps {
  outcome: VignetteOutcome;
  scenarioName: string;
}

export function HeroOutcomeBanner({ outcome, scenarioName }: HeroOutcomeBannerProps) {
  const { letter, color } = computeGrade(outcome);
  const win = outcome.objective_met;
  const bg = win
    ? "bg-gradient-to-br from-emerald-900/60 to-slate-900"
    : "bg-gradient-to-br from-red-900/60 to-slate-900";

  return (
    <div className={`${bg} border border-slate-700 rounded-lg p-5 text-center`}>
      <div className="text-[10px] opacity-70 uppercase tracking-wider mb-1">{scenarioName}</div>
      <div className="text-2xl font-bold mb-2">
        {win ? "Mission Success" : "Mission Failure"}
      </div>
      <div className={`text-6xl font-bold font-serif ${color}`}>{letter}</div>
      <div className="text-xs opacity-70 mt-2">
        Exchange: {outcome.ind_airframes_lost} IAF lost · {outcome.adv_airframes_lost} ADV lost
      </div>
    </div>
  );
}
