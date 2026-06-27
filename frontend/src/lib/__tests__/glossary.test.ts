import { describe, it, expect } from "vitest";
import { GLOSSARY, lookupTerm, type GlossaryEntry } from "../glossary";

describe("glossary", () => {
  it("contains core jargon keys with non-empty definitions", () => {
    const required = ["bvr", "wvr", "roe", "rcs", "vlo", "awacs", "foc", "readiness"];
    for (const key of required) {
      const e: GlossaryEntry | undefined = GLOSSARY[key];
      expect(e, `missing term: ${key}`).toBeTruthy();
      expect(e!.short.length).toBeGreaterThan(0);
    }
  });

  it("lookupTerm is case-insensitive and trims", () => {
    expect(lookupTerm("BVR")?.term).toBe(GLOSSARY["bvr"].term);
    expect(lookupTerm(" roe ")?.term).toBe(GLOSSARY["roe"].term);
  });

  it("lookupTerm returns undefined for unknown keys", () => {
    expect(lookupTerm("definitely-not-a-term")).toBeUndefined();
  });
});
