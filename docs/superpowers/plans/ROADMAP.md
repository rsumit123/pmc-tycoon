# Sovereign Shield — Implementation Roadmap

**Purpose:** High-level index of all implementation plans. Each plan is a self-contained spec-to-plan cycle producing working, testable software. Detailed task-level plans live in `docs/superpowers/plans/YYYY-MM-DD-<name>.md`. This file is the navigation layer — if you're picking up work in a fresh context, start here.

**Status legend:** `🔴 not started` • `🟡 in progress` • `🟢 done` • `⏸️ deferred`

**Last updated:** 2026-04-18 (Plan 11 done)

---

## Current Status Summary

| # | Plan | Status | Plan file |
|---|---|---|---|
| 1 | Foundation (repo cleanup + minimal campaign lifecycle) | 🟢 done | [2026-04-16-foundation-plan.md](2026-04-16-foundation-plan.md) |
| 2 | Turn Engine Core | 🟢 done | [2026-04-16-turn-engine-core-plan.md](2026-04-16-turn-engine-core-plan.md) |
| 3 | Adversary Simulation & Intel | 🟢 done | [2026-04-17-adversary-simulation-intel-plan.md](2026-04-17-adversary-simulation-intel-plan.md) |
| 4 | Vignette Engine | 🟢 done | [2026-04-17-vignette-engine-plan.md](2026-04-17-vignette-engine-plan.md) |
| 5 | LLM Integration (OpenRouter) | 🟢 done | [2026-04-17-llm-integration-plan.md](2026-04-17-llm-integration-plan.md) |
| 6 | Frontend — Map + Core UI Primitives | 🟢 done | [2026-04-17-frontend-map-primitives-plan.md](2026-04-17-frontend-map-primitives-plan.md) |
| 7 | Frontend — Procurement Flows | 🟢 done | [2026-04-17-frontend-procurement-flows-plan.md](2026-04-17-frontend-procurement-flows-plan.md) |
| 8 | Frontend — Vignettes + Intel Screens | 🟢 done | [2026-04-17-frontend-vignettes-intel-plan.md](2026-04-17-frontend-vignettes-intel-plan.md) |
| 9 | Campaign End + Polish | 🟢 done | [2026-04-17-campaign-end-polish-plan.md](2026-04-17-campaign-end-polish-plan.md) |
| 10 | V1 Content Expansion + Balancing | 🟢 done | [2026-04-18-content-expansion-balancing-plan.md](2026-04-18-content-expansion-balancing-plan.md) |
| 11 | V1 Release Polish + E2E Testing | 🟢 done | [2026-04-18-v1-release-polish-e2e-plan.md](2026-04-18-v1-release-polish-e2e-plan.md) |

**Post-V1 backlog** tracked in *V1.5+ Backlog* section below.

---

## How to use this roadmap

1. Before starting work, check the **Current Status Summary** to see what's next.
2. Read the **Plan N** section below for context — what the plan covers, what it depends on, what it produces, what it explicitly defers.
3. Invoke the `writing-plans` skill to produce the detailed task-level plan (unless one already exists in this directory).
4. Execute the detailed plan.
5. Update the **Current Status Summary** when the plan's deliverable ships.

Each plan's detailed task-level spec is committed before execution. This ROADMAP.md is a living index — update status + add notes as work progresses.

---

## Plan 1 — Foundation

**Goal:** Prune obsolete PMC Tycoon code, stand up new backend models + content loaders, seed MVP content, wire a minimal `POST /api/campaigns` + `POST /api/campaigns/{id}/advance` + `GET /api/campaigns/{id}` loop end-to-end with a barebones frontend shell that can create a campaign and advance turns.

**Deliverable:** End-to-end full-stack loop. User visits landing page, creates campaign, clicks "End Turn," sees quarter advance. No gameplay logic — clock just ticks. No map, no dashboards, no vignettes, no LLM.

**Depends on:** nothing (fresh start).

