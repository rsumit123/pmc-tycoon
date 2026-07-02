# 3D Phase A — Theater Command (3D Terrain Map Hub) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/campaign/:id` map into a pitched 3D-terrain theater view with cinematic camera moves and 3D AD coverage domes — frontend-only, zero backend/API changes.

**Architecture:** MapLibre GL (bumped 4.7 → 5.x) gains a raster-DEM terrain source (free AWS terrarium tiles) + hillshade + sky, behind a persisted `terrain3d` toggle with flat fallback. A pure `mapCamera.ts` module defines camera poses (overview / base-focus / AO-alert); `CampaignMapView` triggers `flyTo`s on base tap, sheet close, and pending-vignette arrival. AD coverage renders as translucent 3D hemisphere domes via a three.js custom layer when 3D is on (pure `domeGeometry.ts` math is unit-tested; the WebGL layer stays out of jsdom per existing convention), falling back to the existing SVG `ADCoverageLayer` when off.

**Tech Stack:** React 19 + TypeScript, maplibre-gl 5.x, three (new dep, lazy-loaded), Zustand, Vitest + jsdom. Capacitor Android must keep working (`npm run build` + `npm run cap:sync`).

**Spec:** `docs/superpowers/specs/2026-07-02-3d-roadmap-design.md` (Phase A section).

