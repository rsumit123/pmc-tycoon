# Chakravyuh 3D Roadmap — Design Spec

**Date:** 2026-07-02
**Status:** Approved (design conversation, this session)
**Scope:** Three sequential phases that add 3D presentation to Chakravyuh. Render-layer only — the seeded engine, replay determinism, backend APIs, and campaign data are untouched by every phase.

An interactive HTML preview of all three phases was built and approved during design (Tab A = real MapLibre terrain; Tabs B/C = three.js impressions). Two amendments came out of the preview review and are binding:

1. **Trace-accuracy invariant (Phase B):** the 3D combat replay renders *only* events present in the stored vignette `event_trace`. Same squadrons, same platform types and counts, same launches, same kills, same outcome. No invented action, ever.
2. **AI-generated realistic models (Phases B/C):** aircraft models come from an image → 3D generation pipeline (concept render or real photo → Tripo/Meshy image-to-3D → cleanup → GLB), not from CC-sourced Sketchfab models. The stylized low-poly class models are a fallback tier only.

---

## Why 3D

Engagement. The game's systems depth is done (v2); the presentation ceiling is now the flat map and SVG replay. Three targeted 3D upgrades give: a dramatically better most-viewed screen (map), a shareable emotional peak (combat replay), and a collection/pride loop (hangar) — without a game-engine rewrite. Everything runs in the existing React + Capacitor WebView stack via WebGL.

**Explicitly rejected:** porting to Unity/Godot/Babylon. It discards ~260 components, 259 frontend tests, auth, and the Android pipeline for months of work. Chakravyuh's depth is systems, not twitch graphics.

---

## Phase A — Theater Command (3D map hub)

The `/campaign/:id` map becomes a pitched, terrain-relief theater view.

- **Dependency bump:** `maplibre-gl` 4.7 → 5.x. Our usage (raster tiles, DOM markers, flyTo, GeoJSON layers) is API-stable across the bump; the marker-projection tests + an Android device check gate the upgrade.
- **Terrain:** `raster-dem` source using free, keyless AWS Terrain Tiles (terrarium encoding, `s3.amazonaws.com/elevation-tiles-prod`), `setTerrain` exaggeration ~1.5, plus a hillshade layer (separate dem source — MapLibre requires terrain and hillshade to use distinct sources) tinted to the brand palette. Sky/atmosphere via `setSky` in the `#0a0f1c` family.
- **Camera choreography:**
  - Default view pitched ~55°, slight bearing.
  - Base tap → `flyTo` (zoom ~9.5, pitch ~63) as the BaseSheet opens; closing the sheet returns to overview.
  - Vignette fired → camera snaps to the AO with a red pulse marker.
  - All camera moves use `essential: true` and respect reduced-motion.
- **3D volumes (three.js custom layer):** AD coverage rendered as translucent 3D domes sized by `coverage_km`; ISR orbits as rings at altitude. MapLibre's documented custom-layer + three.js bridge; no deck.gl.
- **Unchanged:** readiness-ring DOM roundels, MapLegend, HUD frame, BaseSheet, all deep-links.
- **Perf/fallback:** "3D terrain" settings toggle persisted to localStorage (default on); automatic fallback to the current flat map on WebGL context failure; pixel-ratio cap on the map canvas.
- **Testing:** camera/dome math extracted to pure modules (unit-tested); the WebGL canvas itself stays out of jsdom per existing convention (`markerProjection.ts` pattern).

## Phase B — Combat Cinema (3D vignette replay)

A cinematic, skippable 3D rendering of resolved vignettes on the AAR page.

- **New deps:** `three`, `@react-three/fiber`, `@react-three/drei` — all inside a lazily-loaded route chunk (zero cost to users who never open it).
- **Replay compiler (pure TS, heavily unit-tested):** `event_trace` → keyframe timeline. Input: the trace phases (detection, BVR rounds at 120/50 km, WVR merge at 15 km, AD engagements) with their launch/kill/miss events. Output: a declarative script of positions, missile flights, kill flashes, and captions. **Trace-accuracy invariant applies: every visual event maps 1:1 to a trace event.** Committed squadrons, adversary composition, weapons, and outcome are read from the same vignette payload the 2D replay uses.
- **Scene:** terrain-toned ground plane, formation fly-in, missile trails, kill flashes, AD dome engagements when batteries fired. IND tinted cyan, adversary rose (faction palette already established).
- **Camera director:** wide establishing → missile chase-cam → kill flash → outcome tableau; total 30–45 s; scrub bar + skip; reuses `EventTicker` captions and the existing WebAudio cues.
- **Models:** decimated LODs (~4k tris) of the Phase C AI-generated fleet, matched by `platform_id`; stylized class model as fallback for platforms without a generated model.
- **Placement:** "▶ 3D Replay" panel on `VignetteAAR`, above the 2D `TacticalReplay`, which remains as the lite/low-end fallback (auto-selected on WebGL failure).

