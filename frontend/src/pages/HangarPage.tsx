import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { FleetFilters, type HangarSortMode } from "../components/hangar/FleetFilters";
import { PlatformSummaryCard } from "../components/hangar/PlatformSummaryCard";
import { SquadronRow } from "../components/hangar/SquadronRow";
import { SquadronDetailSheet } from "../components/hangar/SquadronDetailSheet";
import { RebaseOverlay } from "../components/map/RebaseOverlay";
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
  const bases = useCampaignStore((s) => s.bases);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const rebaseSquadron = useCampaignStore((s) => s.rebaseSquadron);

  const [tab, setTab] = useState<"summary" | "list">("summary");
  const [role, setRole] = useState<string>("All");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<HangarSortMode>("readiness_asc");
  const [selected, setSelected] = useState<HangarSquadron | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<HangarSquadron | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    loadHangar(cid);
    loadBases(cid);
  }, [cid, campaign, loadCampaign, loadHangar, loadBases]);

  const filteredSorted = useMemo(() => {
    if (!hangar) return [] as HangarSquadron[];
    const roleFilter = ROLE_MAP[role] ?? (() => true);
    const filtered = hangar.squadrons.filter((sq) => {
      if (!roleFilter(sq)) return false;
      if (platformFilter && sq.platform_id !== platformFilter) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "readiness_asc") return a.readiness_pct - b.readiness_pct;
      if (sort === "readiness_desc") return b.readiness_pct - a.readiness_pct;
      if (sort === "xp_desc") return b.xp - a.xp;
      return a.name.localeCompare(b.name);
    });
  }, [hangar, role, platformFilter, sort]);

  if (!hangar) return <div className="p-6 text-sm">Loading hangar&hellip;</div>;

  const totalAirframes = hangar.squadrons.reduce((a, b) => a + b.strength, 0);

  // Aggregate pending-upgrade counts per-platform (for PlatformSummaryCard badge).
  const pendingByPlatform: Record<string, number> = {};
  let totalPending = 0;
  for (const s of hangar.squadrons) {
    const n = s.pending_upgrades?.length ?? 0;
    if (n > 0) {
      pendingByPlatform[s.platform_id] = (pendingByPlatform[s.platform_id] ?? 0) + n;
      totalPending += n;
    }
  }

  const handleRebase = async (sqnId: number, targetBaseId: number) => {
    await rebaseSquadron(sqnId, targetBaseId);
    setRebaseTarget(null);
    await loadHangar(cid);
  };

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
        {totalPending > 0 && (
          <div className="bg-amber-950/40 border border-amber-700 rounded-lg p-3 flex items-center justify-between gap-2">
            <div className="text-xs">
              <span className="font-semibold text-amber-200">🔧 {totalPending} missile upgrade{totalPending === 1 ? "" : "s"} in progress</span>
              <span className="block text-[10px] opacity-80 mt-0.5">
                Squadrons keep their current loadout during rollout. Tap a squadron to see its completion quarter.
              </span>
            </div>
            {tab !== "list" && (
              <button
                type="button"
                onClick={() => { setTab("list"); setPlatformFilter(null); setRole("All"); }}
                className="text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-900 rounded px-3 py-1.5 flex-shrink-0"
              >View →</button>
            )}
          </div>
        )}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => { setTab("summary"); setPlatformFilter(null); }}
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
              <PlatformSummaryCard
                key={s.platform_id}
                s={s}
                pendingCount={pendingByPlatform[s.platform_id] ?? 0}
                onClick={() => {
                  setPlatformFilter(s.platform_id);
                  setRole("All");
                  setTab("list");
                }}
              />
            ))}
          </div>
        ) : (
          <>
            {platformFilter && (
              <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800 rounded-lg px-3 py-2 text-xs">
                <span className="text-amber-200 truncate">
                  Filtered: {hangar.summary_by_platform.find((s) => s.platform_id === platformFilter)?.platform_name ?? platformFilter}
                </span>
                <button
                  onClick={() => setPlatformFilter(null)}
                  className="text-amber-300 hover:text-amber-200 underline ml-2 flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            )}
            <FleetFilters
              roleFilter={role}
              onRoleChange={(r) => { setRole(r); setPlatformFilter(null); }}
              sortMode={sort}
              onSortChange={setSort}
            />
            {filteredSorted.length === 0 ? (
              <p className="text-xs opacity-60 py-4 text-center">No squadrons match the current filter.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredSorted.map((sq) => (
                  <SquadronRow
                    key={sq.id}
                    sq={sq}
                    onClick={() => setSelected(sq)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <SquadronDetailSheet
        squadron={selected}
        onClose={() => setSelected(null)}
        onRebaseStart={() => {
          if (selected) setRebaseTarget(selected);
        }}
      />

      <RebaseOverlay
        squadron={rebaseTarget
          ? {
              id: rebaseTarget.id,
              name: rebaseTarget.name,
              call_sign: rebaseTarget.call_sign,
              platform_id: rebaseTarget.platform_id,
              strength: rebaseTarget.strength,
              readiness_pct: rebaseTarget.readiness_pct,
              xp: rebaseTarget.xp,
              ace_name: rebaseTarget.ace_name,
            }
          : null}
        bases={bases}
        currentBaseId={rebaseTarget?.base_id ?? 0}
        onRebase={handleRebase}
        onCancel={() => setRebaseTarget(null)}
      />
    </div>
  );
}
