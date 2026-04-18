import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CombatReasoning } from "../CombatReasoning";
import type {
  EventTraceEntry,
  PlanningState,
  VignetteOutcome,
  VignetteCommitPayload,
} from "../../../lib/types";

const basePlanningState: PlanningState = {
  scenario_id: "scen-001",
  scenario_name: "Northern CAP",
  ao: { region: "North", name: "Ladakh AO", lat: 34.0, lon: 77.0 },
  response_clock_minutes: 15,
  adversary_force: [
    { platform_id: "j20a", count: 4, faction: "PLAAF", role: "air_superiority", loadout: ["pl15"] },
  ],
  eligible_squadrons: [],
  allowed_ind_roles: ["air_superiority"],
  roe_options: ["weapons_free", "weapons_tight", "visual_id_required"],
  objective: { kind: "defend_airspace", success_threshold: { adv_kills_min: 2 } },
};

const baseOutcome: VignetteOutcome = {
  ind_kia: 7,
  adv_kia: 1,
  ind_airframes_lost: 3,
  adv_airframes_lost: 1,
  objective_met: false,
  roe: "weapons_free",
  support: { awacs: false, tanker: false, sead_package: false },
};

const baseTrace: EventTraceEntry[] = [
  { t_min: 0, kind: "detection", advantage: "adv", ind_radar_km: 80, adv_radar_km: 160 },
  { t_min: 2, kind: "bvr_launch", side: "adv", weapon: "pl15", attacker_platform: "j20a", target_platform: "su30mki", pk: 0.45, distance_km: 140 },
  { t_min: 3, kind: "bvr_launch", side: "ind", weapon: "astra_mk2", attacker_platform: "su30mki", target_platform: "j20a", pk: 0.25, distance_km: 90 },
  { t_min: 5, kind: "kill", side: "adv", attacker_platform: "j20a", victim_platform: "su30mki", weapon: "pl15" },
  { t_min: 8, kind: "egress", ind_survivors: 1, adv_survivors: 3 },
  { t_min: 8, kind: "outcome", outcome: baseOutcome },
];

const baseCommittedForce: VignetteCommitPayload = {
  squadrons: [{ squadron_id: 1, airframes: 4 }],
  support: { awacs: false, tanker: false, sead_package: false },
  roe: "weapons_free",
};

describe("CombatReasoning", () => {
  it("renders detection disadvantage factor", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/Detection Disadvantage/i)).toBeInTheDocument();
  });

  it("renders stealth platforms factor for j20a adversary", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/Adversary Stealth Platforms/i)).toBeInTheDocument();
  });

  it("renders AWACS not deployed factor", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/No AWACS Support/i)).toBeInTheDocument();
  });

  it("renders objective failed factor when objective not met", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/Objective Failed/i)).toBeInTheDocument();
  });

  it("renders AWACS support factor when AWACS deployed", () => {
    const forceWithAwacs: VignetteCommitPayload = {
      ...baseCommittedForce,
      support: { awacs: true, tanker: false, sead_package: false },
    };
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={forceWithAwacs}
      />
    );
    expect(screen.getByText(/AWACS Support/i)).toBeInTheDocument();
  });

  it("renders BVR skip factor when vid_skip_bvr event present", () => {
    const traceWithSkip: EventTraceEntry[] = [
      { t_min: 0, kind: "detection", advantage: "mutual" },
      { t_min: 1, kind: "vid_skip_bvr", reason: "visual_id_required ROE in effect" },
      { t_min: 2, kind: "egress", ind_survivors: 2, adv_survivors: 4 },
    ];
    render(
      <CombatReasoning
        eventTrace={traceWithSkip}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={{ ...baseCommittedForce, roe: "visual_id_required" }}
      />
    );
    expect(screen.getByText(/BVR Phase Skipped/i)).toBeInTheDocument();
  });

  it("renders detection advantage when ind detects first", () => {
    const indAdvantageTrace: EventTraceEntry[] = [
      { t_min: 0, kind: "detection", advantage: "ind", ind_radar_km: 160, adv_radar_km: 80 },
    ];
    const successOutcome: VignetteOutcome = { ...baseOutcome, objective_met: true };
    render(
      <CombatReasoning
        eventTrace={indAdvantageTrace}
        planningState={{
          ...basePlanningState,
          adversary_force: [{ platform_id: "j16", count: 2, faction: "PLAAF", role: "air_superiority", loadout: [] }],
        }}
        outcome={successOutcome}
        committedForce={{ ...baseCommittedForce, support: { awacs: true, tanker: false, sead_package: false } }}
      />
    );
    expect(screen.getByText(/Detection Advantage/i)).toBeInTheDocument();
  });

  it("renders combat analysis heading", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText("Combat Analysis")).toBeInTheDocument();
  });
});
