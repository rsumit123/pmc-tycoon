import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { AARReader } from "../components/vignette/AARReader";
import type { Vignette } from "../lib/types";

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
      <main className="p-4 max-w-3xl mx-auto">
        <AARReader campaignId={campaignId} vignette={vignette} />
      </main>
    </div>
  );
}
