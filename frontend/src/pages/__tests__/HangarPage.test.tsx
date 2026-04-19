import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HangarPage } from "../HangarPage";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const defaultStore = {
  campaign: { id: 1, name: "Test", current_year: 2026, current_quarter: 4 } as any,
  loadCampaign: vi.fn(),
  hangar: {
    squadrons: [
      {
        id: 1,
        name: "17 Sqn",
        call_sign: "GOLD",
        platform_id: "rafale_f4",
        platform_name: "Dassault Rafale F4",
        base_id: 1,
        base_name: "Ambala",
        strength: 18,
        readiness_pct: 82,
        xp: 5,
        ace_name: null,
        loadout: ["meteor", "mica_ir"],
      },
    ],
    summary_by_platform: [
      {
        platform_id: "rafale_f4",
        platform_name: "Dassault Rafale F4",
        squadron_count: 1,
        total_airframes: 18,
        avg_readiness_pct: 82,
      },
    ],
  },
  loadHangar: vi.fn(),
  bases: [],
  loadBases: vi.fn(),
  rebaseSquadron: vi.fn(),
};

function setup(overrides: Record<string, unknown> = {}) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store)
  );
  return render(
    <MemoryRouter initialEntries={["/campaign/1/hangar"]}>
      <Routes>
        <Route path="/campaign/:id/hangar" element={<HangarPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("HangarPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders Hangar title", () => {
    setup();
    expect(screen.getByText(/^Hangar$/)).toBeTruthy();
  });

  it("shows summary tab by default", () => {
    setup();
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
  });

  it("renders squadron count + airframes header", () => {
    setup();
    expect(screen.getAllByText(/1 sqns/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/18 airframes/).length).toBeGreaterThan(0);
  });
});
