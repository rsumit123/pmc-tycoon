import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HowToPlayGuide } from "../HowToPlayGuide";

describe("HowToPlayGuide", () => {
  it("renders the casual-path note and does NOT call J-20/J-35 player-procurable", () => {
    render(<MemoryRouter><HowToPlayGuide open onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/you can win/i)).toBeInTheDocument();
    expect(screen.getByText(/adversary stealth fighters \(J-20\/J-35\)/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /glossary/i })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<MemoryRouter><HowToPlayGuide open={false} onClose={vi.fn()} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
