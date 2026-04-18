import { describe, it, expect, beforeEach, vi } from "vitest";

describe("mapStore localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("persists layer toggles to localStorage", async () => {
    const { useMapStore } = await import("../mapStore");
    const store = useMapStore.getState();
    store.toggleLayer("ad_coverage");
    const stored = JSON.parse(localStorage.getItem("sovereign-shield-map-layers") ?? "{}");
    expect(stored.ad_coverage).toBe(true);
  });

  it("loads persisted state on init", async () => {
    localStorage.setItem(
      "sovereign-shield-map-layers",
      JSON.stringify({ ad_coverage: true, intel_contacts: false }),
    );
    const { useMapStore } = await import("../mapStore");
    const state = useMapStore.getState();
    expect(state.activeLayers.ad_coverage).toBe(true);
  });
});
