import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiplomacyStrip } from "../DiplomacyStrip";

describe("DiplomacyStrip", () => {
  it("renders all supplier nations", () => {
    render(<DiplomacyStrip />);
    expect(screen.getByText("France")).toBeTruthy();
    expect(screen.getByText("Russia")).toBeTruthy();
    expect(screen.getByText("United States")).toBeTruthy();
    expect(screen.getByText("Israel")).toBeTruthy();
  });

  it("renders relation levels", () => {
    render(<DiplomacyStrip />);
    const allies = screen.getAllByText("allied");
    expect(allies.length).toBeGreaterThanOrEqual(2);
  });
});
