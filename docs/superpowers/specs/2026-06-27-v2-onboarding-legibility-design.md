# Chakravyuh v2 — Onboarding & Legibility (Phase 1) Design

> Historical note: the game was "Sovereign Shield" through Plans 1–23; "Chakravyuh" since 2026-06-20. This is the first design doc of the **v2 simplification** effort (post-Play-Console release prep).

**Date:** 2026-06-27
**Status:** Approved (design); ready for planning.

## Why v2

After a deep review (frontend flows, turn engine + every mechanic, new-player cold start), the finding: Chakravyuh is **deep, but most of that depth is optional** — yet nothing tells a new player that, and the cold-start experience assumes defense-domain knowledge. The barriers, in order of severity, are: (1) zero onboarding (no tutorial/tooltips/guided turn), (2) a ~40-term jargon wall with no glossary, (3) blind upfront choices (difficulty values + objective consequences hidden), (4) information scattered across 18 routes, (5) a few overwhelming screens, (6) an unforgiving economy.

**v2 principle:** *Don't cut depth — make the default path simple and let depth be opt-in.* "Easy to learn, deep if you want it."

## v2 roadmap (4 phases)

1. **Onboarding & Legibility** (this doc) — glossary/tap-to-define, coach-marks over the real UI, setup clarity, How-to-Play rewrite. Frontend + content only; lowest risk; highest casual-user payoff.
2. **Streamline the core loop** — budget presets + "keep allocation" autopilot + readiness health bars (raw 5 buckets under "Advanced"); live objective tracker; turn-start Situation Report.
3. **Tame heavy screens** — recommended force-package auto-fill + plain odds in the vignette; auto-restock munitions toggle; route consolidation (Hangar+Armory → "Force"; Performance+Combat History → "Records").
4. **Easy/Story mode** — forgiving difficulty tier (generous budget, gentler threat ramp, auto-restock default) + vignette retreat/re-roll (touches the deterministic resolver + replay-determinism test — design carefully).

Phases are sequential. This doc specs Phase 1 only.

## Platform constraint (applies to ALL v2 work)

Chakravyuh ships as a **web app (Vercel)** AND a **Capacitor Android app** (Play closed testing). Every change must work in the Android WebView, not just the browser:
- **Tap, not hover** — all interactions trigger on tap.
- **Safe-area insets** — use existing `safe-pt` / `safe-pb` utils so overlays never hide behind the notch/status bar.
- **Hardware back button** — overlays/popovers must intercept the Capacitor back button (`@capacitor/app`) to dismiss themselves rather than navigate away. There is an existing `useBackButtonClose` hook (`frontend/src/lib/useBackButtonClose.ts`) — reuse it.
- **Touch targets** ≥ 44px; **narrow screens** (<360px) must not clip popovers.
- **Verify on an Android build/emulator** (`npm run cap:sync` + Android Studio) in addition to vitest.

## Phase 1 scope

### 1. Glossary / tap-to-define system

**Term registry** — `frontend/src/lib/glossary.ts`: a typed map of ~40 terms → `{ term, short (one-line), why? (optional "why it matters") }`. Terms include at minimum: BVR, WVR, SEAD, ROE, NEZ, RCS, VLO/LO (stealth bands), AWACS, tanker, FOC, first delivery, interceptor stock, missile stock, readiness, O&M, spares, R&D, acquisition, vignette, AO, posture, doctrine, 4th/4.5/5th-gen, multirole, air superiority, ISR, UCAV, ARM, anti-ship, sortie, ace, XP, squadron, airframe, grant, treasury, runway class, AD battery, coverage, blowback, intel quality/confidence.

**`<Term>` primitive** — `frontend/src/components/primitives/Term.tsx`:
- Renders `children` (the word) with a subtle dotted underline + a small info affordance.
- **Tap** opens a popover (definition + optional "why it matters"). A second tap / outside-tap / back-button closes it.
- Popover auto-positions to remain fully on-screen (flip above/below, clamp horizontally) on phones.
- Looks up the definition by a `term` key (defaults to the lowercased text). Unknown key in dev → console warn (no crash). A unit test asserts every key referenced in shipped components exists in the registry.
- Reuses `useBackButtonClose` for the Capacitor back button.

**Glossary screen** — `frontend/src/pages/Glossary.tsx` at route `/glossary` (public, like `/credits`): A–Z searchable list of all terms with definitions. Linked from the hamburger menu (SETTINGS section) and from the How-to-Play guide.

**Wiring** — apply `<Term>` to the highest-jargon, highest-traffic surfaces first: ForceCommitter (BVR/WVR/ROE/AWACS/tanker/SEAD/readiness), StrikeBuilder (profiles, ROE, blowback), PlatformDossier/RoleInfo (RCS/VLO/gen/role), AcquisitionPipeline (FOC/first delivery/NEZ/interceptor stock), and the How-to-Play guide. Don't attempt to wire every term everywhere in Phase 1 — cover these surfaces, the rest can follow.

