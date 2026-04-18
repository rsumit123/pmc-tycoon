import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroOutcomeBanner } from "../HeroOutcomeBanner";
import type { VignetteOutcome } from "../../../lib/types";

const baseOutcome: VignetteOutcome = {
  ind_kia: 0, adv_kia: 0, ind_airframes_lost: 0, adv_airframes_lost: 0,
  objective_met: true, roe: "weapons_free",
  support: { awacs: false, tanker: false, sead_package: false },
};

describe("HeroOutcomeBanner", () => {
  it("shows Mission Success when objective_met", () => {
    render(<HeroOutcomeBanner outcome={{ ...baseOutcome, objective_met: true, ind_airframes_lost: 1, adv_airframes_lost: 4 }} scenarioName="Test" />);
    expect(screen.getByText("Mission Success")).toBeTruthy();
  });

  it("shows Mission Failure and F when objective failed", () => {
    render(<HeroOutcomeBanner outcome={{ ...baseOutcome, objective_met: false, ind_airframes_lost: 7, adv_airframes_lost: 1 }} scenarioName="Test" />);
    expect(screen.getByText("Mission Failure")).toBeTruthy();
    expect(screen.getByText("F")).toBeTruthy();
  });

  it("grade A when exchange heavily favors IAF", () => {
    render(<HeroOutcomeBanner outcome={{ ...baseOutcome, objective_met: true, ind_airframes_lost: 1, adv_airframes_lost: 6 }} scenarioName="Test" />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("grade C when ratio is unfavorable but objective met", () => {
    render(<HeroOutcomeBanner outcome={{ ...baseOutcome, objective_met: true, ind_airframes_lost: 3, adv_airframes_lost: 2 }} scenarioName="Test" />);
    expect(screen.getByText("C")).toBeTruthy();
  });
});
