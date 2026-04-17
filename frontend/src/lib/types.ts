export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";

export type BudgetBucket = "rd" | "acquisition" | "om" | "spares" | "infrastructure";
export type BudgetAllocation = Record<BudgetBucket, number>;

export type FactionId = "PLAAF" | "PAF" | "PLAN";

export type SourceType = "HUMINT" | "SIGINT" | "IMINT" | "OSINT" | "ELINT";

export type IntelSubjectType =
  | "base_rotation"
  | "force_count"
  | "doctrine_guess"
  | "system_activation"
  | "deployment_observation";

export interface IntelCardPayload {
  headline: string;
  template_id: string;
  subject_faction: FactionId;
  subject_type: IntelSubjectType;
  observed: Record<string, unknown>;
  ground_truth: Record<string, unknown>;
}

export interface IntelCard {
  id: number;
  appeared_year: number;
  appeared_quarter: number;
  source_type: SourceType;
  confidence: number;
  truth_value: boolean;
  payload: IntelCardPayload;
}

export interface IntelListResponse {
  total: number;
  cards: IntelCard[];
}

export interface AdversaryState {
  inventory: Record<string, number>;
  doctrine: string;
  active_systems: string[];
  forward_bases: string[];
}

export interface AdversaryFaction {
  faction: FactionId;
  state: AdversaryState;
}

export interface AdversaryListResponse {
  factions: AdversaryFaction[];
}

export interface Campaign {
  id: number;
  name: string;
  seed: number;
  starting_year: number;
  starting_quarter: number;
  current_year: number;
  current_quarter: number;
  difficulty: Difficulty;
  objectives_json: string[];
  budget_cr: number;
  quarterly_grant_cr: number;
  current_allocation_json: BudgetAllocation | null;
  reputation: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreatePayload {
  name: string;
  difficulty: Difficulty;
  objectives: string[];
  seed?: number;
}

export type VignetteStatus = "pending" | "resolved";

export type ROE = "weapons_free" | "weapons_tight" | "visual_id_required";

export interface AoCoords {
  region: string;
  name: string;
  lat: number;
  lon: number;
}

export interface AdversaryForceEntry {
  role: string;
  faction: FactionId;
  platform_id: string;
  count: number;
  loadout: string[];
}

export interface EligibleSquadron {
  squadron_id: number;
  name: string;
  platform_id: string;
  base_id: number;
  base_name: string;
  distance_km: number;
  in_range: boolean;
  airframes_available: number;
  readiness_pct: number;
  xp: number;
  loadout: string[];
}

export interface ScenarioObjective {
  kind: "defend_airspace" | "defeat_strike" | "escort_carrier" | "suppress_ad";
  success_threshold: Record<string, number>;
}

export interface PlanningState {
  scenario_id: string;
  scenario_name: string;
  ao: AoCoords;
  response_clock_minutes: number;
  adversary_force: AdversaryForceEntry[];
  eligible_squadrons: EligibleSquadron[];
  allowed_ind_roles: string[];
  roe_options: ROE[];
  objective: ScenarioObjective;
}

export interface EventTraceEntry {
  t_min: number;
  kind: string;
  [key: string]: unknown;
}

export interface VignetteOutcome {
  ind_kia: number;
  adv_kia: number;
  ind_airframes_lost: number;
  adv_airframes_lost: number;
  objective_met: boolean;
  roe: ROE;
  support: { awacs: boolean; tanker: boolean; sead_package: boolean };
}

export interface VignetteCommitSquadron {
  squadron_id: number;
  airframes: number;
}

export interface VignetteCommitPayload {
  squadrons: VignetteCommitSquadron[];
  support: { awacs: boolean; tanker: boolean; sead_package: boolean };
  roe: ROE;
}

export interface Vignette {
  id: number;
  year: number;
  quarter: number;
  scenario_id: string;
  status: VignetteStatus;
  planning_state: PlanningState;
  committed_force: VignetteCommitPayload | null;
  event_trace: EventTraceEntry[];
  aar_text: string;
  outcome: VignetteOutcome | Record<string, never>;
  resolved_at: string | null;
}

export interface VignetteListResponse {
  vignettes: Vignette[];
}

export type NarrativeKind =
  | "aar"
  | "intel_brief"
  | "ace_name"
  | "year_recap"
  | "retrospective";

export interface CampaignNarrative {
  id: number;
  kind: NarrativeKind;
  year: number;
  quarter: number;
  subject_id: string | null;
  text: string;
  prompt_version: string;
  created_at: string;
}

export interface GenerateNarrativeResponse {
  text: string;
  cached: boolean;
  kind: NarrativeKind;
  subject_id: string | null;
}

export interface CampaignNarrativeListResponse {
  narratives: CampaignNarrative[];
}
