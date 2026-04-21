import { useMemo } from "react";
import type { EligibleSquadron, VignetteCommitPayload, WeaponMeta } from "../../lib/types";
import { useCampaignStore } from "../../store/campaignStore";

// The resolver fires up to 3 rounds (R1 BVR 120km, R2 BVR 50km, WVR 15km).
// Average airframes see ~2–2.5 missile launches across the combat.
// weapons_tight throttles to ~60%; visual_id_required skips BVR (≈ 1 shot WVR).
const EST_SHOTS_WEAPONS_FREE = 2.5;
const EST_SHOTS_WEAPONS_TIGHT = 1.5;
const EST_SHOTS_VID = 1.0;

function shotsPerAirframe(roe: string): number {
  if (roe === "weapons_tight") return EST_SHOTS_WEAPONS_TIGHT;
  if (roe === "visual_id_required") return EST_SHOTS_VID;
  return EST_SHOTS_WEAPONS_FREE;
}

function avgLoadoutCost(loadout: string[], weaponsById: Record<string, WeaponMeta>): number {
  if (loadout.length === 0) return 0;
  const prices = loadout
    .map((w) => weaponsById[w])
    .filter((m): m is WeaponMeta => m != null && m.class.startsWith("a2a"))
    .map((m) => m.unit_cost_cr);
  if (prices.length === 0) return 0;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

function primaryA2aBvr(loadout: string[], weaponsById: Record<string, WeaponMeta>): string | undefined {
  return loadout.find((w) => {
    const m = weaponsById[w];
    return m && m.class === "a2a_bvr";
  });
}

export interface MunitionsEstimateProps {
  payload: VignetteCommitPayload;
  eligibleSquadrons: EligibleSquadron[];
  weaponsById: Record<string, WeaponMeta>;
  quarterlyGrantCr: number;
  treasuryCr: number;
}

export function MunitionsEstimate({
  payload, eligibleSquadrons, weaponsById,
}: MunitionsEstimateProps) {
  const missileStocks = useCampaignStore((s) => s.missileStocks);

  const { replacementCr, lineItems } = useMemo(() => {
    const shots = shotsPerAirframe(payload.roe);
    const byId = Object.fromEntries(eligibleSquadrons.map((s) => [s.squadron_id, s]));
    const items: Array<{
      name: string;
      airframes: number;
      expectedShots: number;
      weaponId: string | undefined;
      stock: number;
      status: "ok" | "tight" | "short";
      short: number;
    }> = [];
    let total = 0;
    for (const c of payload.squadrons) {
      const sq = byId[c.squadron_id];
      if (!sq) continue;
      const avgCost = avgLoadoutCost(sq.loadout, weaponsById);
      const primary = primaryA2aBvr(sq.loadout, weaponsById);
      const stock = primary
        ? (missileStocks.find((m) => m.base_id === sq.base_id && m.weapon_id === primary)?.stock ?? 0)
        : 0;
      const expected = Math.round(c.airframes * shots);
      total += Math.round(c.airframes * shots * avgCost);
      let status: "ok" | "tight" | "short" = "ok";
      const short = Math.max(0, expected - stock);
      if (stock < expected) status = "short";
      else if (stock < expected * 1.5) status = "tight";
      items.push({
        name: sq.name || sq.platform_id,
        airframes: c.airframes,
        expectedShots: expected,
        weaponId: primary,
        stock,
        status,
        short,
      });
    }
    return { replacementCr: total, lineItems: items };
  }, [payload, eligibleSquadrons, weaponsById, missileStocks]);

  if (lineItems.length === 0) return null;

  const anyShort = lineItems.some((li) => li.status === "short");
  const borderClass = anyShort ? "border-rose-700" : "border-slate-700";

  return (
    <section className={`border rounded-lg p-3 bg-slate-900 ${borderClass}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold">📦 Depot check</h3>
        <span className="text-[10px] opacity-60">
          Stock at committing bases vs expected launches
        </span>
      </div>
      <ul className="text-[11px] space-y-1">
        {lineItems.map((li, i) => {
          const icon = li.status === "ok" ? "✓" : li.status === "tight" ? "⚠" : "✗";
          const tone =
            li.status === "ok" ? "text-emerald-300"
            : li.status === "tight" ? "text-amber-300"
            : "text-rose-300";
          return (
            <li key={i} className="flex items-baseline justify-between gap-2">
              <span className="truncate flex-1">{li.name}</span>
              <span className={`font-mono ${tone} flex-shrink-0`}>
                {icon} expected ~{li.expectedShots}
                {li.weaponId ? ` ${li.weaponId}` : ""}
                {" vs "}
                {li.stock} stock
                {li.status === "short" && li.short > 0 ? ` — ${li.short} short` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] opacity-60 mt-2">
        Replacement cost if depleted: ₹{replacementCr.toLocaleString("en-US")} cr
      </p>
      {anyShort && (
        <p className="text-[10px] text-rose-300 mt-1">
          ⚠ One or more committed bases are short of primary-weapon stock. Reorder via Acquisitions → Missile Batches.
        </p>
      )}
    </section>
  );
}
