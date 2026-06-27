# Chakravyuh v2 Phase 2 — Streamline the Core Loop (Design)

**Date:** 2026-06-27
**Status:** Approved (design); ready for planning.
**Predecessor:** Phase 1 (`2026-06-27-v2-onboarding-legibility-design.md`). Part of the v2 simplification effort ("easy to learn, deep if you want it").

## Goal

Cut the friction of the every-turn core loop for casual players: make budgeting a one-tap decision, make objective standing visible mid-campaign (instead of only at the end), and turn the post-turn report into a real "what happened / what needs you" briefing. Keep all existing depth available behind opt-in surfaces.

## Platform constraint (carried from Phase 1)

Web + Capacitor Android. Tap not hover; safe-area insets (`safe-pt`/`safe-pb`); overlays/popovers dismiss on the hardware back button (`useBackButtonClose`); touch targets ≥44px; verify on an Android build (`npm run cap:sync`). See [[feedback_android_capacitor]].

## Area 1 — Budget presets + autopilot (frontend only)

Rework `frontend/src/components/procurement/BudgetAllocator.tsx`. No backend change — presets compute absolute bucket amounts client-side and POST via the existing `setBudget` → `POST /api/campaigns/{id}/budget`.

- **Default view = 4 one-tap presets** (each maps the quarterly grant across the 5 buckets by percentage):
  - **Balanced** — `{rd:25, acquisition:35, om:20, spares:15, infrastructure:5}` (today's default)
  - **Build the Force** — `{rd:15, acquisition:50, om:18, spares:12, infrastructure:5}`
  - **Tech Rush** — `{rd:40, acquisition:25, om:18, spares:12, infrastructure:5}`
  - **Maintain Readiness** — `{rd:15, acquisition:25, om:35, spares:20, infrastructure:5}`
  - Tapping a preset sets the allocation (commit still required via the existing hold-button).
- **Keep-my-allocation autopilot:** the allocator pre-fills from `campaign.current_allocation_json` when present (the last committed split), falling back to Balanced for a brand-new campaign. So the casual path is: open Budget → it already shows last turn's plan → hold to commit. The preset row shows which preset (if any) the current split matches, else "Custom".
- **Advanced toggle:** the existing 5 steppers + per-bucket commitment warnings (acquisition/R&D burn, under/over-allocation) move behind an "⚙ Advanced / Customize" disclosure (collapsed by default). Nothing is removed.
- **Readiness health line:** a compact green/amber/red bar + label (e.g. "Fleet readiness: Good / Strained / Critical") derived from average squadron readiness, so the player sees the *consequence* of O&M/spares without the formula. Use the existing readiness tiers (≥75 green, 55–74 amber, <55 red) over a fleet average (from bases/squadrons already in the store, or `GET /posture` avg). Display-only.

## Area 2 — Live Objective Tracker (backend + frontend)

The endgame already evaluates objectives (`_evaluate_objective` in `app/api/summary.py` → "pass"/"fail"/"unknown"). Phase 2 surfaces standing *during* the campaign with richer status.

### Backend

- New pure helper `backend/app/engine/objectives.py::objective_progress(obj_id, inputs) -> ObjectiveProgress` where `inputs` is a dataclass of already-derived metrics (keeps it pure + unit-testable, per the engine-layer convention). `ObjectiveProgress = {status: Literal["met","in_progress","at_risk"], progress: float (0..1), detail: str}`.
  - Per-objective rules (ids from `backend/content/objectives.yaml`):
    - `maintain_42_squadrons` — progress `min(1, fighter_squads/42)`; met if ≥42; detail `"{n}/42 squadrons"`.
    - `amca_operational_by_2035` — met if an AMCA squadron exists; else progress = AMCA Mk1 R&D progress fraction; detail `"AMCA R&D {pct}%"` or `"0 AMCA squadrons"`.
    - `modernize_fleet` — progress = modern_frac (gen ≥ 4.5); met if >0.5; detail `"{pct}% 4.5-gen+"`.
    - `indigenous_backbone` — progress `min(1, indigenous_squads/5)`; met if ≥5; detail `"{n}/5 indigenous sqns"`.
    - `missile_sovereignty` — progress = completed_of({astra_mk3,brahmos_ng})/2; met if both; detail `"{n}/2 programs"`.
    - `maritime_reach` — met if tedbf completed; else progress = tedbf R&D fraction; detail `"TEDBF R&D {pct}%"`.
    - `stealth_fleet` — progress `min(1, vlo_squads/2)`; met if ≥2; detail `"{n}/2 stealth sqns"`.
    - `ace_squadrons` — progress `min(1, ace_count/3)`; met if ≥3; detail `"{n}/3 aces"`.
    - `deterrence_posture` — progress `min(1, completed_deterrence/4)`; met if ≥4; detail `"{n}/4 R&D programs"`.
    - `budget_discipline` — met if treasury > 0; **at_risk** if treasury ≤ 0; progress = clamp(treasury / starting_treasury, 0, 1); detail `"₹{treasury} cr"`.
    - `combat_excellence` — progress = win_rate; met if >0.65; **at_risk** if win_rate < 0.5 with total ≥ 5; detail `"{won}/{total} won ({pct}%)"`.
    - `no_territorial_loss` — met if vignettes_lost == 0; **at_risk** if vignettes_lost > 0; progress = win_rate (1.0 if no fights yet); detail `"{lost} losses"` / `"No losses"`.
    - unknown id → `{status:"in_progress", progress:0, detail:""}` (defensive).
- New slim endpoint `GET /api/campaigns/{id}/objectives` → `ObjectiveProgressListResponse { objectives: [{id, name, status, progress, detail}] }`. It assembles the `inputs` once (squad list w/ platform gen + RCS band + indigenous flag from the content loader; resolved-vignette won/total; RDProgramState status + progress_pct per program; ace count = CampaignNarrative rows of kind `ace_name`; treasury + starting treasury). Does NOT call the heavy summary assembly. Guarded by the campaign-ownership dependency like other campaign routes.
- Leave `_evaluate_objective` (summary) untouched to avoid risk; the small logic overlap is acceptable and called out. (Optional: summary could later delegate; not in this phase.)

### Frontend

- `api.getObjectiveProgress(id)` + `campaignStore.loadObjectiveProgress` + state `objectiveProgress` + types (`ObjectiveProgressEntry`).
- `frontend/src/components/objectives/ObjectiveTracker.tsx` — a card listing each objective with a status pill (✅ Met / 🟡 In progress / 🔴 At risk), a thin progress bar, and the detail string. Reuse the visual language of `ObjectiveScoreCard`.
- New screen `frontend/src/pages/ObjectivesPage.tsx` at route `/campaign/:id/objectives`, linked from the map hamburger menu (Operations section, e.g. "🎯 Objectives"). Loads progress on mount.

## Area 3 — Situation Report (frontend only)

Enhance `frontend/src/pages/TurnReport.tsx` (already shown right after End Turn) by adding two sections at the top, above the existing deliveries/R&D/intel:
- **Objective standing** — a compact summary line + the top 2–3 at-risk/in-progress objectives (reuse `ObjectiveTracker` in a compact mode, or a small summary using the same data). Loads via `loadObjectiveProgress`.
- **Needs your attention** — warning-severity items from the existing notifications feed (`loadNotifications`), each a tappable row deep-linking via its `action_url` (low/empty stock, empty AD, pending vignette). Hide the section if there are none.

No new endpoint; reuses objectives progress (Area 2) + notifications.

## Testing

- **Backend:** unit tests for `objective_progress` (each objective's met/in_progress/at_risk + progress + detail, via explicit inputs); an API test for `GET /objectives` (shape, ownership guard, a seeded campaign returns all 12). Preserve the backend baseline (~666 tests) and grow it. Replay determinism unaffected (read-only endpoint; not called from `advance_turn`).
- **Frontend:** `BudgetAllocator` (preset applies correct amounts; autopilot pre-fills from `current_allocation_json`; Advanced toggle reveals steppers; readiness line tiers); `ObjectiveTracker` (renders status pills + bars from data); `ObjectivesPage` (loads + lists); `TurnReport` (new sections render; "needs attention" hidden when empty). Preserve the frontend baseline (235) and grow it.
- **Android:** build + `cap:sync`; manually verify the budget presets, Objectives screen, and Situation Report render and are tappable in the WebView.

## Out of scope (later phases)
- Phase 3: recommended force-package auto-fill in combat, auto-restock munitions, route consolidation.
- Phase 4: easy/story mode + vignette retreat.
- No change to the budget/objective *engine math* — Phase 2 only surfaces and re-skins existing mechanics.

## Decisions captured
- Budget = presets-default with manual under "Advanced"; autopilot pre-fills last allocation.
- Objective tracker = dedicated `/objectives` screen (menu-linked) + a compact summary inside the post-turn report.
- Situation Report = enhanced existing TurnReport (not a new screen).
- Objective progress via a new slim read-only endpoint + pure engine helper; summary's `_evaluate_objective` left untouched.
- Commit to `main`; execute via subagent-driven-development. Deliver a debug APK after the phase.
