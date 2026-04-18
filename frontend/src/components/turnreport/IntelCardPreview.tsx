import type { IntelCardSummary } from "../../lib/types";

export function IntelCardPreview({ card }: { card: IntelCardSummary }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-center justify-between text-[10px] uppercase opacity-70 mb-1">
        <span>{card.source_type}</span>
        <span>{Math.round(card.confidence * 100)}% confidence</span>
      </div>
      <p className="text-xs">{card.headline}</p>
    </div>
  );
}
