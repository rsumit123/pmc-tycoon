# Chakravyuh v2 Phase 4 — Easy/Story Mode + Stand-Down + Collapsible Drawer (Design)

**Date:** 2026-06-28
**Status:** Approved (design + forks decided); ready for planning.
**Predecessor:** Phases 1–3 of the v2 simplification. Final v2 phase.

## Goal

Give brand-new / casual players a forgiving on-ramp: a **Story** difficulty (generous economy + gentler threat), the ability to **Stand down** from a vignette in Story mode (decline a fight with no losses), and a **collapsible side drawer** to tame the now-denser menu. Determinism is protected throughout (existing difficulties and the seeded combat resolver are untouched).

## Platform constraint (carried)

Web + Capacitor Android. Tap not hover; `safe-pt`/`safe-pb`; back-button via `useBackButtonClose`; ≥44px targets; verify on an Android build; deliver a debug APK. See [[feedback_android_capacitor]].

## Determinism guardrails (decided)

- The threat change is **additive and story-only**: a `DIFFICULTY_THREAT_MULTIPLIER` defaulting to **1.0** for relaxed/realistic/hard_peer/worst_case (their threat is byte-identical to today) and **0.3** for story. The multiplier scales the per-faction probability *before* the seeded roll — same RNG sequence, so `test_replay_determinism.py` (which exercises an existing difficulty) is unaffected.
- **Stand-down skips the seeded resolver entirely** (no `resolve()`/`resolve_non_combat()` call), so it consumes no RNG and can't perturb the replay fingerprint.
- **No auto-restock-at-turn** (would require ordering-sensitive `advance_turn` changes). Restock stays the Phase-3 one-tap; Story mode fires fewer vignettes so it's needed less.

## Area 1 — "Story" difficulty tier

A fifth difficulty below Relaxed.

- **Backend:**
  - `app/engine/budget.py`: add `"story": 2.0` to `DIFFICULTY_GRANT_MULTIPLIER` (→ ₹90,000 cr/q starting grant). `compute_quarterly_grant` already uses `.get(difficulty, 1.0)`, so this is the only grant change.
  - `app/engine/vignette/threat.py`: add `DIFFICULTY_THREAT_MULTIPLIER = {"story": 0.3}` (lookup via `.get(difficulty, 1.0)`); thread an optional `threat_multiplier: float = 1.0` through `should_fire_vignette` → `any_faction_fires` → `should_fire_vignette_for_faction` (multiply the probability before `rng.random() <`). Defaults keep every existing caller byte-identical.
  - `app/engine/turn.py`: at the threat-roll call (line ~129) pass `ctx.get("threat_multiplier", 1.0)`.
  - `app/crud/campaign.py::advance_turn`: when building `ctx`, set `threat_multiplier = DIFFICULTY_THREAT_MULTIPLIER.get(campaign.difficulty, 1.0)`.
  - `app/schemas/campaign.py`: extend the `Difficulty` Literal to include `"story"`. (The model column is permissive `String(32)`, no migration needed.)
- **Frontend:**
  - `lib/types.ts`: add `"story"` to the `Difficulty` union.
  - `lib/economy.ts`: add `story: 2.0` to the multiplier map (→ `startingGrantCr("story") === 90000`) + a `DIFFICULTY_BLURB.story` ("Most forgiving — generous budget, calm skies. Best for your first campaign.").
  - `pages/Landing.tsx`: add `{ value: "story", label: "Story" }` to `DIFFICULTIES` (first entry). Existing grant-figure + blurb display picks it up automatically.

## Area 2 — "Stand down" (decline a vignette) — Story mode only

