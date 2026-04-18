import type { DeliverySummary } from "../../lib/types";
import { useCampaignStore } from "../../store/campaignStore";

export function DeliveryAssignmentStep({ delivery }: { delivery: DeliverySummary }) {
  const bases = useCampaignStore((s) => s.bases);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const base = bases.find((b) => b.id === delivery.assigned_base_id);
  const plat = platformsById[delivery.platform_id];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="text-sm font-semibold">{plat?.name ?? delivery.platform_id}</div>
      <div className="text-xs opacity-70 mt-0.5">
        {delivery.count}× delivered • ₹{delivery.cost_cr.toLocaleString("en-US")} cr
      </div>
      <div className="text-xs opacity-60 mt-1">
        Assigned to: <span className="font-semibold">{base?.name ?? "unassigned"}</span>
      </div>
    </div>
  );
}
