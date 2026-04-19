import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ForceCommitter } from "../components/vignette/ForceCommitter";
import { MunitionsEstimate } from "../components/vignette/MunitionsEstimate";
import { CommitHoldButton } from "../components/primitives/CommitHoldButton";
import { AOMiniMap } from "../components/vignette/AOMiniMap";
import { AdversaryForceFogged } from "../components/vignette/AdversaryForceFogged";
import type { Vignette, VignetteCommitPayload } from "../lib/types";

export function OpsRoom() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const campaignId = Number(id);
  const vignetteId = Number(vid);
  const navigate = useNavigate();

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadVignette = useCampaignStore((s) => s.loadVignette);
  const commitVignette = useCampaignStore((s) => s.commitVignette);
  const vignetteById = useCampaignStore((s) => s.vignetteById);
  const loading = useCampaignStore((s) => s.loading);
  const bases = useCampaignStore((s) => s.bases);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const loadWeapons = useCampaignStore((s) => s.loadWeapons);
  const weaponsById = useCampaignStore((s) => s.weaponsById);

  const [vignette, setVignette] = useState<Vignette | null>(null);
  const [payload, setPayload] = useState<VignetteCommitPayload>({
    squadrons: [],
    support: { awacs: false, tanker: false, sead_package: false },
    roe: "weapons_free",
  });
  const [commitError, setCommitError] = useState<string | null>(null);
  const initROE = useRef(false);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign) loadBases(campaign.id);
  }, [campaign, loadBases]);

  useEffect(() => {
    loadPlatforms();
    loadWeapons();
  }, [loadPlatforms, loadWeapons]);

  useEffect(() => {
    if (!Number.isFinite(vignetteId)) return;
    const apply = (v: Vignette) => {
      setVignette(v);
      if (!initROE.current) {
        setPayload((p) => ({ ...p, roe: v.planning_state.roe_options[0] ?? p.roe }));
        initROE.current = true;
      }
    };
    const cached = vignetteById[vignetteId];
    if (cached) apply(cached);
    else loadVignette(campaignId, vignetteId).then((v) => v && apply(v));
  }, [campaignId, vignetteId, vignetteById, loadVignette]);

  const onCommit = async () => {
    if (!vignette) return;
    setCommitError(null);
    try {
      const resolved = await commitVignette(campaignId, vignette.id, payload);
      navigate(`/campaign/${campaignId}/vignette/${resolved.id}/aar`);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setCommitError(err?.response?.data?.detail ?? err?.message ?? "Commit failed");
    }
  };

  if (!vignette) return <div className="p-6">Loading vignette…</div>;
  if (vignette.status === "resolved") {
    return (
      <div className="p-6 space-y-3">
        <p>This vignette has already been resolved.</p>
        <Link to={`/campaign/${campaignId}/vignette/${vignette.id}/aar`} className="underline text-amber-400">View AAR →</Link>
      </div>
    );
  }

  const ps = vignette.planning_state;
  const totalAirframes = payload.squadrons.reduce((a, b) => a + b.airframes, 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      <header className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Ops Room — {ps.scenario_name}</h1>
          <p className="text-xs opacity-70 truncate">
            {ps.ao.region} • {ps.ao.name} • T-{ps.response_clock_minutes} min
          </p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs opacity-60 hover:opacity-100 underline whitespace-nowrap flex-shrink-0">
          Abort → Map
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        <AOMiniMap
          ao={ps.ao}
          inRangeBases={bases.filter((b) =>
            ps.eligible_squadrons.some((e) => e.base_id === b.id && e.in_range)
          )}
          faction={ps.adversary_force[0]?.faction ?? "UNKNOWN"}
        />
        <AdversaryForceFogged
          observed={ps.adversary_force_observed ?? ps.adversary_force.map(f => ({
            faction: f.faction, role: f.role, count: f.count,
            probable_platforms: [f.platform_id], fidelity: "high" as const,
          }))}
          tier={ps.intel_quality?.tier ?? "perfect"}
          score={ps.intel_quality?.score ?? 1}
        />

        <section className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2 text-slate-300">Objective</h2>
          <p className="text-xs">{ps.objective.kind.replace(/_/g, " ")}</p>
        </section>

        <ForceCommitter planning={ps} value={payload} onChange={setPayload} />

        {campaign && (
          <MunitionsEstimate
            payload={payload}
            eligibleSquadrons={ps.eligible_squadrons}
            weaponsById={weaponsById}
            quarterlyGrantCr={campaign.quarterly_grant_cr}
            treasuryCr={campaign.budget_cr}
          />
        )}

        {commitError && (
          <p className="text-sm text-red-300">{commitError}</p>
        )}

        <div className="sticky bottom-0 bg-slate-950 pt-3 pb-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs opacity-70">
            Committing <span className="font-mono">{totalAirframes}</span> airframes across{" "}
            <span className="font-mono">{payload.squadrons.length}</span> squadrons
          </p>
          <CommitHoldButton
            onCommit={onCommit}
            disabled={loading || payload.squadrons.length === 0}
            label="Hold to commit"
          />
        </div>
      </main>
    </div>
  );
}
