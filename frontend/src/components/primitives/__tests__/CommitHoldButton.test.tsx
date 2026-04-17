import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CommitHoldButton } from "../CommitHoldButton";

describe("CommitHoldButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onCommit only after holdMs", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={1000} label="Commit" />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels on early release", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={1000} />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(btn, { pointerId: 1 });
    vi.advanceTimersByTime(1000);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("disabled prevents commit", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={100} disabled />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
