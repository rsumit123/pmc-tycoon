import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectiveScoreCard } from "../ObjectiveScoreCard";

const objectives = [
  { id: "amca_operational_by_2035", name: "Operational AMCA Mk1 squadron by 2035", status: "pass" as const },
  { id: "maintain_42_squadrons", name: "Maintain 42+ fighter squadron strength", status: "fail" as const },
  { id: "no_territorial_loss", name: "No loss of sovereign territory", status: "unknown" as const },
];

describe("ObjectiveScoreCard", () => {
  it("renders all objectives with labels", () => {
    render(<ObjectiveScoreCard objectives={objectives} />);
    expect(screen.getByText(/AMCA Mk1/)).toBeTruthy();
    expect(screen.getByText(/42\+/)).toBeTruthy();
    expect(screen.getByText(/sovereign territory/)).toBeTruthy();
  });

  it("renders pass/fail badges", () => {
    render(<ObjectiveScoreCard objectives={objectives} />);
    expect(screen.getByText("PASS")).toBeTruthy();
    expect(screen.getByText("FAIL")).toBeTruthy();
  });
});
