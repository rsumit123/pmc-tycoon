# Sovereign Shield — Claude working notes

**Important:** This file is auto-loaded into every Claude session in this repo. Treat it as the fast-onboarding page for picking up work in a fresh context.

## What this project is

Browser-based single-player grand strategy game. You play India's **Head of Defense Integration** from 2026 to 2036, managing IAF procurement / R&D / force structure across 40 quarterly turns. Adversaries are real named forces: PLAAF, PAF, PLAN. It's a personal hobby project for the repo owner (a defense enthusiast), audience of one — not shipping to strangers.

The repo was previously called **PMC Tycoon** (a mercenary-contractor game). All that code has been pruned. The deployment infrastructure still uses `pmc-tycoon.skdev.one` / `pmc-tycoon-api.skdev.one` URLs by deliberate choice (see Decision D18) — that is **not** a rename oversight.

## Authoritative docs (read before doing anything substantive)

- `docs/superpowers/plans/ROADMAP.md` — **start here.** High-level index of all plans, status of each, what's done / in progress / next.
- `docs/superpowers/specs/2026-04-15-sovereign-shield-design.md` — canonical game design spec (7 sections: core loop, vignettes, adversary intel, campaign arc, tech architecture, UX direction, content pipeline).
- `docs/decisions/2026-04-15-initial-design-decisions.md` — 22 design decisions (D1–D22) with alternatives considered, reasoning, and what was given up for each. **Read this before proposing a design change** — many decisions intentionally traded off things that might look tempting now.
- `docs/content/platforms-seed-2026.md` — real-world 2026 defense state used to populate starting conditions (MRFA Rafale deal, S-400 queue, PAF J-35E, etc.).
- `docs/superpowers/plans/2026-04-16-foundation-plan.md` — Plan 1 (Foundation). **Done.**
- `docs/superpowers/plans/2026-04-16-turn-engine-core-plan.md` — Plan 2 (Turn Engine Core). **Done.** Pattern reference for engine + CRUD + API layering.
- `docs/superpowers/plans/2026-04-17-adversary-simulation-intel-plan.md` — Plan 3 (Adversary + Intel). **Done.**
- `docs/superpowers/plans/2026-04-17-vignette-engine-plan.md` — Plan 4 (Vignette Engine). **Done.**
- `docs/superpowers/plans/2026-04-17-llm-integration-plan.md` — Plan 5 (LLM Integration / OpenRouter). **Done.**
- `docs/superpowers/plans/2026-04-17-frontend-map-primitives-plan.md` — Plan 6 (Frontend — Map + Core UI Primitives). **Done.**
- `docs/DEPLOYMENT.md` — prod deploy runbook (Vercel frontend + GCP VM Docker backend).
- `README.md` — dev workflow pointers.

## Current status (last updated 2026-04-17)

