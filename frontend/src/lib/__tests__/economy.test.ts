import { describe, it, expect } from "vitest";
import { startingGrantCr, DIFFICULTY_BLURB } from "../economy";

describe("economy", () => {
  it("computes the 2026 starting quarterly grant per difficulty (matches backend)", () => {
    expect(startingGrantCr("relaxed")).toBe(67500);
    expect(startingGrantCr("realistic")).toBe(45000);
    expect(startingGrantCr("hard_peer")).toBe(31500);
    expect(startingGrantCr("worst_case")).toBe(22500);
  });
  it("has a one-line blurb per difficulty", () => {
    (["relaxed", "realistic", "hard_peer", "worst_case"] as const).forEach((d) => {
      expect(DIFFICULTY_BLURB[d].length).toBeGreaterThan(0);
    });
  });
});
