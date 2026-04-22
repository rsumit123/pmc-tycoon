import { useState } from "react";
import { Link } from "react-router-dom";
import type { ADBattery, BaseMarker, BaseSquadronSummary, MissileStock, Platform } from "../../lib/types";
import { SquadronCard } from "../primitives/SquadronCard";
import { PlatformDossier } from "../primitives/PlatformDossier";

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
  if (!base) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label={`${base.name} squadron stack`}
        className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
      >
        <div className="flex items-baseline justify-between pb-3">
          <div>
            <h3 className="text-lg font-bold">{base.name}</h3>
            <p className="text-xs opacity-60">
              {base.lat.toFixed(2)}°N, {base.lon.toFixed(2)}°E
              • {base.squadrons.length} squadron(s)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="close base sheet"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            ×
          </button>
        </div>

        {base.squadrons.length === 0 ? (
          <p className="text-sm opacity-60 p-4">No squadrons stationed.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className="text-xs text-amber-400 hover:text-amber-300 mt-1"
                  title="Rebase squadron"
                >
                  Rebase →
                </button>
              </div>
            ))}
          </div>
        )}

        {(() => {
          const depot = missileStocks
            .filter((s) => s.base_id === base.id && s.stock > 0)
            .sort((a, b) => b.stock - a.stock);
          if (depot.length === 0) {
            return (
              <section className="mt-4 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">
                  🎯 Missile Depot
                </h4>
                <p className="text-xs opacity-60">
                  No missiles stocked at this base.{" "}
                  {campaignId !== undefined && (
                    <Link
                      to={`/campaign/${campaignId}/procurement?tab=acquisitions&view=offers&offer=missiles`}
                      className="text-amber-400 hover:text-amber-300 underline"
                    >
                      Order a batch →
                    </Link>
                  )}
                </p>
              </section>
            );
          }
          return (
            <section className="mt-4 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">
                🎯 Missile Depot
              </h4>
              <ul className="space-y-1">
                {depot.map((s) => (
                  <li
                    key={s.weapon_id}
                    className="flex items-baseline justify-between gap-2 text-xs bg-slate-950/40 border border-slate-800 rounded px-2 py-1"
                  >
                    <span className="font-semibold truncate">
                      {s.weapon_id.toUpperCase().replace(/_/g, "-")}
                    </span>
                    <span className="font-mono opacity-80">{s.stock}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] opacity-60 mt-1.5">
                Shared depot — any squadron at this base can fire from stock.
              </p>
            </section>
          );
        })()}

        {adBatteries.filter((b) => b.base_id === base.id).length > 0 && (
          <section className="mt-4 pt-3 border-t border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">
              🛡 Air Defence Batteries
            </h4>
            <ul className="space-y-1">
              {adBatteries
                .filter((b) => b.base_id === base.id)
                .sort((a, b) => b.coverage_km - a.coverage_km)
                .map((bat) => (
                  <li
                    key={bat.id}
                    className="flex items-baseline justify-between gap-2 text-xs bg-slate-950/40 border border-slate-800 rounded px-2 py-1"
                  >
                    <span className="font-semibold truncate">
                      {AD_SYSTEM_NAMES[bat.system_id] ?? bat.system_id}
                    </span>
                    <span className="opacity-60 whitespace-nowrap font-mono">
                      {bat.coverage_km} km · {bat.installed_year} Q{bat.installed_quarter}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>

      {dossierFor && (
        <PlatformDossier
          platform={dossierFor}
          open={!!dossierFor}
          onClose={() => setDossierFor(null)}
        />
      )}
    </>
  );
}