**Deliberate trims vs spec (documented, not oversights):**
- ISR drone orbits stay as the existing dashed SVG rings (`DroneOrbitLayer`) — "rings at altitude" moves to a later polish pass; the pitched-view correctness problem the spec targets is the AD circles, which this plan fixes with domes.
- No slow orbit animation on End Turn (motion for motion's sake; fly-tos cover the cinematic need).

**Conventions that matter here:**
- Frontend tests: Vitest + jsdom; WebGL/canvas components are NOT unit-tested — extract pure math to `.ts` modules and test those (`markerProjection.ts` pattern).
- All new UI must work on Capacitor Android: tap targets, no hover-only affordances.
- `npm run build` (tsc -b) type-checks test files; ALWAYS run it before declaring green, not just `npx tsc --noEmit`.
- Commit directly to `main` after each task.
- Money/number display: `toLocaleString("en-US")` (not relevant here, but no locale regressions).

**Test baseline before this plan:** frontend 259 tests. Backend untouched (681).

---

### Task 1: Bump maplibre-gl to v5

**Files:**
- Modify: `frontend/package.json` (via npm)

- [ ] **Step 1: Install**

```bash
cd frontend && npm install maplibre-gl@^5
```

- [ ] **Step 2: Verify the app still type-checks, tests pass, and builds**

Run: `cd frontend && npm run test && npm run build`
Expected: all 259 tests pass; build green. Our usage (raster style, `Marker`, `bounds`/`fitBoundsOptions`, `map.project`, GeoJSON layers) is API-stable across v4→v5. If a type error surfaces, fix the call site — do NOT pin back to v4; report the deviation.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(map): bump maplibre-gl to v5 for terrain + sky support"
```

---

### Task 2: `terrain3d` flag in mapStore (persisted, default on)

**Files:**
- Modify: `frontend/src/store/mapStore.ts`
- Test: `frontend/src/store/__tests__/mapStore.terrain.test.ts` (create; if a mapStore test file already exists under a different path, add these cases there instead)

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "../mapStore";

describe("mapStore terrain3d", () => {
  beforeEach(() => {
    localStorage.clear();
    useMapStore.setState({ terrain3d: true });
  });

  it("defaults to enabled", () => {
    expect(useMapStore.getState().terrain3d).toBe(true);
  });

  it("toggleTerrain3d flips the flag and persists it", () => {
    useMapStore.getState().toggleTerrain3d();
    expect(useMapStore.getState().terrain3d).toBe(false);
    expect(localStorage.getItem("map_terrain3d_v1")).toBe("false");
    useMapStore.getState().toggleTerrain3d();
    expect(useMapStore.getState().terrain3d).toBe(true);
    expect(localStorage.getItem("map_terrain3d_v1")).toBe("true");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/store/__tests__/mapStore.terrain.test.ts`
Expected: FAIL — `terrain3d` / `toggleTerrain3d` don't exist.

- [ ] **Step 3: Implement**

In `frontend/src/store/mapStore.ts`, add below `loadLayers()`:

```ts
const TERRAIN_KEY = "map_terrain3d_v1";

function loadTerrain3d(): boolean {
  try {
    const stored = localStorage.getItem(TERRAIN_KEY);
    if (stored !== null) return stored === "true";
  } catch { /* ignore */ }
  return true;
}
```

Extend the interface and store:

```ts
interface MapState {
  selectedBaseId: number | null;
  activeLayers: Record<MapLayerKey, boolean>;
  terrain3d: boolean;
  setSelectedBase: (id: number | null) => void;
  toggleLayer: (key: MapLayerKey) => void;
  toggleTerrain3d: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedBaseId: null,
  activeLayers: loadLayers(),
  terrain3d: loadTerrain3d(),
  setSelectedBase: (id) => set({ selectedBaseId: id }),
  toggleLayer: (key) => set((s) => {
    const next = { ...s.activeLayers, [key]: !s.activeLayers[key] };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { activeLayers: next };
  }),
  toggleTerrain3d: () => set((s) => {
    const next = !s.terrain3d;
    try { localStorage.setItem(TERRAIN_KEY, String(next)); } catch { /* ignore */ }
    return { terrain3d: next };
  }),
}));
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/store/__tests__/mapStore.terrain.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/mapStore.ts src/store/__tests__/mapStore.terrain.test.ts
git commit -m "feat(map): persisted terrain3d toggle in mapStore (default on)"
```

---

### Task 3: Pure camera-pose module `mapCamera.ts`

**Files:**
- Create: `frontend/src/components/map/mapCamera.ts`
- Test: `frontend/src/components/map/__tests__/mapCamera.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { aoAlertPose, baseFocusPose, DEFAULT_PITCH, flyOptions } from "../mapCamera";

describe("mapCamera poses", () => {
  it("baseFocusPose centers on the base with a low cinematic camera", () => {
    const p = baseFocusPose(75.63, 32.23);
    expect(p.center).toEqual([75.63, 32.23]);
    expect(p.zoom).toBeGreaterThan(8);
    expect(p.pitch).toBeGreaterThan(DEFAULT_PITCH);
  });

  it("aoAlertPose frames the AO wider than a base focus", () => {
    const ao = aoAlertPose(73.95, 33.45);
    const base = baseFocusPose(73.95, 33.45);
    expect(ao.zoom).toBeLessThan(base.zoom);
    expect(ao.center).toEqual([73.95, 33.45]);
  });

  it("flyOptions animates by default and snaps under reduced motion", () => {
    const pose = baseFocusPose(70, 20);
    expect(flyOptions(pose, false).duration).toBeGreaterThan(1000);
    expect(flyOptions(pose, true).duration).toBe(0);
    expect(flyOptions(pose, false).essential).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/mapCamera.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/** Camera poses for the Theater Command map. Pure data — the map instance
 * applies them via flyTo/easeTo, so everything here is unit-testable. */

export interface CameraPose {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Default pitch for the 3D theater view (0 when terrain3d is off). */
export const DEFAULT_PITCH = 55;
export const DEFAULT_BEARING = -8;

/** Swoop down onto a friendly base (BaseSheet opening). */
export function baseFocusPose(lon: number, lat: number): CameraPose {
  return { center: [lon, lat], zoom: 9.3, pitch: 62, bearing: 18 };
}

/** Frame a vignette AO — wider than a base focus so the sector reads. */
export function aoAlertPose(lon: number, lat: number): CameraPose {
  return { center: [lon, lat], zoom: 8.2, pitch: 60, bearing: 30 };
}

export interface FlyOpts extends CameraPose {
  duration: number;
  essential: boolean;
}

/** MapLibre flyTo options for a pose; snaps instantly under reduced motion. */
export function flyOptions(pose: CameraPose, reducedMotion: boolean): FlyOpts {
  return { ...pose, duration: reducedMotion ? 0 : 2600, essential: true };
}

/** Guarded matchMedia read (jsdom-safe). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/map/__tests__/mapCamera.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/mapCamera.ts src/components/map/__tests__/mapCamera.test.ts
git commit -m "feat(map): pure camera-pose module for theater fly-tos"
```

---

### Task 4: 3D terrain + sky + pitch in `SubcontinentMap`

**Files:**
- Modify: `frontend/src/components/map/SubcontinentMap.tsx`

No unit test (WebGL — per convention). Verification is the Task 11 build + manual check.

- [ ] **Step 1: Add DEM sources + hillshade to the style**

In `SubcontinentMap.tsx`, extend `MAP_STYLE`. MapLibre requires *separate* raster-dem sources for terrain vs hillshade, so declare two:

```ts
const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];
const DEM_ATTRIBUTION =
  'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles (Mapzen/AWS)</a>';

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      // ... unchanged ...
    },
    dem: {
      type: "raster-dem" as const,
      encoding: "terrarium" as const,
      tiles: DEM_TILES,
      tileSize: 256,
      maxzoom: 13,
      attribution: DEM_ATTRIBUTION,
    },
    demHillshade: {
      type: "raster-dem" as const,
      encoding: "terrarium" as const,
      tiles: DEM_TILES,
      tileSize: 256,
      maxzoom: 13,
    },
  },
  layers: [
    { id: "carto", type: "raster" as const, source: "carto" },
    {
      id: "hillshade",
      type: "hillshade" as const,
      source: "demHillshade",
      paint: {
        "hillshade-exaggeration": 0.45,
        "hillshade-shadow-color": "#020617",
        "hillshade-highlight-color": "#334155",
        "hillshade-accent-color": "#0ea5e9",
      },
    },
  ],
};
```

- [ ] **Step 2: Add `terrain3d` prop and wire constructor + load handler**

Extend the props interface:

```ts
export interface SubcontinentMapProps {
  markers: BaseMarker[];
  onMarkerClick?: (baseId: number) => void;
  onReady?: (map: MLMap) => void;
  flashBaseId?: number | null;
  adBaseIds?: Set<number>;
  terrain3d?: boolean;
  className?: string;
}
```

In the component, add `terrain3d = false` to the destructured props and a ref that tracks it for the init effect (init runs once; later flips are handled in Step 3):

```ts
const terrainRef = useRef(terrain3d);
terrainRef.current = terrain3d;
```

Replace the `Map` construction inside the first `useEffect`:

```ts
const m = new maplibregl.Map({
  container: containerRef.current,
  style: MAP_STYLE,
  bounds: [[b.west, b.south], [b.east, b.north]],
  fitBoundsOptions: { padding: 12 },
  pitch: terrainRef.current ? 55 : 0,
  maxPitch: 70,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
});
mapRef.current = m;
// Terrain fallback: if DEM tiles error out (offline, blocked), drop back to flat.
m.on("error", (e) => {
  const sourceId = (e as { sourceId?: string }).sourceId;
  if (sourceId === "dem" || sourceId === "demHillshade") {
    try {
      m.setTerrain(null);
      if (m.getLayer("hillshade")) m.setLayoutProperty("hillshade", "visibility", "none");
    } catch { /* already flat */ }
  }
});
m.on("load", () => {
  applyTerrain(m, terrainRef.current);
  onReady?.(m);
});
```

Add the helper above the component:

```ts
function applyTerrain(m: MLMap, on: boolean) {
  try {
    if (on) {
      m.setTerrain({ source: "dem", exaggeration: 1.5 });
      m.setSky({
        "sky-color": "#0a0f1c",
        "horizon-color": "#1e293b",
        "fog-color": "#0a0f1c",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.6,
      });
      if (m.getLayer("hillshade")) m.setLayoutProperty("hillshade", "visibility", "visible");
    } else {
      m.setTerrain(null);
      if (m.getLayer("hillshade")) m.setLayoutProperty("hillshade", "visibility", "none");
    }
  } catch { /* WebGL/terrain unavailable — flat map still works */ }
}
```

- [ ] **Step 3: React to `terrain3d` prop flips after init**

Add a new effect after the marker effect:

```ts
useEffect(() => {
  const m = mapRef.current;
  if (!m || !m.isStyleLoaded()) return;
  applyTerrain(m, terrain3d);
  m.easeTo({ pitch: terrain3d ? 55 : 0, duration: 800 });
}, [terrain3d]);
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: green. (`setSky` exists in maplibre v5; if the installed minor lacks it, wrap the call in the existing try/catch — it already is.)

- [ ] **Step 5: Manual smoke (dev server)**

Run: `cd frontend && npm run dev`, open a campaign map. Expected: pitched charcoal terrain with Himalayan relief to the north, hillshade shading, markers still clickable. Toggle nothing yet (Task 9 adds UI).

- [ ] **Step 6: Commit**

```bash
git add src/components/map/SubcontinentMap.tsx
git commit -m "feat(map): 3D terrain, hillshade, sky and pitched camera behind terrain3d prop"
```

---

### Task 5: Camera choreography in `CampaignMapView`

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: Wire base-tap fly-to and sheet-close return**

In `CampaignMapView.tsx`:

Add imports:

```ts
import { baseFocusPose, flyOptions, prefersReducedMotion } from "../components/map/mapCamera";
```

The page already holds `mapInstance` state (`onReady={(m) => setMapInstance(m)}` around line 445) and `handleMarkerClick` (around line 185). Add an overview-pose ref captured when the map is ready, then extend both handlers:

```ts
const overviewPoseRef = useRef<{ center: maplibregl.LngLat; zoom: number; pitch: number; bearing: number } | null>(null);
```

(Import `maplibregl` types if not present: `import type maplibregl from "maplibre-gl";` — or reuse the existing `Map as MLMap` import style already in the file.)

Update the `onReady` callback where `SubcontinentMap` is rendered:

```tsx
onReady={(m) => {
  overviewPoseRef.current = {
    center: m.getCenter(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(),
  };
  setMapInstance(m);
}}
```

Update `handleMarkerClick`:

```ts
const handleMarkerClick = useCallback(
  (bid: number) => {
    setSelectedBase(bid);
    const b = bases.find((x) => x.id === bid);
    if (b && mapInstance) {
      mapInstance.flyTo(flyOptions(baseFocusPose(b.lon, b.lat), prefersReducedMotion()));
    }
  },
  [setSelectedBase, bases, mapInstance],
);
```

Update the BaseSheet's `onClose` (around line 517):

```tsx
onClose={() => {
  setSelectedBase(null);
  const o = overviewPoseRef.current;
  if (o && mapInstance) {
    mapInstance.flyTo({ center: o.center, zoom: o.zoom, pitch: o.pitch, bearing: o.bearing, duration: prefersReducedMotion() ? 0 : 2200, essential: true });
  }
}}
```

Note: the rebase-flow close path near line 174 also calls `setSelectedBase(null)` — leave that one alone (mid-rebase camera return would fight the drag overlay).

- [ ] **Step 2: Run the existing page tests + build**

Run: `cd frontend && npm run test && npm run build`
Expected: all green — CampaignMapView tests (if any exercise marker clicks) still pass because `mapInstance` is null in jsdom and the fly-to is guarded.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CampaignMapView.tsx
git commit -m "feat(map): cinematic fly-to on base tap + return-to-overview on sheet close"
```

---

### Task 6: AO alert — red pulse + camera snap on pending vignette

**Files:**
- Create: `frontend/src/components/map/AOAlertLayer.tsx`
- Create: `frontend/src/components/map/aoAlert.ts`
- Test: `frontend/src/components/map/__tests__/aoAlert.test.ts`
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: Write the failing test for the pure helper**

```ts
import { describe, expect, it } from "vitest";
import { firstPendingAO } from "../aoAlert";
import type { Vignette } from "../../../lib/types";

function vig(id: number, lat: number, lon: number): Vignette {
  return {
    id, year: 2027, quarter: 2, scenario_id: "s", status: "pending",
    planning_state: {
      scenario_id: "s", scenario_name: "Scenario", ao: { region: "NW", name: "Kashmir Sector", lat, lon },
      response_clock_minutes: 60, adversary_force: [], eligible_squadrons: [],
      allowed_ind_roles: [], roe_options: ["tight"], objective: { kind: "defend", description: "" },
    },
    committed_force: null, event_trace: [], aar_text: "", outcome: {}, resolved_at: null,
  } as unknown as Vignette;
}

describe("firstPendingAO", () => {
  it("returns null when no vignettes", () => {
    expect(firstPendingAO([])).toBeNull();
  });
  it("returns id + coords + name of the first pending vignette", () => {
    expect(firstPendingAO([vig(7, 33.45, 73.95), vig(8, 30, 70)])).toEqual({
      id: 7, lat: 33.45, lon: 73.95, name: "Kashmir Sector",
    });
  });
});
```

(If the `objective`/`roe_options` fields don't match `PlanningState` exactly, adjust the fixture to satisfy the real type in `src/lib/types.ts` — the helper only reads `id` and `planning_state.ao`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/aoAlert.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

`frontend/src/components/map/aoAlert.ts`:

```ts
import type { Vignette } from "../../lib/types";

export interface AOAlert {
  id: number;
  lat: number;
  lon: number;
  name: string;
}

/** AO of the first pending vignette, if any — drives the map alert marker. */
export function firstPendingAO(vignettes: Vignette[]): AOAlert | null {
  const v = vignettes[0];
  const ao = v?.planning_state?.ao;
  if (!v || !ao) return null;
  return { id: v.id, lat: ao.lat, lon: ao.lon, name: ao.name };
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/map/__tests__/aoAlert.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the layer component (thin, no unit test)**

`frontend/src/components/map/AOAlertLayer.tsx`:

```tsx
import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { Vignette } from "../../lib/types";
import { firstPendingAO } from "./aoAlert";
import { aoAlertPose, flyOptions, prefersReducedMotion } from "./mapCamera";

export interface AOAlertLayerProps {
  map: MLMap | null;
  pendingVignettes: Vignette[];
}

/** Red pulsing marker at the AO of the first pending vignette. Flies the
 * camera to it once per vignette id (not on every re-render). */
export function AOAlertLayer({ map, pendingVignettes }: AOAlertLayerProps) {
  const markerRef = useRef<Marker | null>(null);
  const flownForRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!map) return;
    const alert = firstPendingAO(pendingVignettes);
    markerRef.current?.remove();
    markerRef.current = null;
    if (!alert) return;

    const el = document.createElement("div");
    el.title = `Vignette AO — ${alert.name}`;
    el.className = "relative h-7 w-7 pointer-events-none";
    el.innerHTML =
      '<span class="absolute inset-0 rounded-full bg-rose-500/40 animate-ping"></span>' +
      '<span class="absolute inset-1 rounded-full border-2 border-rose-400"></span>';
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([alert.lon, alert.lat])
      .addTo(map);

    if (!flownForRef.current.has(alert.id)) {
      flownForRef.current.add(alert.id);
      map.flyTo(flyOptions(aoAlertPose(alert.lon, alert.lat), prefersReducedMotion()));
    }
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, pendingVignettes]);

  return null;
}
```

- [ ] **Step 6: Mount in `CampaignMapView`**

Next to the other layer components (`ADCoverageLayer` / `DroneOrbitLayer` around line 450):

```tsx
<AOAlertLayer map={mapInstance} pendingVignettes={pendingVignettes} />
```

with import `import { AOAlertLayer } from "../components/map/AOAlertLayer";`.

- [ ] **Step 7: Run full tests + build, then commit**

Run: `cd frontend && npm run test && npm run build`
Expected: green.

```bash
git add src/components/map/aoAlert.ts src/components/map/AOAlertLayer.tsx src/components/map/__tests__/aoAlert.test.ts src/pages/CampaignMapView.tsx
git commit -m "feat(map): AO alert pulse + one-shot camera snap when a vignette fires"
```

---

### Task 7: Pure dome math `domeGeometry.ts`

**Files:**
- Create: `frontend/src/components/map/domeGeometry.ts`
- Test: `frontend/src/components/map/__tests__/domeGeometry.test.ts`

Web-Mercator math is implemented locally (3 formulas) rather than importing maplibre runtime into jsdom.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { domeMercatorParams, mercatorX, mercatorY, metersToMercator } from "../domeGeometry";

describe("domeGeometry", () => {
  it("mercatorX maps lng 0 to 0.5 and ±180 to 0/1", () => {
    expect(mercatorX(0)).toBeCloseTo(0.5, 10);
    expect(mercatorX(-180)).toBeCloseTo(0, 10);
    expect(mercatorX(180)).toBeCloseTo(1, 10);
  });

  it("mercatorY maps lat 0 to 0.5 and grows toward the south", () => {
    expect(mercatorY(0)).toBeCloseTo(0.5, 10);
    expect(mercatorY(45)).toBeLessThan(0.5);
    expect(mercatorY(-45)).toBeGreaterThan(0.5);
  });

  it("metersToMercator: one Earth circumference at the equator = 1 unit", () => {
    expect(40075016.686 * metersToMercator(0)).toBeCloseTo(1, 6);
  });

  it("domeMercatorParams scales with radius and sits at the base position", () => {
    const small = domeMercatorParams(75.63, 32.23, 40);
    const big = domeMercatorParams(75.63, 32.23, 120);
    expect(big.scale / small.scale).toBeCloseTo(3, 6);
    expect(big.x).toBeCloseTo(small.x, 12);
    expect(big.y).toBeCloseTo(small.y, 12);
    expect(big.x).toBeCloseTo(mercatorX(75.63), 12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/domeGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/** Web-Mercator helpers for placing 3D volumes on the MapLibre map.
 * Local implementation (identical math to maplibre's MercatorCoordinate)
 * so the module is pure and jsdom-testable. */

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function mercatorX(lng: number): number {
  return (180 + lng) / 360;
}

export function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  );
}

/** Mercator units per meter at a latitude (units shrink toward the poles). */
export function metersToMercator(lat: number): number {
  return 1 / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180));
}

export interface DomeParams {
  x: number; // mercator
  y: number; // mercator
  scale: number; // mercator units per dome-geometry unit (unit hemisphere radius)
}

/** Position + scale for a unit-radius hemisphere covering `radiusKm` around a point. */
export function domeMercatorParams(lon: number, lat: number, radiusKm: number): DomeParams {
  return {
    x: mercatorX(lon),
    y: mercatorY(lat),
    scale: radiusKm * 1000 * metersToMercator(lat),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/map/__tests__/domeGeometry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/domeGeometry.ts src/components/map/__tests__/domeGeometry.test.ts
git commit -m "feat(map): pure web-mercator dome math for 3D AD coverage"
```