- **Backend:**
  - `app/schemas/vignette.py`: add `decline: bool = False` to `VignetteCommitPayload`.
  - `app/crud/vignette.py::commit_vignette`: right after the `status != "pending"` guard, branch on `committed_force.get("decline")`:
    - If the campaign's `difficulty != "story"` → raise `CommitValidationError("Stand down is only available in Story mode")`.
    - Else build a zero-loss outcome `{ind_kia:0, adv_kia:0, ind_airframes_lost:0, adv_airframes_lost:0, objective_met:False, stand_down:True, roe, support, munitions_expended:[], munitions_cost_total_cr:0}`, a minimal `event_trace=[{"t_min":0,"kind":"stand_down"}]`, set `committed_force`/`outcome`/`event_trace`/`aar_text`("Stand-down ordered — engagement declined; no forces committed.")/`status="resolved"`/`resolved_at`, persist, and return — **before** any resolver/readiness/loss logic. No squadron readiness penalty (you didn't fly), no airframe losses.
  - Consequence model (decided: consequence-light): `objective_met=False` so stats stay honest (counts as a non-win in performance/objectives), but **no reputation, readiness, diplomacy, or base-damage penalty**. The `stand_down:True` marker lets the UI label it distinctly. Downstream consumers already read `.get("objective_met")`/`.get(...)` defensively, so the shape is safe.
- **Frontend:**
  - `lib/types.ts`: add `decline?: boolean` to the vignette commit payload type.
  - `lib/api.ts` + store `commitVignette`: allow passing `decline: true` (extend the payload).
  - `pages/OpsRoom.tsx` (and/or `ForceCommitter`): render a **"🏳 Stand down"** button **only when `campaign.difficulty === "story"`**. Tapping it commits `{ squadrons: [], support: {...}, roe: <first option>, decline: true }` (a hold-to-confirm is nice-to-have but a normal confirm is fine), then navigates to the AAR/map as the normal commit does. The AAR can show a "Stood down" note when `outcome.stand_down`.

## Area 3 — Collapsible accordion side drawer

- `pages/CampaignMapView.tsx`: turn the four menu section headers (**Force / Operations / Records / Settings**) into tap-to-expand/collapse accordions. Each header shows a chevron and toggles its group's visibility. Collapse state persisted to `localStorage` (e.g. key `drawer_sections_v1`). Sensible defaults: **Operations expanded; Force, Records, Settings collapsed** (Operations holds the most-used items). Tap targets ≥44px, back-button still closes the whole drawer (unchanged). No route/link changes.

## Testing

- **Backend:** `compute_quarterly_grant("story", 2026) == 90000`; threat multiplier reduces story fire probability and leaves others at 1.0 (a test asserting `should_fire_vignette` with `threat_multiplier=0.3` fires strictly less often over many seeds, and `=1.0` matches current); `commit_vignette` decline path on a story campaign → resolved, zero losses, `objective_met False`, `stand_down True`, resolver NOT called; decline on a non-story campaign → `CommitValidationError`. Run the existing `test_replay_determinism.py` to confirm it still passes (defaults unchanged). Grow from 675.
- **Frontend:** `economy` (story grant 90000 + blurb); Landing shows the Story option; commit-with-decline plumbing; OpsRoom shows Stand down only for story difficulty; the drawer accordion toggles + persists. Grow from 253. Run `npm run build` (`tsc -b`) — not just `npx tsc --noEmit` — before declaring green (Phase-3 lesson).
- **Android:** build + `cap:sync`; manually verify Story setup, a Stand-down in a story campaign, and the collapsible drawer. Deliver a debug APK.

## Out of scope
- No vignette re-roll (rejected — determinism). No auto-restock-at-turn (rejected). No rebalancing of existing difficulties' threat. No new objectives logic.

## Decisions captured
- Story tier: 2.0× grant, 0.3× threat (story-only; others unchanged at 1.0).
- Stand down: **Story-mode only**, consequence-light (no losses/penalty; records as non-win); skips the resolver (determinism-safe).
- Restock: keep Phase-3 one-tap (no auto-at-turn).
- Drawer: accordion sections, localStorage-persisted, Operations open by default.
- Commit to `main`; subagent-driven-development; debug APK after the phase.
