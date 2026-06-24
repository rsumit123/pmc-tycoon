import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PrivacyPolicy } from "../PrivacyPolicy";

describe("PrivacyPolicy", () => {
  it("renders the title, the OpenRouter disclosure, and the contact email", () => {
    render(<MemoryRouter><PrivacyPolicy /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getAllByText(/OpenRouter/).length).toBeGreaterThan(0);
    expect(screen.getByText(/large-language-model provider/i)).toBeInTheDocument();
    const emails = screen.getAllByText(/thetinkerer018@gmail\.com/);
    expect(emails.length).toBeGreaterThan(0);
  });
});