---

### Task 8: `ADDomeLayer` — three.js custom layer for AD coverage

**Files:**
- Modify: `frontend/package.json` (add `three`, `@types/three`)
- Create: `frontend/src/components/map/adDomeSpecs.ts`
- Create: `frontend/src/components/map/ADDomeLayer.tsx`
- Test: `frontend/src/components/map/__tests__/adDomeSpecs.test.ts`

- [ ] **Step 1: Install three**

```bash
cd frontend && npm install three && npm install -D @types/three
```

- [ ] **Step 2: Write the failing test for the spec builder**

`adDomeSpecs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDomeSpecs } from "../adDomeSpecs";
import type { ADBattery, BaseMarker } from "../../../lib/types";

const base = (id: number, lat: number, lon: number): BaseMarker =>
  ({ id, name: `B${id}`, lat, lon, squadrons: [] }) as unknown as BaseMarker;
const bat = (id: number, baseId: number, km: number): ADBattery =>
  ({ id, base_id: baseId, system_id: "s400", coverage_km: km, interceptor_stock: 8,
     installed_year: 2026, installed_quarter: 2 }) as unknown as ADBattery;

describe("buildDomeSpecs", () => {
  it("builds one dome per battery whose base exists, skipping orphans", () => {
    const specs = buildDomeSpecs([base(1, 32.23, 75.63)], [bat(10, 1, 120), bat(11, 999, 40)]);
    expect(specs).toHaveLength(1);
    expect(specs[0].key).toBe(10);
    expect(specs[0].scale).toBeGreaterThan(0);
  });

  it("bigger coverage → bigger scale at the same base", () => {
    const specs = buildDomeSpecs([base(1, 32, 75)], [bat(1, 1, 40), bat(2, 1, 120)]);
    expect(specs[1].scale).toBeGreaterThan(specs[0].scale);
  });
});
```

