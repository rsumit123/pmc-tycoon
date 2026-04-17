import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";

export interface RetrospectiveReaderProps {
  campaignId: number;
  className?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "ineligible" }
  | { kind: "error"; message: string };

export function RetrospectiveReader({ campaignId, className = "" }: RetrospectiveReaderProps) {
  const generateRetrospective = useCampaignStore((s) => s.generateRetrospective);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateRetrospective(campaignId)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text }); })
      .catch((e: { response?: { status?: number } }) => {
        if (cancelled) return;
        if (e?.response?.status === 409) setState({ kind: "ineligible" });
        else setState({ kind: "error", message: "Narrative service unavailable." });
      });
    return () => { cancelled = true; };
  }, [campaignId, generateRetrospective]);

  if (state.kind === "loading") {
    return <div className={["text-sm opacity-60 p-4", className].join(" ")}>Generating retrospective…</div>;
  }
  if (state.kind === "ineligible") {
    return <div className={["text-sm opacity-60 p-4 italic", className].join(" ")}>Retrospective not yet available — campaign must reach Q40.</div>;
  }
  if (state.kind === "error") {
    return <div className={["text-sm text-red-300 p-4", className].join(" ")}>{state.message}</div>;
  }
  return (
    <article className={["prose prose-invert max-w-none prose-sm", className].join(" ")}>
      {state.text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
      ))}
    </article>
  );
}
