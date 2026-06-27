# Chakravyuh v2 Phase 3 — Tame the Heavy Screens (Design)

**Date:** 2026-06-27
**Status:** Approved (design + the two forks decided); ready for planning.
**Predecessor:** Phases 1–2 of the v2 simplification. Part of "easy to learn, deep if you want it."

## Goal

Lower the cognitive load of the three heaviest interactions for casual players — committing a force in a vignette, keeping depots stocked, and finding things in a sprawling menu — **without changing any engine math or breaking existing routes**. All three changes are frontend-only and low-risk (decided forks: one-tap restock, not auto-at-turn; menu grouping, not page-merging).

## Platform constraint (carried from Phases 1–2)

Web + Capacitor Android. Tap not hover; `safe-pt`/`safe-pb`; back-button via `useBackButtonClose`; touch targets ≥44px; verify on an Android build. See [[feedback_android_capacitor]].

## Area 1 — Recommended force package + plain-language odds (vignette)

Operates entirely on the `PlanningState` already passed to `ForceCommitter`; no backend call (mirrors the read-only ethos of `StrikeRiskPreview`).

- **Pure helper** `frontend/src/lib/forceRecommendation.ts`:
  - `recommendPackage(planning: PlanningState): VignetteCommitPayload` — picks reachable, ready squadrons and a sensible support/ROE default:
    - Squadrons: from `planning.eligible_squadrons`, take `range_tier === "A"` (in range, no tanker) with `readiness_pct >= 50`, preferring roles in `allowed_ind_roles`, sorted by `readiness_pct` desc; add squadrons (each at `airframes_available`) until committed airframes ≥ ~1.5× the estimated adversary count (estimate from `adversary_force_observed` mid-of-`count_range`, falling back to summing `adversary_force[].count`), capped at the eligible set.
    - Support: `awacs = (planning.awacs_covering?.length ?? 0) > 0`; `tanker = false` (A-tier only); `sead_package = true` iff the observed/known adversary force includes an `air_defense` role, else false.
    - ROE: `"weapons_free"` if present in `planning.roe_options`, else the first option.
    - AD-only scenarios (`allows_no_cap` with no eligible CAP squadrons): return empty `squadrons` + `awacs` per coverage.
  - `estimateOdds(planning, value: VignetteCommitPayload): { label: "Strong favorite" | "Even" | "Risky"; reason: string }` — a transparent heuristic:
    - `committed = Σ value.squadrons[].airframes`; `advCount = estimate as above`; `ratio = committed / max(1, advCount)`.
    - Detection edge if `value.support.awacs && awacs_covering present` OR `intel_quality.tier ∈ {high, perfect}`.
    - Stealth penalty if observed `probable_platforms` look stealthy and committed squadrons are not stealth-effective.
    - Banding: `ratio ≥ 1.8` (or `≥1.4` with detection edge) → "Strong favorite"; `ratio ≥ 0.9` → "Even"; else "Risky". `reason` is a short plain string ("3:1 numbers + AWACS").
- **Wiring** in `ForceCommitter` (+ `OpsRoom` as needed): an **"✨ Auto-fill recommended"** button (tap → `onChange(recommendPackage(planning))`) near the top of the committer, and a **plain odds chip** (green/amber/rose) that updates as the player edits the package. Both are advisory; the player can override everything. Label the odds clearly as an estimate.

## Area 2 — One-tap "Restock low depots"

Decided: one-tap action, NOT auto-at-turn (keeps `advance_turn` + replay determinism untouched). Restocking just creates normal `missile_batch` acquisition orders via the existing `POST /acquisitions`.

- **Pure helper** `frontend/src/lib/restock.ts::buildRestockOrders(notifications, weaponsById, currentYear, currentQuarter): AcquisitionCreatePayload[]`:
  - Filters `notifications` to `kind ∈ {low_stock, empty_stock}`.
  - For each, parse `base` (`base_id`), `missile` (`weapon_id`), and `qty` (topup) from the notification's `action_url` query string (the backend already encodes `&missile=&base=&qty=` there); skip any that don't parse.
  - Build a `missile_batch` payload per item: `platform_id = weapon_id`, `quantity = qty`, delivery dates = current + 2q (first) / current + 4q (FOC) (mirror `AcquisitionPipeline` missile defaults), `total_cost_cr = qty × weaponsById[weapon_id].unit_cost_cr`, `preferred_base_id = base_id`, `kind = "missile_batch"`.
  - Deterministic + unit-testable (no I/O).
- **Wiring:** a **"⚡ Restock all low depots (N)"** button in `AcquisitionPipeline` (where `weaponsById`, bases, `createAcquisition`/`onSign`, and current quarter already live), shown only when N>0. Tapping it builds the orders via the helper and signs each through the existing acquisition flow (same path as manual missile orders → identical validation, cost, delivery). Ensure the notifications feed is available there (load if not). The existing per-notification deep-link stays; this just adds a bulk one-tap on the same screen.

## Area 3 — Menu grouping (navigation legibility)

Decided: regroup the side menu, keep all routes/pages (zero deep-link breakage, no test rewrites).

- In `CampaignMapView` reorganize the menu sections to:
  - **Force** — Hangar, Armory
  - **Operations** — Strike Command, Procurement, Intel, Objectives, (White Paper when complete)
  - **Records** — Combat History, Performance *(moved out of Operations into a new Records group)*
  - **Settings** — unchanged
- No route changes, no page merges, no component-link changes. Pure menu reorganization.

## Testing

- **Frontend unit:** `forceRecommendation` (recommendPackage picks A-tier ready squads + awacs when covered + weapons_free; sizes ~1.5× adversary; AD-only path; estimateOdds banding incl. detection edge + stealth penalty). `restock.buildRestockOrders` (parses low/empty-stock action_urls → correct payloads; skips unparseable; cost = qty×unit_cost; dates offset). Component: ForceCommitter auto-fill button fills `onChange`; odds chip renders; AcquisitionPipeline restock button appears with count + signs N orders; menu shows Records group with Combat History + Performance.
- Preserve baselines (frontend 242) and grow. No backend changes → backend suite (675) unaffected.
- **Android:** build + `cap:sync`; manually verify the auto-fill + odds in a vignette, the restock button, and the regrouped menu in the WebView. Deliver a debug APK after the phase.

## Out of scope
- Phase 4: easy/story mode + vignette retreat/re-roll.
- No engine math changes; no auto-restock-at-turn (explicitly deferred — would need `advance_turn` changes); no page-merging (explicitly deferred — moderate risk).

## Decisions captured
- Restock = one-tap bulk action (frontend, normal acquisitions); auto-at-turn rejected (determinism risk).
- Navigation = menu grouping (keep routes/pages); full hub-merge rejected (deep-link/test risk).
- Recommended package + odds = client-side heuristics over `PlanningState`; advisory + overridable; no new endpoint.
- Commit to `main`; subagent-driven-development; debug APK after the phase.
