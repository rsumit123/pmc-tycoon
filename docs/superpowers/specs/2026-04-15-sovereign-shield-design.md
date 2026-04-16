# Sovereign Shield — Design Spec

**Date:** 2026-04-15
**Status:** Design approved, pending implementation planning
**Replaces:** "PMC Tycoon" (defense-game repo) — complete revamp

---

## 1. Game Identity

A browser-based, single-player grand strategy game built for a defense-enthusiast audience of one. The player is India's **Head of Defense Integration** (conceptually, MoD procurement + strategic direction). They manage India's air power and strategic long-range strike capability across a 10-year campaign (2026–2036, 40 quarterly turns), facing real-world named adversaries: PLAAF, PAF, PLAN.

The dopamine target is **spec-porn procurement decision-making** (compare Rafale follow-on vs. Tejas Mk2 ramp vs. AMCA acceleration; weigh Meteor integration cost against Astra Mk2 indigenous maturity) with **authored tactical payoff** (when crises fire, your force composition is tested in geographically realistic vignettes).

Non-goals: tactical live play, tri-service management, multiplayer, realism at simulator grade, polished onboarding for strangers.

## 2. Core Loop

Each session = one in-game quarter = ~20 minutes real-time. Three phases:

**Phase 1 — Intel & State Review (3–4 min).** Situation Room dashboard. Intel feed (4–7 cards, mixed fidelity). Force tree by base. R&D queue. Active events awaiting decisions.

**Phase 2 — Decisions (10–12 min).** Six subsystems:
1. **Budget** allocation across R&D / Acquisition / O&M / Spares / Infrastructure (~₹1.55L cr/quarter, with consequences for under-funding each bucket).
2. **R&D** decisions: start / cancel / accelerate programs across an Indian tech tree (AMCA, Tejas Mk2, TEDBF, Ghatak, Astra Mk2/3, Rudram, Pralay, BrahMos-NG, Uttam AESA, DRDO AEW&C Mk2, hypersonic research). Milestones carry risk events.
3. **Acquisitions**: respond to foreign offers (Rafale follow-on, S-400 follow-on, F-21/F-18 bids, MQ-9B) with realistic delivery timelines (2–5 years from signing to FOC).
4. **Force structure**: rebase squadrons, upgrade loadouts, raise new squadrons, retire.
5. **Airbases**: upgrade ~15 IAF bases (shelters, fuel depots, AD integration, runway class, forward-repair). Strategic east vs. west posture.
6. **Diplomacy** (lightweight): relations with France/US/Russia/Israel/UK gate offers; no full grand-strategy diplomacy.

**Phase 3 — Resolution (3–5 min).** End turn. Engine executes in order: R&D progress + milestone rolls → acquisition deliveries → adversary tick → intel generation → threat roll. ~35% mid-campaign chance of vignette firing.

## 3. Vignettes (Payoff Layer)

When a vignette fires, game enters the **Ops Room** planning screen. Constraints mirror a real theatre command:

- **Geography**: every squadron is based at a real IAF base. Only assets within combat radius (with/without tanker support) can be committed.
- **Clock**: each scenario has a response window (30–120 in-game minutes). Assets not already positioned may not arrive in time.
- **Readiness**: squadron readiness % determines airframes actually flyable this instant.
- **Support chain**: AWACS orbit coverage, IL-78 tanker tracks, SEAD package availability, ground-based AD overlap all matter.
- **Adversary A2/AD**: HQ-9 / PL-17 CAPs constrain approach corridors.

Player **composes the response** (chooses squadrons, loadouts, supporting assets, ROE). Engine runs a **deterministic sim with seeded RNG**: detection based on radar power vs. RCS band, BVR engagements using no-escape-zone approximations (Meteor ~60–80km NEZ, PL-15 ~50–70km, etc.), EW modifiers, readiness modifiers, squadron XP.

Output: structured **event trace** → passed through OpenRouter to LLM → **thick AAR** (4–8 paragraph Janes/ORF-style narrated report). AAR references actual loadouts, call signs, and tactical sequence. Expected cost ~₹2–5 per AAR.

## 4. Adversary Intelligence & World Simulation

Adversaries are not a threat curve — they are a **parallel simulated world**.

**Adversary force models.** PLAAF / PAF / PLAN start campaign with realistic 2026 OOBs and evolve on authored roadmaps: J-35A induction wave ~2028–2032, J-36 late-campaign, PL-17 widespread mid-campaign, YJ-21 ASBM operational 2027, etc. Units rotate between bases. Procurement executes on schedule, visible to the player only via intel.

