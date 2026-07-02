import { describe, expect, it } from "vitest";
import { apronSlots } from "../apronLayout";

const BASE_LON = 77.1;
const BASE_LAT = 28.6;

describe("apronSlots", () => {
  it("dedupes and caps at 4, preserving first-occurrence order", () => {
    const slots = apronSlots(BASE_LON, BASE_LAT, [
      "su30_mki", "tejas_mk1a", "su30_mki", "mig29_upg", "rafale_f4", "mirage2000",
    ]);
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.platformId)).toEqual([
      "su30_mki", "tejas_mk1a", "mig29_upg", "rafale_f4",
    ]);
  });

  it("places slots at pairwise distinct positions", () => {
    const slots = apronSlots(BASE_LON, BASE_LAT, [
      "su30_mki", "tejas_mk1a", "mig29_upg", "rafale_f4",
    ]);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(slots[i].lon !== slots[j].lon || slots[i].lat !== slots[j].lat).toBe(true);
      }
    }
  });

  it("is deterministic across calls", () => {
    const a = apronSlots(BASE_LON, BASE_LAT, ["su30_mki", "tejas_mk1a"]);
    const b = apronSlots(BASE_LON, BASE_LAT, ["su30_mki", "tejas_mk1a"]);
    expect(a).toEqual(b);
  });

  it("gives heavies a larger footprint than light fighters", () => {
    const slots = apronSlots(BASE_LON, BASE_LAT, ["su30_mki", "tejas_mk1a"]);
    const heavy = slots.find((s) => s.platformId === "su30_mki")!;
    const light = slots.find((s) => s.platformId === "tejas_mk1a")!;
    expect(heavy.spanM).toBeGreaterThan(light.spanM);
  });

  it("puts every slot south of the base (bearing 140-220 range)", () => {
    const slots = apronSlots(BASE_LON, BASE_LAT, [
      "su30_mki", "tejas_mk1a", "mig29_upg", "rafale_f4",
    ]);
    for (const slot of slots) {
      expect(slot.lat).toBeLessThan(BASE_LAT);
    }
  });
});