(Adjust fixture casts to satisfy the real `BaseMarker`/`ADBattery` types — the builder only reads `id`, `lat`, `lon`, `base_id`, `coverage_km`.)

- [ ] **Step 3: Run to verify it fails, then implement the builder**

Run: `cd frontend && npx vitest run src/components/map/__tests__/adDomeSpecs.test.ts` → FAIL.

`frontend/src/components/map/adDomeSpecs.ts`:

```ts
import type { ADBattery, BaseMarker } from "../../lib/types";
import { domeMercatorParams, type DomeParams } from "./domeGeometry";

export interface DomeSpec extends DomeParams {
  key: number; // battery id
}

/** One dome per AD battery, positioned/scaled in mercator space. */
export function buildDomeSpecs(bases: BaseMarker[], batteries: ADBattery[]): DomeSpec[] {
  const baseById = new Map(bases.map((b) => [b.id, b]));
  const specs: DomeSpec[] = [];
  for (const bat of batteries) {
    const base = baseById.get(bat.base_id);
    if (!base) continue;
    specs.push({ key: bat.id, ...domeMercatorParams(base.lon, base.lat, bat.coverage_km) });
  }
  return specs;
}
```

Run the test again → PASS (2 tests).

- [ ] **Step 4: Implement the custom layer component**

