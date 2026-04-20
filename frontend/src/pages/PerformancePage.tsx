import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { TotalsRibbon } from "../components/performance/TotalsRibbon";
import { FactionSummary } from "../components/performance/FactionSummary";
import { PlatformTable } from "../components/performance/PlatformTable";
import { WeaponTable } from "../components/performance/WeaponTable";
import { SupportPanel } from "../components/performance/SupportPanel";

type Tab = "platforms" | "missiles" | "support";

export function PerformancePage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const performance = useCampaignStore((s) => s.performance);
  const loadPerformance = useCampaignStore((s) => s.loadPerformance);
  const [tab, setTab] = useState<Tab>("platforms");

  useEffect(() => {
    if (Number.isFinite(cid)) loadPerformance(cid);
  }, [cid, loadPerformance]);

  if (!performance) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <p className="text-sm opacity-70">Loading performance…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <h1 className="text-sm font-bold">📊 Performance</h1>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">
          Map
        </Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <TotalsRibbon totals={performance.totals} />
        <FactionSummary factions={performance.factions} />

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {(["platforms", "missiles", "support"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "flex-1 px-3 py-1.5 text-xs font-semibold rounded capitalize",
                tab === t ? "bg-amber-600 text-slate-900" : "text-slate-300",
              ].join(" ")}
            >
              {t === "missiles" ? "Missiles" : t === "support" ? "Support" : "Platforms"}
            </button>
          ))}
        </div>

        {tab === "platforms" && <PlatformTable platforms={performance.platforms} />}
        {tab === "missiles" && <WeaponTable weapons={performance.weapons} />}
        {tab === "support" && <SupportPanel support={performance.support} />}
      </main>
    </div>
  );
}
