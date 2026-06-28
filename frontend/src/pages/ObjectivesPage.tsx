import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ObjectiveTracker } from "../components/objectives/ObjectiveTracker";
import { ScreenHeader } from "../components/primitives/ScreenHeader";

export function ObjectivesPage() {
  const { id } = useParams();
  const cid = Number(id);
  const objectives = useCampaignStore((s) => s.objectiveProgress);
  const loadObjectiveProgress = useCampaignStore((s) => s.loadObjectiveProgress);

  useEffect(() => {
    if (cid) void loadObjectiveProgress(cid);
  }, [cid]);

  return (
    <div className="min-h-screen safe-pb">
      <ScreenHeader title="Objectives" backTo={`/campaign/${cid}`} />
      <div className="max-w-2xl mx-auto space-y-4 p-4">
        <p className="text-sm opacity-70">Your campaign objectives and how you're tracking against each.</p>
        <ObjectiveTracker objectives={objectives} />
      </div>
    </div>
  );
}
