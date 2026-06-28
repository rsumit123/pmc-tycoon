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
    loadCampaignList: vi.fn().mockResolvedValue(undefined),
    loadObjectivesCatalog: vi.fn().mockResolvedValue(undefined),
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
    // handleStart reads useCampaignStore.getState().campaign after creating —
    // stub it so the floating promise doesn't throw on the mocked store.
    (useCampaignStore as unknown as { getState: () => typeof store }).getState = () => store;
    return render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
  }

  it("renders title 'Chakravyuh'", async () => {
    setup(makeStore());
    // listLoaded flips after loadCampaignList() resolves; await past the Loader gate.
    expect(await screen.findByText("Chakravyuh")).toBeTruthy();
  });

  it("shows new campaign form when no existing campaigns", async () => {
    setup(makeStore({ campaignList: [] }));
    // Quick Start is always visible; the custom fields are behind a disclosure.
    expect(await screen.findByRole("button", { name: /quick start/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /custom/i }));
    expect(screen.getByText("Assume Command")).toBeTruthy();
    // objective buttons visible once expanded
    expect(screen.getByText("Objective Alpha")).toBeTruthy();
  });

  it("shows resume buttons for existing campaigns", async () => {
    setup(makeStore({ campaignList: mockCampaigns }));
    expect(await screen.findByText("Test Campaign Alpha")).toBeTruthy();
    expect(screen.getByText("Resume Campaign")).toBeTruthy();
  });

  it("disables start button until 3 objectives are selected", async () => {
    setup(makeStore({ campaignList: [] }));

    // Expand the custom-setup disclosure to reach difficulty/objectives/Assume Command.
    fireEvent.click(await screen.findByRole("button", { name: /custom/i }));
    const startBtn = (await screen.findByText("Assume Command")) as HTMLButtonElement;
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

  it("Quick Start creates a Story-mode campaign with 3 beginner objectives", async () => {
    const createCampaign = vi.fn().mockResolvedValue(undefined);
    setup(makeStore({ campaignList: [], createCampaign }));
    const quick = await screen.findByRole("button", { name: /quick start/i });
    fireEvent.click(quick);
    expect(createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        difficulty: "story",
        objectives: expect.arrayContaining(["maintain_42_squadrons", "modernize_fleet", "budget_discipline"]),
      }),
    );
  });
});
