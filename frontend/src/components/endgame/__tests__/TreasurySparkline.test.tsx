import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TreasurySparkline } from "../TreasurySparkline";
import type { YearSnapshot } from "../../../lib/types";

const snapshots: YearSnapshot[] = [
  { year: 2026, end_treasury_cr: 600000, vignettes_resolved: 0, vignettes_won: 0, deliveries: 0, rd_completions: 0 },
  { year: 2027, end_treasury_cr: 500000, vignettes_resolved: 1, vignettes_won: 1, deliveries: 2, rd_completions: 0 },
  { year: 2028, end_treasury_cr: 450000, vignettes_resolved: 2, vignettes_won: 1, deliveries: 3, rd_completions: 1 },
];

describe("TreasurySparkline", () => {
  it("renders an SVG with a polyline for treasury", () => {
    const { container } = render(<TreasurySparkline snapshots={snapshots} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const polyline = svg?.querySelector("polyline");
    expect(polyline).toBeTruthy();
  });

  it("renders year labels", () => {
    const { container } = render(<TreasurySparkline snapshots={snapshots} />);
    expect(container.textContent).toContain("2026");
    expect(container.textContent).toContain("2028");
  });

  it("handles empty snapshots gracefully", () => {
    const { container } = render(<TreasurySparkline snapshots={[]} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
