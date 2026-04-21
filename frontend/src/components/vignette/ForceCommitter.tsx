// frontend/src/components/vignette/ForceCommitter.tsx
import { useMemo, useState } from "react";
import type { EligibleSquadron, PlanningState, VignetteCommitPayload, ROE, Platform } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { useCampaignStore } from "../../store/campaignStore";
import { AD_STARTING_INTERCEPTORS } from "../procurement/AcquisitionPipeline";

const AD_SYSTEM_DISPLAY: Record<string, string> = {
  s400: "S-400 Triumf",
  long_range_sam: "Indigenous Long-Range SAM",
  project_kusha: "Project Kusha BMD",
  mrsam_air: "MR-SAM (Barak-8)",
  akash_ng: "Akash-NG",
  qrsam: "QRSAM",
  vshorads: "VSHORADS",
};

function shortBaseName(name: string): string {
  return name
    .replace(/\s+Air Force Station\b.*$/, "")
    .replace(/\s+AFS\b.*$/, "");
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat1)) * Math.sin(toRad(lat2))
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon1 - lon2));
  const clamped = Math.max(-1, Math.min(1, a));
  return Math.acos(clamped) * 6371;
}

const LOW_RCS_BANDS = new Set(["VLO", "LO"]);

function deriveTier(sq: EligibleSquadron): "A" | "B" | "C" {
  if (sq.range_tier) return sq.range_tier;
  return sq.in_range ? "A" : "C";
}

function tierBadge(tier: "A" | "B" | "C") {
  if (tier === "A") return { label: "IN RANGE", cls: "bg-emerald-900/60 text-emerald-200 border-emerald-700" };
  if (tier === "B") return { label: "TANKER REQ", cls: "bg-amber-900/60 text-amber-200 border-amber-700" };
  return { label: "OUT OF REACH", cls: "bg-rose-950/60 text-rose-300 border-rose-800" };
}

function adversaryHasStealth(planning: PlanningState, platformsById: Record<string, Platform>): boolean {
  for (const entry of planning.adversary_force) {
    const p = platformsById[entry.platform_id];
    if (p && LOW_RCS_BANDS.has(p.rcs_band)) return true;
  }
  for (const obs of planning.adversary_force_observed ?? []) {
    for (const pid of obs.probable_platforms ?? []) {
      const p = platformsById[pid];
      if (p && LOW_RCS_BANDS.has(p.rcs_band)) return true;
    }
  }
  return false;
}

// Platforms that are NOT combat aircraft — they're activated via Support toggles, not committed as squadrons.
const SUPPORT_PLATFORM_IDS = new Set<string>([
  "netra_aewc", "phalcon_a50", "netra_aewc_mk2",
  "il78_tanker", "il78mki",
  "tapas_uav", "ghatak_ucav",
]);

export interface ForceCommitterProps {
  planning: PlanningState;
  value: VignetteCommitPayload;
  onChange: (next: VignetteCommitPayload) => void;
}

function estimateAdvTotal(planning: PlanningState): number {
  if (planning.adversary_force_observed?.length) {
    return planning.adversary_force_observed.reduce((sum, o) => {
      if (o.count != null) return sum + o.count;
      if (o.count_range) return sum + (o.count_range[0] + o.count_range[1]) / 2;
      return sum;
    }, 0);
  }
  return planning.adversary_force.reduce((s, f) => s + f.count, 0);
}

