import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RDDashboard } from "../RDDashboard";
import type { RDProgramSpec, RDProgramState } from "../../../lib/types";

const catalog: RDProgramSpec[] = [
  { id: "amca_mk1", name: "AMCA Mk1", description: "5th-gen stealth fighter.",
    base_duration_quarters: 36, base_cost_cr: 150000, dependencies: [] },
  { id: "astra_mk2", name: "Astra Mk2", description: "240km BVR AAM.",
    base_duration_quarters: 4, base_cost_cr: 8000, dependencies: [] },
];

const active: RDProgramState[] = [
  { id: 1, program_id: "amca_mk1", progress_pct: 25, funding_level: "standard",
    status: "active", milestones_hit: [1], cost_invested_cr: 30000, quarters_active: 9 },
];

describe("RDDashboard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders active programs with progress + funding level", () => {
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("AMCA Mk1")).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
  });

  it("hides catalog entries for already-active programs", () => {
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getAllByText("Astra Mk2").length).toBeGreaterThan(0);
    const amcaEls = screen.getAllByText("AMCA Mk1");
    expect(amcaEls).toHaveLength(1);
  });

  it("fires onStart when a catalog Start button is held", () => {
    const onStart = vi.fn();
    render(
      <RDDashboard
        catalog={catalog}
        active={[]}
        onStart={onStart}
        onUpdate={() => {}}
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
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    const confirmBtn = screen.queryByRole("button", { name: /confirm cancel/i });
    if (confirmBtn) fireEvent.click(confirmBtn);
    expect(onUpdate).toHaveBeenCalledWith("amca_mk1", { status: "cancelled" });
  });
});
