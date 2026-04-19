import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { BudgetAllocator } from "../components/procurement/BudgetAllocator";
import { RDDashboard } from "../components/procurement/RDDashboard";
import { AcquisitionPipeline } from "../components/procurement/AcquisitionPipeline";
import { DiplomacyStrip } from "../components/procurement/DiplomacyStrip";
import type { BudgetAllocation } from "../lib/types";

type Tab = "budget" | "rd" | "acquisitions";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "budget", label: "Budget" },
  { key: "rd", label: "R&D" },
  { key: "acquisitions", label: "Acquisitions" },
];

export function ProcurementHub() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab =
    rawTab === "rd" || rawTab === "acquisitions" ? rawTab : "budget";

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const rdCatalog = useCampaignStore((s) => s.rdCatalog);
  const rdActive = useCampaignStore((s) => s.rdActive);
  const acquisitions = useCampaignStore((s) => s.acquisitions);
  const loadRdCatalog = useCampaignStore((s) => s.loadRdCatalog);
  const loadRdActive = useCampaignStore((s) => s.loadRdActive);
  const loadAcquisitions = useCampaignStore((s) => s.loadAcquisitions);
  const setBudget = useCampaignStore((s) => s.setBudget);
  const startRd = useCampaignStore((s) => s.startRdProgram);
  const updateRd = useCampaignStore((s) => s.updateRdProgram);
  const createAcquisition = useCampaignStore((s) => s.createAcquisition);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  useEffect(() => {
    if (campaign) {
      loadPlatforms();
      loadRdCatalog();
      loadRdActive(campaign.id);
      loadAcquisitions(campaign.id);
    }
  }, [campaign, loadPlatforms, loadRdCatalog, loadRdActive, loadAcquisitions]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  const defaultAllocation: BudgetAllocation =
    campaign.current_allocation_json ?? {
      rd: Math.floor((campaign.quarterly_grant_cr * 25) / 100),
      acquisition: Math.floor((campaign.quarterly_grant_cr * 35) / 100),
      om: Math.floor((campaign.quarterly_grant_cr * 20) / 100),
      spares: Math.floor((campaign.quarterly_grant_cr * 15) / 100),
      infrastructure: Math.floor((campaign.quarterly_grant_cr * 5) / 100),
    };

  const platformList = Object.values(platformsById)
    .filter((p) => p.procurable_by && p.procurable_by.includes("IND"))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">{campaign.name}</h1>
          <p className="text-xs opacity-70">
            Procurement • {campaign.current_year}-Q{campaign.current_quarter}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/campaign/${campaign.id}`}
            className="text-xs opacity-60 hover:opacity-100 underline"
          >
            ← Map
          </Link>
        </div>
      </header>

      <nav className="flex border-b border-slate-800 bg-slate-950/50">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSearchParams({ tab: t.key })}
            className={[
              "flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
              activeTab === t.key
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="m-4 bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
        {activeTab === "budget" && (
          <BudgetAllocator
            key={`${campaign.id}-${campaign.current_year}-${campaign.current_quarter}`}
            grantCr={campaign.quarterly_grant_cr}
            treasuryCr={campaign.budget_cr}
            initialAllocation={defaultAllocation}
            onCommit={(alloc) => setBudget(alloc)}
            disabled={loading}
          />
        )}
        {activeTab === "rd" && (
          <RDDashboard
            catalog={rdCatalog}
            active={rdActive}
            onStart={(programId, level) => startRd(programId, level)}
            onUpdate={(programId, payload) => updateRd(programId, payload)}
            disabled={loading}
          />
        )}
        {activeTab === "acquisitions" && (
          <>
            <DiplomacyStrip />
            <AcquisitionPipeline
              platforms={platformList}
              orders={acquisitions}
              currentYear={campaign.current_year}
              currentQuarter={campaign.current_quarter}
              onSign={(payload) => createAcquisition(payload)}
              disabled={loading}
              rdCatalog={rdCatalog}
              rdActive={rdActive}
            />
          </>
        )}
      </main>
    </div>
  );
}
