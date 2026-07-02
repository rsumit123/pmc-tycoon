import { describe, expect, it } from "vitest";
import { aoAlertPose, baseFocusPadding, baseFocusPose, DEFAULT_PITCH, flyOptions } from "../mapCamera";

describe("mapCamera poses", () => {
  it("baseFocusPose centers on the base with a low cinematic camera", () => {
    const p = baseFocusPose(75.63, 32.23);
    expect(p.center).toEqual([75.63, 32.23]);
    expect(p.zoom).toBeGreaterThan(8);
    expect(p.pitch).toBeGreaterThan(DEFAULT_PITCH);
  });

  it("baseFocusPadding reserves the bottom-sheet area so the base stays visible", () => {
    const pad = baseFocusPadding(860);
    expect(pad.bottom).toBe(516);
    expect(pad.top).toBe(0);
  });

  it("aoAlertPose frames the AO wider than a base focus", () => {
    const ao = aoAlertPose(73.95, 33.45);
    const base = baseFocusPose(73.95, 33.45);
    expect(ao.zoom).toBeLessThan(base.zoom);
    expect(ao.center).toEqual([73.95, 33.45]);
  });

  it("flyOptions animates by default and snaps under reduced motion", () => {
    const pose = baseFocusPose(70, 20);
    expect(flyOptions(pose, false).duration).toBeGreaterThan(1000);
    expect(flyOptions(pose, true).duration).toBe(0);
    expect(flyOptions(pose, false).essential).toBe(true);
  });
});
