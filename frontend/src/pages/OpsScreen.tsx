import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { PostureDashboard } from "../components/ops/PostureDashboard";
import { StrikeBuilder } from "../components/ops/StrikeBuilder";
import { StrikeHistoryList } from "../components/ops/StrikeHistoryList";
import { isCampaignComplete } from "../lib/campaignLifecycle";
import { ReadOnlyBanner } from "../components/primitives/ReadOnlyBanner";

type Tab = "posture" | "strike" | "history";
const TABS: { k: Tab; label: string }[] = [
  { k: "posture", label: "Posture" },
  { k: "strike", label: "Strike" },
  { k: "history", label: "History" },
];

export function OpsScreen() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = rawTab === "strike" || rawTab === "history" ? rawTab : "posture";

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadPosture = useCampaignStore((s) => s.loadPosture);
  const loadDiplomacy = useCampaignStore((s) => s.loadDiplomacy);
  const loadStrikes = useCampaignStore((s) => s.loadStrikes);
  const loadAdversaryBases = useCampaignStore((s) => s.loadAdversaryBases);
  const loadHangar = useCampaignStore((s) => s.loadHangar);
  const loadMissileStocks = useCampaignStore((s) => s.loadMissileStocks);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const posture = useCampaignStore((s) => s.posture);
  const pendingVignettes = useCampaignStore((s) => s.pendingVignettes);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
  }, [cid, campaign, loadCampaign]);

  useEffect(() => {
    if (!campaign) return;
    loadPosture(campaign.id);
    loadDiplomacy(campaign.id);
    loadStrikes(campaign.id);
    loadAdversaryBases(campaign.id);
    loadHangar(campaign.id);
    loadMissileStocks(campaign.id);
    loadBases(campaign.id);
    loadPlatforms();
  }, [campaign, loadPosture, loadDiplomacy, loadStrikes, loadAdversaryBases, loadHangar, loadMissileStocks, loadBases, loadPlatforms]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  const complete = isCampaignComplete(campaign);

  return (
    <div className="min-h-screen flex flex-col">
      {complete && <ReadOnlyBanner campaignId={campaign.id} />}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{campaign.name}</h1>
          <p className="text-xs opacity-70">
            Operations · {campaign.current_year}-Q{campaign.current_quarter}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/campaign/${cid}`}
            className="text-xs opacity-60 hover:opacity-100 underline"
          >
            ← Map
          </Link>
        </div>
      </header>

      <nav className="flex border-b border-slate-800 bg-slate-950/50 sticky top-[3.5rem] z-10">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setSearchParams({ tab: t.k })}
            className={[
              "flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
              tab === t.k
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto pb-24">
        {tab === "posture" && <PostureDashboard />}
        {tab === "strike" && (
          posture && !posture.offensive_unlocked ? (
            <OffensiveLockedHint hasPending={pendingVignettes.length > 0} cid={cid} />
          ) : (
            <StrikeBuilder />
          )
        )}
        {tab === "history" && <StrikeHistoryList campaignId={cid} />}
      </main>
    </div>
  );
}

function OffensiveLockedHint({ hasPending, cid }: { hasPending: boolean; cid: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center space-y-3">
      <div className="text-3xl">🔒</div>
      <h3 className="text-base font-bold">Offensive operations locked</h3>
      <p className="text-xs opacity-80">
        Strike planning is authorized after the first reactive vignette of your campaign resolves.
      </p>
      {hasPending && (
        <Link
          to={`/campaign/${cid}`}
          className="inline-block text-xs bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold px-3 py-2 rounded"
        >
          A vignette is pending — go resolve it →
        </Link>
      )}
    </div>
  );
}
