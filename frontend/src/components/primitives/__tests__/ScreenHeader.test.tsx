import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScreenHeader } from "../ScreenHeader";

describe("ScreenHeader", () => {
  it("renders the title + subtitle and a back link to the given route", () => {
    render(
      <MemoryRouter>
        <ScreenHeader title="Hangar" subtitle="34 sqns · 534 airframes" backTo="/campaign/1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Hangar")).toBeInTheDocument();
    expect(screen.getByText("34 sqns · 534 airframes")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /back to map/i });
    expect(back).toHaveAttribute("href", "/campaign/1");
  });

  it("supports a custom back label", () => {
    render(
      <MemoryRouter>
        <ScreenHeader title="Strike AAR" backTo="/campaign/1/ops" backLabel="Ops" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /back to ops/i })).toHaveAttribute("href", "/campaign/1/ops");
  });
});
