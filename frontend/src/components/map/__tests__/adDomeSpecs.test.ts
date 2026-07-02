import { describe, expect, it } from "vitest";
import { buildDomeSpecs } from "../adDomeSpecs";
import type { ADBattery, BaseMarker } from "../../../lib/types";

const base = (id: number, lat: number, lon: number): BaseMarker =>
  ({ id, name: `B${id}`, lat, lon, squadrons: [] }) as unknown as BaseMarker;
const bat = (id: number, baseId: number, km: number): ADBattery =>
  ({ id, base_id: baseId, system_id: "s400", coverage_km: km, interceptor_stock: 8,
     installed_year: 2026, installed_quarter: 2 }) as unknown as ADBattery;

describe("buildDomeSpecs", () => {
  it("builds one dome per battery whose base exists, skipping orphans", () => {
    const specs = buildDomeSpecs([base(1, 32.23, 75.63)], [bat(10, 1, 120), bat(11, 999, 40)]);
    expect(specs).toHaveLength(1);
    expect(specs[0].key).toBe(10);
    expect(specs[0].scale).toBeGreaterThan(0);
  });

  it("bigger coverage → bigger scale at the same base", () => {
    const specs = buildDomeSpecs([base(1, 32, 75)], [bat(1, 1, 40), bat(2, 1, 120)]);
    expect(specs[1].scale).toBeGreaterThan(specs[0].scale);
  });
});
