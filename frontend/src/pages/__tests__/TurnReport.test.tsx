import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TurnReport } from "../TurnReport";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const mockReport = {
  campaign_id: 1, year: 2026, quarter: 2,
  events: [], deliveries: [], rd_milestones: [],
  adversary_shifts: [], intel_cards: [],
  vignette_fired: null, treasury_after_cr: 100000, allocation: null,
};

const defaultStore = {
  turnReport: mockReport,
  loadTurnReport: vi.fn(),
  campaign: { id: 1, name: "Test", current_year: 2026, current_quarter: 3 } as any,
  loadCampaign: vi.fn(),
  loadBases: vi.fn(),
  loadPlatforms: vi.fn(),
  bases: [],
  platformsById: {},
  pendingVignettes: [],
};

function setup(overrides: Record<string, unknown> = {}) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store)
  );
  return render(
    <MemoryRouter initialEntries={["/campaign/1/turn-report/2026/2"]}>
      <Routes>
        <Route path="/campaign/:id/turn-report/:year/:quarter" element={<TurnReport />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TurnReport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders title with year and quarter", () => {
    setup();
    expect(screen.getByText(/Turn Report — 2026 Q2/)).toBeTruthy();
  });

  it("shows 'Return to Map' when no pending vignettes", () => {
    setup();
    expect(screen.getByText(/Return to Map/)).toBeTruthy();
  });

  it("shows 'Respond to Vignette' when vignette pending", () => {
    setup({ pendingVignettes: [{ id: 42 }] });
    expect(screen.getByText(/Respond to Vignette/)).toBeTruthy();
  });

  it("shows empty-state messages for empty sections", () => {
    setup();
    expect(screen.getByText(/No deliveries this quarter/)).toBeTruthy();
    expect(screen.getByText(/No R&D milestones/)).toBeTruthy();
  });
});
