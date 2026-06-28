import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OpsRoom } from "../OpsRoom";
import { useCampaignStore } from "../../store/campaignStore";
import type { Campaign, Vignette } from "../../lib/types";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

// Suppress tour behaviour in tests
vi.mock("../../lib/tour", () => ({
  OPS_TOUR_STEPS: [],
  isOpsTourSeen: () => true,
  markOpsTourSeen: vi.fn(),
}));

const mockPlanning = {
  scenario_id: "paf_strike",
  scenario_name: "PAF Strike Package",
  ao: { region: "Punjab", name: "Pathankot", lat: 32.2, lon: 75.6 },
  response_clock_minutes: 12,
  adversary_force: [
    { faction: "PAF", platform_id: "jf17_thunder", role: "multirole", count: 8, rcs_m2: 1.5, loadout: [] },
  ],
  eligible_squadrons: [],
  allowed_ind_roles: ["multirole"],
  roe_options: ["weapons_free", "weapons_tight"] as const,
  objective: { kind: "air_superiority", description: "Deny access" },
  intel_quality: { tier: "high" as const, score: 0.85 },
};

const mockVignette: Vignette = {
  id: 42,
  year: 2027,
  quarter: 2,
  scenario_id: "paf_strike",
  status: "pending",
  planning_state: mockPlanning as unknown as Vignette["planning_state"],
  committed_force: null,
  event_trace: [],
  aar_text: "",
  outcome: {},
  resolved_at: null,
};

const resolvedVignette: Vignette = { ...mockVignette, status: "resolved" };

function makeCampaign(difficulty: Campaign["difficulty"]): Campaign {
  return {
    id: 1,
    name: "Test Campaign",
    seed: 12345,
    starting_year: 2026,
    starting_quarter: 1,
    current_year: 2027,
    current_quarter: 2,
    difficulty,
    objectives_json: [],
    budget_cr: 50000,
    quarterly_grant_cr: 45000,
    current_allocation_json: null,
    reputation: 50,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function buildStore(difficulty: Campaign["difficulty"]) {
  const commitVignette = vi.fn().mockResolvedValue(resolvedVignette);
  return {
    campaign: makeCampaign(difficulty),
    loadCampaign: vi.fn().mockResolvedValue(undefined),
    loadVignette: vi.fn().mockResolvedValue(mockVignette),
    commitVignette,
    vignetteById: { 42: mockVignette },
    loading: false,
    bases: [],
    loadBases: vi.fn().mockResolvedValue(undefined),
    loadADBatteries: vi.fn().mockResolvedValue(undefined),
    loadPlatforms: vi.fn().mockResolvedValue(undefined),
    loadWeapons: vi.fn().mockResolvedValue(undefined),
    weaponsById: {},
    platformsById: {},
    missileStocks: [],
    adBatteries: [],
  };
}

function setup(difficulty: Campaign["difficulty"]) {
  const store = buildStore(difficulty);
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store),
  );
  return store;
}

function renderOpsRoom() {
  return render(
    <MemoryRouter initialEntries={["/campaign/1/vignette/42"]}>
      <Routes>
        <Route path="/campaign/:id/vignette/:vid" element={<OpsRoom />} />
        <Route path="/campaign/:id/vignette/:vid/aar" element={<div>AAR Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OpsRoom Stand down button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stand down button for story difficulty and calls commitVignette with decline=true", async () => {
    const store = setup("story");

    renderOpsRoom();

    // Wait for the vignette to load (vignetteById pre-seeded, so rendered immediately)
    const btn = await screen.findByRole("button", { name: /stand down/i });
    expect(btn).toBeTruthy();

    fireEvent.click(btn);

    await waitFor(() => {
      expect(store.commitVignette).toHaveBeenCalledWith(
        1,
        42,
        expect.objectContaining({ decline: true }),
      );
    });
  });

  it("does not render Stand down button for non-story difficulty", async () => {
    setup("realistic");

    renderOpsRoom();

    // Wait for component to render vignette content
    await screen.findByText(/PAF Strike Package/i);

    expect(screen.queryByRole("button", { name: /stand down/i })).toBeNull();
  });
});