**Key modules touched:**
- `backend/app/models/` — all new SQLAlchemy models
- `backend/app/content/` — YAML loader + registry
- `backend/app/crud/`, `backend/app/api/`, `backend/app/schemas/`, `backend/app/core/config.py` — new
- `backend/content/*.yaml` — MVP seed
- `backend/main.py`, `backend/Dockerfile`, `backend/requirements.txt` — rewritten
- `frontend/src/lib/`, `frontend/src/store/`, `frontend/src/pages/` — scaffolded
- `frontend/src/App.tsx`, `main.tsx`, `index.css` — rewritten
- `deploy.sh` — fixes data-volume mount bug
- `README.md` — new

**Explicitly NOT in scope** (deferred to later plans):
- Any turn-engine gameplay math (budget spend, R&D progression, readiness dynamics) → Plan 2
- Adversary simulation → Plan 3
- Vignettes → Plan 4
- LLM calls → Plan 5
- MapLibre map, dashboards, mobile-first UI patterns → Plans 6-8
- Platform media fetcher → Plan 6
- Campaign end screen → Plan 9

**Detailed plan file:** [2026-04-16-foundation-plan.md](2026-04-16-foundation-plan.md)

---

## Plan 2 — Turn Engine Core

**Goal:** Implement the procurement gameplay loop. Budget allocation, R&D progression with milestones + risk events, acquisition delivery queue, readiness regeneration/degradation, turn orchestrator. All pure-function, deterministic-with-seeded-RNG.

**Deliverable:** A campaign where ending a turn causes meaningful state changes: R&D progress ticks, acquisitions deliver on schedule, readiness drifts, budget accumulates/depletes, events log. No UI beyond what Plan 1 shipped — still raw JSON display. Tests verify 10-turn simulation produces sensible state.

**Depends on:** Plan 1 (foundation).

**Key new modules:**
- `backend/app/engine/__init__.py`
- `backend/app/engine/budget.py` — 5-bucket allocation math + consequences
- `backend/app/engine/rd.py` — program progression, milestone rolls, risk events
- `backend/app/engine/acquisition.py` — delivery queue tick
- `backend/app/engine/readiness.py` — per-squadron regeneration/degradation rules
- `backend/app/engine/rng.py` — seeded RNG streams (namespaced per subsystem)
- `backend/app/engine/turn.py` — end-of-turn orchestrator calling all subsystems in order
- `backend/app/crud/campaign.py` — wire `advance_turn` to call the orchestrator
- New API endpoints: `POST /api/campaigns/{id}/budget`, `POST /api/campaigns/{id}/rd/{program_id}`, `POST /api/campaigns/{id}/acquisitions`
- Tests: engine math, multi-turn simulations, replay-determinism assertions

**Starting-state population:** When Plan 1's `create_campaign` runs, it should populate the pre-seeded state from `docs/content/platforms-seed-2026.md` — MRFA Rafale delivery queue, Tejas Mk1A contract, S-400 queue (4th sqn May-2026, 5th Nov-2026), Astra Mk2 production July-2026, AMCA Mk1 R&D active, etc. This is a data-loading task that lives here (Plan 2) rather than Plan 1 because it touches R&D and Acquisition tables.

**Explicitly NOT in scope:**
- Adversary-side anything (Plan 3)
- Vignettes / combat (Plan 4)
- LLM AARs / intel briefs (Plan 5)
- Frontend UI for budget/R&D/acquisition (Plan 7)

---

## Plan 3 — Adversary Simulation & Intel

**Goal:** Parallel-world simulation of PLAAF + PAF + PLAN. Adversary force tree evolves on authored roadmap. Intel system generates cards with HUMINT/SIGINT/IMINT/OSINT/ELINT sources, varying confidence, and truth values (some intel is wrong). Fog-of-war filter hides ground truth from player.

