import type { IntelCard as IntelCardType } from "../../lib/types";

export interface IntelCardProps {
  card: IntelCardType;
  className?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  HUMINT: "bg-amber-600 text-slate-900",
  SIGINT: "bg-cyan-600 text-slate-900",
  IMINT: "bg-purple-600 text-slate-100",
  OSINT: "bg-slate-500 text-slate-100",
  ELINT: "bg-emerald-600 text-slate-900",
};

const FACTION_FLAG: Record<string, string> = {
  PLAAF: "🇨🇳 PLAAF",
  PAF: "🇵🇰 PAF",
  PLAN: "🇨🇳 PLAN",
};

export function IntelCard({ card, className = "" }: IntelCardProps) {
  const confPct = Math.round(card.confidence * 100);
  return (
    <div
      className={[
        "bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg",
        "min-h-[10rem] flex flex-col gap-3",
        className,
      ].join(" ")}
    >
      <div className="flex items-center justify-between text-xs">
        <span className={["px-2 py-0.5 rounded font-semibold", SOURCE_COLORS[card.source_type] ?? "bg-slate-700"].join(" ")}>
          {card.source_type}
        </span>
        <span className="opacity-70">{FACTION_FLAG[card.payload.subject_faction] ?? card.payload.subject_faction}</span>
      </div>
      <p className="text-sm leading-snug text-slate-100 flex-1">{card.payload.headline}</p>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Q{card.appeared_quarter} {card.appeared_year}</span>
        <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${confPct}%` }} />
        </div>
        <span>{confPct}%</span>
      </div>
    </div>
  );
}
