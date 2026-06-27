import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectiveTracker } from "../ObjectiveTracker";
import type { ObjectiveProgressEntry } from "../../../lib/types";

const ENTRIES: ObjectiveProgressEntry[] = [
  { id: "maintain_42_squadrons", name: "Maintain 42+ squadrons", status: "in_progress", progress: 0.5, detail: "21/42 squadrons" },
  { id: "budget_discipline", name: "Maintain fiscal discipline", status: "at_risk", progress: 0, detail: "Treasury depleted" },
  { id: "modernize_fleet", name: "Modernize fleet", status: "met", progress: 1, detail: "60% 4.5-gen+" },
];

describe("ObjectiveTracker", () => {
  it("renders each objective with name, detail and a status label", () => {
    render(<ObjectiveTracker objectives={ENTRIES} />);
    expect(screen.getByText("Maintain 42+ squadrons")).toBeInTheDocument();
    expect(screen.getByText("21/42 squadrons")).toBeInTheDocument();
    expect(screen.getByText(/at risk/i)).toBeInTheDocument();
    expect(screen.getByText(/met/i)).toBeInTheDocument();
  });

  it("renders an empty hint when there are no objectives", () => {
    render(<ObjectiveTracker objectives={[]} />);
    expect(screen.getByText(/no objectives/i)).toBeInTheDocument();
  });
});