**Deliverable:** Each turn, adversary state advances on roadmap; player receives 4–7 intel cards; 1-in-3 roughly is wrong. No vignettes yet. Tests verify 2026→2036 adversary evolution matches authored roadmap.

**Depends on:** Plan 2 (turn engine).

**Key new modules:**
- `backend/app/engine/adversary/__init__.py`
- `backend/app/engine/adversary/roadmap.py` — authored PLAAF/PAF/PLAN timelines
- `backend/app/engine/adversary/tick.py` — per-turn evolution
- `backend/app/engine/adversary/doctrine.py` — doctrine tiers + adversary style evolution
- `backend/app/engine/intel/__init__.py`
- `backend/app/engine/intel/generator.py` — intel card authoring (structured, no LLM)
- `backend/app/engine/intel/fog.py` — truth-filtering
- `backend/content/adversary_roadmap.yaml` — authored events
- `backend/content/intel_templates.yaml` — intel card archetypes
- Extended seed: PLAAF 2026 starting OOB, PAF J-35E deal pre-seeded as visible event
- Tests

**Explicitly NOT in scope:**
- LLM intel briefs (Plan 5 adds the ~every-2-3-quarters long-form intel brief)
- Player-managed intel capability (parked, Future Improvements)
- Vignette triggering based on adversary state (Plan 4)

---

## Plan 4 — Vignette Engine

**Goal:** Scenario template system + procedural scenario generation + deterministic combat resolver. Every turn rolls against the threat curve; ~35% mid-campaign probability of vignette firing.

**Deliverable:** When a vignette fires, backend returns a **planning state** (AO, adversary force, clock, allowable Indian force commitments subject to geography/readiness/support). Frontend-facing API lets player commit assets + ROE; backend auto-resolves with seeded RNG; returns structured event trace + outcome. No LLM yet — AAR is a stubbed terse string. No UI — testable via curl.

**Depends on:** Plan 3 (adversary state + intel).

**Key new modules:**
- `backend/app/engine/vignette/__init__.py`
- `backend/app/engine/vignette/generator.py` — template + procedural fill
- `backend/app/engine/vignette/planning.py` — planning-screen state machine (what can the player commit?)
- `backend/app/engine/vignette/resolver.py` — deterministic combat sim
- `backend/app/engine/vignette/detection.py` — radar power vs. RCS bands
- `backend/app/engine/vignette/bvr.py` — no-escape-zone approximations, EW modifiers
- `backend/app/engine/vignette/trace.py` — structured event trace writer
- `backend/content/scenario_templates.yaml` — ~8 MVP archetypes
- API: `GET /api/campaigns/{id}/vignettes/pending`, `POST /api/campaigns/{id}/vignettes/{vignette_id}/commit`, `GET /api/campaigns/{id}/vignettes/{vignette_id}`
- Tests: combat math, replay determinism, threat-curve frequency over 1000 sim turns

**Explicitly NOT in scope:**
- LLM AAR narratives (Plan 5)
- Tactical live-play (stays parked — Future Improvements)
- 2D tactical replay visualization (V1.1 post-MVP)
- Map-based vignette UI (Plan 8)

---

## Plan 5 — LLM Integration (OpenRouter)

**Goal:** Wire OpenRouter as the game's narrative/content layer. AARs, intel briefs, emerging-ace names, year-end recaps, end-of-campaign retrospective — all LLM-generated from structured game state via versioned prompt templates.

**Deliverable:** Vignette outcomes now include rich 4–8 paragraph AAR narratives. Every 2–3 quarters, a long-form intel brief appears. Emerging ace names get attached to squadrons after notable wins. Year-end recap fires on Q4 rollover. End-of-campaign retrospective generates when Q40 ends. All cached by input hash so regeneration is free.

**Depends on:** Plan 4 (vignettes produce event traces) + Plan 3 (intel briefs need adversary state to summarize).

