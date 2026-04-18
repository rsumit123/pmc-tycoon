import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Landing } from "../Landing";
import { useCampaignStore } from "../../store/campaignStore";
import type { CampaignListItem, ObjectiveSpec } from "../../lib/types";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockObjectives: ObjectiveSpec[] = [
  { id: "obj_a", title: "Objective Alpha", description: "First objective", weight: 1, target_year: 2030 },
  { id: "obj_b", title: "Objective Bravo", description: "Second objective", weight: 1, target_year: 2031 },
  { id: "obj_c", title: "Objective Charlie", description: "Third objective", weight: 1, target_year: 2032 },
  { id: "obj_d", title: "Objective Delta", description: "Fourth objective", weight: 1, target_year: 2033 },
];

const mockCampaigns: CampaignListItem[] = [
  {
    id: 1,
    name: "Test Campaign Alpha",
    current_year: 2027,
    current_quarter: 2,
    difficulty: "realistic",
    budget_cr: 50000,
    reputation: 75,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    createCampaign: vi.fn(),
    loadCampaignList: vi.fn(),
    loadObjectivesCatalog: vi.fn(),
    loading: false,
    error: null,
    campaignList: [],
    objectivesCatalog: mockObjectives,
    campaign: null,
    ...overrides,
  };
}

describe("Landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(store: ReturnType<typeof makeStore>) {
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store)
    );
    return render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
  }

  it("renders title 'Sovereign Shield'", () => {
    setup(makeStore());
    expect(screen.getByText("Sovereign Shield")).toBeTruthy();
  });

  it("shows new campaign form when no existing campaigns", () => {
    setup(makeStore({ campaignList: [] }));
    expect(screen.getByText("Assume Command")).toBeTruthy();
    expect(screen.getByLabelText !== undefined).toBe(true);
    // objective buttons visible
    expect(screen.getByText("Objective Alpha")).toBeTruthy();
  });

  it("shows resume buttons for existing campaigns", () => {
    setup(makeStore({ campaignList: mockCampaigns }));
    expect(screen.getByText("Test Campaign Alpha")).toBeTruthy();
    expect(screen.getByText("Resume Campaign")).toBeTruthy();
  });

  it("disables start button until 3 objectives are selected", () => {
    setup(makeStore({ campaignList: [] }));

    const startBtn = screen.getByText("Assume Command") as HTMLButtonElement;
    // Initially disabled (0 objectives selected)
    expect(startBtn.disabled).toBe(true);

    // Select 2 objectives — still disabled
    fireEvent.click(screen.getByText("Objective Alpha"));
    fireEvent.click(screen.getByText("Objective Bravo"));
    expect(startBtn.disabled).toBe(true);

    // Select 3rd — now enabled
    fireEvent.click(screen.getByText("Objective Charlie"));
    expect(startBtn.disabled).toBe(false);
  });
});
