import type { ObjectiveProgressEntry } from "../../lib/types";

const STATUS: Record<ObjectiveProgressEntry["status"], { label: string; pill: string; bar: string }> = {
  met:         { label: "✅ Met",         pill: "bg-emerald-700/40 text-emerald-200", bar: "bg-emerald-500" },
  in_progress: { label: "🟡 In progress", pill: "bg-amber-700/30 text-amber-200",     bar: "bg-amber-500" },
  at_risk:     { label: "🔴 At risk",     pill: "bg-rose-800/40 text-rose-200",        bar: "bg-rose-500" },
};

export interface ObjectiveTrackerProps {
  objectives: ObjectiveProgressEntry[];
}

export function ObjectiveTracker({ objectives }: ObjectiveTrackerProps) {
  if (objectives.length === 0) {
    return <p className="text-sm opacity-60">No objectives to track.</p>;
  }
  return (
    <div className="space-y-2">
      {objectives.map((o) => {
        const s = STATUS[o.status];
        return (
          <div key={o.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{o.name}</div>
              <span className={`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap ${s.pill}`}>{s.label}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded bg-slate-800 overflow-hidden">
              <div className={`h-full ${s.bar}`} style={{ width: `${Math.round(o.progress * 100)}%` }} />
            </div>
            {o.detail && <div className="mt-1 text-xs opacity-70">{o.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