**Key new modules:**
- `backend/app/llm/__init__.py`
- `backend/app/llm/client.py` — OpenRouter HTTP client (OpenAI-compatible)
- `backend/app/llm/cache.py` — input-hash-keyed persistence
- `backend/app/llm/prompts/__init__.py`
- `backend/app/llm/prompts/aar_v1.py`
- `backend/app/llm/prompts/intel_brief_v1.py`
- `backend/app/llm/prompts/ace_name_v1.py`
- `backend/app/llm/prompts/year_recap_v1.py`
- `backend/app/llm/prompts/retrospective_v1.py`
- `backend/app/api/llm.py` — endpoints to trigger/retrieve LLM outputs
- Env: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- Tests: mock OpenRouter HTTP, prompt-renders-correctly tests, cache-hit tests

**Explicitly NOT in scope:**
- Fake-headline press feed (parked)
- Twitter/X OSINT simulation (parked)
- Pilot-quote interviews (parked)
- Chai-stall rumor channel (parked)

---

## Plan 6 — Frontend MVP Part 1: Map + Core UI Primitives

**Goal:** Replace the raw-JSON frontend shell from Plan 1 with a real UI. Subcontinent map as landing screen (MapLibre + OSM), platform media pipeline from Wikimedia, reusable primitives (long-press dossier, commit-by-hold button, radar chart, swipe-stack).

**Deliverable:** Player opens the game, sees the map of India with airbase pinpoints, can toggle layers (AD coverage, intel contacts), tap a base to see squadron stack. Long-press any platform → dossier modal. These primitives get reused across later frontend plans.

**Depends on:** Plan 1 (frontend scaffold) + Plan 2 (backend state to render).

**Key new modules:**
- `frontend/src/components/map/SubcontinentMap.tsx` — MapLibre canvas
- `frontend/src/components/map/ADCoverageLayer.tsx` — SVG radar bubbles
- `frontend/src/components/map/IntelContactsLayer.tsx`
- `frontend/src/components/primitives/PlatformDossier.tsx` — long-press-triggered modal
- `frontend/src/components/primitives/CommitHoldButton.tsx` — 2-second press-and-hold
- `frontend/src/components/primitives/RadarChart.tsx`
- `frontend/src/components/primitives/SwipeStack.tsx` — reusable intel/card swiper
- `frontend/src/components/primitives/SquadronCard.tsx`
- `frontend/src/hooks/useLongPress.ts`
- `frontend/public/platforms/` — hero photos, 3-views, crests (gitignored from LFS bloat, fetched by script)
- `scripts/fetch_platform_assets.py` — Wikimedia Commons asset fetcher with attribution
- `frontend/package.json` — add `maplibre-gl`, `recharts` (or custom SVG), `react-spring` or similar for gestures
- Vitest component tests for primitives

**Explicitly NOT in scope:**
- Full procurement dashboards (Plan 7)
- Vignette UI (Plan 8)
- Luxe map features (animated logistics, R&D glow, weather, heatmaps — parked V1.5+)
- Drag-to-rebase (parked)

---

## Plan 7 — Frontend MVP Part 2: Procurement Flows

**Goal:** The six procurement subsystems become real screens, each reachable from the map. Budget allocation (5-bucket stepper UI), R&D dashboard, acquisition pipeline (Gantt-style delivery timeline), force structure, airbase management, diplomacy relations.

**Deliverable:** Player can actually play a turn — spend budget, start/cancel R&D programs, respond to acquisition offers, rebase squadrons, upgrade airbases. Mobile-first card stacks, responsive to laptop.

**Depends on:** Plans 2 + 6.

