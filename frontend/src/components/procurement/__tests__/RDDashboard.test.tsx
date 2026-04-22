import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RDDashboard } from "../RDDashboard";
import { useCampaignStore } from "../../../store/campaignStore";
import type { RDProgramSpec, RDProgramState } from "../../../lib/types";

vi.mock("../../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const catalog: RDProgramSpec[] = [
  {
    id: "amca_mk1", name: "AMCA Mk1", description: "5th-gen stealth fighter.",
    base_duration_quarters: 36, base_cost_cr: 150000, dependencies: [],
  },
  {
    id: "astra_mk2", name: "Astra Mk2", description: "240km BVR AAM.",
    base_duration_quarters: 4, base_cost_cr: 8000, dependencies: [],
  },
];

const activeWithProj: RDProgramState[] = [
  {
    id: 1, program_id: "amca_mk1", status: "active", progress_pct: 25,
    cost_invested_cr: 30000, funding_level: "standard",
    milestones_hit: [1], quarters_active: 9,
    projections: {
      slow: { completion_year: 2036, completion_quarter: 2, quarters_remaining: 54, quarterly_cost_cr: 2083 },
      standard: { completion_year: 2033, completion_quarter: 2, quarters_remaining: 27, quarterly_cost_cr: 4166 },
      accelerated: { completion_year: 2031, completion_quarter: 4, quarters_remaining: 20, quarterly_cost_cr: 6250 },
    },
  },
];

const defaultStore = {
  rdLoading: {},
  campaign: {
    id: 1, name: "Test", current_year: 2026, current_quarter: 4,
    current_allocation_json: { rd: 10000, om: 5000, spares: 5000, acquisition: 10000, infra: 2500 },
  } as any,
};

function setup(overrides: Record<string, unknown> = {}, activeOverride?: RDProgramState[]) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store),
  );
  return render(
    <RDDashboard
      catalog={catalog}
      active={activeOverride ?? activeWithProj}
      onStart={vi.fn()}
      onUpdate={vi.fn()}
    />,
  );
}

describe("RDDashboard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders budget banner with quarterly spend vs bucket", () => {
    setup();
    expect(screen.getByText(/Quarterly R&D spend/)).toBeTruthy();
    // The budget banner shows spend / bucket in a single span: "₹4,166 / ₹10,000 cr"
    expect(screen.getByText(/4,166.*\/.*10,000/)).toBeTruthy();
  });

  it("defaults to active tab when there are active programs", () => {
    setup();
    expect(screen.getByText("AMCA Mk1")).toBeTruthy();
    // Astra is catalog-only — not shown in active tab
    expect(screen.queryByText("Astra Mk2")).toBeNull();
  });

  it("switches to catalog tab on click and shows catalog programs", () => {
    setup();
    fireEvent.click(screen.getByText(/^Catalog \(/));
    expect(screen.getByText("Astra Mk2")).toBeTruthy();
  });

  it("hides active programs from the catalog tab", () => {
    setup();
    fireEvent.click(screen.getByText(/^Catalog \(/));
    // amca_mk1 is active — should not appear in catalog
    expect(screen.queryByText("AMCA Mk1")).toBeNull();
    expect(screen.getByText("Astra Mk2")).toBeTruthy();
  });

  it("shows loading spinner overlay when program is in rdLoading", () => {
    const { container } = setup({ rdLoading: { amca_mk1: true } });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("disables funding buttons during loading", () => {
    setup({ rdLoading: { amca_mk1: true } });
    const fundingBtns = screen.getAllByRole("button", { name: /Set funding/i });
    fundingBtns.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("filters catalog by Weapons category chip", () => {
    setup();
    fireEvent.click(screen.getByText(/^Catalog \(/));
    fireEvent.click(screen.getByRole("button", { name: /^Weapons/ }));
    // Astra Mk2 matches "astra" keyword → Weapons
    expect(screen.getByText("Astra Mk2")).toBeTruthy();
    // AMCA already hidden (it's active), but filter would also hide it
    expect(screen.queryByText("AMCA Mk1")).toBeNull();
  });

  it("empty Active tab shows helpful message", () => {
    setup({}, []);
    // With no active programs the component defaults to catalog tab; switch to active
    fireEvent.click(screen.getByText(/^Active \(/));
    expect(screen.getByText(/No R&D programs underway/i)).toBeTruthy();
  });

  it("shows over-budget warning when spend exceeds bucket", () => {
    // set rd bucket to 1000 so 4166 > 1000
    const overBudgetStore = {
      ...defaultStore,
      campaign: {
        ...defaultStore.campaign,
        current_allocation_json: { rd: 1000, om: 5000, spares: 5000, acquisition: 10000, infra: 2500 },
      },
    };
    setup(overBudgetStore as any);
    expect(screen.getByText(/Projected spend exceeds R&D budget/i)).toBeTruthy();
  });

  it("fires onStart when a catalog Start button is held", () => {
    const onStart = vi.fn();
    const store = { ...defaultStore };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store),
    );
    render(
      <RDDashboard
        catalog={catalog}
        active={[]}
        onStart={onStart}
        onUpdate={vi.fn()}
      />,
    );
    const startButtons = screen.getAllByRole("button", { name: /hold|start/i });
    const startBtn = startButtons[0];
    fireEvent.pointerDown(startBtn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onStart).toHaveBeenCalled();
    const [programId, fundingLevel] = onStart.mock.calls[0];
    expect(catalog.find((p) => p.id === programId)).toBeDefined();
    expect(["slow", "standard", "accelerated"]).toContain(fundingLevel);
  });

  it("fires onUpdate cancel when an active Cancel button is clicked", () => {
    const onUpdate = vi.fn();
    const store = { ...defaultStore };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store),
    );
    render(
      <RDDashboard
        catalog={catalog}
        active={activeWithProj}
        onStart={vi.fn()}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    const confirmBtn = screen.queryByRole("button", { name: /confirm cancel/i });
    if (confirmBtn) fireEvent.click(confirmBtn);
    expect(onUpdate).toHaveBeenCalledWith("amca_mk1", { status: "cancelled" });
  });

  it("sorts active programs by progress_pct descending", () => {
    const multiActive: RDProgramState[] = [
      {
        id: 1, program_id: "amca_mk1", status: "active", progress_pct: 10,
        cost_invested_cr: 5000, funding_level: "standard",
        milestones_hit: [], quarters_active: 3,
      },
      {
        id: 2, program_id: "astra_mk2", status: "active", progress_pct: 60,
        cost_invested_cr: 2000, funding_level: "slow",
        milestones_hit: [], quarters_active: 4,
      },
    ];
    setup({}, multiActive);
    // Each name is followed by an InfoButton ("i") in the same flex container,
    // so textContent is e.g. "Astra Mk2i". Match on trimmed prefix.
    const names = screen.getAllByText(/AMCA Mk1|Astra Mk2/)
      .map((el) => (el.textContent ?? "").replace(/i$/, "").trim());
    // Astra (60%) should appear before AMCA (10%)
    expect(names[0]).toBe("Astra Mk2");
    expect(names[1]).toBe("AMCA Mk1");
  });
});
