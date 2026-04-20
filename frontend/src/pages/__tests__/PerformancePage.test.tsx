import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PerformancePage } from "../PerformancePage";
import { useCampaignStore } from "../../store/campaignStore";
import type { PerformanceResponse } from "../../lib/types";

const bundle: PerformanceResponse = {
  totals: {
    total_sorties: 14, total_kills: 42, total_losses: 12,
    total_munitions_cost_cr: 4500, avg_cost_per_kill_cr: 107,
  },
  factions: [
    { faction: "PLAAF", sorties: 9, wins: 6, losses: 3, win_rate_pct: 67, avg_exchange_ratio: 2.1, avg_munitions_cost_cr: 400 },
    { faction: "PAF", sorties: 4, wins: 3, losses: 1, win_rate_pct: 75, avg_exchange_ratio: 4.0, avg_munitions_cost_cr: 180 },
    { faction: "PLAN", sorties: 1, wins: 0, losses: 1, win_rate_pct: 0, avg_exchange_ratio: 0.5, avg_munitions_cost_cr: 250 },
  ],
  platforms: [
    { platform_id: "rafale_f4", platform_name: "Dassault Rafale F4", sorties: 10, kills: 24, losses: 8, kd_ratio: 3.0, win_contribution_pct: 80, first_shot_pct: 70, top_weapon: "meteor" },
  ],
  weapons: [
    { weapon_id: "meteor", fired: 46, hits: 4, hit_rate_pct: 9, avg_pk: 0.09, total_cost_cr: 828, cost_per_kill_cr: 207, top_target_platform: "kj500", weapon_class: "a2a_bvr" },
  ],
  support: [
    { asset: "awacs", with_sorties: 6, without_sorties: 8, with_win_rate_pct: 83, without_win_rate_pct: 50, delta_win_rate_pp: 33 },
    { asset: "tanker", with_sorties: 0, without_sorties: 14, with_win_rate_pct: 0, without_win_rate_pct: 57, delta_win_rate_pp: 0 },
    { asset: "sead", with_sorties: 0, without_sorties: 14, with_win_rate_pct: 0, without_win_rate_pct: 57, delta_win_rate_pp: 0 },
  ],
};

describe("PerformancePage", () => {
  beforeEach(() => {
    useCampaignStore.setState({
      performance: bundle,
      loadPerformance: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("renders totals + faction summary + platforms tab by default", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    // Totals ribbon value
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
  });

  it("switches to Missiles tab on click", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Missiles/i }));
    // WeaponTable header
    expect(screen.getByText(/Air-to-Air/i)).toBeTruthy();
    // Meteor row
    expect(screen.getByText(/meteor/i)).toBeTruthy();
  });

  it("switches to Support tab on click", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Support/i }));
    expect(screen.getByText(/AWACS/i)).toBeTruthy();
    expect(screen.getByText(/\+33 pp/)).toBeTruthy();
  });
});
