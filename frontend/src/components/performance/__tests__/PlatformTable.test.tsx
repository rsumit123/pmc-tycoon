import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformTable } from "../PlatformTable";
import type { PlatformStat } from "../../../lib/types";

describe("PlatformTable", () => {
  it("renders empty-state when no platforms have committed to combat yet", () => {
    render(<PlatformTable platforms={[]} />);
    expect(screen.getByText(/No combat yet/i)).toBeTruthy();
  });

  it("renders rows with K:D, win contribution %, top weapon", () => {
    const rows: PlatformStat[] = [
      {
        platform_id: "rafale_f4", platform_name: "Dassault Rafale F4",
        sorties: 10, kills: 24, losses: 8, kd_ratio: 3.0,
        win_contribution_pct: 80, first_shot_pct: 70, top_weapon: "meteor",
      },
      {
        platform_id: "su30_mki", platform_name: "Sukhoi Su-30 MKI",
        sorties: 6, kills: 4, losses: 0, kd_ratio: null,
        win_contribution_pct: 50, first_shot_pct: 33, top_weapon: "r77",
      },
    ];
    render(<PlatformTable platforms={rows} />);
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
    expect(screen.getByText(/3\.0/)).toBeTruthy();          // K:D for Rafale
    expect(screen.getByText(/Sukhoi Su-30 MKI/)).toBeTruthy();
    // Su-30 has losses=0 → K:D renders as "∞"
    expect(screen.getByText("∞")).toBeTruthy();
    expect(screen.getByText(/meteor/i)).toBeTruthy();
    expect(screen.getByText(/r77/i)).toBeTruthy();
  });
});
