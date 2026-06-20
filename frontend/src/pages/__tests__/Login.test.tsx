import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";
import { useAuthStore } from "../../store/authStore";

const isNativePlatform = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock("@codetrix-studio/capacitor-google-auth", () => ({
  GoogleAuth: { initialize: vi.fn(), signIn: vi.fn() },
}));

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

  it("renders the native Google button on a native platform", async () => {
    isNativePlatform.mockReturnValue(true);
    const { Login: NativeLogin } = await import("../Login");
    render(<MemoryRouter><NativeLogin /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    isNativePlatform.mockReturnValue(false);
  });
});
