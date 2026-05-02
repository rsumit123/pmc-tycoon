import type { StrikePreview } from "../../lib/types";

const BLOWBACK_COLOR: Record<string, string> = {
  low:      "text-emerald-300",
  medium:   "text-amber-300",
  high:     "text-orange-300",
  critical: "text-rose-300",
};

const INTEL_BADGE: Record<string, string> = {
  high:   "bg-emerald-900/40 text-emerald-200 border-emerald-700",
  medium: "bg-sky-900/40 text-sky-200 border-sky-700",
  low:    "bg-slate-800 text-slate-300 border-slate-700",
};

export interface StrikeRiskPreviewProps {
  preview: StrikePreview | null;
  loading?: boolean;
}

export function StrikeRiskPreview({ preview, loading }: StrikeRiskPreviewProps) {
  if (loading && !preview) {
    return (
      <div className="bg-slate-950/40 border border-slate-800 rounded p-2 text-xs opacity-60">
        Calculating forecast…
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="bg-slate-950/40 border border-slate-800 rounded p-2 text-xs opacity-60">
        Select target + squadron to see risk forecast.
      </div>
    );
  }
  const { issues, forecast, intel_quality } = preview;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase opacity-60">Forecast</span>
        <span className={`px-1.5 py-0.5 rounded border text-[10px] ${INTEL_BADGE[intel_quality] ?? INTEL_BADGE.low}`}>
          {intel_quality} intel
        </span>
      </div>

      {issues.length > 0 && (
        <ul className="text-[11px] text-rose-300 space-y-0.5">
          {issues.map((i, k) => <li key={k}>• {i}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2">
          <div className="opacity-60 text-[10px]">IND losses</div>
          <div className="font-mono text-base">{forecast.ind_losses[0]}–{forecast.ind_losses[1]}</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2">
          <div className="opacity-60 text-[10px]">Target damage</div>
          <div className="font-mono text-base">{forecast.damage_pct[0]}–{forecast.damage_pct[1]}%</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2 col-span-2">
          <div className="opacity-60 text-[10px]">Diplomatic blowback</div>
          <div className={`font-semibold uppercase ${BLOWBACK_COLOR[forecast.diplomatic_blowback]}`}>
            {forecast.diplomatic_blowback}
          </div>
        </div>
      </div>

      {intel_quality === "low" && (
        <p className="text-[10px] opacity-70 italic">
          ⚠ Low intel — actual losses + damage may differ ±40% from forecast. Consider basing
          a Heron TP / MQ-9B closer to refine recon.
        </p>
      )}
    </div>
  );
}
