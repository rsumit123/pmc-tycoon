import { describe, it, expect } from "vitest";
import { synthesizeContacts } from "../intelContacts";
import type { IntelCard } from "../types";

function makeCard(overrides: Partial<IntelCard> & { faction?: string }): IntelCard {
  return {
    id: 1,
    appeared_year: 2026,
    appeared_quarter: 3,
    source_type: "IMINT",
    confidence: 0.85,
    truth_value: true,
    payload: {
      headline: "Test observation",
      template_id: "test",
      subject_faction: overrides.faction ?? "PLAAF",
      subject_type: "force_count",
      observed: {},
      ground_truth: {},
    },
    ...overrides,
  } as IntelCard;
}

describe("synthesizeContacts", () => {
  it("returns empty for empty cards", () => {
    expect(synthesizeContacts([])).toEqual([]);
  });

  it("creates contact from card with faction", () => {
    const card = makeCard({ id: 10, faction: "PLAAF" });
    const contacts = synthesizeContacts([card]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].source_type).toBe("IMINT");
    expect(contacts[0].id).toBe("intel-10");
    expect(Math.abs(contacts[0].lat - 34.0)).toBeLessThan(1.1);
  });

  it("returns contact for each faction", () => {
    const cards = [
      makeCard({ id: 1, faction: "PLAAF" }),
      makeCard({ id: 2, faction: "PAF" }),
      makeCard({ id: 3, faction: "PLAN" }),
    ];
    const contacts = synthesizeContacts(cards);
    expect(contacts).toHaveLength(3);
  });

  it("skips cards without recognized faction", () => {
    const card = makeCard({ id: 4, faction: "UNKNOWN" });
    expect(synthesizeContacts([card])).toEqual([]);
  });

  it("is deterministic", () => {
    const card = makeCard({ id: 5, faction: "PAF" });
    const a = synthesizeContacts([card]);
    const b = synthesizeContacts([card]);
    expect(a[0].lat).toBe(b[0].lat);
    expect(a[0].lng).toBe(b[0].lng);
  });
});