`frontend/src/components/map/ADDomeLayer.tsx` — three.js is imported dynamically so it stays out of the main chunk:

```tsx
import { useEffect } from "react";
import type { CustomLayerInterface, Map as MLMap } from "maplibre-gl";
import type { ADBattery, BaseMarker } from "../../lib/types";
import { buildDomeSpecs } from "./adDomeSpecs";

export interface ADDomeLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
  batteries: ADBattery[];
}

const LAYER_ID = "ad-domes-3d";

/** Translucent 3D hemispheres over AD-covered bases (terrain3d mode only).
 * Uses MapLibre's custom-layer bridge to three.js; falls back silently if
 * three fails to load or WebGL misbehaves. */
export function ADDomeLayer({ map, bases, batteries }: ADDomeLayerProps) {
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let layer: CustomLayerInterface | null = null;

    (async () => {
      const THREE = await import("three");
      if (cancelled || !map.getCanvas()) return;
      const specs = buildDomeSpecs(bases, batteries);
      if (specs.length === 0) return;

      const camera = new THREE.Camera();
      const scene = new THREE.Scene();
      const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const fill = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.09, side: THREE.DoubleSide,
        depthWrite: false,
      });
      const rim = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false,
      });
      for (const s of specs) {
        for (const mat of [fill, rim]) {
          const mesh = new THREE.Mesh(geo, mat);
          mesh.matrixAutoUpdate = false;
          // Mercator: x east, y south, z up(scaled). Rotate hemisphere so its
          // flat face sits on the ground plane (three's Y-up -> mercator Z-up).
          const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
          mesh.matrix = new THREE.Matrix4()
            .makeTranslation(s.x, s.y, 0)
            .multiply(new THREE.Matrix4().makeScale(s.scale, s.scale, s.scale))
            .multiply(rot);
          scene.add(mesh);
        }
      }

      let renderer: import("three").WebGLRenderer | null = null;
      layer = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",
        onAdd(m, gl) {
          renderer = new THREE.WebGLRenderer({
            canvas: m.getCanvas(), context: gl, antialias: true,
          });
          renderer.autoClear = false;
        },
        onRemove() {
          renderer?.dispose();
          renderer = null;
        },
        render(_gl, args) {
          if (!renderer) return;
          const matrix = (args as { defaultProjectionData?: { mainMatrix?: number[] } })
            .defaultProjectionData?.mainMatrix ?? (args as unknown as number[]);
          camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix as number[]);
          renderer.resetState();
          renderer.render(scene, camera);
          map.triggerRepaint();
        },
      };
      try {
        if (!map.getLayer(LAYER_ID)) map.addLayer(layer);
      } catch { /* custom layer unsupported — SVG fallback still available */ }
    })();

    return () => {
      cancelled = true;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      } catch { /* map already torn down */ }
    };
  }, [map, bases, batteries]);

  return null;
}
```

