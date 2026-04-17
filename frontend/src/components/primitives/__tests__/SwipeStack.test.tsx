import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { SwipeStack } from "../SwipeStack";

describe("SwipeStack", () => {
  it("dismisses a card with a rightward drag past threshold", () => {
    const onDismiss = vi.fn();
    render(
      <SwipeStack
        items={[{ id: 1, label: "A" }, { id: 2, label: "B" }]}
        renderCard={(i) => <div data-testid={`card-${i.id}`}>{i.label}</div>}
        onDismiss={onDismiss}
      />,
    );
    const top = screen.getByTestId("card-1").parentElement!;
    fireEvent.pointerDown(top, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(top, { pointerId: 1, clientX: 200, clientY: 105 });
    fireEvent.pointerUp(top,   { pointerId: 1, clientX: 200, clientY: 105 });
    expect(onDismiss).toHaveBeenCalledWith(
      { id: 1, label: "A" }, "right",
    );
  });

  it("snaps back if drag is under threshold", () => {
    const onDismiss = vi.fn();
    render(
      <SwipeStack
        items={[{ id: 1, label: "A" }]}
        renderCard={(i) => <div data-testid="card">{i.label}</div>}
        onDismiss={onDismiss}
      />,
    );
    const card = screen.getByTestId("card").parentElement!;
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(card,   { pointerId: 1, clientX: 140, clientY: 100 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders empty state when no items", () => {
    render(
      <SwipeStack
        items={[]}
        renderCard={() => <div>never</div>}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/no more/i)).toBeInTheDocument();
  });
});