export function ForceCommitter({ planning, value, onChange }: ForceCommitterProps) {
  const platformsById = useCampaignStore((s) => s.platformsById);
  const weaponsById = useCampaignStore((s) => s.weaponsById);
  const missileStocks = useCampaignStore((s) => s.missileStocks);
  const adBatteries = useCampaignStore((s) => s.adBatteries);
  const bases = useCampaignStore((s) => s.bases);
  const [showOutOfReach, setShowOutOfReach] = useState(false);
  const stealthAdversary = useMemo(
    () => adversaryHasStealth(planning, platformsById),
    [planning, platformsById],
  );
  const toggleSquadron = (sqid: number, available: number, checked: boolean) => {
    const rest = value.squadrons.filter((s) => s.squadron_id !== sqid);
    const next = checked ? [...rest, { squadron_id: sqid, airframes: available }] : rest;
    onChange({ ...value, squadrons: next });
  };

  const setAirframes = (sqid: number, n: number) => {
    const next = value.squadrons.map((s) => s.squadron_id === sqid ? { ...s, airframes: n } : s);
    onChange({ ...value, squadrons: next });
  };

  const setSupport = (k: "awacs" | "tanker" | "sead_package", v: boolean) => {
    onChange({ ...value, support: { ...value.support, [k]: v } });
  };

  const setROE = (roe: ROE) => onChange({ ...value, roe });

  const totalCommitted = value.squadrons.reduce((a, b) => a + b.airframes, 0);
  const advTotal = Math.max(1, Math.round(estimateAdvTotal(planning)));
  const overcommit = totalCommitted > advTotal * 2;
  const awacsCovering = planning.awacs_covering ?? [];

  const combatSquadrons = planning.eligible_squadrons.filter(
    (sq) => !SUPPORT_PLATFORM_IDS.has(sq.platform_id),
  );
  const tierOrder: Record<"A" | "B" | "C", number> = { A: 0, B: 1, C: 2 };
  const sortedSquadrons = [...combatSquadrons].sort((a, b) => {
    const ta = deriveTier(a);
    const tb = deriveTier(b);
    if (ta !== tb) return tierOrder[ta] - tierOrder[tb];
    return a.distance_km - b.distance_km;
  });
  const tierCCount = sortedSquadrons.filter((sq) => deriveTier(sq) === "C").length;
  const visibleSquadrons = showOutOfReach
    ? sortedSquadrons
    : sortedSquadrons.filter((sq) => deriveTier(sq) !== "C");
  const tierBInCommit = value.squadrons.some((c) => {
    const sq = combatSquadrons.find((s) => s.squadron_id === c.squadron_id);
    return sq ? deriveTier(sq) === "B" : false;
  });
  const tankerBlocking = tierBInCommit && !value.support.tanker;

  // AD Defense coverage check (only for allows_no_cap scenarios)
  const adCoverageRows = planning.allows_no_cap
    ? adBatteries.map((bat) => {
        const base = bases.find((b) => b.id === bat.base_id);
        const dist = base
          ? haversineKm(base.lat, base.lon, planning.ao.lat, planning.ao.lon)
          : Infinity;
        const covers = dist <= bat.coverage_km;
        return { bat, base, dist, covers };
      }).filter((r) => r.covers)
    : [];

  return (
    <div className="flex flex-col gap-5">
      {planning.allows_no_cap && (
        <section className="bg-slate-900 border border-amber-700/50 rounded-lg p-3">
          <h3 className="text-sm font-bold mb-2 flex items-baseline gap-2">
            🛡 AD Defense
            <span className="text-[10px] opacity-70 font-normal">(primary defender)</span>
          </h3>
          {adCoverageRows.length === 0 ? (
            <div className="text-xs text-rose-300 border border-rose-800 bg-rose-950/30 rounded p-2">
              ⚠ No AD batteries cover this AO — attack will likely breach defenses.
            </div>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {adCoverageRows.map(({ bat, base }) => {
                const name = AD_SYSTEM_DISPLAY[bat.system_id] ?? bat.system_id;
                const capacity = AD_STARTING_INTERCEPTORS[bat.system_id] ?? 16;
                const stock = bat.interceptor_stock ?? capacity;
                const baseLabel = base ? shortBaseName(base.name) : `base ${bat.base_id}`;
                return (
                  <li key={bat.id} className="flex items-center justify-between gap-2 border border-slate-800 bg-slate-950/50 rounded px-2 py-1.5">
                    <span className="font-semibold">{name}</span>
                    <span className="opacity-80">
                      @ {baseLabel} · {stock}/{capacity} · {bat.coverage_km} km
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* PROMOTED: Support section first */}
      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Support Assets</h3>
        <div className="space-y-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            {awacsCovering.length > 0 ? (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value.support.awacs}
                  onChange={(e) => setSupport("awacs", e.target.checked)}
                />
                <span className="flex-1">
                  <span className="font-semibold">AWACS</span>
                  <span className="block text-xs opacity-70 mt-0.5">
                    {awacsCovering[0].base_name} • {awacsCovering[0].distance_km}km • +5% missile PK
                  </span>
                </span>
              </label>
            ) : (
              <div className="text-xs">
                <div className="font-semibold text-slate-400">AWACS <span className="text-red-400">unavailable</span></div>
                <div className="opacity-60 mt-0.5">
                  No AWACS squadrons cover this AO. Consider rebasing a Netra squadron.
                </div>
              </div>
            )}
          </div>
          <label className={[
            "flex items-start gap-2 text-sm border rounded-lg p-3 cursor-pointer",
            tankerBlocking
              ? "bg-amber-950/40 border-amber-600"
              : "bg-slate-900 border-slate-800",
          ].join(" ")}>
            <input type="checkbox" className="mt-0.5" checked={value.support.tanker}
              onChange={(e) => setSupport("tanker", e.target.checked)} />
            <span className="flex-1">
              <span className="font-semibold">Tanker (IL-78)</span>
              {tankerBlocking && <span className="ml-2 text-[10px] bg-amber-700 text-slate-900 rounded px-1.5 py-0.5 font-bold">REQUIRED</span>}
              <span className="block text-xs opacity-70 mt-0.5">
                {tankerBlocking
                  ? "Required: you've committed squadrons beyond unrefuelled combat radius"
                  : "Extends combat radius 2× so distant squadrons can participate"}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm bg-slate-900 border border-slate-800 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={value.support.sead_package}
              onChange={(e) => setSupport("sead_package", e.target.checked)} />
            <span className="flex-1">
              <span className="font-semibold">SEAD package</span>
              <span className="block text-xs opacity-70 mt-0.5">Suppresses enemy AD threat</span>
            </span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Squadrons</h3>
        <p className="text-[10px] opacity-60 mb-2">
          Only combat squadrons are committable here. AWACS, tankers, and ISR drones are activated via the <span className="font-semibold">Support Assets</span> section above.
        </p>
        <ul className="flex flex-col gap-2">
          {visibleSquadrons.map((sq) => {
            const tier = deriveTier(sq);
            const badge = tierBadge(tier);
            const disabled = tier === "C";
            const ineffective = stealthAdversary && sq.loadout_stealth_effective === false;
            const checked = value.squadrons.some((s) => s.squadron_id === sq.squadron_id);
            const picked = value.squadrons.find((s) => s.squadron_id === sq.squadron_id);
            // Depot status — primary A2A BVR weapon at the squadron's base
            const primaryWeapon = sq.loadout.find((w) => {
              const m = weaponsById[w];
              return m && m.class === "a2a_bvr";
            });
            const primaryStock = primaryWeapon
              ? (missileStocks.find((m) => m.base_id === sq.base_id && m.weapon_id === primaryWeapon)?.stock ?? 0)
              : 0;
            const expectedShots = sq.airframes_available * 2.5;
            const depotTier: "green" | "amber" | "red" =
              primaryStock >= expectedShots ? "green"
              : primaryStock >= expectedShots * 0.5 ? "amber"
              : "red";
            const depotClass =
              depotTier === "green" ? "text-emerald-300"
              : depotTier === "amber" ? "text-amber-300"
              : "text-rose-300";
            return (
              <li
                key={sq.squadron_id}
                className={[
                  "border rounded-lg p-3 flex items-center gap-3",
                  disabled ? "border-slate-800 bg-slate-950 opacity-50"
                    : tier === "B" ? "border-amber-900/60 bg-slate-900"
                    : "border-slate-700 bg-slate-900",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  aria-label={sq.name}
                  checked={checked}
                  disabled={disabled}
                  onChange={(e) => toggleSquadron(sq.squadron_id, sq.airframes_available, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate">{sq.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    ✈ <span className="font-semibold">{sq.platform_id.replace(/_/g, " ").toUpperCase()}</span>
                    {sq.loadout.length > 0 && (
                      <span>
                        {" · "}
                        {sq.loadout.map((w, i) => {
                          const meta = weaponsById[w];
                          const cost = meta?.unit_cost_cr;
                          const isStrike = meta && !meta.class.startsWith("a2a");
                          return (
                            <span
                              key={`${w}-${i}`}
                              className={isStrike ? "opacity-40" : "opacity-70"}
                              title={isStrike ? "Strike munition — not used in air-to-air combat" : undefined}
                            >
                              {i > 0 && " · "}
                              {w}
                              {cost != null && (
                                <span className="opacity-60"> ₹{cost}</span>
                              )}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-60 truncate mt-0.5">
                    📍 {sq.base_name} • {sq.distance_km} km • {sq.readiness_pct}% ready • {sq.airframes_available} airframes
                  </div>
                  {primaryWeapon && (
                    <div className={`text-[10px] mt-0.5 ${depotClass}`}>
                      📦 {primaryWeapon} {primaryStock}/{Math.round(expectedShots * 2)} · depot status
                    </div>
                  )}
                  {ineffective && (
                    <div className="text-[10px] text-amber-300 mt-1">
                      ⚠ Loadout ineffective vs low-RCS targets (needs Meteor / Astra Mk2+ / PL-15+).
                    </div>
                  )}
                  {tier === "B" && (
                    <div className="text-[10px] text-amber-300 mt-0.5">
                      Tanker support required to commit this squadron.
                    </div>
                  )}
                </div>
                {checked && picked && (
                  <Stepper
                    value={picked.airframes}
                    min={1}
                    max={sq.airframes_available}
                    step={1}
                    onChange={(n) => setAirframes(sq.squadron_id, n)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {tierCCount > 0 && (
          <button
            type="button"
            onClick={() => setShowOutOfReach((v) => !v)}
            className="text-[11px] text-slate-400 hover:text-slate-200 underline mt-2"
          >
            {showOutOfReach
              ? `Hide ${tierCCount} out-of-reach squadron${tierCCount === 1 ? "" : "s"}`
              : `Show ${tierCCount} out-of-reach squadron${tierCCount === 1 ? "" : "s"}`}
          </button>
        )}
        {overcommit && (
          <p className="text-xs text-amber-400 mt-2 border border-amber-800 bg-amber-950/30 rounded p-2">
            ⚠ Heavy overcommitment ({totalCommitted} vs ~{advTotal} enemy). All committed squadrons lose extra readiness even if they don't engage.
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Rules of Engagement</h3>
        <select
          aria-label="ROE"
          value={value.roe}
          onChange={(e) => setROE(e.target.value as ROE)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          {planning.roe_options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      </section>
    </div>
  );
}
