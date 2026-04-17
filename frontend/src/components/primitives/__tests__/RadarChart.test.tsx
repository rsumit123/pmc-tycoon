import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RadarChart } from "../RadarChart";

describe("RadarChart", () => {
  it("renders one axis label per axis", () => {
    const { getByText } = render(
      <RadarChart axes={[
        { label: "Radius", value: 0.8 },
        { label: "Payload", value: 0.6 },
        { label: "Radar", value: 0.7 },
      ]} />,
    );
    expect(getByText("Radius")).toBeInTheDocument();
    expect(getByText("Payload")).toBeInTheDocument();
    expect(getByText("Radar")).toBeInTheDocument();
  });

  it("renders an svg polygon for the data shape", () => {
    const { container } = render(
      <RadarChart axes={[
        { label: "A", value: 1 },
        { label: "B", value: 1 },
        { label: "C", value: 1 },
      ]} />,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon).not.toBeNull();
    const pts = polygon!.getAttribute("points")!.trim().split(/\s+/);
    expect(pts).toHaveLength(3);
  });

  it("clamps values to 0..1", () => {
    const { container } = render(
      <RadarChart axes={[
        { label: "A", value: -0.5 },
        { label: "B", value: 1.5 },
        { label: "C", value: 0.3 },
      ]} />,
    );
    const polygon = container.querySelector("polygon")!;
    const pts = polygon.getAttribute("points")!.trim().split(/\s+/);
    for (const p of pts) {
      const [x, y] = p.split(",").map(parseFloat);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});
