import { Link } from "react-router-dom";

export function ReadOnlyBanner({ campaignId }: { campaignId: number }) {
  return (
    <div className="bg-amber-900/40 border-b border-amber-700 px-3 py-2 text-[11px] text-amber-100 flex items-center justify-between gap-2">
      <span>
        🔒 <span className="font-semibold">Campaign complete.</span> All actions
        are disabled. Review outcomes in
      </span>
      <div className="flex gap-2 flex-shrink-0">
        <Link to={`/campaign/${campaignId}/white-paper`} className="underline hover:text-amber-50">White Paper</Link>
        <Link to={`/campaign/${campaignId}/performance`} className="underline hover:text-amber-50">Performance</Link>
        <Link to={`/campaign/${campaignId}/combat-history`} className="underline hover:text-amber-50">Combat History</Link>
      </div>
    </div>
  );
}
