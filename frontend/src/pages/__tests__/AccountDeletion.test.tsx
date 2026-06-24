import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccountDeletion } from "../AccountDeletion";

describe("AccountDeletion", () => {
  it("renders the title and both in-app and email deletion methods", () => {
    render(<MemoryRouter><AccountDeletion /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /delete your account/i })).toBeInTheDocument();
    // In-app method
    expect(screen.getByRole("heading", { name: /in-app/i })).toBeInTheDocument();
    expect(screen.getByText(/Delete Account/)).toBeInTheDocument();
    // Email method
    expect(screen.getByRole("heading", { name: /by email/i })).toBeInTheDocument();
    expect(screen.getByText(/thetinkerer018@gmail\.com/)).toBeInTheDocument();
  });
});
