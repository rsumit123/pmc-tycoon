import { describe, it, expect, beforeEach } from "vitest";
import { setAudioEnabled, getAudioEnabled } from "../audio";

describe("audio settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to enabled", () => {
    expect(getAudioEnabled()).toBe(true);
  });

  it("persists disabled state", () => {
    setAudioEnabled(false);
    expect(getAudioEnabled()).toBe(false);
    expect(localStorage.getItem("sovereign-shield-audio")).toBe("false");
  });

  it("persists enabled state", () => {
    setAudioEnabled(false);
    setAudioEnabled(true);
    expect(getAudioEnabled()).toBe(true);
  });
});
