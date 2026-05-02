import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { api } from "../lib/api";
import type { StrikeRead } from "../lib/types";
import { DamageAssessmentPanel } from "../components/ops/DamageAssessmentPanel";

const PROFILE_LABEL: Record<string, string> = {
  deep_strike: "Deep Strike",
  sead_suppression: "SEAD Suppression",
  standoff_cruise: "Stand-off Cruise",
  drone_swarm: "Drone Swarm",
};

export function StrikeAARPage() {
  const { id, sid } = useParams<{ id: string; sid: string }>();
  const cid = Number(id);
  const strikeId = Number(sid);
  const campaign = useCampaignStore((s) => s.campaign);
  const adversaryBases = useCampaignStore((s) => s.adversaryBases);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadAdversaryBases = useCampaignStore((s) => s.loadAdversaryBases);
  const [strike, setStrike] = useState<StrikeRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    if (campaign) loadAdversaryBases(campaign.id);
  }, [cid, campaign, loadCampaign, loadAdversaryBases]);

  useEffect(() => {
    api.getStrike(cid, strikeId)
      .then(setStrike)
      .catch((e) => setError((e as Error).message));
  }, [cid, strikeId]);

  const target = useMemo(
    () => adversaryBases.find((b) => b.id === strike?.target_base_id) ?? null,
    [adversaryBases, strike],
  );

  if (error) return <div className="p-6 text-rose-300 text-sm">{error}</div>;
  if (!strike) return <div className="p-6 text-sm opacity-60">Loading AAR…</div>;

  const damage = strike.outcome_json.damage;
  const lost = strike.outcome_json.ind_airframes_lost;

  // Grade based on simple heuristic: damage delivered vs losses taken.
  const grade = computeGrade(damage, lost);
  const gradeColor =
    grade === "A" ? "bg-emerald-700"
    : grade === "B" ? "bg-emerald-800"
    : grade === "C" ? "bg-amber-800"
    : grade === "D" ? "bg-orange-800"
    : "bg-rose-800";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">Strike AAR</h1>
          <p className="text-xs opacity-70">{strike.year}-Q{strike.quarter}</p>
        </div>
        <Link to={`/campaign/${cid}/ops?tab=history`} className="text-xs opacity-60 hover:opacity-100 underline">
          ← Ops
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto space-y-3 pb-12">
        {/* Outcome banner */}
        <section className={`${gradeColor} rounded-lg p-4 text-white`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              {target?.name ?? `Target #${strike.target_base_id}`}
            </h2>
            <span className="text-3xl font-bold">{grade}</span>
          </div>
          <p className="text-sm opacity-90">
            {PROFILE_LABEL[strike.profile] ?? strike.profile} · ROE {strike.roe.replace(/_/g, " ")}
          </p>
        </section>

        {/* BDA */}
        <DamageAssessmentPanel damage={damage} />

        {/* Force exchange */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">✈ Force Exchange</h3>
          <div className="text-xs">
            IND airframes lost:{" "}
            <span className={[
              "font-mono font-semibold",
              lost === 0 ? "text-emerald-300" : lost > 8 ? "text-rose-300" : "text-amber-300",
            ].join(" ")}>{lost}</span>
          </div>
        </section>

        {/* Munitions */}
        {Object.keys(strike.outcome_json.weapons_consumed).length > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">📦 Munitions Expended</h3>
            <ul className="space-y-1 text-xs">
              {Object.entries(strike.outcome_json.weapons_consumed).map(([w, n]) => (
                <li key={w} className="flex items-baseline justify-between gap-2">
                  <span className="uppercase">{w.replace(/_/g, "-")}</span>
                  <span className="font-mono opacity-80">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Phase trace */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">🎬 Phase trace</h3>
          <ul className="space-y-1.5 text-xs">
            {strike.event_trace.map((ev, k) => (
              <li key={k} className="bg-slate-950/40 border border-slate-800 rounded px-2 py-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold uppercase text-[10px]">
                    {String(ev.phase ?? "?")}
                  </span>
                  <span className="text-[10px] opacity-60">{String(ev.type ?? "")}</span>
                </div>
                {Object.entries(ev)
                  .filter(([k2]) => !["phase", "type"].includes(k2))
                  .map(([k2, v]) => (
                    <div key={k2} className="text-[10px] opacity-80 ml-2">
                      {k2}: <span className="font-mono">{String(v)}</span>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function computeGrade(damage: { shelter_loss_pct: number; runway_disabled_quarters_remaining: number; ad_destroyed: boolean; garrisoned_loss: number }, lost: number): "A" | "B" | "C" | "D" | "F" {
  let dmgScore = damage.shelter_loss_pct;
  if (damage.runway_disabled_quarters_remaining > 0) dmgScore += 15;
  if (damage.ad_destroyed) dmgScore += 25;
  dmgScore += damage.garrisoned_loss * 2;
  // Penalty: each lost airframe is -5 score.
  const net = dmgScore - lost * 5;
  if (net >= 80) return "A";
  if (net >= 50) return "B";
  if (net >= 20) return "C";
  if (net >= 0)  return "D";
  return "F";
}
