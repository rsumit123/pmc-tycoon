import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Stepper } from "../Stepper";

describe("Stepper", () => {
  it("renders current value with formatter and suffix", () => {
    render(
      <Stepper
        value={50000}
        onChange={() => {}}
        formatValue={(v) => v.toLocaleString()}
        unitSuffix=" cr"
        ariaLabel="R&D allocation"
      />,
    );
    expect(screen.getByText(/50,000 cr/)).toBeInTheDocument();
  });

  it("calls onChange(+step) when + is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} />);
    fireEvent.click(screen.getByLabelText(/increment/i));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("calls onChange(-step) when - is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} />);
    fireEvent.click(screen.getByLabelText(/decrement/i));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("clamps to max", () => {
    const onChange = vi.fn();
    render(<Stepper value={98} onChange={onChange} step={5} max={100} />);
    fireEvent.click(screen.getByLabelText(/increment/i));
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("clamps to min", () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} step={5} min={0} />);
    fireEvent.click(screen.getByLabelText(/decrement/i));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("disables + at max", () => {
    render(<Stepper value={100} onChange={() => {}} step={5} max={100} />);
    expect(screen.getByLabelText(/increment/i)).toBeDisabled();
  });

  it("disables both at disabled", () => {
    render(<Stepper value={50} onChange={() => {}} disabled />);
    expect(screen.getByLabelText(/increment/i)).toBeDisabled();
    expect(screen.getByLabelText(/decrement/i)).toBeDisabled();
  });

  it("ArrowUp key increments", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} ariaLabel="Test stepper" />);
    const root = screen.getByLabelText("Test stepper");
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(15);
  });
});
