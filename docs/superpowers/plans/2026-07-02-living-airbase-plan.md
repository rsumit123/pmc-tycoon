# Living Airbase (3D Squadron Minis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player flies into a friendly base on the 3D map, small 3D models of the distinct aircraft types stationed there appear parked around the base — zoom-gated so the theater overview stays clean.

**Architecture:** A new `SquadronMiniLayer` (three.js MapLibre custom layer, same bridge as `ADDomeLayer`) renders per-base miniatures from decimated "mini" GLBs bundled in `frontend/public/models3d/`. Pure, tested modules decide *what* to show (`models3d.ts` registry with variant aliases) and *where* (`apronLayout.ts` arc placement). Minis render only when `terrain3d` is on AND zoom ≥ 7.5. Prototype-validated on 2026-07-02 (`proto-living-airbase.html`).

**Tech Stack:** three (already a dep), maplibre-gl 5 custom layer, gltf-transform CLI for asset prep, Draco decoder bundled locally for offline Android.

**Non-negotiable lessons from the prototype (2026-07-02):**
- Custom layers MUST use `options.defaultProjectionData.mainMatrix` (NOT `modelViewProjectionMatrix`, which type-checks but renders nothing — see `ADDomeLayer.tsx` comment / commit d069843).
- `map.queryTerrainElevation()` returns elevation WITH exaggeration already applied — do not multiply by 1.5 again; it can return null before terrain tiles load (build meshes on the map's `idle` event; fall back to 0).
- glTF models are Y-up; mercator space is Z-up with y growing south → mesh matrix = `T(x,y,z) · S · Rz(-yaw) · Rx(π/2)`.
- Dispose geometry/materials/renderer in the effect cleanup (ADDomeLayer pattern), never `triggerRepaint()` from a static layer.
- **Visual features need visual verification** — Task 5 includes a real screenshot check, not just green tests.

**Test baseline:** frontend 273.

---

### Task 1 (controller-run): Mini GLBs + local Draco decoder

**Files:**
- Create: `scripts/build_mini_models.sh`
- Create: `frontend/public/models3d/<id>.glb` (committed; IAF platforms only)
- Create: `frontend/public/draco/` (decoder js + wasm from three's examples lib)

- [ ] Script: for each IAF platform with a model (`amca_mk1 rafale_f4 su30_mki tejas_mk1a mig29_upg mirage2000 jaguar_darin3 mig21_bison netra_aewc il78_tanker ghatak_ucav mq9b_seaguardian`), run `npx -y @gltf-transform/cli optimize assets3d/<id>/original.glb frontend/public/models3d/<id>.glb --texture-compress webp --texture-size 256 --compress draco --simplify-error 0.001` (target ≤250 KB each; adjust flags to hit budget).
- [ ] Copy Draco decoder: `cp frontend/node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm frontend/node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js frontend/public/draco/`.
- [ ] Commit: `feat(map): mini 3D squadron models + local draco decoder for offline Android`.

### Task 2: Pure modules — model registry + apron layout (TDD)

**Files:**
- Create: `frontend/src/lib/models3d.ts` — `MINI_MODELS: Set<string>` (the 12 ids above), `MODEL_ALIASES: Record<string, string>` (`rafale_f5→rafale_f4`, `tejas_mk1→tejas_mk1a`, `tejas_mk2→tejas_mk1a`, `amca_mk2→amca_mk1`), `miniModelFor(platformId): string | null` (direct → alias → null).
- Create: `frontend/src/components/map/apronLayout.ts` — `apronSlots(baseLon, baseLat, platformIds: string[], cap = 4): ApronSlot[]` where `ApronSlot = { platformId, lon, lat, yawDeg, spanM }`. Distinct ids (order-stable, capped), arranged in an arc south of the base: slot i of n at bearing `140° + i * (80° / max(n-1,1))`, distance ~4.5 km, `spanM` 5200 for heavies (`su30_mki`, `il78_tanker`, `netra_aewc`, `h6kj`), else 4300; yaw = bearing + 65.
- Tests: `models3d.test.ts` (direct hit, alias hit, null miss; every `MINI_MODELS` entry has a file in `frontend/public/models3d/` — use node `fs.existsSync` in the test) and `apronLayout.test.ts` (dedup + cap, slots distinct positions, deterministic output for same input).
- [ ] TDD both; commit `feat(map): model registry + apron layout for living airbases`.

### Task 3: `SquadronMiniLayer` component

**Files:**
- Create: `frontend/src/components/map/SquadronMiniLayer.tsx`

Props `{ map: MLMap | null; bases: BaseMarker[] }`. On effect: derive per-base distinct platform ids from `base.squadrons` → `miniModelFor` → `apronSlots`. Dynamic `import("three")` + GLTFLoader/DRACOLoader (`setDecoderPath("/draco/")`), model cache `Map<string, Promise<Group>>` at module scope (decode once per platform type across effect re-runs). Build meshes on first map `idle` after effect start (terrain elevation available); position via `domeGeometry.ts` helpers + `queryTerrainElevation` (no extra 1.5×; null → 0); matrix per the lesson above; scene lights: ambient (2.2) + one directional. Custom layer id `squadron-minis-3d`, `renderingMode: "3d"`, render gated on `map.getZoom() >= 7.5`, matrix from `defaultProjectionData.mainMatrix`, no `triggerRepaint`. Cleanup: remove layer, dispose renderer + cloned materials/geometries (cached master `Group`s persist by design; dispose clones' nothing — clones share geometry, so only dispose on module cache clear — keep it simple: clones only, masters live for the session).
- [ ] `npm run test && npm run build` green; commit `feat(map): zoom-gated 3D squadron minis layer (living airbase)`.

### Task 4: Wire into `CampaignMapView`

- [ ] Mount next to `ADDomeLayer`: `{terrain3d && <SquadronMiniLayer map={mapInstance} bases={bases} />}`.
- [ ] Tests + build green; commit `feat(map): living airbases on the 3D theater map`.

### Task 5 (controller-run): Verification incl. VISUAL check + APK

- [ ] Full suite + `npm run build` + `npm run cap:sync`.
- [ ] Visual: run the dev server against the local backend with a seeded campaign, Playwright-screenshot the map at base-focus zoom, and confirm minis are actually visible (the whole point of the prototype lesson). If local stack is impractical, minimum bar: screenshot harness reusing the layer in a bare page.
- [ ] Debug APK → Desktop.

### Task 6 (controller-run): Docs

- [ ] CLAUDE.md status bullet + ROADMAP note (fold into the 3D Phase A entry as "A.5 Living Airbase"); commit.
