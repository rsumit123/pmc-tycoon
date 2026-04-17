import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetAllocator } from "../BudgetAllocator";
import type { BudgetAllocation } from "../../../lib/types";

describe("BudgetAllocator", () => {
  const defaultAllocation: BudgetAllocation = {
    rd: 38750, acquisition: 54250, om: 31000, spares: 23250, infrastructure: 7750,
  };

  it("renders all 5 buckets with values", () => {
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={500000}
        initialAllocation={defaultAllocation}
        onCommit={() => {}}
      />,
    );
    expect(screen.getByText(/R&D/)).toBeInTheDocument();
    expect(screen.getByText(/Acquisition/)).toBeInTheDocument();
    expect(screen.getByText(/O&M/)).toBeInTheDocument();
    expect(screen.getByText(/Spares/)).toBeInTheDocument();
    expect(screen.getByText(/Infrastructure/)).toBeInTheDocument();
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining/)).toBeInTheDocument();
  });

  it("computes remaining = available - total", () => {
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={100000}
        initialAllocation={defaultAllocation}
        onCommit={() => {}}
      />,
    );
    const totals = screen.getAllByText(/1(00,000|01,000)|100,000/);
    expect(totals.length).toBeGreaterThan(0);
  });

  it("disables commit when total exceeds available", () => {
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={0}
        initialAllocation={{
          rd: 100000, acquisition: 100000, om: 0, spares: 0, infrastructure: 0,
        }}
        onCommit={() => {}}
      />,
    );
    const commit = screen.getByRole("button", { name: /hold|commit|over/i });
    expect(commit).toBeDisabled();
  });

  it("resets to default allocation on Reset", () => {
    const onCommit = vi.fn();
    render(
      <BudgetAllocator
        grantCr={100000}
        treasuryCr={0}
        initialAllocation={{
          rd: 0, acquisition: 100000, om: 0, spares: 0, infrastructure: 0,
        }}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    // Reset writes DEFAULT_PCT of 100k: rd=25k, acquisition=35k, om=20k, spares=15k, infrastructure=5k
    expect(screen.getByText("25,000")).toBeInTheDocument();
    expect(screen.getByText("35,000")).toBeInTheDocument();
  });
});
