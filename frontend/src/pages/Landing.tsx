import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";

export function Landing() {
  const [name, setName] = useState("Singh-era modernization");
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const navigate = useNavigate();

  async function handleStart() {
    await createCampaign({
      name,
      difficulty: "realistic",
      objectives: ["amca_operational_by_2035", "maintain_42_squadrons", "no_territorial_loss"],
    });
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sovereign Shield</h1>
          <p className="text-sm opacity-70 mt-1">
            Head of Defense Integration — New Delhi, 2026
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm opacity-80">Campaign name</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || name.trim().length === 0}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg px-4 py-3"
        >
          {loading ? "Starting…" : "Assume Command"}
        </button>
      </div>
    </div>
  );
}
