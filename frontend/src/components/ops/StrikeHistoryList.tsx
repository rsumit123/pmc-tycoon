import { Link } from "react-router-dom";
import { useCampaignStore } from "../../store/campaignStore";

const PROFILE_LABEL: Record<string, string> = {
  deep_strike: "Deep Strike",
  sead_suppression: "SEAD",
  standoff_cruise: "Standoff Cruise",
  drone_swarm: "Drone Swarm",
};

const FACTION_BAR: Record<string, string> = {
  PAF: "border-l-rose-600",
  PLAAF: "border-l-orange-600",
  PLAN: "border-l-amber-600",
};

export function StrikeHistoryList({ campaignId }: { campaignId: number }) {
  const strikes = useCampaignStore((s) => s.strikes);
  const adversaryBases = useCampaignStore((s) => s.adversaryBases);
  if (strikes.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No strikes flown yet.</p>
        <p className="text-xs opacity-50 mt-2">
          Once offensive ops are unlocked, every strike you fly is recorded here.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {strikes.map((s) => {
        const target = adversaryBases.find((b) => b.id === s.target_base_id);
        const faction = target?.faction ?? "PAF";
        const lost = s.outcome_json.ind_airframes_lost;
        const dmg = s.outcome_json.damage;
        return (
          <li
            key={s.id}
            className={`bg-slate-900 border border-slate-800 rounded-lg p-3 border-l-4 ${FACTION_BAR[faction] ?? "border-l-slate-600"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-sm truncate">
                {target?.name ?? `Target #${s.target_base_id}`}
              </span>
              <span className="text-[10px] opacity-60">{s.year}-Q{s.quarter}</span>
            </div>
            <div className="text-[11px] opacity-70 mt-0.5">
              {PROFILE_LABEL[s.profile] ?? s.profile} · {faction}
            </div>
            <div className="text-[11px] mt-1 flex items-baseline gap-3">
              <span>Lost: <span className="font-mono">{lost}</span></span>
              <span>Shelters: <span className="font-mono">−{dmg.shelter_loss_pct}%</span></span>
              {dmg.ad_destroyed && <span className="text-rose-300">AD ✕</span>}
              {dmg.runway_disabled_quarters_remaining > 0 && (
                <span className="text-amber-300">Runway {dmg.runway_disabled_quarters_remaining}Q</span>
              )}
            </div>
            <Link
              to={`/campaign/${campaignId}/ops/strike/${s.id}`}
              className="inline-block mt-1.5 text-[11px] text-amber-400 hover:text-amber-300 underline"
            >
              View AAR →
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
