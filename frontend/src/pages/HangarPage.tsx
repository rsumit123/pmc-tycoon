import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ScreenHeader } from "../components/primitives/ScreenHeader";
import { PlatformImage } from "../components/primitives/PlatformImage";
import { FleetFilters, type HangarSortMode } from "../components/hangar/FleetFilters";
import { PlatformSummaryCard } from "../components/hangar/PlatformSummaryCard";
import { SquadronRow } from "../components/hangar/SquadronRow";
import { SquadronDetailSheet } from "../components/hangar/SquadronDetailSheet";
import { SquadronSplitModal } from "../components/hangar/SquadronSplitModal";
import { RebaseOverlay } from "../components/map/RebaseOverlay";
import type { HangarSquadron } from "../lib/types";
import { isCampaignComplete } from "../lib/campaignLifecycle";
import { ReadOnlyBanner } from "../components/primitives/ReadOnlyBanner";
import { Loader } from "../components/primitives/Loader";

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
  const splitSquadron = useCampaignStore((s) => s.splitSquadron);
  const renameSquadron = useCampaignStore((s) => s.renameSquadron);

  const [tab, setTab] = useState<"summary" | "list">("summary");
  const [role, setRole] = useState<string>("All");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<HangarSortMode>("readiness_asc");
  const [selected, setSelected] = useState<HangarSquadron | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState<HangarSquadron | null>(null);
  const [splitTarget, setSplitTarget] = useState<HangarSquadron | null>(null);

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

  if (!hangar) return <Loader label="Loading hangar" />;

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

  const complete = isCampaignComplete(campaign);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {complete && campaign && <ReadOnlyBanner campaignId={campaign.id} />}
      <ScreenHeader
        title="Hangar"
        subtitle={`${hangar.squadrons.length} sqns · ${totalAirframes} airframes`}
        backTo={`/campaign/${cid}`}
      />

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
            {platformFilter && (() => {
              const pname = hangar.summary_by_platform.find((s) => s.platform_id === platformFilter)?.platform_name ?? platformFilter;
              return (
                <div className="flex items-center gap-3 bg-amber-950/30 border border-amber-800 rounded-lg px-3 py-2 text-xs">
                  <PlatformImage
                    platformId={platformFilter}
                    name={pname}
                    variant="thumb"
                    className="h-10 w-16 flex-shrink-0 rounded border border-amber-800/40"
                  />
                  <span className="flex-1 truncate text-amber-200">
                    Filtered: <span className="font-semibold">{pname}</span>
                  </span>
                  <button
                    onClick={() => setPlatformFilter(null)}
                    className="ml-2 flex-shrink-0 text-amber-300 underline hover:text-amber-200"
                  >
                    Clear
                  </button>
                </div>
              );
            })()}
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
        onSplitStart={() => {
          if (selected) setSplitTarget(selected);
        }}
        onRename={async (name, callSign) => {
          if (!selected) return;
          await renameSquadron(selected.id, name, callSign);
          await loadHangar(cid);
          // Update the selected state with the new name so the sheet stays in sync
          setSelected({ ...selected, name, call_sign: callSign ?? selected.call_sign });
        }}
      />

      {splitTarget && (
        <SquadronSplitModal
          squadron={splitTarget}
          bases={bases}
          onClose={() => setSplitTarget(null)}
          onSplit={async (sqid, airframes, targetBaseId) => {
            await splitSquadron(sqid, airframes, targetBaseId);
            await loadHangar(cid);
          }}
        />
      )}

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
