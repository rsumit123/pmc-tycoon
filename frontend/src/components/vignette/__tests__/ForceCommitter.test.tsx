// frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceCommitter } from "../ForceCommitter";
import type { PlanningState, VignetteCommitPayload } from "../../../lib/types";

const planning: PlanningState = {
  scenario_id: "saturation_raid",
  scenario_name: "Saturation Raid",
  ao: { region: "LAC", name: "s", lat: 34, lon: 78 },
  response_clock_minutes: 15,
  adversary_force: [],
  eligible_squadrons: [
    { squadron_id: 1, name: "17 Sqn", platform_id: "rafale_f4", base_id: 10, base_name: "Ambala", distance_km: 320, in_range: true, airframes_available: 12, readiness_pct: 85, xp: 2, loadout: ["meteor"] },
    { squadron_id: 2, name: "45 Sqn", platform_id: "tejas_mk1a", base_id: 11, base_name: "Sulur", distance_km: 1800, in_range: false, airframes_available: 8, readiness_pct: 70, xp: 1, loadout: [] },
  ],
  allowed_ind_roles: ["interceptor"],
  roe_options: ["weapons_free", "weapons_tight"],
  objective: { kind: "defend_airspace", success_threshold: {} },
};

describe("ForceCommitter", () => {
  it("disables out-of-range squadron", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /sqn/i });
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).toBeDisabled();
  });

  it("emits payload when squadron checked", () => {
    const onChange = vi.fn();
    const initial: VignetteCommitPayload = { squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" };
    render(<ForceCommitter planning={planning} value={initial} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /17 Sqn/i })[0]);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as VignetteCommitPayload;
    expect(last.squadrons[0]).toEqual({ squadron_id: 1, airframes: 12 });
  });

  it("offers only the roe_options from planning state", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    const opts = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(["weapons_free", "weapons_tight"]);
  });
});
