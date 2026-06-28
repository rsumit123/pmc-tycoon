import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ScreenHeader } from "../components/primitives/ScreenHeader";
import { ChakravyuhRings } from "../components/brand/ChakravyuhRings";
import { ObjectiveScoreCard } from "../components/endgame/ObjectiveScoreCard";
import { TreasurySparkline } from "../components/endgame/TreasurySparkline";
import { EmergingAceCard } from "../components/endgame/EmergingAceCard";
import { RetrospectiveReader } from "../components/endgame/RetrospectiveReader";
import { CampaignCardGenerator } from "../components/endgame/CampaignCardGenerator";
import { Loader } from "../components/primitives/Loader";

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

  if (!campaign || !summary) return <Loader label="Compiling white paper" />;

  const objectiveEntries = summary.objectives.length > 0
    ? summary.objectives
    : (campaign.objectives_json || []).map((objId: string) => ({
        id: objId,
        name: objId.replace(/_/g, " "),
        status: "unknown" as const,
      }));

  return (
    <div className="relative min-h-screen bg-[#0a0f1c] text-slate-100">
      <ScreenHeader
        title="Defense White Paper"
        subtitle={`${campaign.name} · ${summary.starting_year}–${summary.current_year}`}
        backTo={`/campaign/${campaignId}`}
      />

      {/* Ceremonial hero — bookends the Login/Landing entry */}
      <div className="relative overflow-hidden border-b border-slate-800/80">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div className="pointer-events-none absolute inset-0">
          <ChakravyuhRings />
        </div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(120% 95% at 50% 32%, transparent 34%, #0a0f1c 90%)" }}
        />
        <div className="relative z-10 mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="font-tech text-[11px] tracking-[0.3em] text-amber-500/80">IAF · DEFENSE INTEGRATION COMMAND</div>
          <div className="font-display mt-3 text-xl leading-none text-amber-400/70">चक्रव्यूह</div>
          <h2 className="font-display mt-1 text-3xl font-bold uppercase tracking-[0.1em] text-slate-50">Defense White Paper</h2>
          <p className="font-tech mt-2 text-xs tracking-wider text-slate-400">
            {campaign.name} · {summary.starting_year}–{summary.current_year}
          </p>
          <p className="font-tech mt-3 text-[11px] tracking-[0.2em] text-slate-500">
            CAMPAIGN CONCLUDED · {summary.vignettes_won}–{summary.vignettes_lost} RECORD
          </p>
        </div>
      </div>

      <main className="p-4 max-w-3xl mx-auto space-y-8 pb-12">
        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Campaign Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
