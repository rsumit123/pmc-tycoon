import { describe, it, expect } from "vitest";
import { recommendPackage, estimateOdds } from "../forceRecommendation";
import type { PlanningState } from "../types";

function planning(over: Partial<PlanningState> = {}): PlanningState {
  return {
    scenario_id: "s", scenario_name: "Test", ao: { lat: 0, lon: 0 } as never,
    response_clock_minutes: 45,
    adversary_force: [{ role: "fighter", faction: "PLAAF", platform_id: "j16", count: 6, loadout: [] } as never],
    eligible_squadrons: [
      { squadron_id: 1, name: "A", platform_id: "rafale_f4", base_id: 1, base_name: "X", distance_km: 100, in_range: true, range_tier: "A", airframes_available: 12, readiness_pct: 80, xp: 0, loadout: [] } as never,
      { squadron_id: 2, name: "B", platform_id: "su30mki", base_id: 1, base_name: "X", distance_km: 100, in_range: true, range_tier: "A", airframes_available: 10, readiness_pct: 40, xp: 0, loadout: [] } as never,
      { squadron_id: 3, name: "C", platform_id: "mig29", base_id: 2, base_name: "Y", distance_km: 600, in_range: false, range_tier: "C", airframes_available: 8, readiness_pct: 90, xp: 0, loadout: [] } as never,
    ],
    allowed_ind_roles: ["fighter"], roe_options: ["weapons_free", "weapons_tight"] as never,
    objective: {} as never,
    awacs_covering: [{ base_name: "X", distance_km: 200 } as never],
    ...over,
  } as PlanningState;
}

describe("recommendPackage", () => {
  it("picks A-tier ready squadrons, enables AWACS when covered, defaults weapons_free", () => {
    const rec = recommendPackage(planning());
    const ids = rec.squadrons.map((s) => s.squadron_id);
    expect(ids).toContain(1);
    expect(ids).not.toContain(3);
    expect(rec.support.awacs).toBe(true);
    expect(rec.support.tanker).toBe(false);
    expect(rec.roe).toBe("weapons_free");
  });

  it("sizes the package toward ~1.5x the adversary count", () => {
    const rec = recommendPackage(planning());
    const committed = rec.squadrons.reduce((s, x) => s + x.airframes, 0);
    expect(committed).toBeGreaterThanOrEqual(9);
  });
});

describe("estimateOdds", () => {
  it("Strong favorite when heavily outnumbering with detection edge", () => {
    const odds = estimateOdds(planning(), { squadrons: [{ squadron_id: 1, airframes: 12 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Strong favorite");
  });
  it("Risky when outnumbered", () => {
    const odds = estimateOdds(planning(), { squadrons: [{ squadron_id: 1, airframes: 2 }], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Risky");
  });
  it("Risky with zero committed", () => {
    const odds = estimateOdds(planning(), { squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Risky");
  });
});