**Implementation note for the engineer:** maplibre v5 passes custom-layer `render` a `defaultProjectionData` object (v4 passed the raw matrix array) — the code above handles both shapes. If TypeScript's `CustomRenderMethod` signature differs in the installed minor, match it and keep the two-shape handling; verify visually in Step 6.

- [ ] **Step 5: Conditional mount in `CampaignMapView`**

Where `ADCoverageLayer` renders (~line 450), split on `terrain3d` (from `useMapStore`):

```tsx
{activeLayers.ad_coverage && terrain3d && (
  <ADDomeLayer map={mapInstance} bases={bases} batteries={adBatteries} />
)}
{activeLayers.ad_coverage && !terrain3d && (
  <ADCoverageLayer /* existing props unchanged */ />
)}
```

with `const terrain3d = useMapStore((s) => s.terrain3d);` and import of `ADDomeLayer`. Keep the existing `ADCoverageLayer` JSX exactly as-is in the `!terrain3d` branch. (Match the actual prop names/guards already present around line 450 — the existing layer may already be wrapped in `activeLayers.ad_coverage &&`.)

- [ ] **Step 6: Verify build + manual smoke**

Run: `cd frontend && npm run test && npm run build`
Expected: green.
Manual (`npm run dev`): enable the "AD coverage" layer — with 3D on you get translucent domes (S-400 at Pathankot is seeded, so a fresh campaign shows one); toggling 3D off (after Task 9) returns the SVG circles.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/map/adDomeSpecs.ts src/components/map/ADDomeLayer.tsx src/components/map/__tests__/adDomeSpecs.test.ts src/pages/CampaignMapView.tsx
git commit -m "feat(map): 3D AD coverage domes via three.js custom layer (SVG fallback in flat mode)"
```

---

### Task 9: "3D terrain" toggle in `LayerTogglePanel`

**Files:**
- Modify: `frontend/src/components/map/LayerTogglePanel.tsx`
- Test: extend `frontend/src/components/map/__tests__/LayerTogglePanel.test.tsx` (create if missing)

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerTogglePanel } from "../LayerTogglePanel";
import { useMapStore } from "../../../store/mapStore";

describe("LayerTogglePanel terrain toggle", () => {
  it("renders the 3D terrain toggle and flips the store", () => {
    useMapStore.setState({ terrain3d: true });
    render(<LayerTogglePanel />);
    const btn = screen.getByRole("button", { name: /3d terrain/i });
    fireEvent.click(btn);
    expect(useMapStore.getState().terrain3d).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/LayerTogglePanel.test.tsx`
