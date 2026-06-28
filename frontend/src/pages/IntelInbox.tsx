import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ScreenHeader } from "../components/primitives/ScreenHeader";
import { useCampaignStore } from "../store/campaignStore";
import { IntelSwipeStack } from "../components/intel/IntelSwipeStack";
import { IntelBriefReader } from "../components/intel/IntelBriefReader";
import { Loader } from "../components/primitives/Loader";

export function IntelInbox() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const intelCards = useCampaignStore((s) => s.intelCards);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadIntel = useCampaignStore((s) => s.loadIntel);

  const [intelLoaded, setIntelLoaded] = useState(false);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign && campaign.id === campaignId) {
      void Promise.resolve(
        loadIntel(campaignId, { year: campaign.current_year, quarter: campaign.current_quarter }),
      ).finally(() => setIntelLoaded(true));
    }
  }, [campaign, campaignId, loadIntel]);

  if (!campaign || !intelLoaded) return <Loader label="Loading intel" />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ScreenHeader
        title="Intel"
        subtitle={`Q${campaign.current_quarter} ${campaign.current_year}`}
        backTo={`/campaign/${campaignId}`}
      />
      <main className="p-4 max-w-3xl mx-auto space-y-6">
        <section>
          <h2 className="text-sm font-semibold mb-2 text-slate-300">Quarterly intel brief</h2>
          <IntelBriefReader campaignId={campaignId} />
        </section>
        <section>
          <h2 className="text-sm font-semibold mb-2 text-slate-300">
            Intel reports ({intelCards.length})
          </h2>
          <IntelSwipeStack cards={intelCards} />
        </section>
      </main>
    </div>
  );
}
