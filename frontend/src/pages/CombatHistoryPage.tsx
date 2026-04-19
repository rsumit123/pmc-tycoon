import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { CombatHistoryEntry, CombatHistoryResponse } from "../lib/types";

type FactionFilter = "all" | "PLAAF" | "PAF" | "PLAN";
type OutcomeFilter = "all" | "wins" | "losses";

function computeGrade(e: CombatHistoryEntry): { letter: string; color: string } {
  if (!e.objective_met) return { letter: "F", color: "text-red-400" };
  const adv = Math.max(1, e.adv_airframes_lost);
  const ratio = e.ind_airframes_lost / adv;
  if (ratio < 0.5) return { letter: "A", color: "text-emerald-400" };
  if (ratio < 1.0) return { letter: "B", color: "text-emerald-300" };
  if (ratio < 2.0) return { letter: "C", color: "text-amber-300" };
  return { letter: "D", color: "text-red-300" };
}

export function CombatHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const navigate = useNavigate();

  const [data, setData] = useState<CombatHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [factionFilter, setFactionFilter] = useState<FactionFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

  useEffect(() => {
    setLoading(true);
    api.getCombatHistory(cid)
      .then(setData)
      .finally(() => setLoading(false));
  }, [cid]);

  const filtered = useMemo(() => {
    if (!data) return [] as CombatHistoryEntry[];
    return data.vignettes.filter((v) => {
      if (factionFilter !== "all" && v.faction !== factionFilter) return false;
      if (outcomeFilter === "wins" && !v.objective_met) return false;
      if (outcomeFilter === "losses" && v.objective_met) return false;
      return true;
    });
  }, [data, factionFilter, outcomeFilter]);

  // Last-10 trend strip
  const last10 = useMemo(() => {
    if (!data) return [];
    return data.vignettes.slice(0, 10).reverse(); // oldest-first for left-to-right reading
  }, [data]);

  const winRate = data && data.total > 0 ? (data.wins / data.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Combat History</h1>
          {data && (
            <p className="text-xs opacity-70">
              {data.total} engagement{data.total === 1 ? "" : "s"} · {data.wins} won · {data.losses} lost
              {data.total > 0 && <> · <span className={winRate >= 50 ? "text-emerald-300" : "text-rose-300"}>{Math.round(winRate)}%</span></>}
            </p>
          )}
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        {loading ? (
          <p className="text-xs opacity-60 text-center py-6">Loading history…</p>
        ) : !data || data.total === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
            <p className="text-sm opacity-80">No combat yet.</p>
            <p className="text-xs opacity-50 mt-2">
              Once a vignette fires and you commit your force, it'll show here with the grade and exchange ratio.
            </p>
          </div>
        ) : (
          <>
            {last10.length > 1 && (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wide opacity-60 mb-2">Recent form (oldest → newest)</p>
                <div className="flex gap-1 flex-wrap">
                  {last10.map((v) => (
                    <span
                      key={v.id}
                      className={[
                        "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                        v.objective_met ? "bg-emerald-700 text-emerald-100" : "bg-rose-900 text-rose-200",
                      ].join(" ")}
                      title={`${v.scenario_name} (${v.year} Q${v.quarter}) — ${v.objective_met ? "Win" : "Loss"}`}
                    >
                      {v.objective_met ? "W" : "L"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] opacity-60 mr-1">Outcome:</span>
                {(["all", "wins", "losses"] as OutcomeFilter[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutcomeFilter(o)}
                    className={[
                      "text-[11px] rounded-full px-2.5 py-1 border capitalize",
                      outcomeFilter === o
                        ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                        : "bg-slate-800 border-slate-700 text-slate-300",
                    ].join(" ")}
                  >{o}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] opacity-60 mr-1">Faction:</span>
                {(["all", "PLAAF", "PAF", "PLAN"] as FactionFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFactionFilter(f)}
                    className={[
                      "text-[11px] rounded-full px-2.5 py-1 border",
                      factionFilter === f
                        ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                        : "bg-slate-800 border-slate-700 text-slate-300",
                    ].join(" ")}
                  >{f === "all" ? "All" : f}</button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-xs opacity-60 py-6 text-center">No engagements match the current filter.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((v) => {
                  const { letter, color } = computeGrade(v);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => navigate(`/campaign/${cid}/vignette/${v.id}/aar`)}
                      className="w-full text-left bg-slate-900 border border-slate-800 hover:border-amber-600/60 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`text-2xl font-bold font-serif ${color} w-8 text-center flex-shrink-0`}>{letter}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-sm font-semibold truncate">{v.scenario_name}</div>
                            <span className="text-[10px] opacity-70 whitespace-nowrap flex-shrink-0">
                              {v.year} Q{v.quarter}
                            </span>
                          </div>
                          <div className="text-[10px] opacity-70 truncate mt-0.5">
                            vs <span className="font-semibold">{v.faction}</span>
                            {v.ao_name && <> · 📍 {v.ao_name}</>}
                          </div>
                          <div className="text-[11px] opacity-80 mt-1">
                            <span className={v.objective_met ? "text-emerald-300" : "text-rose-300"}>
                              {v.objective_met ? "✓ Objective met" : "✗ Objective failed"}
                            </span>
                            <span className="opacity-70"> · IAF {v.ind_airframes_lost} / ADV {v.adv_airframes_lost}</span>
                            {!!v.munitions_cost_cr && (
                              <span className="opacity-70"> · 💸 ₹{v.munitions_cost_cr.toLocaleString("en-US")} cr</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
