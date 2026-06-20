import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";
import { useAuthStore } from "../../store/authStore";

describe("Login (Google-only)", () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

  it("renders the Chakravyuh brand and a Google sign-in prompt", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByText("Chakravyuh")).toBeInTheDocument();
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });

  it("does not render email/password fields", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /sign in|create account/i })).toBeNull();
  });
});
