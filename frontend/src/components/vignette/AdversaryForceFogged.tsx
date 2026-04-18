import type { AdversaryForceObserved } from "../../lib/types";

export interface AdversaryForceFoggedProps {
  observed: AdversaryForceObserved[];
  tier: "low" | "medium" | "high" | "perfect";
  score: number;
}

const TIER_COPY: Record<string, { title: string; hint: string; color: string }> = {
  low:     { title: "Minimal Intel", hint: "Only rough estimates available. Commit with caution.", color: "border-red-800 bg-red-950/30" },
  medium:  { title: "Partial Intel", hint: "Approximate composition — platform IDs uncertain.",    color: "border-amber-800 bg-amber-950/30" },
  high:    { title: "Good Intel",    hint: "Likely composition identified.",                        color: "border-emerald-800 bg-emerald-950/30" },
  perfect: { title: "Full Intel",    hint: "Confirmed force composition.",                          color: "border-emerald-700 bg-emerald-950/40" },
};

export function AdversaryForceFogged({ observed, tier, score }: AdversaryForceFoggedProps) {
  const copy = TIER_COPY[tier] ?? TIER_COPY.low;

  return (
    <div className={`border rounded-lg p-3 ${copy.color}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-200">Adversary Force</h3>
        <div className="text-[10px] uppercase tracking-wide opacity-80">
          {copy.title} · {Math.round(score * 100)}%
        </div>
      </div>
      <p className="text-[10px] opacity-70 mb-2">{copy.hint}</p>
      {observed.length === 0 ? (
        <p className="text-xs opacity-60">No contacts.</p>
      ) : (
        <ul className="text-xs space-y-1.5">
          {observed.map((o, i) => (
            <li key={i} className="flex flex-wrap gap-1.5 items-baseline">
              <span className="opacity-70">[{o.faction}]</span>
              {o.fidelity === "low" ? (
                <>
                  <span className="font-semibold">{o.count_range?.[0]}-{o.count_range?.[1]} aircraft</span>
                  <span className="opacity-60 italic">Unknown composition</span>
                </>
              ) : o.fidelity === "medium" ? (
                <>
                  <span className="font-semibold">~{o.count_range?.[0]}-{o.count_range?.[1]}</span>
                  <span>{o.probable_platforms.join(" / ")}</span>
                  {o.role && <span className="opacity-60">({o.role})</span>}
                </>
              ) : (
                <>
                  <span className="font-semibold">{o.count}×</span>
                  <span>{o.probable_platforms.join(" / ")}</span>
                  {o.role && <span className="opacity-60">({o.role})</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
