import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { YearEndRecapToast } from "../YearEndRecapToast";
import { useCampaignStore } from "../../../store/campaignStore";

describe("YearEndRecapToast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    useCampaignStore.getState().reset();
  });

  afterEach(() => vi.useRealTimers());

  it("renders nothing when yearRecapToast is null", () => {
    const { container } = render(<YearEndRecapToast />);
    expect(container.textContent).toBe("");
  });

  it("renders toast text when yearRecapToast is set", () => {
    useCampaignStore.setState({ yearRecapToast: "IAF held the line in 2028." });
    render(<YearEndRecapToast />);
    expect(screen.getByText(/IAF held the line/)).toBeTruthy();
  });

  it("auto-dismisses after 8 seconds", () => {
    useCampaignStore.setState({ yearRecapToast: "recap text" });
    render(<YearEndRecapToast />);
    expect(screen.getByText(/recap text/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByText(/recap text/)).toBeNull();
  });

  it("dismisses on click", async () => {
    useCampaignStore.setState({ yearRecapToast: "click to dismiss" });
    render(<YearEndRecapToast />);
    const el = screen.getByText(/click to dismiss/);
    await act(async () => el.click());
    expect(screen.queryByText(/click to dismiss/)).toBeNull();
  });
});