Expected: FAIL — no such button.

- [ ] **Step 3: Implement**

In `LayerTogglePanel.tsx`, read the new store fields and render the toggle above the layer list, visually separated:

```tsx
export function LayerTogglePanel() {
  const active = useMapStore((s) => s.activeLayers);
  const toggle = useMapStore((s) => s.toggleLayer);
  const terrain3d = useMapStore((s) => s.terrain3d);
  const toggleTerrain3d = useMapStore((s) => s.toggleTerrain3d);

  return (
    <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-800 p-2 space-y-1 z-10">
      <button
        onClick={toggleTerrain3d}
        className={[
          "flex items-center w-full text-left text-xs px-2 py-2.5 min-h-[40px] rounded border-b border-slate-800 mb-1",
          terrain3d ? "bg-cyan-700 text-slate-50 font-semibold" : "text-slate-300 hover:bg-slate-800",
        ].join(" ")}
      >
        {terrain3d ? "◆" : "◇"} 3D terrain
      </button>
      {(Object.keys(active) as MapLayerKey[]).map((k) => (
        /* existing layer buttons unchanged */
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + build**

Run: `cd frontend && npm run test && npm run build`
Expected: green (new test passes, existing LayerTogglePanel tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/LayerTogglePanel.tsx src/components/map/__tests__/LayerTogglePanel.test.tsx
git commit -m "feat(map): 3D terrain toggle in layer panel"
```

