import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Loader } from "../Loader";

describe("Loader", () => {
  it("renders the status role with the given label", () => {
    render(<Loader label="Loading map" />);
    const status = screen.getByRole("status", { name: "Loading map" });
    expect(status).toBeInTheDocument();
    expect(status.textContent).toContain("Loading map");
  });

  it("defaults to a sensible label", () => {
    render(<Loader />);
    expect(screen.getByRole("status", { name: /establishing uplink/i })).toBeInTheDocument();
  });
});
