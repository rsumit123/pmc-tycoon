import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../authStore";
import type { TokenResponse } from "../../lib/types";

const sample: TokenResponse = {
  access_token: "acc", refresh_token: "ref", token_type: "bearer",
  user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" },
};

describe("authStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("setAuth populates user + tokens and persists", () => {
    useAuthStore.getState().setAuth(sample);
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.accessToken).toBe("acc");
    expect(s.user?.email).toBe("a@b.com");
    expect(localStorage.getItem("ss_tokens")).toContain("acc");
  });

  it("logout clears state + storage", () => {
    useAuthStore.getState().setAuth(sample);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("ss_tokens")).toBeNull();
  });

  it("hydrates from localStorage on init via loadFromStorage", () => {
    localStorage.setItem("ss_tokens", JSON.stringify({ access_token: "x", refresh_token: "y" }));
    localStorage.setItem("ss_user", JSON.stringify(sample.user));
    useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().accessToken).toBe("x");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
