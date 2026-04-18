import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HowToPlayGuide } from "../HowToPlayGuide";

describe("HowToPlayGuide", () => {
  it("renders heading when open=true", () => {
    const onClose = vi.fn();
    render(<HowToPlayGuide open={true} onClose={onClose} />);
    expect(screen.getByText("How to Play")).toBeInTheDocument();
  });

  it("returns null when open=false", () => {
    const onClose = vi.fn();
    const { container } = render(
      <HowToPlayGuide open={false} onClose={onClose} />
    );
    expect(screen.queryByText("How to Play")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("calls onClose when Got it button is clicked", async () => {
    const onClose = vi.fn();
    render(<HowToPlayGuide open={true} onClose={onClose} />);
    const button = screen.getByText("Got it");
    await userEvent.click(button);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
