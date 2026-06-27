import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceCommitter } from "../ForceCommitter";
import type { PlanningState } from "../../../lib/types";

// Fixture mirrors the existing ForceCommitter.test.tsx fixture,
// ensuring ≥1 range_tier "A" squadron with readiness_pct >= 50.
const planning: PlanningState = {
  scenario_id: "saturation_raid",
  scenario_name: "Saturation Raid",
  ao: { region: "LAC", name: "s", lat: 34, lon: 78 },
  response_clock_minutes: 15,
  adversary_force: [{ platform_id: "j16", count: 8, role: "interceptor" }],
  eligible_squadrons: [
    { squadron_id: 1, name: "17 Sqn", platform_id: "rafale_f4", base_id: 10, base_name: "Ambala", distance_km: 320, in_range: true, range_tier: "A", airframes_available: 12, readiness_pct: 85, xp: 2, loadout: ["meteor"] },
    { squadron_id: 2, name: "45 Sqn", platform_id: "tejas_mk1a", base_id: 11, base_name: "Sulur", distance_km: 1800, in_range: false, range_tier: "C", airframes_available: 8, readiness_pct: 70, xp: 1, loadout: [] },
  ],
  allowed_ind_roles: ["interceptor"],
  roe_options: ["weapons_free", "weapons_tight"],
  objective: { kind: "defend_airspace", success_threshold: {} },
} as never;

describe("ForceCommitter recommend + odds", () => {
  it("Auto-fill button populates a package via onChange", () => {
    const onChange = vi.fn();
    render(
      <ForceCommitter
        planning={planning}
        value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /auto-fill|recommend/i }));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].squadrons.length).toBeGreaterThan(0);
  });

  it("renders an odds estimate chip", () => {
    render(
      <ForceCommitter
        planning={planning}
        value={{ squadrons: [{ squadron_id: 1, airframes: 12 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/strong favorite|even|risky/i)).toBeInTheDocument();
  });
});
