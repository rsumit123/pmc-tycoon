import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, api } from "../api";

describe("endgame API methods", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("getCampaignSummary calls GET /api/campaigns/:id/summary", async () => {
    const mock = vi.spyOn(http, "get").mockResolvedValue({
      data: {
        campaign_id: 1, name: "test", difficulty: "realistic",
        starting_year: 2026, current_year: 2036, current_quarter: 2,
        budget_cr: 100000, reputation: 75,
        year_snapshots: [], force_structure: { squadrons_end: 30, total_airframes: 450, fifth_gen_squadrons: 2 },
        vignettes_won: 5, vignettes_lost: 2, vignettes_total: 7,
        ace_count: 1, aces: [], is_complete: true,
      },
    });
    const result = await api.getCampaignSummary(1);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/summary");
    expect(result.is_complete).toBe(true);
    expect(result.force_structure.squadrons_end).toBe(30);
  });

  it("generateYearRecap calls POST with year param", async () => {
    const mock = vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "recap text", cached: false, kind: "year_recap", subject_id: "year-2028" },
    });
    const result = await api.generateYearRecap(1, 2028);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/year-recap/generate", null, { params: { year: 2028 } });
    expect(result.text).toBe("recap text");
  });

  it("generateRetrospective calls POST", async () => {
    const mock = vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "retro text", cached: false, kind: "retrospective", subject_id: "campaign" },
    });
    const result = await api.generateRetrospective(1);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/retrospective");
    expect(result.text).toBe("retro text");
  });
});
