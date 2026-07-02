import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "../mapStore";

describe("mapStore terrain3d", () => {
  beforeEach(() => {
    localStorage.clear();
    useMapStore.setState({ terrain3d: true });
  });

  it("defaults to enabled", () => {
    expect(useMapStore.getState().terrain3d).toBe(true);
  });

  it("toggleTerrain3d flips the flag and persists it", () => {
    useMapStore.getState().toggleTerrain3d();
    expect(useMapStore.getState().terrain3d).toBe(false);
    expect(localStorage.getItem("map_terrain3d_v1")).toBe("false");
    useMapStore.getState().toggleTerrain3d();
    expect(useMapStore.getState().terrain3d).toBe(true);
    expect(localStorage.getItem("map_terrain3d_v1")).toBe("true");
  });
});
