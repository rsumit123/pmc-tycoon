import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Term } from "../Term";

describe("Term", () => {
  it("renders its children", () => {
    render(<Term k="bvr">BVR</Term>);
    expect(screen.getByText("BVR")).toBeInTheDocument();
  });

  it("opens a definition popover on tap and closes on second tap", () => {
    render(<Term k="roe">ROE</Term>);
    const trigger = screen.getByRole("button", { name: /define ROE/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText(/how aggressively/i)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders plain text (no trigger) for an unknown key", () => {
    render(<Term k="nope">Nope</Term>);
    expect(screen.getByText("Nope")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