- **Plan 1 (Foundation)** — ✅ done. End-to-end loop works.
- **Plan 2 (Turn Engine Core)** — ✅ done. Pure-function engine (rng / budget / rd / acquisition / readiness / turn), seeded-RNG orchestrator, replay-determinism test, 3 player-action APIs.
- **Plan 3 (Adversary Simulation & Intel)** — ✅ done. Roadmap-driven PLAAF/PAF/PLAN evolution + intel generator with 5 source types + fog filter.
- **Plan 4 (Vignette Engine)** — ✅ done. 260 backend tests passing. 8 MVP scenario archetypes; threat curve 0.15→0.55 linear over 40 quarters. Full engine: `engine/vignette/` (threat, generator, planning with haversine, detection vs RCS bands, BVR weapon table + engagement_pk, 3-round resolver with ROE modifiers). Three new APIs: `GET /vignettes/pending`, `GET /vignettes/{id}`, `POST /vignettes/{id}/commit`. Resolver deterministic per (campaign.seed, year, quarter); replay test locks this in end-to-end. Backpressure via pending_vignette_exists check.
- **Plan 5 (LLM Integration — OpenRouter)** — ✅ done. 296 backend tests passing. `backend/app/llm/` layered as client → cache → service → prompts. Five versioned prompt modules (`aar_v1`, `intel_brief_v1`, `ace_name_v1`, `year_recap_v1`, `retrospective_v1`) self-register via `REGISTRY`. `LLMCache` de-duplicates by sha256(kind:version:model:input_hash). `CampaignNarrative` persists per-campaign output with `UniqueConstraint(campaign_id, kind, subject_id)` — idempotent generate-if-missing. Six endpoints under `/api/campaigns/{id}/…`: vignette AAR, intel-briefs generate, vignette ace-name, year-recap generate, retrospective, list narratives. 409 on eligibility failure (NarrativeIneligibleError), 502 on upstream 5xx, 500 on bad requests. **No auto-emission from `advance_turn`** — frontend triggers explicitly, replay determinism guarded by `test_advance_turn_does_not_create_llm_rows`. Tests stub `llm_service.chat_completion` via monkeypatch; httpx.MockTransport used in client tests; no network ever touched in CI.
- **Plan 6 (Frontend — Map + Core UI Primitives)** — ✅ done. 300 backend tests + 25 frontend vitest tests. MapLibre subcontinent map (OSM raster tiles) is now the `/campaign/:id` view; raw JSON moved to `/campaign/:id/raw`. Reusable primitives under `frontend/src/components/primitives/`: `useLongPress` (400ms hold, 8px move cancel), `CommitHoldButton` (2s hold fills progress bar), `RadarChart` (hand-rolled SVG, 3–8 axes), `SwipeStack` (pointer-drag, 80px threshold dismiss, reads clientX directly from pointerUp to avoid stale closure), `PlatformDossier` (modal with hero image + silhouette fallback + radar chart), `SquadronCard`. Map components under `frontend/src/components/map/`: `SubcontinentMap` (MapLibre canvas; WebGL — no unit test), `ADCoverageLayer` (SVG overlay scaled by squadron count), `IntelContactsLayer` (wired but fed empty array in MVP), `LayerTogglePanel` (corner UI), `BaseSheet` (bottom sheet). State: `mapStore` for layer toggles + selected base; `campaignStore` extended with `bases` + `platformsById`. Backend adds two read-only endpoints: `GET /api/content/platforms` and `GET /api/campaigns/{id}/bases`. Asset fetcher at `scripts/fetch_platform_assets.py` + manifest at `backend/content/asset_manifest.yaml` seed 6 platforms; downloaded JPEGs are gitignored per `frontend/public/platforms/.gitignore`, only `attribution.json` sidecars commit. Vitest setup adds `fakeTimers.toFake: ["setTimeout","clearTimeout","performance"]` + a `PointerEvent` polyfill in `src/test/setup.ts` (jsdom doesn't expose PointerEvent by default).
- **Next up: Plan 7 (Frontend — Procurement Flows)** — six procurement subsystems as mobile-first screens: budget allocator (5-bucket stepper), R&D dashboard, acquisition pipeline (Gantt), force structure, airbase management, diplomacy panel. Scope in `ROADMAP.md` §Plan 7.

## Working rules (important — these are user preferences, not defaults)

- **Commit directly to `main`.** No feature branches, no worktrees. Solo hobby repo. If a superpowers skill asks about branch strategy, skip past it — the answer is always "commit to main". (Saved as feedback memory.)
- **Don't over-review mechanical tasks.** Pure file-deletion or `npm install` tasks don't need full spec + code-quality review cycles. Use judgment.
- **Respect the decision log.** If you're tempted to revisit a design choice, read the relevant D-entry first. Many "obvious" improvements were deliberately rejected.
- **Mobile-first UI with laptop fallback.** Per D11. Don't propose info-dense desktop-only dashboards.
- **Semi-realistic stats, not simulator-grade.** Per D10. Real platform names, real-ish rough numbers. Never go deeper than gameplay needs.

## Tech stack snapshot

- **Backend:** FastAPI + SQLAlchemy 2.x (`Mapped[T]` / `mapped_column` — no legacy `Column(...)` patterns) + SQLite + Pydantic 2.x + pydantic-settings. YAML content in `backend/content/`.
- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind v4 (`@import "tailwindcss";`) + Zustand + axios + react-router-dom 7. No Redux.
- **LLM (future plans):** OpenRouter via env var `OPENROUTER_API_KEY` (BYOK). Model swappable via `OPENROUTER_MODEL`. Default `anthropic/claude-haiku-4.5`.
- **Hosting:** Vercel frontend at `pmc-tycoon.skdev.one`, GCP VM Docker backend at `pmc-tycoon-api.skdev.one`. Deploy via `./deploy.sh [frontend|backend|both]`.

## How to pick up work (fresh session kickoff)

1. Read `ROADMAP.md` §"Current Status Summary" — find the first `🔴 not started` row, note the plan number.
2. Read that plan's scope section in ROADMAP (e.g., `§Plan N`) for module boundaries + what's in/out of scope.
3. Skim the most recently-done plan doc in `docs/superpowers/plans/` — that's the current per-task convention (bite-sized TDD steps, exact code in every step, 13–15 tasks, intentional-red when one task's import comes from a later one).
4. Read `docs/content/platforms-seed-2026.md` if the plan touches content / starting state.
5. Invoke `superpowers:writing-plans` to produce the detailed task-level plan, saved as `docs/superpowers/plans/YYYY-MM-DD-<feature>-plan.md`.
6. Execute via `superpowers:subagent-driven-development`. Memory-saved preference: always pick subagent-driven, don't re-ask. Commit to `main`.
7. When the plan is done: mark it 🟢 in `ROADMAP.md`, bump the "Last updated" line, update the "Current status" block in this file (CLAUDE.md), and append any new tuning/carry-over items to the list below.

