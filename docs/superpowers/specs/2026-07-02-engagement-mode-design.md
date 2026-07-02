# Engagement Mode — Design Spec

**Date:** 2026-07-02
**Status:** Approved direction (this session); supersedes the "Phase B Combat Cinema" scope of the 3D roadmap — the passive cinema replay is subsumed (auto-resolve players simply skip the battle; a trace-driven cinema can return later as polish).
**Prototype:** validated through 9 iterations (`proto-dogfight.html`, session scratchpad / owner's Desktop). Real-time arcade air combat in three.js is fun, runs in the WebView, and needs **no game engine** (no Unity/Godot).

## What it is

When a vignette fires, the player can **fly the engagement** instead of auto-resolving it: a 60–120 second real-time arcade battle (Ace Combat-lite — bank-to-turn steering, lock-on, missile choice, flares; no sim-grade flight) rendered in three.js over the real AO terrain, using the AI-generated fleet models. **Auto-resolve remains one tap and untouched; Story mode keeps Stand Down.** This is the renegotiation of decision D8: a tactical *layer*, not a flight simulator — and it exists to make force-building pay off viscerally ("you buy your combat power, then you fly it").

## Player experience

1. Ops Room: commit squadrons/support as today → choose **⚔ Lead the engagement** or **⚡ Auto-resolve**.
2. Battle screen: you fly the lead of one committed squadron (wingmen = its other airframes, visible in formation). **Switch squadrons** mid-battle (camera jumps to that flight's lead). Enemies are the vignette's actual adversary force (real models: J-20/JF-17/F-16…).
3. Controls (prototype-proven): virtual stick / WASD; TGT cycle lock; tappable weapon chips; FIRE; FLARE (limited). HUD: crosshair, altitude bar with terrain tick, per-target distance + in-range guidance, hit/miss/decoy callouts, launch camera riding each missile.
4. Outcome: kills/losses/munitions feed the same AAR, grades, economy, and objective scoring as auto-resolve.

## Procurement drives combat power (the point of the feature)

- **Weapons** = the squadron's real loadout classes + the base depot's actual stock (counts shown on the chips; empty depot = no chip).
- **Radar/lock range** per platform tier (`platforms.yaml`); **enemy RCS** (J-20) shortens your lock range.
- **AWACS committed** = full picture: all contacts typed + ranged at any distance, early launch warnings. **No AWACS** = degraded: "⚠ NO AWACS ON STATION" banner (prototype-proven), bogeys unlabeled until locked, markers only inside your own radar cone, late missile warnings.
- **Tanker** = extended engagement timer; **flare stock** finite; airframe speed/agility from platform stats.

## Scale model: you fight your flight, the engine fights the rest

The player commands one flight (≤4 airframes) at a time. Player kills/losses/munitions are **literal**; the remainder of the committed force vs the remainder of the adversary force resolves through the **existing seeded resolver**, and outcomes merge into one result. This keeps the arcade fight readable (≤ ~8 aircraft on screen), preserves balance mass, and means a skilled player tilts — but does not replace — the battle.

## Determinism (recorded-outcome model)

Skill-driven battles cannot replay from a seed. The interactive battle's **result is recorded as a player action** (like a budget commit): stored on the vignette, replay reproduces identical campaign state from the action log. The auto-resolve path stays byte-identical seeded. `test_replay_determinism` extends to cover stored engagement results. Backend applies **plausibility caps** (kills ≤ adversary count, munitions ≤ depot stock, losses ≥ 0…) — sufficient anti-cheat for a single-player game.

## API surface (small)

- `POST /api/campaigns/{id}/vignettes/{vid}/commit` gains `mode: "auto" | "interactive"`; interactive reserves the vignette (status `engaged`) and returns an **engagement briefing** (player squadrons + loadouts/stocks, adversary force w/ fidelity per intel, AO coords, support flags, time budget).
- `POST .../vignettes/{vid}/engagement-result` submits `{flight_kills, flight_losses, munitions_expended, flares_used, disengaged}` → backend validates caps, resolves the residual force via the existing resolver, merges, writes outcome/events/AAR exactly like commit does today.
- Abandon/timeout: an `engaged` vignette with no result falls back to auto-resolve on next turn advance (no stuck campaigns).

## Frontend shape

- Route `/campaign/:id/vignette/:vid/engage`; combat runtime extracted from the prototype into `frontend/src/combat/` (pure-testable modules: flight kinematics, guidance, AI state machine, lock logic, outcome tally — separated from the three.js render layer per house convention).
- Terrain: runtime terrarium tiles for the AO (CORS is fine on http(s) origins — the prototype's failure was `file://`-only); procedural ridge fallback + explicit indicator (silent fallback hid a bug once).
- Models: `models3d/` minis + variant aliases; missiles = the prototype's procedural model.
- Android: pixel-ratio cap, 60fps target on mid-range (prototype patterns), landscape prompt.

## Prototype-learned rules (bake into implementation, they were all real bugs)

1. **Camera logic must never touch the simulation path** — the frozen-world bug (camera block early-returned out of the frame loop) produced every "missile points backwards" report.
2. Verify motion with **state deltas, not single screenshots**; expose a debug state hook (`?test`).
3. Orientation: Tripo aircraft face **-X** (yaw-fix −π/2); missiles oriented by explicit quaternion (geometry nose axis → velocity), never `Object3D.lookAt`.
4. Launch missiles **on-bearing to the target**; ¾ rigid missile cam (dead-behind reads as backwards); enemy ordnance visually distinct (red bodies).
5. Embedded/bundled assets over runtime fetches where offline matters; silent fallbacks need visible indicators.

## Build phases (~3 plans)

| Phase | Scope | Risk |
|---|---|---|
| E1 backend | commit `mode`, briefing payload, engagement-result endpoint + caps + residual-resolve merge, `engaged` fallback, determinism tests | resolver-adjacent — heavy test gating |
| E2 combat runtime | `frontend/src/combat/` port of the prototype with real-data adapters (briefing → entities), pure-module tests, E2E screenshot+delta harness | biggest code chunk |
| E3 integration | Ops Room entry, squadron switching, AWACS/fog layer, outcome→AAR flow, Android perf pass, debug APK | UX polish |

## Non-goals

- No sim-grade flight (stalls, fuel physics, landings), no PvP, no VR.
- WVR guns/dogfight micro-mechanics: missiles + flares only in v1.
- No change to auto-resolve outcomes, economy math, or Story mode.
