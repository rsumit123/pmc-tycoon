export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";

export type BudgetBucket = "rd" | "acquisition" | "om" | "spares" | "infrastructure";
export type BudgetAllocation = Record<BudgetBucket, number>;

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
