import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";

describe("Login", () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

  it("renders email + password fields", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("logs in via email/password and stores auth", async () => {
    vi.spyOn(api, "login").mockResolvedValueOnce({
      access_token: "a", refresh_token: "r", token_type: "bearer",
      user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" },
    });
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw123456" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
  });
});
