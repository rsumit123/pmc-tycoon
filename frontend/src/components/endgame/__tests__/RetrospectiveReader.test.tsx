import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RetrospectiveReader } from "../RetrospectiveReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";

describe("RetrospectiveReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
  });

  it("renders LLM retrospective text", async () => {
    vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "The decade concluded with a mixed assessment.\n\nForce structure grew from 31 to 38 squadrons.", cached: false, kind: "retrospective", subject_id: "campaign" },
    });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/decade concluded/)).toBeTruthy());
    expect(screen.getByText(/Force structure grew/)).toBeTruthy();
  });

  it("shows ineligible message on 409", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 409, data: { detail: "Q40 not complete" } } });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/not yet available/i)).toBeTruthy());
  });

  it("shows error on 502", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 502 } });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeTruthy());
  });
});
