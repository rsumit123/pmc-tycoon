import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { AARReader } from "../components/vignette/AARReader";
import { CombatReasoning } from "../components/vignette/CombatReasoning";
import { CombatStats } from "../components/vignette/CombatStats";
import { TacticalReplay } from "../components/vignette/TacticalReplay";
import { HeroOutcomeBanner } from "../components/vignette/HeroOutcomeBanner";
import { ForceExchangeViz } from "../components/vignette/ForceExchangeViz";
import { ADContributionPanel } from "../components/vignette/ADContribution";
import { MunitionsExpended } from "../components/vignette/MunitionsExpended";
import type { Vignette, VignetteOutcome } from "../lib/types";

export function VignetteAAR() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const campaignId = Number(id);
  const vignetteId = Number(vid);

  const vignetteById = useCampaignStore((s) => s.vignetteById);
  const loadVignette = useCampaignStore((s) => s.loadVignette);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const campaign = useCampaignStore((s) => s.campaign);

  const [vignette, setVignette] = useState<Vignette | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    const cached = vignetteById[vignetteId];
    if (cached) setVignette(cached);
    else loadVignette(campaignId, vignetteId).then((v) => v && setVignette(v));
  }, [campaignId, vignetteId, vignetteById, loadVignette]);

  if (!vignette) return <div className="p-6">Loading AAR…</div>;
  const ps = vignette.planning_state;

  const outcome = (vignette.outcome && "objective_met" in vignette.outcome)
    ? (vignette.outcome as VignetteOutcome)
    : null;
  const indCommitted = (vignette.committed_force?.squadrons ?? []).reduce((a, b) => a + b.airframes, 0);
  const advCommitted = ps.adversary_force.reduce((a, b) => a + b.count, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">AAR — {ps.scenario_name}</h1>
          <p className="text-xs opacity-70">Q{vignette.quarter} {vignette.year} • {ps.ao.region}</p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>
      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {outcome && <HeroOutcomeBanner outcome={outcome} scenarioName={ps.scenario_name} />}
        {outcome && vignette.committed_force && (
          <ForceExchangeViz outcome={outcome} indCommitted={indCommitted} advCommitted={advCommitted} />
        )}
        {outcome && <ADContributionPanel outcome={outcome} />}
        {outcome && <MunitionsExpended outcome={outcome} />}
        {vignette.event_trace && vignette.event_trace.length > 0 && (
          <CombatStats eventTrace={vignette.event_trace} />
        )}
        {vignette.event_trace && vignette.event_trace.length > 0 && (
          <TacticalReplay
            eventTrace={vignette.event_trace}
            indPlatforms={
              (vignette.committed_force?.squadrons ?? []).map((s) => {
                const es = ps.eligible_squadrons.find((e) => e.squadron_id === s.squadron_id);
                return { platform_id: es?.platform_id ?? "unknown", count: s.airframes };
              })
            }
            advPlatforms={ps.adversary_force.map((f) => ({ platform_id: f.platform_id, count: f.count }))}
            ao={ps.ao}
            faction={ps.adversary_force[0]?.faction}
          />
        )}
        {outcome && vignette.committed_force && (
          <CombatReasoning
            eventTrace={vignette.event_trace}
            planningState={ps}
            outcome={outcome}
            committedForce={vignette.committed_force}
          />
        )}
        <details className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <summary className="text-sm font-semibold cursor-pointer select-none">Read Full AAR Briefing</summary>
          <div className="mt-3">
            <AARReader campaignId={campaignId} vignette={vignette} />
          </div>
        </details>
      </main>
    </div>
  );
}
