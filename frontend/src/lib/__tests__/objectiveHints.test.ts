import { describe, it, expect } from "vitest";
import { OBJECTIVE_HINTS, BEGINNER_OBJECTIVE_IDS } from "../objectiveHints";

describe("objectiveHints", () => {
  it("has hints for the core objective ids", () => {
    ["amca_operational_by_2035", "maintain_42_squadrons", "modernize_fleet"].forEach((id) => {
      expect(OBJECTIVE_HINTS[id], `missing hint: ${id}`).toBeTruthy();
    });
  });
  it("beginner set has exactly 3 gentle objectives, all with hints", () => {
    expect(BEGINNER_OBJECTIVE_IDS).toHaveLength(3);
    BEGINNER_OBJECTIVE_IDS.forEach((id) => expect(OBJECTIVE_HINTS[id]).toBeTruthy());
  });
});