## Execution pattern that's been working

Each plan so far (2/3/4) lands in one session with this rhythm:
- **13–15 tasks** per plan. Too few → tasks too big to review; too many → excessive subagent dispatch cost.
- **Model per task:** cheapest that fits. Mechanical schema/YAML/types tasks → fast model, minimal review. Engine logic → standard model + optional spec review. Orchestrator + final → standard model + full review.
- **Intentional-red pattern:** when module A imports from module B not yet implemented, commit A with failing tests and a clear "Tests will fail until Task N lands B" caveat in the commit message. Next task closes the loop.
- **Final code review after all tasks** via `superpowers:code-reviewer`. Reviewers have caught real issues every time — never skip this.
- **Expect ~1 small plan bug per plan.** I (plan author) have consistently introduced small correctness bugs: off-by-one in formulas, sign-inversion in math, destructure order, stray YAML keys, test math not matching implementation. Implementers catch them. Accept their deviations when well-reasoned; don't force verbatim.
- Current backend test baseline (end of Plan 4): **260 tests**. Fresh work should preserve or grow this.

## Known carry-overs / tuning backlog

Items flagged by post-review that deserve attention when the relevant future plan lands — none block current plans:

- **Intel false-rate** lands ~0.18 not spec's "1-in-3" due to IMINT-heavy roadmap cards. Either rebalance source mix or update the spec target to ~0.22. (Plan 3)
- **Cancelled R&D program restart** creates duplicate rows in `rd_program_states` for the same `(campaign_id, program_id)`. No UI exposes cancel-then-restart yet; fix before Plan 7 wires the cancel button. Add `UniqueConstraint("campaign_id", "program_id")` or have `update_program` target only the active row. (Plan 2)
- **Underfunded acquisitions are effectively free** in MVP — orchestrator deducts full allocation from treasury regardless of bucket consumption, and the resolver logs a warning but delivery still proceeds. Plan to add schedule-slip-from-underfunding later. (Plan 2)
- **Integer cost rounding** accumulates over long R&D programs (~hundreds of cr under-invested at AMCA completion). Decimal or end-of-program reconciliation if financial reports get scrutinized. (Plan 2)
- **No `UniqueConstraint("campaign_id", "faction")` on AdversaryState** — re-seeding would silently duplicate. Add before any data-migration path. (Plan 3)
- **H-6KJ bombers have empty loadouts** in `PLATFORM_LOADOUTS`, so they're free kills that inflate `adv_kia` counts for saturation-raid scenarios; re-tune `success_threshold.adv_kills_min` when playtesting. (Plan 4)
- **Adversary platform picking is inventory-weighted, not doctrine-aware** — PLAAF often sends J-16s on modern CAPs because they have more of them. Narration will read flat in Plan 5 AARs. (Plan 4)
- **Target selection in resolver is uniform random** — no role-based prioritization (strike packages don't target AWACS first). Worth adding before Plan 5 LLM narration gets scrutiny. (Plan 4)
- **RCS_DETECTION_MULTIPLIER is dual-purposed** (drives both detection range and P_kill multiplier). Consider split or rename before Plan 10 content migration. (Plan 4)
- **`datetime.utcnow()` deprecation** warnings across several CRUD files — opportunistic sweep when touching each file next. (Plans 1–4)
- **`vignette_resolved` CampaignEvent payload** lacks AO + scenario_name (only `vignette_fired` has them). Retrospective (Plan 9) may want this on both. (Plan 4)
- **No retry/backoff around OpenRouter.** A flaky upstream returns 502 to the frontend; re-clicking generate retries. Add single-retry with jitter in `app/llm/client.py::chat_completion` if playtesting shows friction. (Plan 5)
- **Year-recap + retrospective inputs are partial in MVP.** `acquisitions_delivered`, `rd_milestones`, `notable_adversary_shifts`, `budget_efficiency_pct`, `notable_engagements`, `fifth_gen_squadrons_end` are all `[]` / `0` placeholders in `app/llm/service.py`. Plan 9 (Campaign End + Polish) should materialize these from `CampaignEvent` rows tagged with the year. (Plan 5)
- **No auto-invocation from `advance_turn`.** Frontend must explicitly POST to generate each narrative (deliberate — keeps replay deterministic and `advance_turn` fast). Reconsider if playtesting shows friction; add a fire-and-forget background job path before landing any auto-triggers. (Plan 5)
- **Ace-name endpoint returns `subject_id=null`** in its response because the picker is internal (`_pick_ace_squadron` picks squadron with most airframes). Clients resolve via `GET /narratives?kind=ace_name` which returns the proper `subject_id="sqn-{id}"`. If a cleaner API is needed, include the winning `squadron_id` in `GenerateResponse`. (Plan 5)
- **`year_recap.vignettes_won`** currently counts all resolved vignettes, not wins (placeholder). Refine to filter on `outcome.objective_met` when Plan 9 revisits year-recap. (Plan 5)
- **Token usage is logged in `LLMCache` but never surfaced.** Consider `GET /api/admin/llm-usage` before committing to OpenRouter credit spend tracking. (Plan 5)
- **Race between `find_narrative` and `write_narrative`** is not atomic in `app/llm/service.py`. Single-user hobby repo so a double-click surfaces as a 500 from `IntegrityError` on the `UniqueConstraint`. Catch `IntegrityError` in `app/api/narratives.py::_wrap` and re-read via `find_narrative` if it becomes a playtest annoyance. (Plan 5)
- **LLM cache row is flushed before `CampaignNarrative` row is committed.** If the narrative insert fails, the flushed cache row is rolled back too — but the upstream OpenRouter call already spent tokens. Retry spends tokens again. Fold both writes into a single flush if this surfaces as wasted spend. (Plan 5)
- **Plan 9 will enrich year-recap / retrospective input payloads** (currently `[]`/`0` placeholders). Bump the prompt `VERSION` from `"v1"` to `"v2"` rather than editing in place — otherwise existing cached v1 narratives stay cached for identical-looking inputs even after the enrichment lands. (Plan 5 → Plan 9)
- **`IntelContactsLayer` is wired but fed empty data in Plan 6.** Plan 8 should synthesize `IntelContact[]` from loaded intel cards: HUMINT/IMINT cards have `subject_faction` → use PLAAF/PAF/PLAN base lat/lon; OSINT/SIGINT cards that reference a specific system could anchor at the adversary's forward-base list. MVP leaves it as `contacts={[]}` in `CampaignMapView`. (Plan 6 → Plan 8)
- **Wikimedia Commons 403s the asset-fetcher UA** `sovereign-shield-asset-fetcher/0.1`. Script is structurally correct; the manifest needs a browser-like UA or an alternative image-source CDN before bulk fetch will succeed. Fetched images are gitignored either way. Revisit with Plan 10's content expansion. (Plan 6 → Plan 10)
- **`SubcontinentMap` has no unit test** — WebGL/canvas isn't viable under jsdom. Pure marker-projection math is tested (`markerProjection.test.ts`). An E2E Playwright smoke test against a real deployed URL is the intended complement; wire one once a staging env is stable. (Plan 6)
- **`kmToPixels` in `ADCoverageLayer`** uses a latitude-only approximation (~±3% within the subcontinent bbox). If zoom or AO extent exceeds ~20° latitude span, add cosine-correction. (Plan 6)
- **Platform asset manifest seeds 6 platforms.** The other ~24 platforms in `platforms.yaml` fall back to the generic `PlatformSilhouette` SVG. Plan 10's content expansion should expand the manifest + re-run the fetcher. (Plan 6 → Plan 10)
- **`mapStore.activeLayers` is session-local** — reload loses toggles. Intentional MVP; add localStorage persistence if playtesting shows friction. (Plan 6)
- **Vitest fake timers + `performance.now()`** — `vitest.config.ts` includes `performance` in `fakeTimers.toFake`, and `src/test/setup.ts` unconditionally replaces jsdom's rAF stub with a setTimeout-based polyfill. Required for `CommitHoldButton` to tick under fake timers. (Plan 6)
- **`api.ts` now exports `http`** (the axios instance) so vitest can spy on it. No runtime impact; the export is consumed only in tests. (Plan 6)

## Conventions that matter across plans

- **Pure-function engine layer.** `backend/app/engine/` code takes state + seed in, returns new state. Deterministic. Side effects confined to `app/crud/` (DB writes) and the future `app/llm/` (OpenRouter calls).
- **Every campaign has an RNG seed** (`Campaign.seed`). Each subsystem draws from its own stream via `app/engine/rng.py::subsystem_rng(seed, "<subsystem_name>", year, quarter)` — sha256-derived, isolated per (subsystem, turn). Subsystem names in use: `rd`, `readiness`, `adversary`, `intel`, `vignette` (threat roll + scenario pick), `vignette_resolve` (combat resolver). When adding a new subsystem, pick a unique name.
- **Orchestrator deep-copies inputs.** `engine/turn.py::advance` deep-copies all mutable state from ctx before handing to subsystems, so subsystem shallow-copy bugs don't leak across turns. Preserve this when extending.
- **CampaignEvent is the unified log.** Every meaningful state change writes a typed `CampaignEvent` tagged with the FROM clock (the turn it happened in, NOT the post-advance clock). Canonical event types pinned in `backend/tests/test_event_vocabulary.py::CANONICAL_EVENT_TYPES` — new event types must be registered there.
- **Replay determinism** is tested end-to-end in `backend/tests/test_replay_determinism.py`: same seed + same actions on two independent in-memory DBs → identical fingerprint (Campaign fields + intel cards + adversary state + pending vignettes). Extend the fingerprint when adding new persistent player-visible state.
- **Tests use in-memory SQLite** with `poolclass=StaticPool` (see `backend/tests/test_campaigns_api.py` fixture). Every API test file uses the same fixture pattern.
- **New content files go to `backend/content/`** and are loaded by `app/content/loader.py`. Add a `@dataclass(frozen=True)` loader + `@lru_cache(maxsize=1)` registry singleton per new content type. Remember to add to `registry.reload_all()`.

## What NOT to do

- Don't propose a rewrite of the old PMC Tycoon battle engine code. It was deliberately deleted.
- Don't propose tri-service scope (army/navy/triad details) for MVP — parked per D5.
- Don't add tactical live-play inside vignettes — parked per D8.
- Don't propose multiplayer, news-desk mode, or player-managed intel capability — all parked to V1.5+ in the ROADMAP backlog.
- Don't re-name `pmc-tycoon.skdev.one` URLs, deploy paths, or container names — intentional per D18.
- Don't use git worktrees or feature branches — commit to `main`.
