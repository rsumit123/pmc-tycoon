import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { UnlocksFeed } from "../components/armory/UnlocksFeed";
import { MissileCard } from "../components/armory/MissileCard";
import { MissileEquipModal } from "../components/armory/MissileEquipModal";
import { ADSystemCard } from "../components/armory/ADSystemCard";
import { ADDeploymentsTable } from "../components/armory/ADDeploymentsTable";
import { MissileDepotTable } from "../components/armory/MissileDepotTable";
import { DroneRoster } from "../components/armory/DroneRoster";
import type { MissileUnlock } from "../lib/types";
import { isCampaignComplete } from "../lib/campaignLifecycle";
import { ReadOnlyBanner } from "../components/primitives/ReadOnlyBanner";

type Tab = "unlocks" | "missiles" | "ad" | "drones";

export function ArmoryPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const unlocks = useCampaignStore((s) => s.armoryUnlocks);
  const loadUnlocks = useCampaignStore((s) => s.loadArmoryUnlocks);
  const hangar = useCampaignStore((s) => s.hangar);
  const loadHangar = useCampaignStore((s) => s.loadHangar);
  const bases = useCampaignStore((s) => s.bases);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const adBatteries = useCampaignStore((s) => s.adBatteries);
  const loadADBatteries = useCampaignStore((s) => s.loadADBatteries);
  const missileStocks = useCampaignStore((s) => s.missileStocks);
  const loadMissileStocks = useCampaignStore((s) => s.loadMissileStocks);
  const equipMissile = useCampaignStore((s) => s.equipMissile);

  const [tab, setTab] = useState<Tab>("unlocks");
  const [missileModal, setMissileModal] = useState<MissileUnlock | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    loadUnlocks(cid);
    loadHangar(cid);
    loadBases(cid);
    loadADBatteries(cid);
    loadMissileStocks(cid);
  }, [cid, campaign, loadCampaign, loadUnlocks, loadHangar, loadBases, loadADBatteries, loadMissileStocks]);

  const basesById = Object.fromEntries(bases.map((b) => [b.id, b]));
  const installedBasesBySystem: Record<string, string[]> = {};
  for (const b of adBatteries) {
    const baseName = basesById[b.base_id]?.name ?? `base-${b.base_id}`;
    (installedBasesBySystem[b.system_id] ??= []).push(baseName);
  }

  if (!unlocks || !hangar) return <div className="p-6 text-sm">Loading armory…</div>;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    {
      id: "unlocks",
      label: "Unlocks",
      count: unlocks.missiles.length + unlocks.ad_systems.length
           + unlocks.isr_drones.length + unlocks.strike_platforms.length,
    },
    { id: "missiles", label: "Missiles", count: unlocks.missiles.length },
    { id: "ad", label: "AD", count: unlocks.ad_systems.length },
    {
      id: "drones",
      label: "Drones",
      count: unlocks.isr_drones.length + unlocks.strike_platforms.length,
    },
  ];

  const complete = isCampaignComplete(campaign);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {complete && campaign && <ReadOnlyBanner campaignId={campaign.id} />}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Armory</h1>
          <p className="text-xs opacity-70">Unlocks from completed R&D</p>
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold rounded whitespace-nowrap",
                tab === t.id ? "bg-amber-600 text-slate-900" : "text-slate-300",
              ].join(" ")}
            >
              {t.label} ({t.count ?? 0})
            </button>
          ))}
        </div>

        {tab === "unlocks" && <UnlocksFeed unlocks={unlocks} />}

        {tab === "missiles" && (
          unlocks.missiles.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No missiles unlocked yet.</p>
          ) : (() => {
            const a2a = unlocks.missiles.filter(
              (m) => (m.weapon_class ?? "a2a_bvr").startsWith("a2a"),
            );
            const strike = unlocks.missiles.filter(
              (m) => !(m.weapon_class ?? "a2a_bvr").startsWith("a2a"),
            );
            return (
              <div className="space-y-4">
                {a2a.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-300 mb-2">
                      Air-to-Air ({a2a.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {a2a.map((m) => (
                        <MissileCard key={m.target_id} m={m} onEquip={() => setMissileModal(m)} />
                      ))}
                    </div>
                  </section>
                )}
                {strike.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-300 mb-2">
                      Strike Munitions ({strike.length})
                    </h3>
                    <p className="text-[10px] opacity-60 mb-2 italic">
                      Anti-ship, land-attack, and anti-radiation missiles. These equip onto eligible squadrons for realism + cost tracking but do not fire in air-to-air vignettes — they wait for ground-strike scenarios (future).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {strike.map((m) => (
                        <MissileCard key={m.target_id} m={m} onEquip={() => setMissileModal(m)} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            );
          })()
        )}

        {tab === "ad" && (
          unlocks.ad_systems.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No AD systems unlocked yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unlocks.ad_systems.map((a) => (
                  <ADSystemCard
                    key={a.target_id}
                    a={a}
                    installedBaseNames={installedBasesBySystem[a.target_id] ?? []}
                    totalBases={bases.length}
                    campaignId={cid}
                  />
                ))}
              </div>
              <ADDeploymentsTable adBatteries={adBatteries} bases={bases} />
              <MissileDepotTable missileStocks={missileStocks} bases={bases} />
            </div>
          )
        )}

        {tab === "drones" && (
          <DroneRoster
            isrDrones={unlocks.isr_drones}
            strikeDrones={unlocks.strike_platforms}
            squadrons={hangar.squadrons}
          />
        )}

        {missileModal && (
          <MissileEquipModal
            missile={missileModal}
            squadrons={hangar.squadrons}
            onClose={() => setMissileModal(null)}
            onPick={async (sqid) => {
              await equipMissile(missileModal.target_id, sqid);
              await loadUnlocks(cid);
            }}
          />
        )}

      </main>
    </div>
  );
}
