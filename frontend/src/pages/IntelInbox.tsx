import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { IntelSwipeStack } from "../components/intel/IntelSwipeStack";
import { IntelBriefReader } from "../components/intel/IntelBriefReader";

export function IntelInbox() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const intelCards = useCampaignStore((s) => s.intelCards);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadIntel = useCampaignStore((s) => s.loadIntel);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign && campaign.id === campaignId) {
      loadIntel(campaignId, { year: campaign.current_year, quarter: campaign.current_quarter });
    }
  }, [campaign, campaignId, loadIntel]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">Intel Desk</h1>
          <p className="text-xs opacity-70">Q{campaign.current_quarter} {campaign.current_year}</p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>
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
