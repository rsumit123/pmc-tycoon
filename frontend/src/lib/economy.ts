import type { Difficulty } from "./types";

// Mirror of backend/app/engine/budget.py. Guarded by economy.test.ts.
const BASE_QUARTERLY_GRANT_CR = 45000;
const DIFFICULTY_MULT: Record<Difficulty, number> = {
  relaxed: 1.5, realistic: 1.0, hard_peer: 0.7, worst_case: 0.5,
};

/** Starting (2026) quarterly grant, rounded to nearest 500 — matches backend. */
export function startingGrantCr(d: Difficulty): number {
  return Math.round((BASE_QUARTERLY_GRANT_CR * DIFFICULTY_MULT[d]) / 500) * 500;
}

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  relaxed: "Generous budget — best for learning the game.",
  realistic: "Balanced budget, true-to-life pace.",
  hard_peer: "Tighter budget — tougher trade-offs.",
  worst_case: "Severe budget pressure — for veterans.",
};