**Intel system with fog of war.** Player sees intel products, not ground truth:
- HUMINT (RAW / IB) — variable reliability
- SIGINT (orbital + ground)
- IMINT (RISAT / Cartosat imagery)
- OSINT (Chinese social media, Pakistani press, Janes)
- ELINT (radar emissions)

**Rumors can be wrong.** Some intel cards carry false information. Player may commit R&D or procurement decisions based on intel that turns out incorrect. Deliberate tension.

**LLM intel briefs** every 2–3 quarters (3–6 paragraph R&AW / NTRO-styled assessments, LLM-generated from filtered adversary state).

**Adversary doctrine evolves.** Early-campaign PLAAF fights conservatively; mid-campaign integrates EW + stealth push; late-campaign saturation raids (J-20 + J-35 + H-6K + YJ-21 combined strikes against carrier groups). Pakistan J-35 induction is a plausible mid-campaign shock event.

## 5. Campaign Arc

**Setup (Turn 0).** Player picks: starting year (default **2026-Q2**), difficulty preset (*Relaxed / Realistic / Hard-Peer / Worst-Case*), 3–5 objectives from ~12, starting force posture (default historical).

**Historical grounding.** The campaign opens against a real 2026 backdrop, one year after the **May 2025 India-Pak limited air engagement** ("Operation Sindoor" reference). The player inherits:
- 31 active IAF fighter squadrons against authorized 42 (real 2024-25 parliamentary finding)
- A pre-signed **MRFA Rafale deal** (114 jets, F4 standard, Feb 2026 DAC approval, first sqn 2027-Q4)
- **Tejas Mk1A contract** (97 jets signed Sep 2025, delivery rolling 2026-2030)
- **S-400 deliveries in flight**: 4th sqn May 2026, 5th Nov 2026, follow-on 5-sqn AoN cleared Mar 2026
- **Astra Mk2** series production starting Jul 2026
- Active R&D: AMCA (first flight 2028-29, serial prod 2035), Tejas Mk2 (LRIP 2033), Astra Mk3 ramjet, Rudram-2/3, BrahMos-NG, Ghatak UCAV, TEDBF
- **Adversary starting posture**: PLAAF ~500 J-20 airframes, J-35A inducting, J-36 demonstrator flying; Pakistan J-35E deal signed Jan 2026 (40 + 30 option, first deliveries early 2026)

Full seed data maintained in `docs/content/platforms-seed-2026.md` — the content pipeline uses this as its starting state.

**Sample objectives:** Operational AMCA Mk1 squadron by 2035; 65% indigenization in air-launched weapons by 2036; no loss of sovereign territory; 3 operational CBGs; maintain 42+ fighter squadron strength; zero CAATSA sanctions; deter Pakistan below escalation threshold; dominate IOR; defense exports ≥ ₹50,000 cr cumulative.

**Three acts:**
- **Act 1 (2026–2028, Q1–Q12)** — inheritance era, plant R&D seeds.
- **Act 2 (2029–2032, Q13–Q28)** — rising tension, R&D starts delivering.
- **Act 3 (2033–2036, Q29–Q40)** — the reckoning, force shape mostly locked.

**End state.** Q40 triggers **Defense White Paper**: objective PASS/PARTIAL/FAIL grades, force posture score, indigenization chart, casualty record, doctrine scorecard, 3–5 career-defining vignette callouts, S–F grade, and an **LLM-generated 6–10 paragraph defense-historian retrospective**.

**No savescumming.** One autosave slot per campaign. Vignette outcomes are canon.

## 6. Technical Architecture

**Stack (keep existing defense-game repo, refactor in place, prune unused code).**

- **Frontend**: React 19 + Vite + TypeScript + Tailwind + **Zustand** for state. Mobile-first responsive, desktop graceful. Card-stack UI on phone, multi-column reflow on laptop.
- **Backend**: FastAPI + SQLAlchemy + SQLite. One DB, one campaign row per save.
- **LLM**: OpenRouter (OpenAI-compatible). API key in backend env var. Default model Claude Haiku 4.5 / Gemini Flash class; swappable per request.
- **Hosting**: unchanged — Vercel (`pmc-tycoon.skdev.one`) + GCP VM Docker (`pmc-tycoon-api.skdev.one`), same deploy script.
- **Auth**: none initially. Single implicit user.

