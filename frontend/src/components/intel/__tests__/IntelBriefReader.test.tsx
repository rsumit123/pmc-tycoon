import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IntelBriefReader } from "../IntelBriefReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";

const seedCampaign = () => {
  useCampaignStore.setState({
    campaign: {
      id: 7, name: "c", seed: 1, starting_year: 2026, starting_quarter: 1,
      current_year: 2027, current_quarter: 2, difficulty: "realistic",
      objectives_json: [], budget_cr: 1000, quarterly_grant_cr: 100,
      current_allocation_json: null, reputation: 0,
      created_at: "", updated_at: "",
    },
  });
};

describe("IntelBriefReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
    seedCampaign();
  });

  it("renders LLM text after generate succeeds", async () => {
    vi.spyOn(http, "post").mockResolvedValue({ data: { text: "PLAAF is shifting J-20s.", cached: false, kind: "intel_brief", subject_id: "2027-Q2" } });
    render(<IntelBriefReader campaignId={7} />);
    await waitFor(() => expect(screen.getByText(/PLAAF is shifting J-20s/)).toBeTruthy());
  });

  it("shows friendly message on 409 ineligible", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 409, data: { detail: "no intel this quarter" } } });
    render(<IntelBriefReader campaignId={7} />);
    await waitFor(() => expect(screen.getByText(/not available/i)).toBeTruthy());
  });
});
