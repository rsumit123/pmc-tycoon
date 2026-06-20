import { create } from "zustand";
import type { AuthUser, TokenResponse } from "../lib/types";

const TOKENS_KEY = "ss_tokens";
const USER_KEY = "ss_user";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (resp: TokenResponse) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (resp) => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({
      access_token: resp.access_token, refresh_token: resp.refresh_token,
    }));
    localStorage.setItem(USER_KEY, JSON.stringify(resp.user));
    set({ user: resp.user, accessToken: resp.access_token, refreshToken: resp.refresh_token, isAuthenticated: true });
  },

  setTokens: (access, refresh) => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ access_token: access, refresh_token: refresh }));
    set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem(TOKENS_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    try {
      const t = localStorage.getItem(TOKENS_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (!t) return;
      const tokens = JSON.parse(t);
      const user = u ? JSON.parse(u) : null;
      set({
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        user,
        isAuthenticated: Boolean(tokens.access_token),
      });
    } catch {
      /* ignore corrupt storage */
    }
  },
}));
