import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergingAceCard } from "../EmergingAceCard";
import type { AceSummary } from "../../../lib/types";

const ace: AceSummary = {
  squadron_id: 17,
  squadron_name: "17 Sqn Golden Arrows",
  platform_id: "rafale_f4",
  ace_name: "Sqn Ldr Rao 'Vajra'",
  awarded_year: 2031,
  awarded_quarter: 3,
};

describe("EmergingAceCard", () => {
  it("renders squadron name and ace name", () => {
    render(<EmergingAceCard ace={ace} />);
    expect(screen.getByText(/17 Sqn Golden Arrows/)).toBeTruthy();
    expect(screen.getByText(/Sqn Ldr Rao/)).toBeTruthy();
  });

  it("renders platform and year", () => {
    render(<EmergingAceCard ace={ace} />);
    expect(screen.getByText(/rafale_f4/)).toBeTruthy();
    expect(screen.getByText(/2031/)).toBeTruthy();
  });
});
