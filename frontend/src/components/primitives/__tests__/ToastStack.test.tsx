import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastStack } from "../ToastStack";
import { useCampaignStore } from "../../../store/campaignStore";

vi.mock("../../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

describe("ToastStack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders no toasts when store is empty", () => {
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: { toasts: unknown[]; dismissToast: () => void }) => unknown) =>
        sel({ toasts: [], dismissToast: vi.fn() })
    );
    const { container } = render(<ToastStack />);
    expect(container.querySelectorAll("[role='status']").length).toBe(0);
  });

  it("renders each toast with its message", () => {
    const store = {
      toasts: [
        { id: "a", variant: "success", message: "Squadron rebased to Ambala" },
        { id: "b", variant: "warning", message: "Budget exceeded" },
      ],
      dismissToast: vi.fn(),
    };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store)
    );
    render(<ToastStack />);
    expect(screen.getByText("Squadron rebased to Ambala")).toBeTruthy();
    expect(screen.getByText("Budget exceeded")).toBeTruthy();
  });

  it("calls dismissToast when toast is clicked", () => {
    const dismiss = vi.fn();
    const store = {
      toasts: [{ id: "x", variant: "info", message: "Hello" }],
      dismissToast: dismiss,
    };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store)
    );
    render(<ToastStack />);
    screen.getByText("Hello").click();
    expect(dismiss).toHaveBeenCalledWith("x");
  });
});
