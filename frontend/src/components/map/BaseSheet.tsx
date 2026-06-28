import { useState } from "react";
import { Link } from "react-router-dom";
import type { ADBattery, BaseMarker, BaseSquadronSummary, MissileStock, Platform } from "../../lib/types";
import { SquadronCard } from "../primitives/SquadronCard";
import { PlatformDossier } from "../primitives/PlatformDossier";
import { MissileTransferModal } from "./MissileTransferModal";
import { useCampaignStore } from "../../store/campaignStore";
import { useBackButtonClose } from "../../lib/useBackButtonClose";

// Friendly display names for AD systems (matches ad_systems.yaml entries).
const AD_SYSTEM_NAMES: Record<string, string> = {
  s400: "S-400 Triumf",
  long_range_sam: "Indigenous Long-Range SAM",
  project_kusha: "Project Kusha BMD",
  mrsam_air: "MR-SAM (Barak-8)",
  akash_ng: "Akash-NG",
  qrsam: "QRSAM",
  vshorads: "VSHORADS",
};

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1.5 text-center">
      <div className="font-mono text-lg font-bold leading-none text-slate-100">{n}</div>
      <div className="font-tech mt-1 text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

export interface BaseSheetProps {
  base: BaseMarker | null;
  platforms: Record<string, Platform>;
  adBatteries?: ADBattery[];
  missileStocks?: MissileStock[];
  campaignId?: number;
  onClose: () => void;
  onRebaseStart?: (squadron: BaseSquadronSummary, baseId: number) => void;
}

export function BaseSheet({
  base, platforms, adBatteries = [], missileStocks = [], campaignId, onClose, onRebaseStart,
}: BaseSheetProps) {
  const [dossierFor, setDossierFor] = useState<Platform | null>(null);
  const [transferFor, setTransferFor] = useState<{ weaponId: string; stock: number } | null>(null);
  const allBases = useCampaignStore((s) => s.bases);
  const transferMissileStock = useCampaignStore((s) => s.transferMissileStock);
  useBackButtonClose(base !== null, onClose);
  if (!base) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label={`${base.name} station dossier`}
        className="fixed inset-x-0 bottom-0 z-40 bg-[#0a0f1c] border-t border-amber-900/40 rounded-t-2xl max-h-[72vh] overflow-y-auto safe-pb"
      >
        {/* Header band */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0a0f1c]/95 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-tech text-[10px] tracking-[0.25em] text-amber-500/70">▸ STATION DOSSIER</div>
              <h3 className="truncate font-display text-xl font-bold uppercase tracking-wide text-slate-50">{base.name}</h3>
              <p className="font-tech mt-0.5 text-[10px] tracking-wider text-slate-500">
                {base.lat.toFixed(2)}°N · {base.lon.toFixed(2)}°E
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="close base sheet"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              ×
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat n={base.squadrons.length} label="Squadrons" />
            <Stat n={base.squadrons.reduce((a, s) => a + s.strength, 0)} label="Airframes" />
            <Stat n={adBatteries.filter((b) => b.base_id === base.id).length} label="AD Batteries" />
          </div>
        </div>

        <div className="space-y-5 p-4">
          {/* Air Wing */}
          <section>
            <h4 className="font-tech mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-500/70">Air Wing</h4>
            {base.squadrons.length === 0 ? (
              <p className="text-sm opacity-60">No squadrons stationed.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {base.squadrons.map((sq) => (
                  <div key={sq.id}>
                    <SquadronCard
                      squadron={sq}
                      platform={platforms[sq.platform_id]}
                      onLongPress={() => {
                        const p = platforms[sq.platform_id];
                        if (p) setDossierFor(p);
                      }}
                    />
                    <button
                      onClick={() => onRebaseStart?.(sq, base.id)}
                      className="mt-1 font-tech text-[11px] uppercase tracking-wider text-amber-400 hover:text-amber-300"
                      title="Rebase squadron"
                    >
                      Rebase →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Missile Depot */}
          {(() => {
            const depot = missileStocks
              .filter((s) => s.base_id === base.id && s.stock > 0)
              .sort((a, b) => b.stock - a.stock);
            return (
              <section>
                <h4 className="font-tech mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-500/70">Missile Depot</h4>
                {depot.length === 0 ? (
                  <p className="text-xs opacity-60">
                    No missiles stocked at this base.{" "}
                    {campaignId !== undefined && (
                      <Link
                        to={`/campaign/${campaignId}/procurement?tab=acquisitions&view=offers&offer=missiles`}
                        className="text-amber-400 underline hover:text-amber-300"
                      >
                        Order a batch →
                      </Link>
                    )}
                  </p>
                ) : (
                  <>
                    <ul className="space-y-1">
                      {depot.map((s) => (
                        <li
                          key={s.weapon_id}
                          className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 text-xs"
                        >
                          <span className="truncate font-semibold">{s.weapon_id.toUpperCase().replace(/_/g, "-")}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono opacity-80">{s.stock}</span>
                            <button
                              type="button"
                              onClick={() => setTransferFor({ weaponId: s.weapon_id, stock: s.stock })}
                              className="font-tech text-[10px] uppercase tracking-wider text-amber-400 underline hover:text-amber-300"
                              aria-label={`Transfer ${s.weapon_id} to another base`}
                            >Transfer →</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] opacity-60">Shared depot — any squadron at this base can fire from stock.</p>
                  </>
                )}
              </section>
            );
          })()}

          {/* Air Defence */}
          {adBatteries.filter((b) => b.base_id === base.id).length > 0 && (
            <section>
              <h4 className="font-tech mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-500/70">Air Defence</h4>
              <ul className="space-y-1">
                {adBatteries
                  .filter((b) => b.base_id === base.id)
                  .sort((a, b) => b.coverage_km - a.coverage_km)
                  .map((bat) => (
                    <li
                      key={bat.id}
                      className="flex items-baseline justify-between gap-2 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5 text-xs"
                    >
                      <span className="truncate font-semibold">{AD_SYSTEM_NAMES[bat.system_id] ?? bat.system_id}</span>
                      <span className="whitespace-nowrap font-mono opacity-60">
                        {bat.coverage_km} km · {bat.installed_year} Q{bat.installed_quarter}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {dossierFor && (
        <PlatformDossier
          platform={dossierFor}
          open={!!dossierFor}
          onClose={() => setDossierFor(null)}
        />
      )}

      {transferFor && (
        <MissileTransferModal
          weaponId={transferFor.weaponId}
          fromBase={base}
          availableStock={transferFor.stock}
          allBases={allBases}
          allStocks={missileStocks}
          onClose={() => setTransferFor(null)}
          onTransfer={async (toBaseId, quantity) => {
            await transferMissileStock({
              weapon_id: transferFor.weaponId,
              from_base_id: base.id,
              to_base_id: toBaseId,
              quantity,
            });
          }}
        />
      )}
    </>
  );
}
