import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetAllocator } from "../BudgetAllocator";

const baseProps = {
  grantCr: 45000,
  treasuryCr: 45000,
  initialAllocation: { rd: 11250, acquisition: 15750, om: 9000, spares: 6750, infrastructure: 2250 },
  onCommit: vi.fn(),
};

describe("BudgetAllocator presets", () => {
  it("shows preset buttons and applies Tech Rush split of the grant", () => {
    render(<BudgetAllocator {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /tech rush/i }));
    // Tech Rush = rd 40% of 45000 = 18000 — surfaced somewhere in the UI
    expect(screen.getAllByText(/18,000/).length).toBeGreaterThan(0);
  });

  it("hides the raw bucket steppers until Advanced is expanded", () => {
    render(<BudgetAllocator {...baseProps} />);
    expect(screen.queryByText(/infrastructure/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /advanced|customize/i }));
    expect(screen.getByText(/infrastructure/i)).toBeInTheDocument();
  });
});
