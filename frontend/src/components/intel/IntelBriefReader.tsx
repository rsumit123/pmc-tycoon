import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";

export interface IntelBriefReaderProps {
  campaignId: number;
  className?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; text: string; cached: boolean }
  | { kind: "ineligible"; message: string }
  | { kind: "error"; message: string };

export function IntelBriefReader({ campaignId, className = "" }: IntelBriefReaderProps) {
  const generateIntelBrief = useCampaignStore((s) => s.generateIntelBrief);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateIntelBrief(campaignId)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text, cached: resp.cached }); })
      .catch((e: { response?: { status?: number; data?: { detail?: string } } }) => {
        if (cancelled) return;
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail ?? "Brief unavailable.";
        if (status === 409) setState({ kind: "ineligible", message: "Intel brief not available this quarter." });
        else setState({ kind: "error", message: detail });
      });
    return () => { cancelled = true; };
  }, [campaignId, generateIntelBrief]);

  if (state.kind === "loading" || state.kind === "idle") {
    return <div className={["text-sm opacity-60 p-4", className].join(" ")}>Generating intel brief…</div>;
  }
  if (state.kind === "ineligible") {
    return <div className={["text-sm opacity-60 p-4 italic", className].join(" ")}>{state.message}</div>;
  }
  if (state.kind === "error") {
    return <div className={["text-sm text-red-300 p-4", className].join(" ")}>Error: {state.message}</div>;
  }
  return (
    <article className={["prose prose-invert max-w-none prose-sm", className].join(" ")}>
      {state.text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
      ))}
    </article>
  );
}
