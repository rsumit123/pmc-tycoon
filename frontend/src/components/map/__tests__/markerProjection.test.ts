import { describe, it, expect } from "vitest";
import { subcontinentBounds, fitsInsideSubcontinent } from "../markerProjection";

describe("markerProjection helpers", () => {
  it("exposes a tight-ish bbox around the Indian subcontinent", () => {
    const b = subcontinentBounds();
    expect(b.west).toBeLessThan(70);
    expect(b.east).toBeGreaterThan(95);
    expect(b.south).toBeLessThan(10);
    expect(b.north).toBeGreaterThan(35);
  });

  it("fitsInsideSubcontinent returns true for Ambala", () => {
    expect(fitsInsideSubcontinent(76.78, 30.37)).toBe(true);
  });

  it("fitsInsideSubcontinent returns false for Moscow", () => {
    expect(fitsInsideSubcontinent(37.6, 55.75)).toBe(false);
  });
});
