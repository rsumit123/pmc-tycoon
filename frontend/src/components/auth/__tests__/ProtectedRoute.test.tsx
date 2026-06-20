import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../ProtectedRoute";
import { useAuthStore } from "../../../store/authStore";

function tree(initial: string) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/secret" element={<div>SECRET</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.getState().logout(); });

  it("redirects to /login when unauthenticated", () => {
    render(tree("/secret"));
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("renders child when authenticated", () => {
    useAuthStore.getState().setTokens("a", "r");
    render(tree("/secret"));
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });
});
