import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DeleteAccountButton } from "../DeleteAccountButton";
import { api } from "../../../lib/api";
import { useAuthStore } from "../../../store/authStore";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("DeleteAccountButton", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("deletes the account, logs out, and navigates to /login on confirm", async () => {
    const deleteSpy = vi.spyOn(api, "deleteAccount").mockResolvedValue(undefined);
    const logoutSpy = vi.spyOn(useAuthStore.getState(), "logout").mockImplementation(() => {});

    render(<MemoryRouter><DeleteAccountButton /></MemoryRouter>);

    // Step 1: reveal confirmation
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    // Step 2: confirm
    fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });

  it("shows an error and does not navigate when deletion fails", async () => {
    vi.spyOn(api, "deleteAccount").mockRejectedValue(new Error("boom"));
    const logoutSpy = vi.spyOn(useAuthStore.getState(), "logout").mockImplementation(() => {});

    render(<MemoryRouter><DeleteAccountButton /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));

    await waitFor(() => expect(screen.getByText(/could not delete account/i)).toBeInTheDocument());
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
