import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";

export function CampaignConsoleRaw() {
  const { id } = useParams<{ id: string }>();
  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const advanceTurn = useCampaignStore((s) => s.advanceTurn);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  if (!campaign) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm opacity-70">
            {campaign.current_year} • Q{campaign.current_quarter} • {campaign.difficulty}
          </p>
        </div>
        <button
          onClick={advanceTurn}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-4 py-2"
        >
          {loading ? "Ending turn…" : "End Turn"}
        </button>
      </header>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4">
        <Stat label="Budget" value={`₹${campaign.budget_cr.toLocaleString()} cr`} />
        <Stat label="Reputation" value={String(campaign.reputation)} />
        <Stat label="Seed" value={String(campaign.seed)} />
        <Stat label="Objectives" value={String(campaign.objectives_json.length)} />
      </section>

      <details className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-xs">
        <summary className="cursor-pointer opacity-80">Raw campaign state</summary>
        <pre className="mt-3 overflow-auto">{JSON.stringify(campaign, null, 2)}</pre>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
      <div className="text-xs uppercase opacity-60">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
