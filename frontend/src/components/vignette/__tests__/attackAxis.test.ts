import { describe, it, expect } from "vitest";
import { bearingFromFactionToAO } from "../attackAxis";

describe("bearingFromFactionToAO", () => {
  it("PAF to northern punjab: bearing toward AO is ~123, attack comes from ~303 (NW)", () => {
    const bearing = bearingFromFactionToAO("PAF", { lat: 31.0, lon: 74.5 });
    // Attack comes FROM reciprocal: (123 + 180) % 360 = 303, which is NW
    expect(bearing).toBeGreaterThan(120);
    expect(bearing).toBeLessThan(130);
  });

  it("PLAAF to ladakh: bearing toward AO is ~201, attack comes from ~21 (NE)", () => {
    const bearing = bearingFromFactionToAO("PLAAF", { lat: 34.0, lon: 78.5 });
    // Attack comes FROM reciprocal: (201 + 180) % 360 = 21, which is NE
    expect(bearing).toBeGreaterThan(200);
    expect(bearing).toBeLessThan(210);
  });

  it("unknown faction returns 0", () => {
    expect(bearingFromFactionToAO("UNKNOWN", { lat: 30, lon: 75 })).toBe(0);
  });
});
