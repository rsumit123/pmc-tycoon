import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
import { initCapacitor } from "../capacitorInit";

describe("initCapacitor", () => {
  it("is a no-op on web and does not throw", () => {
    expect(() => initCapacitor()).not.toThrow();
  });
});
