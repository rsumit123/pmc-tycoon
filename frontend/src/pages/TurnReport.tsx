import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { RDProgressCard } from "../components/turnreport/RDProgressCard";
import { AdversaryShiftCard } from "../components/turnreport/AdversaryShiftCard";
import { IntelCardPreview } from "../components/turnreport/IntelCardPreview";
import { DeliveryAssignmentStep } from "../components/turnreport/DeliveryAssignmentStep";
import { UnlockBanner } from "../components/turnreport/UnlockBanner";
import { ObjectiveTracker } from "../components/objectives/ObjectiveTracker";

export function TurnReport() {
  const { id, year, quarter } = useParams<{ id: string; year: string; quarter: string }>();
  const navigate = useNavigate();

  const campaignId = Number(id);
  const y = Number(year), q = Number(quarter);

  const report = useCampaignStore((s) => s.turnReport);
  const loadTurnReport = useCampaignStore((s) => s.loadTurnReport);
  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const pendingVignettes = useCampaignStore((s) => s.pendingVignettes);
  const objectiveProgress = useCampaignStore((s) => s.objectiveProgress);
  const loadObjectiveProgress = useCampaignStore((s) => s.loadObjectiveProgress);
  const notifications = useCampaignStore((s) => s.notifications);
  const loadNotifications = useCampaignStore((s) => s.loadNotifications);

  useEffect(() => {
    loadTurnReport(campaignId, y, q);
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
    loadBases(campaignId);
    loadPlatforms();
    loadObjectiveProgress(campaignId);
    loadNotifications(campaignId);
  }, [campaignId, y, q, campaign, loadTurnReport, loadCampaign, loadBases, loadPlatforms, loadObjectiveProgress, loadNotifications]);

  if (!report) return <div className="p-6 text-sm">Compiling turn report…</div>;

  const sections: { title: string; empty: string; content: React.ReactNode }[] = [
    {
      title: "Deliveries",
      empty: "No deliveries this quarter.",
      content: report.deliveries.length > 0 ? (
        <div className="space-y-2">
          {report.deliveries.map((d) => (
            <DeliveryAssignmentStep key={d.order_id} delivery={d} />
          ))}
        </div>
      ) : null,
    },
    {
      title: "R&D Activity",
      empty: "No R&D milestones this quarter.",
      content: report.rd_milestones.length > 0 ? (
        <div className="space-y-2">
          {report.rd_milestones.map((m, i) => (
            <RDProgressCard key={i} milestone={m} campaignId={campaignId} />
          ))}
        </div>
      ) : null,
    },
    {
      title: "Adversary Activity",
      empty: "Adversary posture unchanged.",
      content: report.adversary_shifts.length > 0 ? (
        <div className="space-y-2">
          {report.adversary_shifts.map((a, i) => (
            <AdversaryShiftCard key={i} shift={a} />
          ))}
        </div>
      ) : null,
    },
    {
      title: "Intel",
      empty: "No new intel cards.",
      content: report.intel_cards.length > 0 ? (
        <div className="space-y-2">
          {report.intel_cards.map((c, i) => (
            <IntelCardPreview key={i} card={c} />
          ))}
        </div>
      ) : null,
    },
  ];

  const nextAction = pendingVignettes.length > 0
    ? { label: "⚠ Respond to Vignette", to: `/campaign/${campaignId}/vignette/${pendingVignettes[0].id}` }
    : { label: "Return to Map", to: `/campaign/${campaignId}` };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate font-display">Turn Report — {y} Q{q}</h1>
          <p className="text-xs opacity-70">
            Treasury: ₹{report.treasury_after_cr.toLocaleString("en-US")} cr
          </p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs opacity-60 hover:opacity-100 underline">
          Skip
        </Link>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-5 pb-20">
        {/* Situation Report */}
        {(objectiveProgress.length > 0 || notifications.some((n) => n.severity === "warning")) && (
          <section className="border border-slate-700 rounded-lg p-4 space-y-3 bg-slate-900/50">
            <h2 className="font-tech text-[10px] uppercase tracking-wider text-slate-400">Situation Report</h2>

            {/* Objective standing */}
            {objectiveProgress.length > 0 && (() => {
              const met = objectiveProgress.filter((o) => o.status === "met").length;
              const inProgress = objectiveProgress.filter((o) => o.status === "in_progress").length;
              const atRisk = objectiveProgress.filter((o) => o.status === "at_risk").length;
              const atRiskOnes = objectiveProgress.filter((o) => o.status === "at_risk");
              return (
                <div className="space-y-2">
                  <p className="text-xs text-slate-300">
                    <span className="text-emerald-400">{met} met</span>
                    {" · "}
                    <span className="text-amber-400">{inProgress} in progress</span>
                    {" · "}
                    <span className={atRisk > 0 ? "text-rose-400 font-semibold" : "text-slate-400"}>{atRisk} at risk</span>
                  </p>
                  {atRiskOnes.length > 0 && <ObjectiveTracker objectives={atRiskOnes} />}
                  <Link
                    to={`/campaign/${campaignId}/objectives`}
                    className="text-xs text-amber-400 hover:text-amber-300 underline"
                  >
                    View all objectives →
                  </Link>
                </div>
              );
            })()}

            {/* Needs your attention */}
            {(() => {
              const warnings = notifications.filter((n) => n.severity === "warning");
              if (warnings.length === 0) return null;
              return (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-rose-300">Needs your attention</p>
                  <ul className="space-y-1">
                    {warnings.map((w) => (
                      <li key={w.id}>
                        <Link
                          to={w.action_url}
                          className="text-xs text-slate-200 hover:text-amber-300 underline"
                        >
                          {w.title}
                          {w.body ? <span className="opacity-60 ml-1">— {w.body}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </section>
        )}

        <UnlockBanner campaignId={campaignId} completions={report.rd_milestones} />
        {report.vignette_fired && (
          <section className="border border-red-800 rounded-lg p-4 bg-red-950/30">
            <h2 className="text-sm font-bold text-red-300 mb-1">⚠ Vignette Fired</h2>
            <p className="text-sm">{report.vignette_fired.scenario_name}</p>
            <p className="text-xs opacity-70">{report.vignette_fired.ao?.name ?? ""}</p>
          </section>
        )}
        {(() => {
          const mc = report.events.find((e) => e.event_type === "munitions_cost");
          if (!mc) return null;
          const total = Number(mc.payload?.total_cost_cr ?? 0);
          const items = (mc.payload?.munitions as Array<{ weapon: string; fired: number }> | undefined) ?? [];
          const top = items.slice(0, 2).map((i) => `${i.fired}× ${i.weapon}`).join(", ");
          return (
            <section className="border border-amber-900/60 rounded-lg p-3 bg-amber-950/20">
              <p className="text-sm">
                💸 <span className="font-semibold">Munitions expended:</span>{" "}
                <span className="font-mono text-amber-300">₹{total.toLocaleString("en-US")} cr</span>
                {top && <span className="opacity-70"> ({top}{items.length > 2 ? ` +${items.length - 2} more` : ""})</span>}
              </p>
            </section>
          );
        })()}
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-tech text-[10px] uppercase tracking-wider text-slate-500 mb-2">{s.title}</h2>
            {s.content ?? <p className="text-xs opacity-60">{s.empty}</p>}
          </section>
        ))}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 p-3 safe-pb">
        <button
          onClick={() => navigate(nextAction.to)}
          className="w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold rounded-lg px-4 py-3 text-sm"
        >
          {nextAction.label}
        </button>
      </div>
    </div>
  );
}
