import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ADContributionPanel } from "../ADContribution";
import type { VignetteOutcome } from "../../../lib/types";

const baseOutcome: VignetteOutcome = {
  ind_kia: 0, adv_kia: 0, ind_airframes_lost: 0, adv_airframes_lost: 0,
  objective_met: true, roe: "weapons_free",
  support: { awacs: false, tanker: false, sead_package: false },
};

describe("ADContributionPanel", () => {
  it("renders rows and totals with 2 contributions", () => {
    const outcome: VignetteOutcome = {
      ...baseOutcome,
      ad_contributions: [
        { battery_id: 1, system: "S-400", base_name: "Pathankot", interceptors_fired: 6, kills: 4 },
        { battery_id: 2, system: "Akash-NG", base_name: "Adampur", interceptors_fired: 10, kills: 5 },
      ],
    };
    render(<ADContributionPanel outcome={outcome} />);
    expect(screen.getByText(/AD Performance/i)).toBeInTheDocument();
    // Totals: 9 kills / 16 fired
    expect(screen.getByText(/9 intercepts \/ 16 interceptors fired/i)).toBeInTheDocument();
    expect(screen.getByText("S-400")).toBeInTheDocument();
    expect(screen.getByText("Akash-NG")).toBeInTheDocument();
    expect(screen.getByText("Pathankot")).toBeInTheDocument();
    expect(screen.getByText("Adampur")).toBeInTheDocument();
  });

  it("returns null when ad_contributions is empty", () => {
    const { container } = render(<ADContributionPanel outcome={{ ...baseOutcome, ad_contributions: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when ad_contributions is undefined", () => {
    const { container } = render(<ADContributionPanel outcome={baseOutcome} />);
    expect(container.firstChild).toBeNull();
  });
});
