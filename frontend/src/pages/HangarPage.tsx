import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { FleetFilters, type HangarSortMode } from "../components/hangar/FleetFilters";
import { PlatformSummaryCard } from "../components/hangar/PlatformSummaryCard";
import { SquadronRow } from "../components/hangar/SquadronRow";
import type { HangarSquadron } from "../lib/types";

const ROLE_MAP: Record<string, (sq: HangarSquadron) => boolean> = {
  All:      () => true,
  AWACS:    (sq) => sq.platform_id === "netra_aewc",
  Tanker:   (sq) => sq.platform_id === "il78_tanker",
  Drones:   (sq) => ["tapas_uav", "ghatak_ucav"].includes(sq.platform_id),
  Fighters: (sq) => !["netra_aewc", "il78_tanker", "tapas_uav", "ghatak_ucav"].includes(sq.platform_id),
};

export function HangarPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const hangar = useCampaignStore((s) => s.hangar);
  const loadHangar = useCampaignStore((s) => s.loadHangar);

  const [tab, setTab] = useState<"summary" | "list">("summary");
  const [role, setRole] = useState<string>("All");
  const [sort, setSort] = useState<HangarSortMode>("readiness_asc");

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    loadHangar(cid);
  }, [cid, campaign, loadCampaign, loadHangar]);

  const filteredSorted = useMemo(() => {
    if (!hangar) return [] as HangarSquadron[];
    const filter = ROLE_MAP[role] ?? (() => true);
    const filtered = hangar.squadrons.filter(filter);
    return [...filtered].sort((a, b) => {
      if (sort === "readiness_asc") return a.readiness_pct - b.readiness_pct;
      if (sort === "readiness_desc") return b.readiness_pct - a.readiness_pct;
      if (sort === "xp_desc") return b.xp - a.xp;
      return a.name.localeCompare(b.name);
    });
  }, [hangar, role, sort]);

  if (!hangar) return <div className="p-6 text-sm">Loading hangar&hellip;</div>;

  const totalAirframes = hangar.squadrons.reduce((a, b) => a + b.strength, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Hangar</h1>
          <p className="text-xs opacity-70">
            {hangar.squadrons.length} sqns &bull; {totalAirframes} airframes
          </p>
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab("summary")}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "summary" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
          >By Platform</button>
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "list" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
          >All Squadrons</button>
        </div>

        {tab === "summary" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {hangar.summary_by_platform.map((s) => (
              <PlatformSummaryCard key={s.platform_id} s={s} />
            ))}
          </div>
        ) : (
          <>
            <FleetFilters
              roleFilter={role}
              onRoleChange={setRole}
              sortMode={sort}
              onSortChange={setSort}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredSorted.map((sq) => (
                <SquadronRow key={sq.id} sq={sq} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