---

### Task 10: Thread `terrain3d` into the map + legend note

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`
- Modify: `frontend/src/components/map/MapLegend.tsx`

- [ ] **Step 1: Pass the flag to `SubcontinentMap`**

In `CampaignMapView.tsx` (the `terrain3d` store read exists from Task 8):

```tsx
<SubcontinentMap
  markers={...}
  onMarkerClick={handleMarkerClick}
  onReady={...}
  terrain3d={terrain3d}
  /* existing props unchanged */
/>
```

- [ ] **Step 2: Legend hint**

In `MapLegend.tsx`, append one row to the expanded panel after the ASSET BADGES rows:

```tsx
<div className="pt-1 tracking-widest text-amber-500/70">VIEW</div>
<div className="text-slate-400">Drag to pan · two-finger drag to tilt</div>
```

- [ ] **Step 3: Tests + build, then commit**

Run: `cd frontend && npm run test && npm run build`
Expected: green (MapLegend test asserts on existing rows only; if it snapshot-fails, update the assertion for the new row).

```bash
git add src/pages/CampaignMapView.tsx src/components/map/MapLegend.tsx
git commit -m "feat(map): wire terrain3d into the map + tilt hint in legend"
```

---

### Task 11: Full verification + Android build

**Files:** none (verification only)

- [ ] **Step 1: Full frontend suite + production build**

Run: `cd frontend && npm run test && npm run build`
Expected: **268+ tests** (259 baseline + ~9 new), build green.

- [ ] **Step 2: Capacitor sync**

Run: `cd frontend && npm run cap:sync`
Expected: sync completes; no plugin errors.

- [ ] **Step 3: Android debug APK**

```bash
cd frontend/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
```

Expected: BUILD SUCCESSFUL; APK at `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Copy to Desktop for owner device testing.

- [ ] **Step 4: Manual checklist (dev server or device)**

- Map loads pitched with visible Himalayan relief; pan/tilt works (two-finger drag on touch).
- Base tap → camera swoops in as BaseSheet opens; closing returns to overview.
- Turn with a fired vignette → red AO pulse + one-time camera snap; snap does NOT repeat on re-render.
- AD coverage layer on + 3D on → domes; 3D off → SVG circles return, pitch eases to 0.
- Toggle state survives reload (localStorage).
- Marker taps still reliable at 44px hit area under pitch.
- Airplane-mode/offline: map falls back to flat without crashing (terrain error guard).

- [ ] **Step 5: Commit anything the checklist shook out** (fixes only, no new scope).

---

### Task 12: Docs + status updates

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-02-3d-roadmap-design.md`

- [ ] **Step 1: Update statuses**

- ROADMAP: add/flip a "3D Phase A (Theater Command)" row to 🟢 with a one-line scope note.
- CLAUDE.md: prepend a "Current status" bullet — Phase A done, new test count, terrain toggle, dome layer, camera choreography; note maplibre v5 + three deps; note Phases B/C remain with the 20-model fleet already generated in `assets3d/`.
- Spec: mark Phase A ✅ in the sequencing table.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md docs/superpowers/specs/2026-07-02-3d-roadmap-design.md
git commit -m "docs(3d): mark Phase A (Theater Command) done"
```

---

## Self-review notes

- **Spec coverage:** terrain+hillshade+sky (T4), v5 bump (T1), pitched default + fly-tos + AO snap + reduced-motion (T3/5/6), 3D volumes for AD (T7/8), persisted toggle + fallback (T2/4/9/10), pixel-ratio cap (T4), pure-math testing convention (T3/6/7/8), Android verification (T11). Trims (ISR rings at altitude, end-turn orbit) documented in the header.
- **Type consistency:** `CameraPose`/`flyOptions` used identically in T5/T6; `DomeParams`→`DomeSpec` chain consistent between T7/T8; `terrain3d` prop name consistent across T2/T4/T8/T9/T10.
- **Known risk pinned in-task:** maplibre v5 custom-layer `render` signature (T8 note) and `setSky` availability (T4 try/catch) — both have graceful fallbacks and explicit verification steps.
