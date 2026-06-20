import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, api } from "../api";
import { useAuthStore } from "../../store/authStore";

describe("auth api + interceptors", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    vi.restoreAllMocks();
  });

  it("signup posts and returns tokens", async () => {
    vi.spyOn(http, "post").mockResolvedValueOnce({
      data: { access_token: "a", refresh_token: "r", token_type: "bearer",
              user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" } },
    } as never);
    const res = await api.signup("a@b.com", "pw123456", "A");
    expect(res.access_token).toBe("a");
  });

  it("request interceptor attaches bearer when authenticated", () => {
    useAuthStore.getState().setTokens("tok123", "ref123");
    const cfg = { headers: {} as Record<string, string> };
    const handler = (http.interceptors.request as unknown as { handlers: { fulfilled: (c: typeof cfg) => typeof cfg }[] }).handlers[0].fulfilled;
    const out = handler(cfg);
    expect(out.headers.Authorization).toBe("Bearer tok123");
  });
});
