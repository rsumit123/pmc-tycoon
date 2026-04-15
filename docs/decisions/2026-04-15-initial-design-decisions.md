# Sovereign Shield — Initial Design Decision Log

**Date:** 2026-04-15
**Context:** Complete revamp of the "PMC Tycoon" / defense-game repo into a new game ("Sovereign Shield"). This log captures every significant decision taken during the brainstorming session, what alternatives were considered, why we picked what we did, and what we're giving up.

Read this before iterating on the design. If you want to change a decision, read the "Reasoning" and "What we gave up" sections first — most decisions have non-obvious tradeoffs.

---

## D1 — Scope: Personal playground

**Decision:** Game is built for the developer alone (audience of 1). Small scope, weekend-playable sessions, no concern for onboarding strangers, no balance tuning for mass appeal.

**Alternatives considered:** (B) Portfolio-quality indie game; (C) Ambitious long-term project with eventual community / multiplayer.

**Reasoning:** Honest answer about what he actually wants. Scope discipline is the single biggest factor in whether a hobby game ever ships. Starting narrow preserves the option to expand later.

**What we gave up:** Any polish targeted at strangers. If this ever becomes a public product, significant onboarding/art/balancing work will be needed.

---

## D2 — Dopamine target: Procurement + tactical payoff

**Decision:** Primary fun = spec-porn procurement decision-making (comparing platforms, weighing R&D bets, making purchase calls). Secondary = kill-chain tactical vignettes as the payoff that validates procurement decisions. Minor dash of real-world inspiration in some scenarios.

**Alternatives considered:** (C) Geopolitical chess / arms-trade map-painter; (D) Force-composition puzzle; (E) Live-news-driven roleplay.

**Reasoning:** The procurement layer is infinite content at low content cost (once platform stats exist, combinations are emergent). Kill-chain vignettes give emotional validation to strategic decisions. Rejected (E) pure news-driven because it creates a content-pipeline dependency and the resolution feels less visceral than geography-aware vignettes.

**What we gave up:** The unique "feels alive with current events" hook of a news-desk shape. Parked for Future Improvements.

---

## D3 — Campaign structure: Hybrid (objectives + threat curve) over a ~10-year arc

**Decision:** Player sets 3–5 strategic objectives at campaign start (~12 to choose from). Threat curve escalates independently regardless of player performance. Arc runs 2026–2036, 40 quarters. End-of-campaign report card with objective grades.

**Alternatives considered:** (A) Objectives only; (B) Threat curve only; (C) Scripted branching timeline; (D) Open-ended sandbox with no end.