## Phase C — Hangar Bay (3D platform showcase)

Rotatable realistic models in the platform dossier, with AR on Android.

- **Viewer:** `@google/model-viewer` web component inside `PlatformDossier` — drag-to-rotate, idle auto-rotate, exposure/lighting tuned to the command-UI look, and the native **AR button** on Android (Scene Viewer).
- **Asset pipeline (new script `scripts/generate_platform_models.py` + manifest):**
  1. Reference image per platform — real photo for existing aircraft; AI concept render for AMCA/prototypes, generated via **OpenRouter image models using the existing `OPENROUTER_API_KEY`** (proven 2026-07-02: Gemini image model produced a clean studio-style AMCA render for ~cents).
  2. Image-to-3D via the **Tripo API** — **PoC PASSED 2026-07-02**: full pipeline (upload → `image_to_model` task → poll → GLB download) ran hands-free off the API **free wallet** (600 credits, expires **2026-07-16**); the AMCA task cost **30 credits** and returned a 6.9 MB textured GLB with correct stealth geometry, canopy, and wing roundel. ~570 credits remain ≈ ~19 more models → the whole hero fleet is effectively free if batched before expiry. License caveat: free-wallet outputs may carry free-tier (CC-BY-style) terms rather than paid commercial terms — fine for a free game with the existing `/credits` attribution page; buy one paid month if the game ever monetizes. Open-source fallback also validated: Hunyuan3D-2 (HF space) produced good untextured geometry at zero cost; TRELLIS spaces were down/quota-blocked.
  3. Cleanup: decimate to two LODs (hero ≤30k tris, replay ≤4k tris), Draco-compress via `gltf-transform`, bake to ≤2 MB (hero) / ≤150 KB (replay).
  4. Manifest records generator, input image source, and license terms; surfaces on the existing `/credits` page.
- **Delivery:** hero GLBs are lazy-fetched (served with the frontend, HTTP-cached), NOT baked into the APK; replay LODs (small) ship in-bundle. Fallback chain per platform: generated model → stylized class model → photo → silhouette.
- **Unlock hook:** R&D completion `UnlockBanner` gains "Inspect in 3D →" deep-link to the dossier.

---

## Sequencing, risks, releases

| Phase | Effort | Key risk | Mitigation |
|---|---|---|---|
| A | ~1 plan | maplibre v5 regressions; WebView terrain perf | projection tests + Android device check; persisted toggle + flat fallback |
| B | ~1.5 plans | mid-range Android scene perf; compiler fidelity | low-poly LODs, pixel cap, 2D fallback; compiler is pure + unit-tested against real traces |
| C | ~1 plan | AI model quality/cleanup effort | free-tier PoC gates the spend; stylized fallback fills gaps |

- Order: **A → C-PoC (✅ done 2026-07-02) → fleet batch generation (time-boxed: free credits expire 2026-07-16) → B → C**. Phase B consumes Phase C's replay LODs; the PoC proved quality, so the batch should run early even though the full Hangar Bay ships last.
- Each phase: own plan doc, subagent-driven execution, commit to `main`, versionCode-bumped closed-testing AAB.
- Owner tasks: ~~Tripo account + PoC~~ (done — account created, API key issued, PoC run agent-side). Remaining owner call: regenerate the Tripo API key after the batch (it was pasted in a chat session), and decide on a paid month only if the game monetizes.

### PoC verdict (2026-07-02)

Riskiest unknown resolved: realistic AI-generated models are viable at ~zero cost. Textured Tripo AMCA judged in the preview hangar — approved look; pipeline scripted end-to-end (OpenRouter concept image → Tripo API → GLB → three.js viewer). Interactive preview artifact: `chakravyuh-3d-preview.html` (session scratchpad / owner's Desktop), with GLB drag-and-drop in the Hangar Bay tab.

## Non-goals

- No engine/backend changes; no new endpoints. Replay determinism fingerprint untouched.
- No live-controlled 3D combat (D8 still parked). The replay is a rendering of a decided result.
- No VR; AR limited to what model-viewer gives for free.
