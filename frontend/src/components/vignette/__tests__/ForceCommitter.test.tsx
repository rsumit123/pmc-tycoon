// frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceCommitter } from "../ForceCommitter";
import type { PlanningState, VignetteCommitPayload } from "../../../lib/types";
import { useCampaignStore } from "../../../store/campaignStore";

const planning: PlanningState = {
  scenario_id: "saturation_raid",
  scenario_name: "Saturation Raid",
  ao: { region: "LAC", name: "s", lat: 34, lon: 78 },
  response_clock_minutes: 15,
  adversary_force: [],
  eligible_squadrons: [
    { squadron_id: 1, name: "17 Sqn", platform_id: "rafale_f4", base_id: 10, base_name: "Ambala", distance_km: 320, in_range: true, range_tier: "A", airframes_available: 12, readiness_pct: 85, xp: 2, loadout: ["meteor"] },
    { squadron_id: 2, name: "45 Sqn", platform_id: "tejas_mk1a", base_id: 11, base_name: "Sulur", distance_km: 1800, in_range: false, range_tier: "C", airframes_available: 8, readiness_pct: 70, xp: 1, loadout: [] },
  ],
  allowed_ind_roles: ["interceptor"],
  roe_options: ["weapons_free", "weapons_tight"],
  objective: { kind: "defend_airspace", success_threshold: {} },
};

describe("ForceCommitter", () => {
  it("hides tier-C squadrons by default, disables them when shown", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    // Only the in-range squadron is visible by default.
    expect(screen.queryByRole("checkbox", { name: /45 Sqn/i })).toBeNull();
    // Reveal the out-of-reach squadron.
    fireEvent.click(screen.getByText(/Show 1 out-of-reach/i));
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

  describe("AD Defense section (allows_no_cap)", () => {
    afterEach(() => {
      useCampaignStore.setState({ adBatteries: [], bases: [] });
    });

    it("does not render AD Defense section when allows_no_cap is false", () => {
      const onChange = vi.fn();
      render(
        <ForceCommitter
          planning={{ ...planning, allows_no_cap: false }}
          value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }}
          onChange={onChange}
        />
      );
      expect(screen.queryByText(/AD Defense/i)).toBeNull();
    });

    it("renders AD Defense batteries list when allows_no_cap and batteries cover AO", () => {
      useCampaignStore.setState({
        bases: [{
          id: 10, template_id: "pathankot", name: "Pathankot Air Force Station",
          lat: 32.23, lon: 75.63, shelter_count: 0, fuel_depot_size: 0,
          ad_integration_level: 1, runway_class: "long", squadrons: [],
        }],
        adBatteries: [{
          id: 1, base_id: 10, system_id: "s400", coverage_km: 200,
          installed_year: 2026, installed_quarter: 2, interceptor_stock: 12,
        }],
      });
      const adPlanning: PlanningState = {
        ...planning,
        allows_no_cap: true,
        ao: { region: "Punjab", name: "Pathankot vicinity", lat: 32.25, lon: 75.65 },
      };
      const onChange = vi.fn();
      render(
        <ForceCommitter
          planning={adPlanning}
          value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }}
          onChange={onChange}
        />
      );
      expect(screen.getByText(/AD Defense/i)).toBeInTheDocument();
      expect(screen.getByText(/S-400 Triumf/i)).toBeInTheDocument();
      expect(screen.getByText(/Pathankot/i)).toBeInTheDocument();
    });

    it("shows warning when allows_no_cap and no batteries cover AO", () => {
      const adPlanning: PlanningState = {
        ...planning,
        allows_no_cap: true,
      };
      const onChange = vi.fn();
      render(
        <ForceCommitter
          planning={adPlanning}
          value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }}
          onChange={onChange}
        />
      );
      expect(screen.getByText(/No AD batteries cover this AO/i)).toBeInTheDocument();
    });
  });
});