**Engine module boundaries (backend `app/engine/`):**
- `procurement/` — budget, R&D, acquisition, force structure (pure functions).
- `intel/` — fog-of-war, intel card authoring, intel brief generation.
- `adversary/` — parallel world simulation, OOB evolution, doctrine progression.
- `vignette/` — scenario generator, planning-screen state, deterministic resolution, event trace pipeline.
- `turn/` — end-of-turn orchestrator.
- `app/llm/` — OpenRouter client + versioned prompt templates (AAR, intel brief, retrospective).
- `app/api/` — thin REST layer.

**Determinism.** Every campaign has an RNG seed. All randomness draws from seeded streams. Same state + same seed = same outcome. LLM output is the one non-deterministic layer; structured event trace is cached so AAR regeneration is possible without re-running the sim.

**Domain model (persistent):** Campaign, Squadron, Base, RDProgram, AcquisitionOrder, IntelCard (with truth value stored for retrospective), AdversaryState, Vignette (with event trace + AAR), CampaignEvent (unified log).

**Domain model (static content, YAML in repo):** `platforms.yaml`, `scenario_templates.yaml`, `rd_programs.yaml`, `bases.yaml`, `objectives.yaml`, `doctrines.yaml`.

## 7. UX Direction

The game is a single-player browser experience for a defense-nerd audience. Text-heavy stat tables are the default failure mode. The UX target is an **IBMS / MoD workstation feel** — authentic, visually rich, spatial, gesture-driven on mobile.

**7.1 MVP UX commitments (all shippable in-scope)**

- **Real media on every card.** Platform hero photos, 3-view silhouettes, and squadron crests pulled from Wikimedia Commons. Built-time fetch script populates `frontend/public/platforms/`. Fallback SVG silhouettes for missing assets.
- **Map-first primary interface.** Subcontinent map (MapLibre + OSM tiles — free) is the landing screen. Airbase pinpoints, adversary base pinpoints, two layer toggles (AD coverage = SVG radar bubbles; intel contacts = fading dots with confidence rings). Tap a base → squadron stack modal. Procurement dashboards are *entered from the map*, not from a sidebar.
- **Swipe-stack intel cards.** Each quarter's intel feed is a Tinder-style swipeable stack. Swipe to dismiss, tap to expand, long-press for actions.
- **Long-press anywhere → platform dossier.** Every platform reference in the UI supports a long-press gesture that opens a full spec sheet (hero photo, 3-view, radar chart, history). Reused everywhere.
- **Commit-by-hold for irreversible decisions.** Signing a ₹3L cr deal or cancelling a major R&D program requires a 2-second press-and-hold on a confirm button with a progress ring. Makes the weight real.
- **Radar charts for platform comparisons.** When evaluating acquisitions or comparing own vs. adversary fleets, use radar charts (the standard defense-journalism visual). No side-by-side stat tables.
- **Named squadrons with call signs + XP + emerging aces.** Squadrons carry real-or-plausible names (Golden Arrows, Tigersharks). XP accumulates across vignettes. After notable wins, an "emerging ace" is named by the LLM with a one-line trait, attached to the squadron card.
- **End-of-year one-line LLM recap.** When Q4 rolls over, an LLM-generated single sentence summarizes the in-game year. Displayed during year-transition animation.
- **Shareable campaign card** at campaign end. `html2canvas` renders a PNG of the end-of-campaign infographic: grade, 6 key stats, highlight headline, timeline sparkline. Screenshot-shareable.

**7.2 UX principles**

- **Mobile-first responsive.** Card-stack and bottom-sheet patterns on phone, multi-column reflow on laptop. No info-dense desktop-only dashboards.
- **Spatial before list.** If data has a location, it lives on the map first.
- **Progressive disclosure.** Long-press / tap-to-expand, never cram a stat block into a summary card.
- **Physical weight for big decisions.** Commit-by-hold, explicit confirmations for >₹1L cr spends.
- **Diegetic minimum** — classification banners, IST clock, military iconography, but no over-stylized teletype/CRT effects in MVP (saved for later).

**7.3 Deferred to V1.5+ (explicitly not MVP)**

To keep MVP shippable, these are named out loud and left until post-MVP:

- Animated logistics lines, R&D facility glow, weather overlays, sector heatmaps on map
- Drag-to-rebase squadrons on map (use modal action in MVP)
- Draw-strike-route gesture during vignette planning
- Tinder-style platform comparison swipes (use radar chart comparison modal instead)
- Diegetic teletype text reveals and CRT/amber themes
- Animated signing stamp / procurement certificate ceremony
- 2D tactical replay of vignettes (the LLM-generated AAR carries the moment in MVP)
- Audio and haptic feedback
- Sankey budget flow diagrams (use simple stacked bar in MVP)
- Fake-headline press feed (Hindustan Times / Global Times style)
- Twitter/X OSINT simulation
- Pilot-quote interviews after vignettes
- Chai-stall rumor channels
- Retirement ceremonies, year-end video montage, full career yearbook, commissioned portrait
- Squadron banter text channel

