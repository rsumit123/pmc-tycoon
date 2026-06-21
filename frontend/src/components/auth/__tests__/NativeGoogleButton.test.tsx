import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signIn = vi.fn();
const initialize = vi.fn();
vi.mock("@codetrix-studio/capacitor-google-auth", () => ({
  GoogleAuth: { initialize: (...a: unknown[]) => initialize(...a), signIn: () => signIn() },
}));

import { NativeGoogleButton } from "../NativeGoogleButton";

describe("NativeGoogleButton", () => {
  beforeEach(() => { signIn.mockReset(); initialize.mockReset(); });

  it("calls onCredential with the idToken from GoogleAuth.signIn", async () => {
    signIn.mockResolvedValueOnce({ authentication: { idToken: "tok-123" } });
    const onCredential = vi.fn();
    render(<NativeGoogleButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith("tok-123"));
  });

  it("shows an error and does not call onCredential when sign-in throws", async () => {
    signIn.mockRejectedValueOnce(new Error("cancelled"));
    const onCredential = vi.fn();
    render(<NativeGoogleButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(screen.getByText(/sign-in failed: cancelled/i)).toBeInTheDocument());
    expect(onCredential).not.toHaveBeenCalled();
  });
});
