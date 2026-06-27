// Short cost/time hints per objective id. Source of truth for ids:
// backend/content/objectives.yaml. Missing ids simply render no hint.
export const OBJECTIVE_HINTS: Record<string, string> = {
  amca_operational_by_2035: "Hard — needs ~9 yrs of AMCA R&D + production.",
  maintain_42_squadrons: "Steady buying; beginner-friendly.",
  no_territorial_loss: "Defensive — win the combat events that matter.",
  modernize_fleet: "Buy/retire toward 4.5-gen majority; beginner-friendly.",
  indigenous_backbone: "Field 5+ Tejas/AMCA squadrons over the campaign.",
  missile_sovereignty: "Finish Astra Mk3 + BrahMos-NG R&D (multi-year).",
  maritime_reach: "Complete the TEDBF naval-fighter R&D program.",
  budget_discipline: "End in the black; beginner-friendly.",
  combat_excellence: "Win >65% of combat events.",
  stealth_fleet: "Field 2+ stealth (VLO) platforms by 2035 — expensive.",
  ace_squadrons: "Grow 3+ veteran 'ace' squadrons through combat.",
  deterrence_posture: "Complete 4+ missile/EW/sensor R&D programs.",
};

export const BEGINNER_OBJECTIVE_IDS = [
  "maintain_42_squadrons",
  "modernize_fleet",
  "budget_discipline",
] as const;
