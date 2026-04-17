import type { AceSummary } from "../../lib/types";

export interface EmergingAceCardProps {
  ace: AceSummary;
}

export function EmergingAceCard({ ace }: EmergingAceCardProps) {
  return (
    <div className="bg-slate-900 border border-amber-600/40 rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-amber-400">{ace.ace_name}</span>
        <span className="text-xs opacity-60">Q{ace.awarded_quarter} {ace.awarded_year}</span>
      </div>
      <p className="text-xs text-slate-300">{ace.squadron_name}</p>
      <p className="text-xs opacity-60">{ace.platform_id}</p>
    </div>
  );
}
