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
