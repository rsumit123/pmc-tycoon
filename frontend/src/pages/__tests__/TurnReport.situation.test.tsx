import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TurnReport } from "../TurnReport";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({ useCampaignStore: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "1", year: "2027", quarter: "2" }), useNavigate: () => vi.fn() };
});

function mockStore(over: Record<string, unknown> = {}) {
  const store = {
    turnReport: { campaign_id: 1, year: 2027, quarter: 2, events: [], deliveries: [], rd_milestones: [], adversary_shifts: [], intel_cards: [], vignette_fired: null, treasury_after_cr: 44000, allocation: null },
    loadTurnReport: vi.fn().mockResolvedValue(undefined),
    objectiveProgress: [{ id: "budget_discipline", name: "Fiscal discipline", status: "at_risk", progress: 0, detail: "Treasury depleted" }],
    loadObjectiveProgress: vi.fn().mockResolvedValue(undefined),
    notifications: [{ id: "n1", kind: "low_stock", severity: "warning", title: "Meteor low at Ambala", body: "reorder", action_url: "/campaign/1/procurement" }],
    loadNotifications: vi.fn().mockResolvedValue(undefined),
    readNotificationIds: new Set<string>(),
    pendingVignettes: [],
    campaign: null,
    loadCampaign: vi.fn().mockResolvedValue(undefined),
    loadBases: vi.fn().mockResolvedValue(undefined),
    loadPlatforms: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((sel: (s: typeof store) => unknown) => sel(store));
  return store;
}

describe("TurnReport situation report", () => {
  it("shows objective standing + a needs-attention warning row", async () => {
    mockStore();
    render(<MemoryRouter><TurnReport /></MemoryRouter>);
    expect(await screen.findByText(/needs your attention/i)).toBeInTheDocument();
    expect(screen.getByText(/Meteor low at Ambala/i)).toBeInTheDocument();
  });

  it("hides needs-attention when there are no warnings", async () => {
    mockStore({ notifications: [{ id: "n2", kind: "rd_completed", severity: "info", title: "X complete", body: "", action_url: "/x" }] });
    render(<MemoryRouter><TurnReport /></MemoryRouter>);
    await screen.findByText(/turn report|situation/i).catch(() => {});
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument();
  });
});