**Reasoning:** Agency (player-chosen goals) + pressure (world doesn't adjust to you) creates tension. Rejected (C) because authoring branching timelines is the kind of content work that eats hobby projects. Rejected (D) because weekend-playable sessions still need stakes to be worth opening.

**What we gave up:** The narrative richness of a hand-authored branching history. Worth a look post-V1 if procedural scenarios feel flat.

---

## D4 — Adversaries: Specific, named (China + Pakistan)

**Decision:** PLAAF, PAF, PLAN with real platform names, real bases, real-ish capabilities and roadmaps.

**Alternatives considered:** Abstracted "Red Peer / Red Regional" stand-ins.

**Reasoning:** Game is for one defense-nerd user. Authenticity is the point. No political sensitivity concerns since it's not being distributed.

**What we gave up:** Plausible deniability if the game is ever shared. Would need a rename + platform re-skin for any public version.

---

## D5 — Command scope: Air + strategic long-range strike

**Decision:** IAF (fighters, AEW&C, tankers, air defense) + strategic strike (BrahMos regiments, Agni / Pralay TELs, ISR satellites). No army, no naval surface/sub management in MVP.

**Alternatives considered:** (A) Air only; (C) All three services; (D) Full MoD including nukes / space / cyber / special ops.

**Reasoning:** Air + strategic is where defense-nerd content density is highest (radars, missiles, EW, fighter generations). Tri-service triples the procurement dashboard width and content authoring burden. Sweet spot for hobby scope.

**What we gave up:** Carrier group gameplay, armor procurement decisions, artillery / MLRS duels. Named out loud in his original pitch; parked for Future Improvements with expectation of eventual expansion.

---

## D6 — Unit of management: Squadrons strategically, airframes in vignettes

**Decision:** Strategic layer manages ~40 named squadrons ("17 Sqn Golden Arrows — Rafale × 18, Ambala, readiness 82%"). Tactical vignettes zoom into individual airframes for flavor.

**Alternatives considered:** Fleet-aggregate management; individual tail-number tracking.

**Reasoning:** Squadrons give named-unit personality (you remember "my Golden Arrows got bloodied in 2029") without the grind of tracking 200 airframes. Vignette zoom delivers the individual-platform moment without strategic-layer overhead.

**What we gave up:** Football-Manager-extreme individual airframe lifecycle (maintenance cycles, pilot assignments per aircraft).

---

## D7 — Turn structure: One quarter per session, deep

**Decision:** 1 turn = 1 in-game quarter (3 months) = 1 session of ~20 minutes. 40 turns per campaign (~13 hours total).

**Alternatives considered:** (B) Multiple quarters per session, light; (C) Event-driven continuous time; (D) Two-phase (plan + watch).

**Reasoning:** A quarter matches how real defense establishments run (budget reviews, R&D milestones, readiness reports are quarterly). A year is too coarse for procurement granularity (you'd watch progress bars). A month is too fine at the strategic level. Rejected (C) because pause-on-event creates "did I miss something" anxiety.

**What we gave up:** Some quarters will feel "flat" (no vignette fires). Mitigated by ensuring every quarter has meaningful events (intel updates, R&D milestones, diplomatic offers, readiness issues).

---

## D8 — Vignette role: Player plans, engine resolves (B)

**Decision:** When a vignette fires, player enters an Ops Room planning screen: compose force response (squadrons, loadouts, support assets, ROE) subject to geography / basing / clock / readiness constraints. Engine auto-resolves deterministically with light RNG. Player does not micro-manage the fight.

**Alternatives considered:** (A) Pure after-action report with no player input; (C) Live tactical turn-by-turn play.

**Reasoning:** (A) makes vignettes feel disconnected from procurement decisions. (C) is a whole second game to design and balance, and explodes session length from 20 to 45+ minutes. (B) makes the procurement loop still the point while giving the player a visceral "last-mile commitment" moment that reflects their strategic choices.

**What we gave up:** The arcade pleasure of live tactical decision-making. Parked for Future Improvements as an optional vignette mode.

---

## D9 — Vignette constraints: Full geography, basing, readiness, clock, support chain

**Decision:** Vignette planning is constrained by real IAF base locations, combat radius with/without tanker support, scenario response clock (30–120 min), squadron readiness %, AWACS orbit coverage, tanker tracks, SEAD package availability, ground AD overlap, and adversary A2/AD corridors.

**Reasoning:** This is what makes procurement decisions actually matter. "Basing decisions matter — if I have 3 Rafale squadrons at Ambala and 0 in the east, the next Himalayan scenario is bad." This is the defense-nerd MoD brain.

**Side effect:** Airbases become a first-class managed asset — upgrade runway class, harden shelters, add fuel depots, integrate AD. Strategic east vs. west posture becomes a real choice.

**What we gave up:** Complexity. This is a lot to balance. Accepted because it's the core of the "decisions matter" loop.

---

## D10 — Platform stats: Semi-realistic (B)

**Decision:** Real platform names, real-ish rough numbers (combat radius in km, payload in kg, radar range vs. 3m² RCS, RCS tier bands, NEZ approximations). Not simulator-grade; not abstract.

**Alternatives considered:** (A) Abstract gameplay stats ("A2A/A2G/Survivability 1–10"); (C) Simulator-grade (actual RCS in m², real no-escape-zones).

**Reasoning:** Sweet spot between defense-nerd authenticity ("should I integrate Meteor or stick with Astra Mk2?") and hobby-feasibility (simulator-grade data entry is a multi-year job).

**What we gave up:** Full simulation authenticity. Accepted because plausibility is what matters for dopamine, not precision.

---

## D11 — UI: Mobile-first responsive, desktop graceful

**Decision:** Mobile is the primary target (developer plays most often on phone). Desktop must still look clean. Card-stack layouts on phone; multi-column reflow on laptop. No info-dense desktop-only dashboards.

**Reasoning:** Where the developer actually plays is where UI polish pays off.

**What we gave up:** Desktop info-density. A rich multi-pane strategic dashboard would be fun on a laptop but forces either a mobile-hostile design or two separate UIs.

---

## D12 — Turn rhythm: Three-phase (Review / Decide / Resolve)

**Decision:** 3–4 min intel/state review → 10–12 min decisions → 3–5 min end-turn resolution (possibly including a vignette).

**Reasoning:** Ritual structure, predictable session shape, always-meaningful quarters because even vignette-less quarters have intel/R&D/diplomatic events to engage with.

---

## D13 — Deterrence feedback: Dropped

**Decision:** Adversary aggression does NOT adjust down when player is overmatchingly prepared. Pure "world doesn't care" design.

**Alternatives considered:** Small deterrence effect (over-preparation reduces vignette frequency ~10%).

**Reasoning:** Simpler. Truer to the D3 promise of independent threat curve. Easy to add back if playtesting shows it's missed.

**What we gave up:** A plausible feedback loop that would reward force-planning for deterrence vs. combat.

---

## D14 — AAR depth: Thick LLM-generated narratives

**Decision:** Every vignette produces a 4–8 paragraph LLM-generated after-action report in Janes/ORF defense-journalism style. Structured event trace from the engine → OpenRouter → prose.

**Alternatives considered:** Terse AARs ("2 kills, 1 loss, tactical success").

**Reasoning:** This is probably the single highest dopamine-per-word feature for a defense nerd. Every vignette becomes a mini defense-journalism read. Cost is trivial (~₹50 per campaign).

**What we gave up:** Pure offline operation. LLM becomes a runtime dependency.

---

## D15 — LLM provider: OpenRouter (not Anthropic direct)

**Decision:** All LLM calls go through OpenRouter's OpenAI-compatible API. Default to cheap capable models (Claude Haiku 4.5 / Gemini Flash class); swappable via config.

**Reasoning:** Avoid provider lock-in. Enables trivial model-swap for cost or quality experiments. User brings their own OpenRouter key.

**What we gave up:** Direct access to Anthropic-specific features (prompt caching nuances, extended thinking APIs). Re-evaluate if those become compelling.

---

## D16 — Save model: No savescumming

**Decision:** One autosave slot per campaign. No manual save, no reload. Vignette outcomes are canon.

**Reasoning:** Spec-nerd brain will optimize the fun out of the game if it can reload bad rolls. Accepted canonical outcomes create tension and meaning.

**What we gave up:** Recovery from frustrating RNG. Trusting that deterministic sim + seeded RNG keeps variance reasonable.

---

## D17 — Adversary Intelligence: First-class system with fog of war

**Decision:** Player sees intel products (HUMINT/SIGINT/IMINT/OSINT/ELINT) with varying confidence. Some intel is wrong. LLM-generated intel briefs every 2–3 quarters. Adversary doctrine evolves over campaign.

**Reasoning:** User explicitly requested "as much opponent intelligence as possible." This converts adversary simulation from a threat curve into a felt parallel world.

**Sub-decision:** Rumors being wrong sometimes — kept. Creates authentic tension.

**Sub-decision:** Player-managed intel capability (invest in RISAT / HUMINT / SIGINT to raise intel quality) — parked for Future Improvements. Out of MVP scope.

---

## D18 — Tech stack: Keep existing defense-game repo, prune, refactor in place

**Decision:** Keep React 19 + Vite + Tailwind frontend and FastAPI + SQLite backend. Same deployment pipeline (Vercel + GCP VM Docker), same domains (`pmc-tycoon.skdev.one` + `pmc-tycoon-api.skdev.one`). Delete obsolete PMC Tycoon engines/models/routes; preserve deployment scaffolding.

**Alternatives considered:** Start clean in a fresh repo.

**Reasoning:** Deployment is already working. Domain infrastructure is set up. Basic FE/BE scaffolding is reusable. Only the game logic is wrong for Sovereign Shield.

**What we gave up:** Clean-slate mental freshness. Accepted because deployment overhead would cost more than pruning.

**Addition:** Zustand for frontend state (lighter than Redux).

---

## D19 — OpenRouter key storage: Env var

**Decision:** OpenRouter API key in backend env var. Single user, single deployment.

**Alternatives considered:** Encrypted backend user-settings table; browser localStorage BYOK.

**Reasoning:** Single-player personal game — user and deployer are the same person. Simplest possible solution.

**What we gave up:** Per-user BYOK if this ever becomes multi-user. Straightforward migration if needed.

---

## D20 — Engine determinism: Seeded RNG

**Decision:** Every campaign has an RNG seed. All randomness draws from seeded streams. LLM output is the only non-deterministic layer, and structured event traces are cached so AARs can be regenerated.

**Reasoning:** Testability, debugability, meaningful "this happened" feel, replay capability.

---

## D21 — Campaign grounded in real 2026 state (starting backdrop)

**Decision:** The default campaign (2026-Q2 start) opens against a historically real backdrop. Player inherits a real 31-squadron IAF, the just-signed MRFA Rafale deal (114 jets, Feb 2026), the Tejas Mk1A 97-jet contract (Sep 2025), active S-400 deliveries, Astra Mk2 series production starting Jul 2026, and active R&D on AMCA, Tejas Mk2, Astra Mk3, Rudram-2/3, BrahMos-NG, Ghatak, TEDBF. Backstory frame: one year after the May 2025 India-Pak limited air engagement.

Adversary starting posture is also real: PLAAF ~500 J-20s, J-35A inducting, J-36 demonstrator; Pakistan J-35E deal (signed Jan 2026) visible at campaign start as imminent threat evolution.

**Alternatives considered:** Neutral/generic 2026 with pre-seeded queues empty; player builds from scratch.

**Reasoning:** Defense-nerd target audience already carries this world-state in their head. Fighting the player's real-world knowledge is worse than embracing it. Pre-seeded queues also give the opening turns immediate decisions ("do I exercise the MRFA's in-built Make-in-India transfer clauses?") rather than empty-calendar drift.

**What we gave up:** Some flexibility in counterfactual "what if India had bought Su-57 instead" scenarios. Mitigated by offering difficulty presets and "what-if" posture options at Turn-0.

**Living reference:** `docs/content/platforms-seed-2026.md` holds all pre-seeded state (platform stats, delivery queue, R&D state, adversary OOB, missile specs). It will evolve; treat as the canonical seed rather than this decision entry.

---

## Future Improvements (from the design — not decisions, but parked ideas)

- Player-managed intel capability
- Deterrence feedback loop
- Multiplayer / PvP
- Real-world news ingestion ("Defense News Desk")
- Tactical live-play vignettes (player makes turn-by-turn calls inside vignettes)
- Tri-service expansion (army, navy, strategic triad)

---

## How to use this log

When iterating on the design:

1. **Before changing a decision**, read the original decision's "What we gave up" section. Many decisions intentionally traded off something you might now want back.
2. **Before adding a new feature**, check if it's already parked in Future Improvements — the reason it's parked is probably still valid.
3. **When making a new significant decision**, add it here with the same structure (decision / alternatives / reasoning / what we gave up).
