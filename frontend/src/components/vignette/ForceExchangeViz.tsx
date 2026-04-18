import type { VignetteOutcome } from "../../lib/types";

function silhouetteRow(count: number, lostCount: number, color: string, label: string) {
  const frames: React.ReactNode[] = [];
  const safeCount = Math.max(0, count);
  const safeLost = Math.min(safeCount, Math.max(0, lostCount));
  for (let i = 0; i < safeCount; i++) {
    const lost = i < safeLost;
    frames.push(
      <svg key={i} width={14} height={10} viewBox="0 0 14 10"
           className={lost ? "opacity-30" : ""}>
        <path d="M 7 0 L 14 8 L 10 8 L 10 10 L 4 10 L 4 8 L 0 8 Z" fill={color} />
        {lost && <line x1={0} y1={0} x2={14} y2={10} stroke="#ef4444" strokeWidth={1.5} />}
      </svg>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 items-center">
      <span className="text-xs opacity-70 w-12 flex-shrink-0">{label}</span>
      {frames.length > 0 ? frames : <span className="text-xs opacity-40">—</span>}
    </div>
  );
}

export interface ForceExchangeVizProps {
  outcome: VignetteOutcome;
  indCommitted: number;
  advCommitted: number;
}

export function ForceExchangeViz({ outcome, indCommitted, advCommitted }: ForceExchangeVizProps) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider opacity-70">Force Exchange</h3>
      {silhouetteRow(indCommitted, outcome.ind_airframes_lost, "#3b82f6", "IAF")}
      {silhouetteRow(advCommitted, outcome.adv_airframes_lost, "#ef4444", "ADV")}
    </div>
  );
}
