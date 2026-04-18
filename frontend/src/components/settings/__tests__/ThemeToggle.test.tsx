import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to STD theme", () => {
    render(<ThemeToggle />);
    expect(screen.getByText("STD")).toBeDefined();
  });

  it("toggles to CRT on click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText("STD"));
    expect(screen.getByText("CRT")).toBeDefined();
    expect(document.documentElement.getAttribute("data-theme")).toBe("crt");
  });

  it("persists theme preference", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText("STD"));
    expect(localStorage.getItem("sovereign-shield-theme")).toBe("crt");
  });
});
