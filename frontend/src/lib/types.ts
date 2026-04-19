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
  range_tier?: "A" | "B" | "C";
  requires_tanker?: boolean;
  loadout_stealth_effective?: boolean;
  airframes_available: number;
  readiness_pct: number;
  xp: number;
  loadout: string[];
}

export interface ScenarioObjective {
  kind: "defend_airspace" | "defeat_strike" | "escort_carrier" | "suppress_ad";
  success_threshold: Record<string, number>;
}

export interface IntelQualityModifiers {
  awacs: number;
  intel: number;
  stealth_penalty: number;
}

export interface IntelQuality {
  score: number;
  tier: "low" | "medium" | "high" | "perfect";
  modifiers: IntelQualityModifiers;
}

export interface AwacsCovering {
  squadron_id: number;
  base_id: number;
  base_name: string;
  distance_km: number;
  strength: number;
  readiness_pct: number;
}

export interface AdversaryForceObserved {
  faction: string;
  role?: string;
  count?: number;
  count_range?: [number, number];
  probable_platforms: string[];
  fidelity: "low" | "medium" | "high";
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
  intel_quality?: IntelQuality;
  awacs_covering?: AwacsCovering[];
  adversary_force_observed?: AdversaryForceObserved[];
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
  munitions_expended?: MunitionsExpendedEntry[];
  munitions_cost_total_cr?: number;
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

export interface Platform {
  id: string;
  name: string;
  origin: string;
  role: string;
  generation: string;
  combat_radius_km: number;
  payload_kg: number;
  rcs_band: string;
  radar_range_km: number;
  cost_cr: number;
  intro_year: number;
  procurable_by: string[];
  default_first_delivery_quarters: number;
  default_foc_quarters: number;
  runway_class?: string;
}

export interface PlatformListResponse {
  platforms: Platform[];
}

export interface BaseSquadronSummary {
  id: number;
  name: string;
  call_sign: string;
  platform_id: string;
  strength: number;
  readiness_pct: number;
  xp: number;
  ace_name: string | null;
}

export interface BaseMarker {
  id: number;
  template_id: string;
  name: string;
  lat: number;
  lon: number;
  shelter_count: number;
  fuel_depot_size: number;
  ad_integration_level: number;
  runway_class: string;
  squadrons: BaseSquadronSummary[];
}

export interface BaseUpgradeResponse {
  base_template_id: string;
  upgrade_type: string;
  cost_cr: number;
  shelter_count: number;
  fuel_depot_size: number;
  ad_integration_level: number;
  runway_class: string;
  remaining_budget_cr: number;
}

export interface BaseListResponse {
  bases: BaseMarker[];
}

// ---------- Plan 7: procurement types ----------

export interface UnlockSpecSummary {
  kind: "missile" | "ad_system" | "isr_drone" | "strike_platform" | "platform" | "none";
  target_id: string | null;
  eligible_platforms: string[];
  coverage_km: number | null;
  description: string;
}

export interface RDProgramSpec {
  id: string;
  name: string;
  description: string;
  base_duration_quarters: number;
  base_cost_cr: number;
  dependencies: string[];
  unlocks?: UnlockSpecSummary;
}

export interface RDProgramSpecListResponse {
  programs: RDProgramSpec[];
}

export type RDFundingLevel = "slow" | "standard" | "accelerated";
export type RDStatus = "active" | "completed" | "cancelled";

export interface ProjectedCompletion {
  completion_year: number;
  completion_quarter: number;
  quarters_remaining: number;
  quarterly_cost_cr: number;
}

export type RDProjections = Record<"slow" | "standard" | "accelerated", ProjectedCompletion>;

export interface RDProgramState {
  id: number;
  program_id: string;
  progress_pct: number;
  funding_level: RDFundingLevel;
  status: RDStatus;
  milestones_hit: number[];
  cost_invested_cr: number;
  quarters_active: number;
  projections?: RDProjections;
}

export interface RDProgramStateListResponse {
  programs: RDProgramState[];
}

export interface AcquisitionOrder {
  id: number;
  platform_id: string;
  quantity: number;
  signed_year: number;
  signed_quarter: number;
  first_delivery_year: number;
  first_delivery_quarter: number;
  foc_year: number;
  foc_quarter: number;
  delivered: number;
  total_cost_cr: number;
  cancelled?: boolean;
  preferred_base_id?: number | null;
}

export interface AcquisitionListResponse {
  orders: AcquisitionOrder[];
}

export interface AcquisitionCreatePayload {
  platform_id: string;
  quantity: number;
  first_delivery_year: number;
  first_delivery_quarter: number;
  foc_year: number;
  foc_quarter: number;
  total_cost_cr: number;
  preferred_base_id?: number | null;
}

export interface RDUpdatePayload {
  funding_level?: RDFundingLevel;
  status?: RDStatus;
}

// ---------- Plan 9: endgame types ----------

export interface YearSnapshot {
  year: number;
  end_treasury_cr: number;
  vignettes_resolved: number;
  vignettes_won: number;
  deliveries: number;
  rd_completions: number;
}

export interface ForceStructureSummary {
  squadrons_end: number;
  total_airframes: number;
  fifth_gen_squadrons: number;
}

export interface AceSummary {
  squadron_id: number;
  squadron_name: string;
  platform_id: string;
  ace_name: string;
  awarded_year: number;
  awarded_quarter: number;
}

export interface CampaignSummary {
  campaign_id: number;
  name: string;
  difficulty: Difficulty;
  starting_year: number;
  current_year: number;
  current_quarter: number;
  budget_cr: number;
  reputation: number;
  year_snapshots: YearSnapshot[];
  force_structure: ForceStructureSummary;
  vignettes_won: number;
  vignettes_lost: number;
  vignettes_total: number;
  ace_count: number;
  aces: AceSummary[];
  objectives: { id: string; name: string; status: "pass" | "fail" | "unknown" }[];
  is_complete: boolean;
}

// ---------- Plan 12: objectives + campaign list ----------

export interface ObjectiveSpec {
  id: string;
  title: string;
  description: string;
  weight: number;
  target_year: number;
}

export interface ObjectiveListResponse {
  objectives: ObjectiveSpec[];
}

export interface CampaignListItem {
  id: number;
  name: string;
  current_year: number;
  current_quarter: number;
  difficulty: string;
  budget_cr: number;
  reputation: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignListResponse {
  campaigns: CampaignListItem[];
}

// ---------- Plan 13: turn report types ----------

export interface DeliverySummary {
  order_id: number;
  platform_id: string;
  count: number;
  cost_cr: number;
  assigned_base_id: number | null;
  assigned_squadron_id: number | null;
}

export interface RDMilestoneSummary {
  program_id: string;
  kind: "breakthrough" | "setback" | "milestone" | "completed" | "underfunded";
  progress_pct: number | null;
}

export interface IntelCardSummary {
  source_type: string;
  confidence: number;
  headline: string;
}

export interface VignetteFiredSummary {
  scenario_id: string;
  scenario_name: string;
  ao: AoCoords;
}

export interface TurnReportResponse {
  campaign_id: number;
  year: number;
  quarter: number;
  events: { event_type: string; payload: Record<string, unknown> }[];
  deliveries: DeliverySummary[];
  rd_milestones: RDMilestoneSummary[];
  adversary_shifts: { event_type: string; payload: Record<string, unknown> }[];
  intel_cards: IntelCardSummary[];
  vignette_fired: VignetteFiredSummary | null;
  treasury_after_cr: number;
  allocation: Record<string, number> | null;
}

// ---------- Plan 14: toast types ----------

export type ToastVariant = "success" | "info" | "warning" | "error";

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  /** ms until auto-dismiss. 0 = never. Default 3000. */
  duration?: number;
}

// ---------- Plan 15: armory + hangar types ----------

export interface MissileUnlock {
  target_id: string;
  name: string;
  description: string;
  eligible_platforms: string[];
  nez_km: number;
  max_range_km: number;
}

export interface ADSystemUnlock {
  target_id: string;
  name: string;
  description: string;
  coverage_km: number;
  install_cost_cr: number;
  max_pk: number;
}

export interface ISRDroneUnlock {
  target_id: string;
  name: string;
  description: string;
  coverage_km: number;
}

export interface StrikePlatformUnlock {
  target_id: string;
  name: string;
  description: string;
}

export interface UnlocksResponse {
  missiles: MissileUnlock[];
  ad_systems: ADSystemUnlock[];
  isr_drones: ISRDroneUnlock[];
  strike_platforms: StrikePlatformUnlock[];
}

export interface LoadoutUpgrade {
  id: number;
  squadron_id: number;
  weapon_id: string;
  completion_year: number;
  completion_quarter: number;
  status: "pending" | "completed" | "cancelled";
}

export interface ADBattery {
  id: number;
  base_id: number;
  system_id: string;
  coverage_km: number;
  installed_year: number;
  installed_quarter: number;
}

export interface WeaponMeta {
  id: string;
  nez_km: number;
  max_range_km: number;
  unit_cost_cr: number;
}

export interface WeaponCatalogResponse {
  weapons: Record<string, WeaponMeta>;
}

export interface MunitionsExpendedEntry {
  weapon: string;
  fired: number;
  hits: number;
  unit_cost_cr: number;
  total_cost_cr: number;
}

export interface CombatHistoryEntry {
  id: number;
  year: number;
  quarter: number;
  scenario_id: string;
  scenario_name: string;
  ao_name: string;
  ao_region: string;
  faction: string;
  ind_airframes_lost: number;
  adv_airframes_lost: number;
  ind_kia: number;
  adv_kia: number;
  objective_met: boolean;
  resolved_at: string | null;
  munitions_cost_cr?: number;
}

export interface CombatHistoryResponse {
  total: number;
  wins: number;
  losses: number;
  vignettes: CombatHistoryEntry[];
}

export interface PendingLoadoutUpgrade {
  weapon_id: string;
  completion_year: number;
  completion_quarter: number;
}

export interface HangarSquadron {
  id: number;
  name: string;
  call_sign: string;
  platform_id: string;
  platform_name: string;
  base_id: number;
  base_name: string;
  strength: number;
  readiness_pct: number;
  xp: number;
  ace_name: string | null;
  loadout: string[];
  pending_upgrades?: PendingLoadoutUpgrade[];
}

export interface HangarPlatformSummary {
  platform_id: string;
  platform_name: string;
  squadron_count: number;
  total_airframes: number;
  avg_readiness_pct: number;
}

export interface HangarResponse {
  squadrons: HangarSquadron[];
  summary_by_platform: HangarPlatformSummary[];
}
