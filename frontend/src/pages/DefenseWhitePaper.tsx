import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ObjectiveScoreCard } from "../components/endgame/ObjectiveScoreCard";
import { TreasurySparkline } from "../components/endgame/TreasurySparkline";
import { EmergingAceCard } from "../components/endgame/EmergingAceCard";
import { RetrospectiveReader } from "../components/endgame/RetrospectiveReader";
import { CampaignCardGenerator } from "../components/endgame/CampaignCardGenerator";

export function DefenseWhitePaper() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const summary = useCampaignStore((s) => s.campaignSummary);
  const loadSummary = useCampaignStore((s) => s.loadCampaignSummary);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign && campaign.id === campaignId) loadSummary(campaignId);
  }, [campaign, campaignId, loadSummary]);

  if (!campaign || !summary) return <div className="p-6">Loading Defense White Paper…</div>;

  const objectiveEntries = summary.objectives.length > 0
    ? summary.objectives
    : (campaign.objectives_json || []).map((objId: string) => ({
        id: objId,
        name: objId.replace(/_/g, " "),
        status: "unknown" as const,
      }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">Defense White Paper</h1>
          <p className="text-xs opacity-70">
            {campaign.name} • {summary.starting_year}–{summary.current_year}
          </p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-8 pb-12">
        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Campaign Summary</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.vignettes_won}</div>
              <div className="text-xs text-slate-400">Won</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.vignettes_lost}</div>
              <div className="text-xs text-slate-400">Lost</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.force_structure.squadrons_end}</div>
              <div className="text-xs text-slate-400">Squadrons</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Objectives</h2>
          <ObjectiveScoreCard objectives={objectiveEntries} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Treasury Evolution</h2>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <TreasurySparkline snapshots={summary.year_snapshots} />
          </div>
        </section>

        {summary.aces.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">
              Emerging Aces ({summary.ace_count})
            </h2>
            <div className="space-y-2">
              {summary.aces.map((ace) => (
                <EmergingAceCard key={ace.squadron_id} ace={ace} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Retrospective</h2>
          <RetrospectiveReader campaignId={campaignId} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Campaign Card</h2>
          <CampaignCardGenerator summary={summary} />
        </section>
      </main>
    </div>
  );
}
