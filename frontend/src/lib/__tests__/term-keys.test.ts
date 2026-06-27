import { describe, it, expect } from "vitest";
import { GLOSSARY } from "../glossary";

// Keys wired into combat surfaces (ForceCommitter / StrikeBuilder). Keep in sync.
const USED_KEYS = ["awacs", "tanker", "sead", "roe", "readiness", "blowback"];

describe("term keys used in combat UI", () => {
  it("every wired key exists in the glossary", () => {
    for (const k of USED_KEYS) {
      expect(GLOSSARY[k], `glossary missing key: ${k}`).toBeTruthy();
    }
  });
});
