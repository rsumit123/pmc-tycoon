import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportPanel } from "../SupportPanel";
import type { SupportStat } from "../../../lib/types";

describe("SupportPanel", () => {
  it("renders all three assets even if some have zero sorties", () => {
    const rows: SupportStat[] = [
      { asset: "awacs", with_sorties: 6, without_sorties: 4, with_win_rate_pct: 83, without_win_rate_pct: 50, delta_win_rate_pp: 33 },
      { asset: "tanker", with_sorties: 0, without_sorties: 10, with_win_rate_pct: 0, without_win_rate_pct: 60, delta_win_rate_pp: 0 },
      { asset: "sead", with_sorties: 0, without_sorties: 10, with_win_rate_pct: 0, without_win_rate_pct: 60, delta_win_rate_pp: 0 },
    ];
    render(<SupportPanel support={rows} />);
    expect(screen.getByText(/AWACS/i)).toBeTruthy();
    expect(screen.getByText(/Tanker/i)).toBeTruthy();
    expect(screen.getByText(/SEAD/i)).toBeTruthy();
    // AWACS positive delta shows "+33 pp" with emerald tint
    expect(screen.getByText(/\+33 pp/)).toBeTruthy();
    // Tanker / SEAD with zero sorties on one side — shows "—" delta, not "+0 pp"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