These are real features worth building — just not in MVP. Revisit post-first-playable.

**7.4 Asset pipeline**

- **Build-time fetch script** at `scripts/fetch_platform_assets.py` — reads `platforms.yaml`, resolves Wikimedia Commons URLs per platform, downloads hero image + 3-view silhouette + squadron crest where applicable, writes to `frontend/public/platforms/{platform_id}/`, commits manifest with attribution. Run manually during content updates.
- **Fallback SVG silhouettes** — hand-authored or pulled from Wikimedia vector sources for platforms missing imagery.
- **Attribution screen** — one low-traffic settings page listing sources and Creative Commons attributions.

## 8. Content Pipeline

**Platform stats (~15 fields each):** combat_radius_km, payload_kg, max_speed_mach, ceiling_ft, rcs_band, radar_type, radar_range_km, ewi_capability, bvr/wvr/agm slots, cost_cr, operating_cost_per_hour, gen, intro_year, retirement_year.

**Authoring process:** LLM-assisted first-pass population of platform stats from public sources, human review/correction, commit. Semi-realistic — *plausible, gameable*, not canonical truth.

**Scenario templates:** ~25–30 archetypes, hand-authored YAML. Adversary composition specified as role/platform/count-range with probabilities. Trigger gates by quarter + intensity. Per-vignette procedural fill for AO, clock, adversary roadmap state, ROE.

**Adversary roadmap:** Authored once for 2026–2036 based on publicly reported Chinese/Pakistani timelines. Procurement executes on schedule.

**MVP vs V1 vs V2:**
- **MVP**: ~30 platforms, ~8 scenario templates, ~6 objectives, ~10 R&D programs. Enough for a first 10-turn playable slice.
- **V1**: ~60 platforms, ~20 templates, ~12 objectives, ~25 R&D programs, full adversary roadmap. First complete campaign.
- **V2**: balancing passes, expanded variety.

## 9. Future Improvements (Explicitly Deferred)

Parked during design discussion; worth revisiting post-V1:

- **Player-managed intel capability** — invest in RISAT constellation, SIGINT platforms, HUMINT assets to raise intel quality. Feels authentic; out of MVP scope.
- **Deterrence feedback loop** — adversary aggression adjusts down when player is overmatchingly prepared. Dropped for cleaner "world doesn't care" design; easy to add back.
- **Multiplayer / PvP** — India vs. Pakistan human-on-human.
- **Real-world news ingestion ("Defense News Desk")** — LLM-driven scenario generation from live RSS feeds.
- **Tactical live-play vignettes** — player makes turn-by-turn calls inside the vignette instead of auto-resolve.
- **Tri-service expansion** — ground forces (armor, artillery, MLRS), full naval surface/sub management, strategic triad depth.

## 10. Open Questions

Nothing blocking implementation planning. The following are tuning questions, answerable during playtesting:

- Exact vignette frequency curve (placeholder: 15% → 55% over 40 quarters)
- Balance of hand-authored vs. procedural scenario variety
- Platform cost curve calibration (gameable ₹ values vs. real-world pricing)
- AAR prompt engineering — which model produces the best narrative ROI

---

## Implementation Phasing (High-Level)

Detailed implementation plan lives in a separate document (to be written next via `writing-plans`). High-level phases:

1. **Repo cleanup** — prune obsolete PMC Tycoon models/engines/routes. Preserve deployment, auth scaffolding (if any), UI shell.
2. **Domain scaffolding** — new SQLAlchemy models for Sovereign Shield entities.
3. **Static content MVP** — author first-pass YAML for 30 platforms, 8 templates, ~10 bases.
4. **Engine core** — turn orchestrator, procurement math, adversary tick, intel generation. Pure-function design with seeded RNG.
5. **Vignette engine** — scenario generator, planning-screen state machine, deterministic resolver, event trace structure.
6. **LLM layer** — OpenRouter client, AAR prompt v1, intel brief prompt v1, retrospective prompt v1.
7. **Frontend shell** — Zustand store, routing, card-stack layout primitives, mobile-first responsive.
8. **Frontend views** — Situation Room, Procurement dashboards (6 subsystems), Ops Room (vignette planning), AAR reader, Campaign Setup, Defense White Paper.
9. **First playable slice** — 10-turn MVP campaign end-to-end.
10. **Content expansion to V1** — full 40-turn campaign playable.
