import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignCardGenerator } from "../CampaignCardGenerator";
import type { CampaignSummary } from "../../../lib/types";

vi.mock("html2canvas", () => ({
  default: vi.fn(() => Promise.resolve({
    toDataURL: () => "data:image/png;base64,fakepng",
  })),
}));

const summary: CampaignSummary = {
  campaign_id: 1, name: "Iron Spear", difficulty: "realistic",
  starting_year: 2026, current_year: 2036, current_quarter: 2,
  budget_cr: 100000, reputation: 75,
  year_snapshots: [
    { year: 2026, end_treasury_cr: 600000, vignettes_resolved: 0, vignettes_won: 0, deliveries: 0, rd_completions: 0 },
    { year: 2027, end_treasury_cr: 500000, vignettes_resolved: 1, vignettes_won: 1, deliveries: 2, rd_completions: 0 },
  ],
  force_structure: { squadrons_end: 38, total_airframes: 570, fifth_gen_squadrons: 2 },
  vignettes_won: 8, vignettes_lost: 3, vignettes_total: 11,
  ace_count: 3, aces: [],
  objectives: [{ id: "obj1", name: "Test Objective", status: "pass" as const }],
  is_complete: true,
};

describe("CampaignCardGenerator", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders campaign name and key stats", () => {
    render(<CampaignCardGenerator summary={summary} />);
    expect(screen.getByText(/Iron Spear/)).toBeTruthy();
    expect(screen.getByText(/38/)).toBeTruthy();
    expect(screen.getByText(/570/)).toBeTruthy();
  });

  it("renders grade based on win ratio", () => {
    render(<CampaignCardGenerator summary={summary} />);
    // 8/11 = 72.7% → B grade
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("renders export button", () => {
    render(<CampaignCardGenerator summary={summary} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeTruthy();
  });
});
