export type ObjectiveStatus = "pass" | "fail" | "unknown";

export interface ObjectiveEntry {
  id: string;
  name: string;
  status: ObjectiveStatus;
}

export interface ObjectiveScoreCardProps {
  objectives: ObjectiveEntry[];
}

const statusColor: Record<ObjectiveStatus, string> = {
  pass: "bg-emerald-600 text-emerald-50",
  fail: "bg-red-600 text-red-50",
  unknown: "bg-slate-600 text-slate-200",
};

const statusLabel: Record<ObjectiveStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  unknown: "N/A",
};

export function ObjectiveScoreCard({ objectives }: ObjectiveScoreCardProps) {
  if (objectives.length === 0) {
    return <p className="text-xs opacity-60">No objectives defined.</p>;
  }
  return (
    <div className="space-y-2">
      {objectives.map((obj) => (
        <div key={obj.id} className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-4 py-3">
          <span className="text-sm text-slate-200">{obj.name}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor[obj.status]}`}>
            {statusLabel[obj.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
