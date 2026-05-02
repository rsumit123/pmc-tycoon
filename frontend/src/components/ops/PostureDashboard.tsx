import { Link } from "react-router-dom";
import { useCampaignStore } from "../../store/campaignStore";
import type { DiplomaticTier } from "../../lib/types";
import { Sparkline } from "./Sparkline";
import { DiplomacyMeter } from "./DiplomacyMeter";

const FACTION_COLOR: Record<string, string> = {
  PAF: "#dc2626", PLAAF: "#ea580c", PLAN: "#d97706",
};

export function PostureDashboard() {
  const posture = useCampaignStore((s) => s.posture);
  const diplomacy = useCampaignStore((s) => s.diplomacy);
  const campaign = useCampaignStore((s) => s.campaign);

  if (!posture) {
    return <div className="text-sm opacity-60 p-6 text-center">Loading posture…</div>;
  }

  const cid = campaign?.id;
  const hostile = diplomacy?.factions.filter((f) => f.tier === "hostile") ?? [];
  const cold = diplomacy?.factions.filter((f) => f.tier === "cold") ?? [];
  const tierCount: Partial<Record<DiplomaticTier, number>> = {};
  diplomacy?.factions.forEach((f) => {
    tierCount[f.tier] = (tierCount[f.tier] ?? 0) + 1;
  });

  return (
    <div className="space-y-3">
      {/* Hostile / cold warning band — only when relevant */}
      {(hostile.length > 0 || cold.length > 0) && (
        <section className={[
          "rounded-lg p-3 border text-xs",
          hostile.length > 0
            ? "bg-rose-950/40 border-rose-800 text-rose-100"
            : "bg-orange-950/30 border-orange-800 text-orange-100",
        ].join(" ")}>
          <div className="font-semibold">
            {hostile.length > 0
              ? `⚠ HOSTILE: ${hostile.map((f) => f.faction).join(", ")}`
              : `⚠ Tensions rising: ${cold.map((f) => f.faction).join(", ")}`}
          </div>
          <p className="opacity-90 mt-1 text-[11px]">
            {hostile.length > 0
              ? "New procurement from this supplier blocked. Strike planning available."
              : "Cool/cold relations affect war-footing grant."}
          </p>
        </section>
      )}

      {/* Treasury */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">💰 Treasury</h3>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-mono font-semibold">
            ₹{posture.treasury.treasury_cr.toLocaleString("en-US")} cr
          </span>
          <span className="text-xs opacity-70">
            grant ₹{posture.treasury.quarterly_grant_cr.toLocaleString("en-US")}/q
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
          <span className={posture.treasury.runway_quarters < 4 ? "text-rose-300" : "opacity-70"}>
            Runway: <span className="font-mono">{posture.treasury.runway_quarters}q</span>
            {posture.treasury.runway_quarters < 4 && " ⚠"}
          </span>
          {(diplomacy?.grant_bump_pct ?? 0) > 0 && (
            <span className="text-amber-300 font-semibold">
              War footing +{diplomacy?.grant_bump_pct}%
            </span>
          )}
        </div>
      </section>

      {/* Active Ops */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">🎯 Active Ops</h3>
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span>
            Strikes this quarter:{" "}
            <span className="font-mono font-semibold">
              {posture.strikes_this_quarter} / 2
            </span>
          </span>
          {posture.offensive_unlocked && cid !== undefined && (
            <Link
              to={`/campaign/${cid}/ops?tab=strike`}
              className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1 rounded font-semibold text-[11px]"
            >
              Plan strike →
            </Link>
          )}
          {!posture.offensive_unlocked && (
            <span className="text-[10px] opacity-60">🔒 not yet authorized</span>
          )}
        </div>
      </section>

      {/* Threat history */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">
          ⚔ Threat — last 8 quarters
        </h3>
        <div className="space-y-1.5">
          {Object.entries(posture.threat_history_by_faction).map(([faction, vals]) => (
            <div key={faction} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold w-12">{faction}</span>
              <Sparkline
                values={vals}
                width={120}
                height={20}
                stroke={FACTION_COLOR[faction] ?? "#fbbf24"}
                ariaLabel={`${faction} threat trajectory`}
              />
              <span className="opacity-70 font-mono w-6 text-right">
                {vals[vals.length - 1] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Diplomacy meter */}
      <DiplomacyMeter diplomacy={diplomacy} />

      {/* Force readiness */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">✈ Force Readiness</h3>
        {posture.fleet_by_role.length === 0 ? (
          <p className="text-xs opacity-60">No squadrons.</p>
        ) : (
          <ul className="space-y-1.5">
            {posture.fleet_by_role.map((entry) => (
              <li key={entry.role} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate">{entry.role.replace(/_/g, " ")}</span>
                <span className="font-mono w-8 text-right opacity-80">{entry.airframes}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div
                    className={[
                      "h-full",
                      entry.avg_readiness_pct >= 80
                        ? "bg-emerald-500"
                        : entry.avg_readiness_pct >= 60
                        ? "bg-amber-500"
                        : "bg-rose-500",
                    ].join(" ")}
                    style={{ width: `${Math.min(100, entry.avg_readiness_pct)}%` }}
                  />
                </div>
                <span className="font-mono w-8 text-right opacity-80">
                  {entry.avg_readiness_pct}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deliveries */}
      {cid !== undefined && (
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">
            📦 Deliveries ({posture.total_active_orders} active)
          </h3>
          {posture.nearest_delivery ? (
            <p className="text-xs">
              Next: <span className="font-semibold">{posture.nearest_delivery.platform_id}</span>
              {" → "}{posture.nearest_delivery.foc_year}-Q{posture.nearest_delivery.foc_quarter}
            </p>
          ) : (
            <p className="text-xs opacity-60">No active deliveries.</p>
          )}
          <Link
            to={`/campaign/${cid}/procurement?tab=acquisitions`}
            className="text-[11px] text-amber-400 hover:text-amber-300 underline mt-1 inline-block"
          >
            See all in Acquisitions →
          </Link>
        </section>
      )}

      {/* R&D */}
      {cid !== undefined && (
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">🔬 R&D</h3>
          <p className="text-xs">
            Active: <span className="font-mono font-semibold">{posture.rd_active_count}</span>
            {" · "}
            Completed: <span className="font-mono font-semibold">{posture.rd_completed_count}</span>
          </p>
          <Link
            to={`/campaign/${cid}/procurement?tab=rd`}
            className="text-[11px] text-amber-400 hover:text-amber-300 underline mt-1 inline-block"
          >
            See all in R&D →
          </Link>
        </section>
      )}
    </div>
  );
}
