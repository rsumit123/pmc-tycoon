import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ObjectiveTracker } from "../components/objectives/ObjectiveTracker";

export function ObjectivesPage() {
  const { id } = useParams();
  const cid = Number(id);
  const objectives = useCampaignStore((s) => s.objectiveProgress);
  const loadObjectiveProgress = useCampaignStore((s) => s.loadObjectiveProgress);

  useEffect(() => {
    if (cid) void loadObjectiveProgress(cid);
  }, [cid]);

  return (
    <div className="min-h-screen p-4 safe-pt safe-pb">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display uppercase tracking-wider">Objectives</h1>
          <Link to={`/campaign/${cid}`} className="text-xs text-slate-400 underline">← Map</Link>
        </div>
        <p className="text-sm opacity-70">Your campaign objectives and how you're tracking against each.</p>
        <ObjectiveTracker objectives={objectives} />
      </div>
    </div>
  );
}