**Key new modules:**
- `frontend/src/components/procurement/BudgetAllocator.tsx`
- `frontend/src/components/procurement/RDDashboard.tsx`
- `frontend/src/components/procurement/AcquisitionPipeline.tsx`
- `frontend/src/components/procurement/ForceStructure.tsx`
- `frontend/src/components/procurement/AirbaseManager.tsx`
- `frontend/src/components/procurement/DiplomacyPanel.tsx`
- `frontend/src/pages/CampaignSetup.tsx` — Turn-0 objective picker
- `frontend/src/pages/SituationRoom.tsx` — the full dashboard (replaces Plan 1's CampaignConsole)
- Expanded Zustand stores for each subsystem

**Explicitly NOT in scope:**
- Vignette planning / ops room (Plan 8)
- End-of-campaign screen (Plan 9)
- Fancy data-viz beyond radar charts + gantts (sankeys parked)

---

## Plan 8 — Frontend MVP Part 3: Vignettes + Intel Screens

**Goal:** Ops Room planning screen for vignettes (geography-aware force commitment). Intel swipe-stack each quarter. AAR reader that renders the LLM narrative beautifully.

**Deliverable:** Full end-of-turn loop plays out: intel cards appear → player reviews → decisions → end turn → vignette fires (if rolled) → Ops Room opens → player commits → AAR displays. Campaign feels like a game.

**Depends on:** Plans 4, 5, 6, 7.

**Key new modules:**
- `frontend/src/components/vignette/OpsRoom.tsx` — planning screen
- `frontend/src/components/vignette/AARReader.tsx` — renders LLM markdown AAR with section formatting
- `frontend/src/components/intel/IntelSwipeStack.tsx`
- `frontend/src/components/intel/IntelBriefReader.tsx`
- `frontend/src/components/vignette/ForceCommitter.tsx` — subject to geography/readiness
- `frontend/src/pages/TurnResolution.tsx` — end-turn flow orchestrator

**Explicitly NOT in scope:**
- 2D tactical replay animation (V1.1 candidate)
- Drag-strike-route gesture (parked)

---

## Plan 9 — Campaign End + Polish

**Goal:** When Q40 ends, campaign closes with the full **Defense White Paper** screen, LLM retrospective, and shareable campaign-card PNG. Named squadrons with emerging aces get UI treatment. Year-end one-line LLM recap fires on Q4 rollover.

**Deliverable:** Full campaign playthrough now has a satisfying end state. Screenshot-worthy.

**Depends on:** Plans 5 (retrospective LLM), 7, 8.

**Key new modules:**
- `frontend/src/pages/DefenseWhitePaper.tsx`
- `frontend/src/components/endgame/ObjectiveScoreCard.tsx`
- `frontend/src/components/endgame/ForceEvolutionChart.tsx` — sparklines across 40 quarters
- `frontend/src/components/endgame/CampaignCardGenerator.tsx` — html2canvas PNG export
- `frontend/src/components/endgame/RetrospectiveReader.tsx` — renders LLM retrospective
- `frontend/src/components/endgame/EmergingAceCard.tsx` — surfaces named aces per squadron
- `frontend/src/components/endgame/YearEndRecapToast.tsx` — one-line recap animation on Q4 rollover
- `frontend/package.json` — add `html2canvas`

**Explicitly NOT in scope:**
- Career yearbook (parked V1.5+)
- Commissioned portrait (parked)
- Year-end video montage (parked)
- Retirement ceremonies (parked)

---

## Plan 10 — V1 Content Expansion + Balancing

**Goal:** Scale content from MVP levels (~30 platforms, 8 scenarios, 6 objectives, 10 R&D programs) to V1 levels (~60 platforms, ~20 scenarios, ~12 objectives, ~25 R&D programs). Full adversary roadmap for 2026–2036. Balance-pass through playtesting. Save/load robustness.

**Deliverable:** A first-complete-playable-campaign version of the game. Shippable as a solo hobby product.

**Depends on:** Plans 1–9 (needs the playable game to balance against).

**Work:**
- Expand `backend/content/*.yaml` files
- Playtesting → identify imbalances, tune numbers
- Fix edge cases found during 40-turn campaigns
- Harden save/load: schema migration story for in-flight campaigns, export/import JSON
- Attribution page for Wikimedia media

**Explicitly NOT in scope:** Anything in the V1.5+ backlog below.

---

## Plan 11 — V1 Release Polish + E2E Testing

**Goal:** Ship-ready polish pass. Fix remaining gameplay bugs, add the missing UX flourishes that make the game *feel* finished, wire Playwright E2E tests for release confidence, and clean up technical debt. After this plan, the game is deployable as a complete solo hobby product.

**Deliverable:** A polished, tested V1 with: tactical replay on AARs, squadron rebase, map polish, audio/visual feedback, Playwright E2E smoke tests, and all remaining carry-over fixes.

**Depends on:** Plans 1–10 (complete playable game with full content).

**Work — grouped by theme:**

### A. Gameplay Fixes (remaining carry-overs)

Items from the carry-over backlog that affect gameplay correctness:

1. **H-6KJ bomber empty loadouts** — free kills inflating `adv_kia` counts. Add realistic loadouts to `PLATFORM_LOADOUTS` (e.g. YJ-21, CJ-20 cruise missiles) and re-tune `success_threshold.adv_kills_min` on saturation-raid scenarios. (Plan 4 carry-over)
2. **Doctrine-aware adversary platform picking** — currently inventory-weighted, so PLAAF sends J-16s on modern CAPs. Add role-weighting so VLO platforms get picked for CAP and bombers/strikers get picked for strike roles. (Plan 4 carry-over)
3. **Role-based target selection in resolver** — currently uniform random. Strike packages should prioritize AWACS, CAP should prioritize strikers. Makes combat feel more realistic and AARs read better. (Plan 4 carry-over)
4. **LLM single-retry with jitter** — flaky OpenRouter 502s currently pass through. Add one retry with 1–3s jitter in `app/llm/client.py::chat_completion`. (Plan 5 carry-over)
5. **`vignette_resolved` CampaignEvent payload enrichment** — add AO + scenario_name to resolved events (currently only on `vignette_fired`). Retrospective prompts benefit from this. (Plan 4 carry-over)
6. **`datetime.utcnow()` deprecation sweep** — replace with `datetime.now(datetime.UTC)` across all CRUD files. (Plans 1–4 carry-over)
7. **UniqueConstraint on AdversaryState(campaign_id, faction)** — prevent silent duplicate on re-seed. (Plan 3 carry-over)
8. **Narrative race condition** — catch `IntegrityError` in `app/api/narratives.py::_wrap` and re-read via `find_narrative` on double-click. (Plan 5 carry-over)

### B. V1.1 UX — High Priority (promoted from backlog)

Core UX features that make the game feel complete:

9. **2D NATO-symbol tactical replay** on vignette AAR — lightweight SVG rendering of the 3-round engagement trace. Shows aircraft symbols moving, BVR/WVR exchanges, kills. Addresses "AAR feels flat" risk. Renders inside `VignetteAAR` page below the `AARReader`.
10. **Drag-to-rebase squadrons on map** — tap a squadron in `BaseSheet`, drag to another base marker. Backend already has `Squadron.base_id` FK. Need a `POST /api/campaigns/{id}/squadrons/{sqn_id}/rebase` endpoint + map gesture handling.
11. **Map polish** — animated logistics lines between bases with active acquisitions, R&D facility glow markers, force-density heatmap overlay option in `LayerTogglePanel`.

### C. Medium-Priority UX Polish (promoted from backlog)

Audiovisual flourishes that turn "functional" into "delightful":

12. **Audio cues** — radar ping on vignette alert, teletype clack on intel cards, Vajra drum on year-end. Use Web Audio API + small (<50KB each) OGG samples. Volume toggle in settings. Add haptic feedback (`navigator.vibrate`) on mobile for hold-to-commit completion.
13. **Animated procurement ceremony** — when `CommitHoldButton` completes on acquisition sign, show a brief stamp/seal animation overlay (~500ms). CSS keyframe, no heavy deps.
14. **CRT/amber theme option** — dark theme with scanline overlay + amber text. CSS custom properties swap. Toggle in a minimal settings menu (localStorage persisted).
15. **ForceEvolutionChart rename** — rename to `TreasurySparkline` to match what it actually plots. (Plan 9 carry-over)

### D. Platform Assets

16. **Fix asset-fetcher UA + expand manifest** — update `scripts/fetch_platform_assets.py` with browser-like UA. Expand `asset_manifest.yaml` to cover all 41 platforms. Run fetcher. Commit `attribution.json` sidecars (images remain gitignored). (Plan 6 carry-over)

### E. Playwright E2E Tests

17. **Playwright E2E smoke tests** — wire 4–6 critical-path tests against `E2E_BASE_URL` (default: `https://pmc-tycoon.skdev.one`). Config already exists at `frontend/playwright.config.ts` with mobile + desktop projects. Tests:
    - Create campaign → lands on map view
    - End Turn → quarter advances, budget changes
    - Navigate to Procurement → tabs work, can see platforms
    - Trigger vignette → Ops Room → commit force → AAR page renders
    - Navigate to Intel → cards display
    - Play through to Q40 → white paper renders (optional long test, can be `test.slow()`)
18. **`mapStore.activeLayers` localStorage persistence** — save toggles so page reload doesn't lose them. (Plan 6 carry-over)

### F. Remaining Minor Debt

19. **Duplicate vignette query in summary endpoint** — consolidate `_year_snapshots()` and main query. (Plan 9 carry-over)
20. **RCS_DETECTION_MULTIPLIER split** — separate detection range multiplier from P_kill multiplier in `bvr.py`. Currently dual-purposed. (Plan 4 carry-over)

**Explicitly NOT in scope (remains in V1.5+ backlog):**
- Sankey diagrams, retirement ceremonies, year-end montage, career yearbook, squadron banter
- Fake-headline press feed, Twitter/X OSINT, pilot-quote interviews, chai-stall rumors
- Draw-strike-route gesture, Tinder-style platform comparison
- Player-managed intel capability, deterrence feedback loop
- Multiplayer, real-world news ingestion, tactical live-play, tri-service expansion

---

## V1.5+ Backlog (parked — not plans, candidate future work)

Items explicitly deferred during design. Revisit after V1 ships.

**UX upgrades (deferred from Plan 11):**
- Sankey diagrams for budget flow
- Retirement ceremonies for outgoing platforms / squadrons
- Year-end montage / cinematic reel
- Full career yearbook + commissioned portrait at campaign end
- Squadron banter text channel with personality

**Content/world upgrades:**
- Fake-headline press feed (Indian / Chinese / Pakistani newspapers)
- Twitter/X OSINT simulation
- Pilot-quote interviews after vignettes
- Chai-stall rumor channel for low-confidence intel
- Draw-strike-route gesture during vignette planning
- Tinder-style platform comparison swipes

**Mechanics upgrades:**
- Player-managed intel capability (invest in RISAT / HUMINT / SIGINT)
- Deterrence feedback loop (adversary aggression adjusts to player strength)

**Long-horizon future improvements** (spec §9):
- Multiplayer / PvP
- Real-world news ingestion ("Defense News Desk" — Shape 2 from design brainstorm)
- Tactical live-play vignettes (player makes turn-by-turn calls)
- Tri-service expansion (army, navy, strategic triad depth)

---

## How to update this file

**When a plan starts:** change status to `🟡 in progress`, update "Last updated" at top.

**When a plan completes:** change status to `🟢 done`, note the PR / commit range if useful.

**When a plan's detailed task file is written:** update the link in Current Status Summary.

**When scope changes mid-plan:** note it in the relevant plan section; if it's big, write a new decision log entry in `docs/decisions/`.

**When V1.5+ backlog items get promoted to real plans:** move them out of the backlog section into a numbered plan.

This file exists so future sessions (including after context loss) can pick up immediately without re-deriving the whole roadmap.
