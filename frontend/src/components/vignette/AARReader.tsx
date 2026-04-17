// frontend/src/components/vignette/AARReader.tsx
import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";
import type { Vignette, VignetteOutcome } from "../../lib/types";

export interface AARReaderProps {
  campaignId: number;
  vignette: Vignette;
  className?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "fallback"; text: string };

function hasOutcome(v: Vignette): v is Vignette & { outcome: VignetteOutcome } {
  return v.outcome != null && "objective_met" in v.outcome;
}

export function AARReader({ campaignId, vignette, className = "" }: AARReaderProps) {
  const generateAAR = useCampaignStore((s) => s.generateAAR);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateAAR(campaignId, vignette.id)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text }); })
      .catch(() => {
        if (!cancelled) setState({ kind: "fallback", text: vignette.aar_text || "No AAR available." });
      });
    return () => { cancelled = true; };
  }, [campaignId, vignette.id, vignette.aar_text, generateAAR]);

  const outcome = hasOutcome(vignette) ? vignette.outcome : null;

  return (
    <div className={["flex flex-col gap-4", className].join(" ")}>
      {outcome && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
          <div className={outcome.objective_met ? "text-emerald-400 font-semibold col-span-2" : "text-red-400 font-semibold col-span-2"}>
            {outcome.objective_met ? "✓ Objective met" : "✗ Objective failed"}
          </div>
          <div>IAF KIA: <span className="font-mono">{outcome.ind_kia}</span></div>
          <div>Adv KIA: <span className="font-mono">{outcome.adv_kia}</span></div>
          <div>IAF airframes lost: <span className="font-mono">{outcome.ind_airframes_lost}</span></div>
          <div>Adv airframes lost: <span className="font-mono">{outcome.adv_airframes_lost}</span></div>
        </div>
      )}
      {state.kind === "loading" && (
        <div className="text-sm opacity-60 p-4">Generating AAR…</div>
      )}
      {(state.kind === "ready" || state.kind === "fallback") && (
        <article className="prose prose-invert max-w-none prose-sm">
          {state.text.split(/\n\n+/).map((para, i) => (
            <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
          ))}
          {state.kind === "fallback" && (
            <p className="text-xs opacity-50 italic">(narrative service unavailable — fallback summary)</p>
          )}
        </article>
      )}
    </div>
  );
}
