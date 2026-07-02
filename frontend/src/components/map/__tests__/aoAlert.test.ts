import { describe, expect, it } from "vitest";
import { firstPendingAO } from "../aoAlert";
import type { Vignette } from "../../../lib/types";

function vig(id: number, lat: number, lon: number): Vignette {
  return {
    id, year: 2027, quarter: 2, scenario_id: "s", status: "pending",
    planning_state: {
      scenario_id: "s", scenario_name: "Scenario", ao: { region: "NW", name: "Kashmir Sector", lat, lon },
      response_clock_minutes: 60, adversary_force: [], eligible_squadrons: [],
      allowed_ind_roles: [], roe_options: ["tight"], objective: { kind: "defend", description: "" },
    },
    committed_force: null, event_trace: [], aar_text: "", outcome: {}, resolved_at: null,
  } as unknown as Vignette;
}

describe("firstPendingAO", () => {
  it("returns null when no vignettes", () => {
    expect(firstPendingAO([])).toBeNull();
  });
  it("returns id + coords + name of the first pending vignette", () => {
    expect(firstPendingAO([vig(7, 33.45, 73.95), vig(8, 30, 70)])).toEqual({
      id: 7, lat: 33.45, lon: 73.95, name: "Kashmir Sector",
    });
  });
});
