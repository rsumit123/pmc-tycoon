import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoachMarks, type CoachStep } from "../CoachMarks";

const STEPS: CoachStep[] = [
  { targetId: "a", title: "Step A", body: "First" },
  { targetId: "missing", title: "Step B", body: "Second" },
];

describe("CoachMarks", () => {
  it("shows the first step, advances on Next, finishes on the last step", () => {
    const onDone = vi.fn();
    render(<CoachMarks steps={STEPS} onDone={onDone} />);
    expect(screen.getByText("Step A")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Step B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /done|finish/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("Skip calls onDone immediately", () => {
    const onDone = vi.fn();
    render(<CoachMarks steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
