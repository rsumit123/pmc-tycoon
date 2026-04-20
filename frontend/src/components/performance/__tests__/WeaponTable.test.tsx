import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeaponTable } from "../WeaponTable";
import type { WeaponStat } from "../../../lib/types";

describe("WeaponTable", () => {
  it("renders empty-state when no weapons have fired yet", () => {
    render(<WeaponTable weapons={[]} />);
    expect(screen.getByText(/No weapons fired yet/i)).toBeTruthy();
  });

  it("splits A2A and strike sections, flags extreme cost-per-kill", () => {
    const rows: WeaponStat[] = [
      {
        weapon_id: "meteor", fired: 46, hits: 4, hit_rate_pct: 9, avg_pk: 0.09,
        total_cost_cr: 828, cost_per_kill_cr: 207, top_target_platform: "kj500",
        weapon_class: "a2a_bvr",
      },
      {
        weapon_id: "r77", fired: 6, hits: 3, hit_rate_pct: 50, avg_pk: 0.25,
        total_cost_cr: 24, cost_per_kill_cr: 8, top_target_platform: "j10c",
        weapon_class: "a2a_bvr",
      },
      {
        weapon_id: "air_brahmos2", fired: 0, hits: 0, hit_rate_pct: 0, avg_pk: 0,
        total_cost_cr: 0, cost_per_kill_cr: null, top_target_platform: null,
        weapon_class: "anti_ship",
      },
    ];
    render(<WeaponTable weapons={rows} />);
    expect(screen.getByText(/Air-to-Air/i)).toBeTruthy();
    expect(screen.getByText(/Strike/i)).toBeTruthy();
    // Meteor's cost/kill of 207 is above the 100 cr flag threshold → should be rose
    const meteorCell = screen.getByText(/₹207/i);
    expect(meteorCell.className).toMatch(/rose|red/);
    // R-77's 8 cr/kill is normal
    expect(screen.getByText("₹8")).toBeTruthy();
  });
});
