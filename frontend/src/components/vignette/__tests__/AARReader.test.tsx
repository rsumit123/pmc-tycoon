// frontend/src/components/vignette/__tests__/AARReader.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AARReader } from "../AARReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";
import type { Vignette } from "../../../lib/types";

const baseVig: Vignette = {
  id: 3, year: 2027, quarter: 2, scenario_id: "saturation_raid",
  status: "resolved",
  planning_state: { scenario_id: "saturation_raid", scenario_name: "Saturation Raid", ao: { region: "LAC", name: "sector-A", lat: 34, lon: 78 }, response_clock_minutes: 15, adversary_force: [], eligible_squadrons: [], allowed_ind_roles: [], roe_options: ["weapons_free"], objective: { kind: "defend_airspace", success_threshold: {} } },
  committed_force: null,
  event_trace: [],
  aar_text: "fallback stub",
  outcome: { ind_kia: 2, adv_kia: 11, ind_airframes_lost: 1, adv_airframes_lost: 4, objective_met: true, roe: "weapons_free", support: { awacs: true, tanker: false, sead_package: false } },
  resolved_at: "2027-06-01T00:00:00Z",
};

describe("AARReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
  });

  it("renders LLM narrative + outcome stats", async () => {
    vi.spyOn(http, "post").mockResolvedValue({ data: { text: "The mission began at dawn.\n\nSquadron 17 engaged first.", cached: false, kind: "aar", subject_id: "vig-3" } });
    render(<AARReader campaignId={7} vignette={baseVig} />);
    await waitFor(() => expect(screen.getByText(/The mission began at dawn/)).toBeTruthy());
    expect(screen.getByText(/Objective met/i)).toBeTruthy();
    expect(screen.getByText(/11/)).toBeTruthy();
  });

  it("falls back to stub aar_text on 502", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 502 } });
    render(<AARReader campaignId={7} vignette={baseVig} />);
    await waitFor(() => expect(screen.getByText(/fallback stub/)).toBeTruthy());
  });
});