### 2. Coach-marks (guided first turn, over the real UI)

**Coach-mark primitive** — `frontend/src/components/onboarding/CoachMarks.tsx` (+ a small controller/store):
- Given an ordered list of steps `{ targetSelector | ref, title, body, placement }`, render a dimmed full-screen overlay with a "spotlight" cutout around the target element and a tooltip card with **Next / Back / Skip** and a step counter ("2 of 5").
- Spotlight rect is computed from the target's bounding box; **respects safe-area insets** so the card never sits under the notch / status bar; clamps on-screen for narrow phones.
- Hardware **back button** = "Back" (or dismiss on first step); reuse `useBackButtonClose`.
- If a target isn't on screen yet (e.g., behind a closed menu), the step may specify an action hint or be skippable; keep the engine resilient to missing targets (skip gracefully, never crash).

**First-run sequence** (on `CampaignMapView` after a campaign is created, only if not seen before):
1. Welcome + "you are India's Head of Defense Integration; here's the map."
2. Top bar — treasury + per-quarter net + outstanding orders (link these terms to glossary).
3. The hamburger menu — "everything lives here: Procurement, Hangar, Intel…".
4. The **End Turn** button — "advance the quarter when you're ready."
5. (Deferred to first vignette) — a one-time overlay on the **Ops Room** explaining force commitment, support, ROE (no combat-engine change).

**State + replay:** a `tutorial_seen_v1` flag in `localStorage` (persists in the WebView). A **"Replay tutorial"** entry in the hamburger SETTINGS section resets/launches it. First-run auto-launch only when the flag is unset AND it's the player's first turn.

**Out of scope for Phase 1:** a separate scripted sandbox campaign; making the first vignette guaranteed-winnable (that's Phase 4 — it touches the deterministic resolver).

### 3. Setup clarity (Landing)

On `frontend/src/pages/Landing.tsx`:
- **Difficulty**: each option shows the **real starting/quarterly grant** (e.g., "₹45,000 cr/quarter") and a one-line "what changes" (budget pressure). Source the numbers from the same constants the backend uses (`BASE_QUARTERLY_GRANT_CR` × multiplier) — expose via a small content endpoint or mirror the constants in the frontend with a test guarding they match.
- **Quick Start** button: one tap → beginner-friendly difficulty (Relaxed) + a sensible 3-objective bundle (e.g., "Maintain 42+ squadrons", "Modernize to 4.5-gen majority", "Maintain fiscal discipline") + a default name → straight into the campaign.
- **Objective cards**: add a short **cost/time hint** per objective (e.g., "AMCA: ~9 yrs of R&D", "Stealth: needs VLO platforms by 2035") and a **"Beginner-friendly"** tag on the low-difficulty ones. Hints can be authored as metadata in the objectives content (`backend/content/objectives*.yaml`) or a frontend lookup keyed by objective id; prefer extending the content so backend stays source of truth.

### 4. How-to-Play rewrite + bug fix

On `frontend/src/components/guide/HowToPlayGuide.tsx`:
- Tighten copy, link jargon to `<Term>` / the glossary, add a "casual path" note ("you can win by allocating budget, buying a few jets, and fighting vignettes — the rest is optional depth").
- **Fix the J-20/J-35 error**: the guide currently implies J-20/J-35 are player-procurable; they are **adversary-only**. Reword to "adversary stealth fighters (J-20/J-35) are hard to kill — you need numbers or your own 5th-gen (AMCA)."
- Add a link to the full Glossary screen.

## Testing

- **Vitest**: `Term` (renders, opens/closes popover, unknown-key safe); a registry-coverage test (every term key used in components exists); `CoachMarks` (step navigation, skip, missing-target resilience); Landing (Quick Start fills the form + enables Assume Command; difficulty shows grant figures); Glossary screen renders all terms. Preserve the existing frontend baseline (~216 tests) and grow it.
- **Android verification**: build via `npm run cap:sync` + Android Studio (or emulator); manually confirm tooltips/coach-marks open on tap, stay on-screen, and dismiss on the hardware back button; confirm safe-area spacing on a notched device.
- No backend logic changes expected beyond (optionally) objective metadata + a difficulty-constants read path; replay-determinism unaffected.

## Decisions captured
- Tutorial = **coach-marks over the real UI** (not a separate sandbox). Cheaper, no parallel content to maintain.
- Glossary = **inline tap-to-define** everywhere + a browsable Glossary screen. Best for mobile/discoverability.
- **Forgiving first combat deferred to Phase 4** (engine risk); Phase 1 gives the first vignette only an explanatory coach-mark.
- Commit directly to `main`; execute via subagent-driven-development (per repo convention).
