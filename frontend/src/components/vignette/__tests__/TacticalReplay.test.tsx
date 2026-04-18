import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TacticalReplay } from "../TacticalReplay";

const TRACE = [
  { t_min: 0, kind: "detection", advantage: "ind" },
  { t_min: 3, kind: "bvr_launch", side: "ind", weapon: "meteor", attacker_platform: "rafale_f4", target_platform: "j16", pk: 0.35, distance_km: 120 },
  { t_min: 3, kind: "kill", side: "ind", attacker_platform: "rafale_f4", victim_platform: "j16", weapon: "meteor" },
  { t_min: 12, kind: "egress", ind_survivors: 2, adv_survivors: 1 },
  { t_min: 12, kind: "outcome", outcome: { ind_kia: 0, adv_kia: 1, objective_met: true } },
];

describe("TacticalReplay", () => {
  it("renders all phase buttons", () => {
    render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    expect(screen.getByText("DETECTION")).toBeDefined();
    expect(screen.getByText("BVR1")).toBeDefined();
    expect(screen.getByText("WVR")).toBeDefined();
    expect(screen.getByText("EGRESS")).toBeDefined();
  });

  it("clicking BVR1 shows kill count", () => {
    render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    fireEvent.click(screen.getByText("BVR1"));
    expect(screen.getByText("Kills: 1")).toBeDefined();
  });

  it("renders SVG with tactical replay label", () => {
    const { container } = render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("aria-label")).toContain("tactical replay");
  });
});
