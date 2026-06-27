import { describe, it, expect, beforeEach } from "vitest";
import { MAP_TOUR_STEPS, isTourSeen, markTourSeen, resetTour } from "../tour";
import { OPS_TOUR_STEPS, isOpsTourSeen, markOpsTourSeen } from "../tour";

describe("tour helpers", () => {
  beforeEach(() => localStorage.clear());

  it("defines ordered map tour steps with required fields", () => {
    expect(MAP_TOUR_STEPS.length).toBeGreaterThanOrEqual(3);
    for (const s of MAP_TOUR_STEPS) {
      expect(s.targetId).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
    }
  });

  it("tracks seen state in localStorage", () => {
    expect(isTourSeen()).toBe(false);
    markTourSeen();
    expect(isTourSeen()).toBe(true);
    resetTour();
    expect(isTourSeen()).toBe(false);
  });
});

describe("ops tour helpers", () => {
  beforeEach(() => localStorage.clear());
  it("defines ops tour steps", () => {
    expect(OPS_TOUR_STEPS.length).toBeGreaterThanOrEqual(2);
  });
  it("tracks ops seen state", () => {
    expect(isOpsTourSeen()).toBe(false);
    markOpsTourSeen();
    expect(isOpsTourSeen()).toBe(true);
  });
});
