import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useLongPress } from "../useLongPress";

function Harness({
  onLongPress, onClick,
}: { onLongPress: () => void; onClick: () => void }) {
  const handlers = useLongPress({
    onLongPress,
    onClick,
    durationMs: 300,
  });
  return (
    <button data-testid="t" {...handlers}>hold me</button>
  );
}

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onLongPress after durationMs", () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={onClick} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(320);
    fireEvent.pointerUp(getByTestId("t"), { pointerId: 1 });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick for a short tap", () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={onClick} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(100);
    fireEvent.pointerUp(getByTestId("t"), { pointerId: 1 });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels when pointer leaves", () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={() => {}} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    fireEvent.pointerLeave(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
