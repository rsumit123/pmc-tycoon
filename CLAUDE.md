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
- `docs/superpowers/plans/2026-04-16-foundation-plan.md` — Plan 1 (Foundation) detailed task-level plan. **Done.**
- `docs/DEPLOYMENT.md` — prod deploy runbook (Vercel frontend + GCP VM Docker backend).
- `README.md` — dev workflow pointers.

## Current status (last updated 2026-04-16)

- **Plan 1 (Foundation)** — ✅ done. 22 commits, 22 backend tests passing. End-to-end loop works: create campaign in browser → advance turn → see state update.
- **Next up: Plan 2 (Turn Engine Core)** — budget math, R&D progression with milestones/risk events, acquisition delivery queue, readiness regen/degradation, seeded-RNG turn orchestrator. Scope outlined in `ROADMAP.md` §Plan 2. Detailed task-level plan not yet written — invoke `writing-plans` skill when executing.

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

For the next plan (Plan 2):

1. Read `ROADMAP.md` §Plan 2 for scope + module boundaries.
2. Read Plan 1's `foundation-plan.md` briefly to see the per-task structure convention.
3. Read `docs/content/platforms-seed-2026.md` §"Campaign Starting Conditions" — Plan 2 populates the pre-seeded acquisition queue (MRFA, Tejas Mk1A, S-400) and R&D state (AMCA, Astra Mk2, etc.) into real DB rows.
4. Invoke the `writing-plans` skill (`superpowers:writing-plans`) to produce a detailed task-level plan, saved as `docs/superpowers/plans/YYYY-MM-DD-turn-engine-core-plan.md`.
5. Execute via `superpowers:subagent-driven-development`. Commit to `main`.
6. When the plan is done, update `ROADMAP.md` to mark Plan 2 🟢 done and bump the "Last updated" line.

## Conventions that matter across plans

- **Pure-function engine layer.** `backend/app/engine/` code takes state + seed in, returns new state. Deterministic. Side effects confined to `app/llm/` (OpenRouter calls) and `app/crud/` (DB writes).
- **Every campaign has an RNG seed** (`Campaign.seed`). Subsystems request a seeded `random.Random` instance via `app/core/rng.py::make_rng(seed)` so runs are replay-deterministic.
- **CampaignEvent is the unified log.** Every meaningful state change (R&D milestone, acquisition delivery, intel update, vignette outcome) writes a typed `CampaignEvent`. The end-of-campaign retrospective reads from this log.
- **Tests use in-memory SQLite** with `poolclass=StaticPool` (see `backend/tests/test_campaigns_api.py` fixture). Plan 1's `conftest.py` fixture is the template.
- **New content files go to `backend/content/`** and are loaded by `app/content/loader.py`. Add a loader function + registry singleton per new content type.

## What NOT to do

- Don't propose a rewrite of the old PMC Tycoon battle engine code. It was deliberately deleted.
- Don't propose tri-service scope (army/navy/triad details) for MVP — parked per D5.
- Don't add tactical live-play inside vignettes — parked per D8.
- Don't propose multiplayer, news-desk mode, or player-managed intel capability — all parked to V1.5+ in the ROADMAP backlog.
- Don't re-name `pmc-tycoon.skdev.one` URLs, deploy paths, or container names — intentional per D18.
- Don't use git worktrees or feature branches — commit to `main`.
