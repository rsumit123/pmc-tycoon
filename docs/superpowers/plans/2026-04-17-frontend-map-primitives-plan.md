# Sovereign Shield — Frontend MVP Part 1: Map + Core UI Primitives (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-JSON frontend shell with a real UI. When the player enters a campaign, they see a subcontinent map of India with their airbase pinpoints. Long-press any platform in any card → dossier modal with a radar chart. AD coverage and intel-contact layers are toggleable overlays. All primitives (long-press hook, commit-by-hold button, radar chart, swipe-stack) are reusable and unit-tested so Plans 7–9 can compose them.

**Architecture:**
- MapLibre GL for the base canvas; OpenStreetMap raster tiles (no API key, CC-BY-SA attribution). Geographic layers (AD coverage circles, intel-contact dots) live as a sibling SVG overlay with matched projection math — simpler than a MapLibre custom layer and more than enough visual fidelity for MVP.
- Reusable primitives under `frontend/src/components/primitives/`: `useLongPress` hook, `CommitHoldButton`, `RadarChart` (hand-SVG, no chart lib), `SwipeStack`, `PlatformDossier`, `SquadronCard`. Each exports a clean `props` interface, has a Vitest unit test, and is composed — not duplicated — by higher screens.
- Map components under `frontend/src/components/map/`: `SubcontinentMap` (the canvas), `ADCoverageLayer` (SVG), `IntelContactsLayer` (SVG), `LayerTogglePanel`, `BaseMarkerLayer`.
- Backend adds two read-only endpoints: `GET /api/content/platforms` (registry passthrough) and `GET /api/campaigns/{id}/bases` (base rows joined with their template's lat/lon + each base's squadrons). These are thin serializers; no engine logic.
- Route restructuring: `/campaign/:id` now renders the new `CampaignMapView` (map + stats ribbon + End-Turn). The existing raw-JSON console moves to `/campaign/:id/raw` as a dev escape hatch; Plan 7 will replace it wholesale with full procurement screens.
- Testing: Vitest + `@testing-library/react` + `jsdom` for primitives. MapLibre's WebGL canvas is not unit-testable, so the map component takes `markers: BaseMarker[]` as a prop and marker-derivation logic is pure and tested separately.
- Platform media pipeline: a single `scripts/fetch_platform_assets.py` that reads a hand-curated manifest YAML (paths to Wikimedia Commons pages) and downloads hero JPEGs into `frontend/public/platforms/{platform_id}/hero.jpg` with an `attribution.json` sibling file. MVP seeds the manifest with ~6 key platforms; missing images fall back to a generic SVG silhouette rendered inline. V1+ populates more via Plan 10.

**Tech Stack:** React 19, Vite 8, TypeScript 5.9, Tailwind 4, Zustand 5, React Router 7 (all existing). Adds: `maplibre-gl`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@vitest/ui` (optional), `jsdom`. Python stdlib + `httpx` for the fetcher.

---

## Scope reminder

**In scope (per ROADMAP §Plan 6):**
- MapLibre subcontinent map with IAF airbase markers
- Base-click bottom sheet showing squadron stack
- `AD coverage` toggle layer (SVG radar bubbles at base lat/lon based on platform assignments)
- `Intel contacts` toggle layer (dots at intel cards' implied AO coords)
- Reusable primitives: `useLongPress`, `CommitHoldButton`, `RadarChart`, `SwipeStack`, `PlatformDossier`, `SquadronCard`
- Wikimedia asset fetcher script + manifest + attribution metadata
- Vitest component tests for each primitive
- Backend passthrough endpoints for platforms + bases (read-only)
- Campaign view restructured to map-first; raw JSON reachable at `/campaign/:id/raw`

**Out of scope (parked):**
- Drag-to-rebase gestures (V1.1)
- Animated logistics lines, R&D facility glow, weather overlays, heatmap layers (V1.5+ per D11)
- Procurement screens (Plan 7)
- Vignette / Ops Room UI (Plan 8)
- Campaign-end Defense White Paper (Plan 9)
- Full platform content (~60 platforms) + media for all (Plan 10)
- Audio, haptic, teletype theming (V1.5+)

---

## File Structure

**Backend (create):**
- `backend/app/api/content.py` — `GET /api/content/platforms` passthrough for `platforms.yaml` registry
- `backend/app/api/bases.py` — `GET /api/campaigns/{id}/bases` with embedded squadron list per base
- `backend/app/schemas/content.py` — `PlatformOut`, `PlatformListResponse`
- `backend/app/schemas/base.py` — `BaseSquadronOut`, `BaseOut`, `BaseListResponse`
- `backend/app/crud/base.py` — `list_bases_for_campaign(db, campaign_id)`
- `backend/tests/test_content_api.py`
- `backend/tests/test_bases_api.py`

**Backend (modify):**
- `backend/main.py` — register `content_router`, `bases_router`

**Frontend (create — primitives):**
- `frontend/src/components/primitives/useLongPress.ts`
- `frontend/src/components/primitives/CommitHoldButton.tsx`
- `frontend/src/components/primitives/RadarChart.tsx`
- `frontend/src/components/primitives/SwipeStack.tsx`
- `frontend/src/components/primitives/PlatformDossier.tsx`
- `frontend/src/components/primitives/SquadronCard.tsx`
- `frontend/src/components/primitives/PlatformSilhouette.tsx` — generic fallback SVG

**Frontend (create — map):**
- `frontend/src/components/map/SubcontinentMap.tsx` — MapLibre container
- `frontend/src/components/map/BaseMarkerLayer.tsx` — DOM markers driven by MapLibre's `projectToScreen`
- `frontend/src/components/map/ADCoverageLayer.tsx` — SVG overlay
- `frontend/src/components/map/IntelContactsLayer.tsx` — SVG overlay
- `frontend/src/components/map/LayerTogglePanel.tsx` — floating toggle UI
- `frontend/src/components/map/BaseSheet.tsx` — bottom sheet showing squadrons at selected base

**Frontend (create — page + store):**
- `frontend/src/pages/CampaignMapView.tsx` — new default campaign view (map + stats ribbon + End Turn + layer toggles)
- `frontend/src/pages/CampaignConsoleRaw.tsx` — moved from `pages/CampaignConsole.tsx`; reachable at `/campaign/:id/raw`
- `frontend/src/store/mapStore.ts` — layer-toggle state + selected base id

**Frontend (create — tests + config):**
- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts` — vitest setup (jest-dom matchers, DOM cleanup)
- `frontend/src/components/primitives/__tests__/useLongPress.test.tsx`
- `frontend/src/components/primitives/__tests__/CommitHoldButton.test.tsx`
- `frontend/src/components/primitives/__tests__/RadarChart.test.tsx`
- `frontend/src/components/primitives/__tests__/SwipeStack.test.tsx`
- `frontend/src/components/primitives/__tests__/SquadronCard.test.tsx`
- `frontend/src/components/map/__tests__/markerProjection.test.ts` — pure fn test
- `frontend/src/lib/__tests__/api.test.ts` — mocked axios test for new endpoints

**Frontend (modify):**
- `frontend/package.json` — add dev deps + `test` + `test:ui` scripts
- `frontend/src/App.tsx` — route `/campaign/:id` → `CampaignMapView`; add `/campaign/:id/raw` → `CampaignConsoleRaw`
- `frontend/src/lib/api.ts` — `getPlatforms()`, `getBases(campaignId)`
- `frontend/src/lib/types.ts` — `Platform`, `BaseMarker`, `BaseSquadronSummary`, `BaseListResponse`
- `frontend/src/store/campaignStore.ts` — expose bases + platforms loaders
- `frontend/src/index.css` — import MapLibre CSS
- `frontend/tsconfig.app.json` — include `src/**/*.test.{ts,tsx}` in test scope / vitest globals
- `frontend/eslint.config.js` — ignore test files for react-refresh rule
- `frontend/README.md` — document `npm test` + asset fetcher

**Scripts (create):**
- `scripts/fetch_platform_assets.py`
- `backend/content/asset_manifest.yaml` — hand-curated `platform_id → wikimedia_commons_url` mapping (seeded with 6 platforms)
- `frontend/public/platforms/.gitignore` — ignore downloaded binaries; commit `attribution.json`s only

**Docs (modify):**
- `docs/superpowers/plans/ROADMAP.md` — flip Plan 6 to 🟢 done (in final task)
- `CLAUDE.md` — update Current status (in final task)

---

## Domain modelling decisions (locked)

### Marker projection seam

`SubcontinentMap` receives `markers: BaseMarker[]` and a `onMarkerClick(baseId)` callback. Internally it holds a MapLibre instance. For each marker, the DOM marker is created via `new maplibregl.Marker()`, positioned at `[lng, lat]`, and `addTo(map)`. Click handler dispatches `onMarkerClick(base.id)`.

SVG overlay layers (`ADCoverageLayer`, `IntelContactsLayer`) receive `projectFn: (lng: number, lat: number) => {x: number, y: number}` which is `map.project(...)` — the child uses it on every render to position SVG circles. The map re-renders layers on `move` events by lifting a `projectionVersion: number` counter in `CampaignMapView` that bumps each time MapLibre fires `move`.

This keeps the WebGL portion of MapLibre isolated to `SubcontinentMap.tsx` (untestable); everything else is pure DOM/SVG and fully testable.

### Base + platform types

```typescript
// frontend/src/lib/types.ts (additions)

export interface Platform {
  id: string;
  name: string;
  origin: string;
  role: string;
  generation: string;
  combat_radius_km: number;
  payload_kg: number;
  rcs_band: string;
  radar_range_km: number;
  cost_cr: number;
  intro_year: number;
}

export interface PlatformListResponse {
  platforms: Platform[];
}

export interface BaseSquadronSummary {
  id: number;
  name: string;
  call_sign: string;
  platform_id: string;
  strength: number;
  readiness_pct: number;
  xp: number;
  ace_name: string | null;
}

export interface BaseMarker {
  id: number;                      // CampaignBase row id
  template_id: string;             // "ambala", "hindan", etc.
  name: string;                    // pretty name
  lat: number;
  lon: number;
  squadrons: BaseSquadronSummary[];
}

export interface BaseListResponse {
  bases: BaseMarker[];
}
```

### Platform registry passthrough

`GET /api/content/platforms` returns the registry dict flattened into a list. No campaign scoping; it's static content.

### Bases endpoint

`GET /api/campaigns/{id}/bases`:
1. Lookup campaign; 404 if missing.
2. Query `CampaignBase` rows for that campaign.
3. Cross-reference `bases.yaml` registry (via `app/content/registry.py::bases()`) to resolve template → lat/lon/name.
4. Query `Squadron` rows grouped by `base_id`.
5. Build `BaseMarker[]` response.

### `useLongPress` contract

```typescript
interface LongPressOptions {
  onLongPress: (e: PointerEvent) => void;
  onClick?: (e: PointerEvent) => void;  // short-tap
  durationMs?: number;                  // default 400
}

function useLongPress(opts: LongPressOptions): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp:   (e: React.PointerEvent) => void;
  onPointerLeave:(e: React.PointerEvent) => void;
  onPointerCancel:(e: React.PointerEvent) => void;
};
```

Cancellation rules: movement beyond 8px cancels. Leave / cancel cancels. Pointer up before duration → fire `onClick` if defined. Pointer up after duration → `onLongPress` already fired; no click.

### `CommitHoldButton` contract

```typescript
interface CommitHoldButtonProps {
  onCommit: () => void;
  label?: string;              // default "Hold to commit"
  holdMs?: number;             // default 2000
  disabled?: boolean;
  className?: string;
}
```

Visually: a button that fills progress bar during hold. Releases early → reset. Holds full → fire `onCommit`.

### `RadarChart` contract

```typescript
interface RadarChartAxis {
  label: string;
  value: number;   // 0..1 normalized
}

interface RadarChartProps {
  axes: RadarChartAxis[];       // 3..8 axes
  size?: number;                 // default 240
  fillOpacity?: number;          // default 0.3
  color?: string;                // default "var(--radar-color, #f59e0b)"
}
```

### `SwipeStack` contract

```typescript
interface SwipeStackProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  onDismiss: (item: T, direction: "left" | "right") => void;
  className?: string;
}
```

Touch + mouse drag. Threshold 80px triggers dismiss; anything less snaps back. Card stack shows next 3 items with visual offset.

### `PlatformDossier` contract

```typescript
interface PlatformDossierProps {
  platform: Platform;
  open: boolean;
  onClose: () => void;
}
```

Modal. Shows hero image (from `/platforms/{id}/hero.jpg` with `onError` fallback to `PlatformSilhouette`), name, origin, role, generation, and a `RadarChart` with 6 normalized axes: combat radius, payload, radar range, cost (inverted — cheaper = higher), intro year (normalized over 2000–2040), RCS quality (VLO=1.0 → large=0.1).

### `SquadronCard` contract

```typescript
interface SquadronCardProps {
  squadron: BaseSquadronSummary;
  platform?: Platform;           // if loaded
  onLongPress?: () => void;      // opens dossier
  onClick?: () => void;
  className?: string;
}
```

Uses `useLongPress` internally.

### Asset manifest YAML shape

```yaml
# backend/content/asset_manifest.yaml
platforms:
  - id: rafale_f4
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/..."
    attribution: "Photo by X, CC BY-SA 4.0"
  - id: tejas_mk1a
    hero_url: "..."
    attribution: "..."
```

Fetcher reads this, downloads into `frontend/public/platforms/{id}/hero.jpg`, writes `frontend/public/platforms/{id}/attribution.json` with `{source_url, license, attribution}`. MVP seeds 6 entries; rest fall back to silhouette.

### Route restructuring

- `/` — `Landing.tsx` (unchanged)
- `/campaign/:id` — NEW `CampaignMapView.tsx` (map + stats ribbon + End Turn)
- `/campaign/:id/raw` — the old `CampaignConsole.tsx` (renamed to `CampaignConsoleRaw.tsx`), used for debugging
- `*` — `Navigate to="/"` (unchanged)

---

## Task 1: Vitest + Testing Library setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/lib/__tests__/sanity.test.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/eslint.config.js`
- Modify: `frontend/README.md`

- [ ] **Step 1: Add dev deps and scripts to `frontend/package.json`**

```bash
cd frontend && npm install --save-dev \
  vitest@^2.1.5 \
  @vitest/ui@^2.1.5 \
  jsdom@^25.0.1 \
  @testing-library/react@^16.1.0 \
  @testing-library/jest-dom@^6.6.3 \
  @testing-library/user-event@^14.5.2 \
  @types/jsdom@^21.1.7
```

Then edit `frontend/package.json` to add to the `"scripts"` block (alongside the existing `"dev"`, `"build"`, etc.):

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
```

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
```

- [ ] **Step 3: Create `frontend/src/test/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Add a sanity smoke test at `frontend/src/lib/__tests__/sanity.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("vitest bootstrap", () => {
  it("arithmetic still works", () => {
    expect(2 + 2).toBe(4);
  });

  it("jsdom provides a document", () => {
    expect(typeof document).toBe("object");
    expect(document.body).toBeDefined();
  });
});
```

- [ ] **Step 5: Update `frontend/tsconfig.app.json` to include test files and vitest globals**

Open the file, confirm `"include"` covers `src/**/*.{ts,tsx}` (it likely already does). Add `"types": ["vitest/globals"]` to `"compilerOptions"` if not present. If the file already has a `"types"` array, append `"vitest/globals"`.

- [ ] **Step 6: Silence eslint's react-refresh warnings on test files**

Edit `frontend/eslint.config.js` and extend the existing ignores / file-overrides so that `**/*.test.{ts,tsx}` and `src/test/setup.ts` don't trip `react-refresh/only-export-components`. If there's already a file-glob override for test files in the config, just add the glob; otherwise append:

```javascript
{
  files: ["**/*.test.{ts,tsx}", "src/test/setup.ts"],
  rules: {
    "react-refresh/only-export-components": "off",
  },
},
```

- [ ] **Step 7: Update `frontend/README.md`**

Add a "Testing" section near the top:

```markdown
## Testing

Unit + component tests run via Vitest + jsdom.

- `npm test` — one-shot run
- `npm run test:watch` — watch mode
- `npm run test:ui` — browser-based UI runner

E2E tests (Playwright) hit a deployed environment; see `playwright.config.ts`.
```

- [ ] **Step 8: Run the sanity test**

Run: `cd frontend && npm test -- --run sanity`
Expected: 2 passed.

- [ ] **Step 9: Run the full build to confirm nothing broke**

Run: `cd frontend && npm run build`
Expected: TypeScript build + Vite bundle succeed.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/vitest.config.ts frontend/src/test/setup.ts \
        frontend/src/lib/__tests__/sanity.test.ts \
        frontend/tsconfig.app.json frontend/eslint.config.js \
        frontend/README.md
git commit -m "feat(frontend): vitest + testing-library setup with sanity smoke test"
```

---

## Task 2: Backend `GET /api/content/platforms` endpoint

**Files:**
- Create: `backend/app/schemas/content.py`
- Create: `backend/app/api/content.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_content_api.py`

- [ ] **Step 1: Write failing test at `backend/tests/test_content_api.py`**

```python
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


def _client():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    Base.metadata.create_all(bind=eng)

    def override_get_db():
        db = TestingSessionLocal()
        try: yield db
        finally: db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), eng


def test_list_platforms_returns_yaml_registry():
    client, eng = _client()
    try:
        r = client.get("/api/content/platforms")
        assert r.status_code == 200
        body = r.json()
        assert "platforms" in body
        assert len(body["platforms"]) > 0
        # Every platform must expose the fields the frontend dossier reads
        first = body["platforms"][0]
        for key in ("id", "name", "origin", "role", "generation",
                    "combat_radius_km", "payload_kg", "rcs_band",
                    "radar_range_km", "cost_cr", "intro_year"):
            assert key in first, f"missing {key} in {first}"
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_platforms_includes_rafale_f4():
    client, eng = _client()
    try:
        r = client.get("/api/content/platforms")
        ids = {p["id"] for p in r.json()["platforms"]}
        assert "rafale_f4" in ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

- [ ] **Step 2: Run — expect FAIL (route missing)**

Run: `cd backend && pytest tests/test_content_api.py -v`
Expected: 404 on `/api/content/platforms` → test fails.

- [ ] **Step 3: Create `backend/app/schemas/content.py`**

```python
from pydantic import BaseModel


class PlatformOut(BaseModel):
    id: str
    name: str
    origin: str
    role: str
    generation: str
    combat_radius_km: int
    payload_kg: int
    rcs_band: str
    radar_range_km: int
    cost_cr: int
    intro_year: int


class PlatformListResponse(BaseModel):
    platforms: list[PlatformOut]
```

- [ ] **Step 4: Create `backend/app/api/content.py`**

```python
from fastapi import APIRouter
from dataclasses import asdict

from app.content.registry import platforms as platforms_reg
from app.schemas.content import PlatformOut, PlatformListResponse

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("/platforms", response_model=PlatformListResponse)
def list_platforms_endpoint():
    registry = platforms_reg()
    out: list[PlatformOut] = []
    for spec in registry.values():
        # spec is a frozen dataclass (see app/content/loader.py). asdict is
        # safest against future field additions.
        d = asdict(spec)
        out.append(PlatformOut(
            id=d["id"], name=d["name"], origin=d.get("origin", ""),
            role=d.get("role", ""), generation=str(d.get("generation", "")),
            combat_radius_km=int(d.get("combat_radius_km", 0)),
            payload_kg=int(d.get("payload_kg", 0)),
            rcs_band=d.get("rcs_band", "conventional"),
            radar_range_km=int(d.get("radar_range_km", 0)),
            cost_cr=int(d.get("cost_cr", 0)),
            intro_year=int(d.get("intro_year", 2026)),
        ))
    out.sort(key=lambda p: p.id)
    return PlatformListResponse(platforms=out)
```

Note: if `dataclass.asdict` doesn't work on the existing `Platform` content-dataclass (check `backend/app/content/loader.py`), replace with direct attribute access (`spec.id`, `spec.name`, etc.). The field set should already match — that's what the content loader parses from `platforms.yaml`. If a field is missing on the dataclass, STOP and report BLOCKED rather than silently inventing defaults.

- [ ] **Step 5: Register the router in `backend/main.py`**

Look for existing `app.include_router(...)` calls. Add:

```python
from app.api.content import router as content_router
...
app.include_router(content_router)
```

- [ ] **Step 6: Run tests — expect 2 passed**

Run: `cd backend && pytest tests/test_content_api.py -v`
Expected: 2 passed.

- [ ] **Step 7: Run full suite**

Run: `cd backend && pytest -q`
Expected: **298 passed** (296 baseline + 2 new).

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/content.py backend/app/api/content.py \
        backend/main.py backend/tests/test_content_api.py
git commit -m "feat(api): GET /api/content/platforms passthrough"
```

---

## Task 3: Backend `GET /api/campaigns/{id}/bases` endpoint

**Files:**
- Create: `backend/app/schemas/base.py`
- Create: `backend/app/crud/base.py`
- Create: `backend/app/api/bases.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_bases_api.py`

- [ ] **Step 1: Write failing test at `backend/tests/test_bases_api.py`**

```python
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


def _client():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    Base.metadata.create_all(bind=eng)

    def override_get_db():
        db = TestingSessionLocal()
        try: yield db
        finally: db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), eng


def test_list_bases_404_for_missing_campaign():
    client, eng = _client()
    try:
        r = client.get("/api/campaigns/99999/bases")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_bases_returns_seeded_airbases_with_squadrons():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "b", "difficulty": "realistic", "objectives": [], "seed": 7,
        }).json()
        cid = created["id"]
        r = client.get(f"/api/campaigns/{cid}/bases")
        assert r.status_code == 200
        body = r.json()
        assert "bases" in body
        assert len(body["bases"]) > 0
        first = body["bases"][0]
        assert "id" in first
        assert "template_id" in first
        assert "name" in first
        assert isinstance(first["lat"], float)
        assert isinstance(first["lon"], float)
        assert "squadrons" in first
        # At least one base should have squadrons from the seeded state
        total_squadrons = sum(len(b["squadrons"]) for b in body["bases"])
        assert total_squadrons >= 1
        if total_squadrons > 0:
            for b in body["bases"]:
                if b["squadrons"]:
                    sq = b["squadrons"][0]
                    for key in ("id", "name", "call_sign", "platform_id",
                                "strength", "readiness_pct", "xp", "ace_name"):
                        assert key in sq
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

- [ ] **Step 2: Run — expect FAIL (route missing)**

Run: `cd backend && pytest tests/test_bases_api.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `backend/app/schemas/base.py`**

```python
from pydantic import BaseModel


class BaseSquadronOut(BaseModel):
    id: int
    name: str
    call_sign: str
    platform_id: str
    strength: int
    readiness_pct: int
    xp: int
    ace_name: str | None


class BaseOut(BaseModel):
    id: int
    template_id: str
    name: str
    lat: float
    lon: float
    squadrons: list[BaseSquadronOut]


class BaseListResponse(BaseModel):
    bases: list[BaseOut]
```

- [ ] **Step 4: Create `backend/app/crud/base.py`**

```python
from sqlalchemy.orm import Session

from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from app.content.registry import bases as bases_reg


def list_bases_for_campaign(db: Session, campaign_id: int) -> list[dict]:
    """Join CampaignBase rows with their YAML template (for lat/lon/name) and
    the squadrons stationed at each base. Pure serializer — no engine logic."""
    base_rows = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign_id
    ).all()
    templates = bases_reg()

    squadron_rows = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id
    ).all()
    by_base: dict[int, list[Squadron]] = {}
    for sq in squadron_rows:
        by_base.setdefault(sq.base_id, []).append(sq)

    out: list[dict] = []
    for row in base_rows:
        tpl = templates.get(row.template_id)
        if tpl is None:
            continue
        out.append({
            "id": row.id,
            "template_id": row.template_id,
            "name": tpl.name,
            "lat": tpl.lat,
            "lon": tpl.lon,
            "squadrons": [
                {
                    "id": sq.id,
                    "name": sq.name,
                    "call_sign": sq.call_sign,
                    "platform_id": sq.platform_id,
                    "strength": sq.strength,
                    "readiness_pct": sq.readiness_pct,
                    "xp": sq.xp,
                    "ace_name": sq.ace_name,
                }
                for sq in by_base.get(row.id, [])
            ],
        })
    out.sort(key=lambda b: b["template_id"])
    return out
```

- [ ] **Step 5: Create `backend/app/api/bases.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.base import list_bases_for_campaign
from app.schemas.base import BaseOut, BaseListResponse

router = APIRouter(prefix="/api/campaigns", tags=["bases"])


@router.get("/{campaign_id}/bases", response_model=BaseListResponse)
def list_bases_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_bases_for_campaign(db, campaign_id)
    return BaseListResponse(bases=[BaseOut(**r) for r in rows])
```

- [ ] **Step 6: Register in `backend/main.py`**

```python
from app.api.bases import router as bases_router
...
app.include_router(bases_router)
```

- [ ] **Step 7: Run tests — expect 2 passed**

Run: `cd backend && pytest tests/test_bases_api.py -v`
Expected: 2 passed.

- [ ] **Step 8: Run full suite**

Run: `cd backend && pytest -q`
Expected: **300 passed** (298 + 2).

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/base.py backend/app/crud/base.py \
        backend/app/api/bases.py backend/main.py backend/tests/test_bases_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/bases with squadrons"
```

---

## Task 4: Frontend types + API client for platforms + bases

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/__tests__/api.test.ts`

- [ ] **Step 1: Write failing test at `frontend/src/lib/__tests__/api.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { api } from "../api";
import type { PlatformListResponse, BaseListResponse } from "../types";

vi.mock("axios");
const mockedAxios = axios as unknown as { create: ReturnType<typeof vi.fn> };

describe("api client — platforms + bases", () => {
  const getMock = vi.fn();
  beforeEach(() => {
    getMock.mockReset();
    (mockedAxios.create as any).mockReturnValue({ get: getMock, post: vi.fn() });
  });
  afterEach(() => vi.resetModules());

  it("getPlatforms returns the list", async () => {
    const body: PlatformListResponse = {
      platforms: [{
        id: "rafale_f4", name: "Rafale F4", origin: "FR", role: "multirole",
        generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
        rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
      }],
    };
    getMock.mockResolvedValueOnce({ data: body });
    // Re-import so the mocked axios.create takes effect
    const { api: freshApi } = await import("../api");
    const out = await freshApi.getPlatforms();
    expect(out.platforms).toHaveLength(1);
    expect(out.platforms[0].id).toBe("rafale_f4");
    expect(getMock).toHaveBeenCalledWith("/api/content/platforms");
  });

  it("getBases returns the list", async () => {
    const body: BaseListResponse = {
      bases: [{
        id: 1, template_id: "ambala", name: "Ambala AFB",
        lat: 30.37, lon: 76.78, squadrons: [],
      }],
    };
    getMock.mockResolvedValueOnce({ data: body });
    const { api: freshApi } = await import("../api");
    const out = await freshApi.getBases(42);
    expect(out.bases[0].template_id).toBe("ambala");
    expect(getMock).toHaveBeenCalledWith("/api/campaigns/42/bases");
  });
});
```

If the mock-hoisting dance feels brittle, an equivalent approach using `vi.spyOn` is acceptable — keep the two behavioral assertions (URL + returned shape).

- [ ] **Step 2: Run — expect FAIL (getPlatforms/getBases missing)**

Run: `cd frontend && npm test -- --run api.test`
Expected: FAIL (undefined method).

- [ ] **Step 3: Extend `frontend/src/lib/types.ts`**

Append:

```typescript
export interface Platform {
  id: string;
  name: string;
  origin: string;
  role: string;
  generation: string;
  combat_radius_km: number;
  payload_kg: number;
  rcs_band: string;
  radar_range_km: number;
  cost_cr: number;
  intro_year: number;
}

export interface PlatformListResponse {
  platforms: Platform[];
}

export interface BaseSquadronSummary {
  id: number;
  name: string;
  call_sign: string;
  platform_id: string;
  strength: number;
  readiness_pct: number;
  xp: number;
  ace_name: string | null;
}

export interface BaseMarker {
  id: number;
  template_id: string;
  name: string;
  lat: number;
  lon: number;
  squadrons: BaseSquadronSummary[];
}

export interface BaseListResponse {
  bases: BaseMarker[];
}
```

- [ ] **Step 4: Extend `frontend/src/lib/api.ts`**

Update to:

```typescript
import axios from "axios";
import type {
  Campaign,
  CampaignCreatePayload,
  PlatformListResponse,
  BaseListResponse,
} from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8010";

const http = axios.create({ baseURL, timeout: 10_000 });

export const api = {
  async createCampaign(payload: CampaignCreatePayload): Promise<Campaign> {
    const { data } = await http.post<Campaign>("/api/campaigns", payload);
    return data;
  },

  async getCampaign(id: number): Promise<Campaign> {
    const { data } = await http.get<Campaign>(`/api/campaigns/${id}`);
    return data;
  },

  async advanceTurn(id: number): Promise<Campaign> {
    const { data } = await http.post<Campaign>(`/api/campaigns/${id}/advance`);
    return data;
  },

  async getPlatforms(): Promise<PlatformListResponse> {
    const { data } = await http.get<PlatformListResponse>("/api/content/platforms");
    return data;
  },

  async getBases(campaignId: number): Promise<BaseListResponse> {
    const { data } = await http.get<BaseListResponse>(
      `/api/campaigns/${campaignId}/bases`,
    );
    return data;
  },
};
```

- [ ] **Step 5: Run test — expect 2 passed**

Run: `cd frontend && npm test -- --run api.test`
Expected: 2 passed.

- [ ] **Step 6: Build to confirm TS is clean**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts \
        frontend/src/lib/__tests__/api.test.ts
git commit -m "feat(frontend): Platform/Base types + getPlatforms/getBases API methods"
```

---

## Task 5: `useLongPress` hook

**Files:**
- Create: `frontend/src/components/primitives/useLongPress.ts`
- Test: `frontend/src/components/primitives/__tests__/useLongPress.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// frontend/src/components/primitives/__tests__/useLongPress.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useLongPress } from "../useLongPress";

function Harness({
  onLongPress, onClick,
}: { onLongPress: () => void; onClick: () => void }) {
  const handlers = useLongPress({
    onLongPress,
    onClick,
    durationMs: 300,
  });
  return (
    <button data-testid="t" {...handlers}>hold me</button>
  );
}

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onLongPress after durationMs", () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={onClick} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(320);
    fireEvent.pointerUp(getByTestId("t"), { pointerId: 1 });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires onClick for a short tap", () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={onClick} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(100);
    fireEvent.pointerUp(getByTestId("t"), { pointerId: 1 });
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels when pointer leaves", () => {
    const onLongPress = vi.fn();
    const { getByTestId } = render(
      <Harness onLongPress={onLongPress} onClick={() => {}} />,
    );
    fireEvent.pointerDown(getByTestId("t"), { pointerId: 1 });
    fireEvent.pointerLeave(getByTestId("t"), { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `cd frontend && npm test -- --run useLongPress`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/useLongPress.ts`**

```typescript
import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface LongPressOptions {
  onLongPress: (e: ReactPointerEvent) => void;
  onClick?: (e: ReactPointerEvent) => void;
  durationMs?: number;
}

export interface LongPressHandlers {
  onPointerDown:   (e: ReactPointerEvent) => void;
  onPointerUp:     (e: ReactPointerEvent) => void;
  onPointerLeave:  (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onPointerMove:   (e: ReactPointerEvent) => void;
}

export function useLongPress(opts: LongPressOptions): LongPressHandlers {
  const duration = opts.durationMs ?? 400;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPointRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    firedRef.current = false;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      opts.onLongPress(e);
    }, duration);
  }, [opts, duration]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const wasLongPress = firedRef.current;
    clear();
    if (!wasLongPress && opts.onClick) opts.onClick(e);
  }, [opts, clear]);

  const onPointerLeave = useCallback(() => { clear(); }, [clear]);
  const onPointerCancel = useCallback(() => { clear(); }, [clear]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = startPointRef.current;
    if (!start || !timerRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 64 /* 8px */ * 8) clear();
  }, [clear]);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onPointerMove };
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run useLongPress`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/useLongPress.ts \
        frontend/src/components/primitives/__tests__/useLongPress.test.tsx
git commit -m "feat(primitives): useLongPress hook with 8px move cancel"
```

---

## Task 6: `CommitHoldButton`

**Files:**
- Create: `frontend/src/components/primitives/CommitHoldButton.tsx`
- Test: `frontend/src/components/primitives/__tests__/CommitHoldButton.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// frontend/src/components/primitives/__tests__/CommitHoldButton.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CommitHoldButton } from "../CommitHoldButton";

describe("CommitHoldButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onCommit only after holdMs", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={1000} label="Commit" />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels on early release", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={1000} />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(btn, { pointerId: 1 });
    vi.advanceTimersByTime(1000);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("disabled prevents commit", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CommitHoldButton onCommit={onCommit} holdMs={100} disabled />,
    );
    const btn = getByRole("button");
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run CommitHoldButton`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/CommitHoldButton.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";

export interface CommitHoldButtonProps {
  onCommit: () => void;
  label?: string;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
}

export function CommitHoldButton({
  onCommit,
  label = "Hold to commit",
  holdMs = 2000,
  disabled = false,
  className = "",
}: CommitHoldButtonProps) {
  const [progress, setProgress] = useState(0); // 0..1
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startedAtRef.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startedAtRef.current == null) return;
    const elapsed = performance.now() - startedAtRef.current;
    const frac = Math.min(1, elapsed / holdMs);
    setProgress(frac);
    if (frac >= 1) {
      stop();
      onCommit();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [holdMs, onCommit, stop]);

  const onPointerDown = useCallback(() => {
    if (disabled) return;
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <button
      type="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={[
        "relative overflow-hidden rounded-lg px-4 py-3 font-semibold",
        "bg-amber-600 text-slate-900 select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-500 active:bg-amber-700",
        className,
      ].join(" ")}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-amber-400/40 origin-left"
        style={{ transform: `scaleX(${progress})` }}
      />
      <span className="relative">{label}</span>
    </button>
  );
}
```

Note: `requestAnimationFrame` behaves oddly under Vitest's fake timers. The tests use `vi.advanceTimersByTime` which advances `performance.now()` under `jsdom` + fake timers — verify the test still passes after implementation; if `requestAnimationFrame` fails to tick, polyfill at the top of `frontend/src/test/setup.ts`:

```typescript
// Already imported above; add below cleanup registration
import { vi as _vi } from "vitest";
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}
```

If the polyfill is needed, add it in this task's Step 3.5 and amend the commit. Don't silently add timer deps.

- [ ] **Step 4: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run CommitHoldButton`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/CommitHoldButton.tsx \
        frontend/src/components/primitives/__tests__/CommitHoldButton.test.tsx
# Include frontend/src/test/setup.ts only if the rAF polyfill was needed
git commit -m "feat(primitives): CommitHoldButton with progress bar"
```

---

## Task 7: `RadarChart`

**Files:**
- Create: `frontend/src/components/primitives/RadarChart.tsx`
- Test: `frontend/src/components/primitives/__tests__/RadarChart.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RadarChart } from "../RadarChart";

describe("RadarChart", () => {
  it("renders one axis label per axis", () => {
    const { getByText } = render(
      <RadarChart axes={[
        { label: "Radius", value: 0.8 },
        { label: "Payload", value: 0.6 },
        { label: "Radar", value: 0.7 },
      ]} />,
    );
    expect(getByText("Radius")).toBeInTheDocument();
    expect(getByText("Payload")).toBeInTheDocument();
    expect(getByText("Radar")).toBeInTheDocument();
  });

  it("renders an svg polygon for the data shape", () => {
    const { container } = render(
      <RadarChart axes={[
        { label: "A", value: 1 },
        { label: "B", value: 1 },
        { label: "C", value: 1 },
      ]} />,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon).not.toBeNull();
    // 3-axis shape → 3 points
    const pts = polygon!.getAttribute("points")!.trim().split(/\s+/);
    expect(pts).toHaveLength(3);
  });

  it("clamps values to 0..1", () => {
    const { container } = render(
      <RadarChart axes={[
        { label: "A", value: -0.5 },
        { label: "B", value: 1.5 },
        { label: "C", value: 0.3 },
      ]} />,
    );
    const polygon = container.querySelector("polygon")!;
    // All three coordinate pairs should parse as finite numbers
    const pts = polygon.getAttribute("points")!.trim().split(/\s+/);
    for (const p of pts) {
      const [x, y] = p.split(",").map(parseFloat);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run RadarChart`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/RadarChart.tsx`**

```tsx
export interface RadarChartAxis {
  label: string;
  value: number;
}

export interface RadarChartProps {
  axes: RadarChartAxis[];
  size?: number;
  fillOpacity?: number;
  color?: string;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function RadarChart({
  axes,
  size = 240,
  fillOpacity = 0.3,
  color = "#f59e0b",
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 32; // leave room for labels
  const n = axes.length;

  const pointFor = (axisIdx: number, valueFraction: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * axisIdx) / n;
    const r = radius * clamp01(valueFraction);
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPoints = axes
    .map((a, i) => {
      const p = pointFor(i, a.value);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} role="img" aria-label="stat radar chart">
      {/* concentric rings */}
      {rings.map((r, i) => {
        const pts = axes
          .map((_, axisIdx) => {
            const p = pointFor(axisIdx, r);
            return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(" ");
        return (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}
      {/* axis spokes */}
      {axes.map((_, i) => {
        const outer = pointFor(i, 1);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
        );
      })}
      {/* data polygon */}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* labels */}
      {axes.map((axis, i) => {
        const outer = pointFor(i, 1.1);
        return (
          <text
            key={axis.label}
            x={outer.x}
            y={outer.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="rgba(230,237,243,0.85)"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run RadarChart`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/RadarChart.tsx \
        frontend/src/components/primitives/__tests__/RadarChart.test.tsx
git commit -m "feat(primitives): RadarChart SVG component"
```

---

## Task 8: `SwipeStack`

**Files:**
- Create: `frontend/src/components/primitives/SwipeStack.tsx`
- Test: `frontend/src/components/primitives/__tests__/SwipeStack.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { SwipeStack } from "../SwipeStack";

describe("SwipeStack", () => {
  it("dismisses a card with a rightward drag past threshold", () => {
    const onDismiss = vi.fn();
    render(
      <SwipeStack
        items={[{ id: 1, label: "A" }, { id: 2, label: "B" }]}
        renderCard={(i) => <div data-testid={`card-${i.id}`}>{i.label}</div>}
        onDismiss={onDismiss}
      />,
    );
    const top = screen.getByTestId("card-1").parentElement!; // draggable wrapper
    fireEvent.pointerDown(top, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(top, { pointerId: 1, clientX: 200, clientY: 105 });
    fireEvent.pointerUp(top,   { pointerId: 1, clientX: 200, clientY: 105 });
    expect(onDismiss).toHaveBeenCalledWith(
      { id: 1, label: "A" }, "right",
    );
  });

  it("snaps back if drag is under threshold", () => {
    const onDismiss = vi.fn();
    render(
      <SwipeStack
        items={[{ id: 1, label: "A" }]}
        renderCard={(i) => <div data-testid="card">{i.label}</div>}
        onDismiss={onDismiss}
      />,
    );
    const card = screen.getByTestId("card").parentElement!;
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(card,   { pointerId: 1, clientX: 140, clientY: 100 });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders empty state when no items", () => {
    render(
      <SwipeStack
        items={[]}
        renderCard={() => <div>never</div>}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/no more/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run SwipeStack`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/SwipeStack.tsx`**

```tsx
import { useCallback, useRef, useState } from "react";

export interface SwipeStackProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  onDismiss: (item: T, direction: "left" | "right") => void;
  className?: string;
  threshold?: number;
}

export function SwipeStack<T>({
  items,
  renderCard,
  onDismiss,
  className = "",
  threshold = 80,
}: SwipeStackProps<T>) {
  const [dx, setDx] = useState(0);
  const startXRef = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    setDx(0);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startXRef.current == null) return;
    setDx(e.clientX - startXRef.current);
  }, []);

  const release = useCallback(() => {
    if (startXRef.current == null) {
      setDx(0);
      return;
    }
    const movement = dx;
    startXRef.current = null;
    if (Math.abs(movement) >= threshold && items.length > 0) {
      const direction: "left" | "right" = movement > 0 ? "right" : "left";
      onDismiss(items[0], direction);
    }
    setDx(0);
  }, [dx, threshold, items, onDismiss]);

  if (items.length === 0) {
    return (
      <div className={["text-sm opacity-60 text-center p-6", className].join(" ")}>
        No more cards.
      </div>
    );
  }

  const top = items[0];
  const beneath = items.slice(1, 4);

  return (
    <div className={["relative select-none touch-none", className].join(" ")}>
      {/* stack behind */}
      {beneath.map((item, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            transform: `translateY(${(i + 1) * 6}px) scale(${1 - (i + 1) * 0.03})`,
            zIndex: -i,
            opacity: 1 - (i + 1) * 0.15,
          }}
        >
          {renderCard(item, i + 1)}
        </div>
      ))}
      {/* top draggable */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        className="relative cursor-grab active:cursor-grabbing"
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 40}deg)`,
          transition: startXRef.current == null ? "transform 0.2s ease" : "none",
        }}
      >
        {renderCard(top, 0)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run SwipeStack`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/SwipeStack.tsx \
        frontend/src/components/primitives/__tests__/SwipeStack.test.tsx
git commit -m "feat(primitives): SwipeStack with pointer-drag threshold dismiss"
```

---

## Task 9: `PlatformSilhouette` fallback + `PlatformDossier`

**Files:**
- Create: `frontend/src/components/primitives/PlatformSilhouette.tsx`
- Create: `frontend/src/components/primitives/PlatformDossier.tsx`
- Test: `frontend/src/components/primitives/__tests__/PlatformDossier.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformDossier } from "../PlatformDossier";
import type { Platform } from "../../../lib/types";

const platform: Platform = {
  id: "rafale_f4", name: "Dassault Rafale F4", origin: "FR", role: "multirole",
  generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
  rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
};

describe("PlatformDossier", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <PlatformDossier platform={platform} open={false} onClose={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders the platform name + stats when open", () => {
    render(<PlatformDossier platform={platform} open onClose={() => {}} />);
    expect(screen.getByText("Dassault Rafale F4")).toBeInTheDocument();
    expect(screen.getByText(/multirole/i)).toBeInTheDocument();
    expect(screen.getByText(/FR/)).toBeInTheDocument();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    render(<PlatformDossier platform={platform} open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run PlatformDossier`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/PlatformSilhouette.tsx`**

```tsx
export function PlatformSilhouette({ size = 180 }: { size?: number }) {
  // Generic fixed-wing top-view silhouette — neutral, non-branded.
  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 200 120"
      role="img"
      aria-label="platform silhouette"
    >
      <g fill="rgba(230,237,243,0.55)" stroke="rgba(230,237,243,0.3)">
        {/* fuselage */}
        <ellipse cx={100} cy={60} rx={80} ry={6} />
        {/* wing */}
        <polygon points="40,60 160,60 140,75 60,75" />
        {/* tail */}
        <polygon points="180,60 195,50 195,70" />
        {/* cockpit */}
        <circle cx={60} cy={60} r={4} fill="rgba(15,23,42,0.8)" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Implement `frontend/src/components/primitives/PlatformDossier.tsx`**

```tsx
import { useState } from "react";
import type { Platform } from "../../lib/types";
import { RadarChart } from "./RadarChart";
import { PlatformSilhouette } from "./PlatformSilhouette";

export interface PlatformDossierProps {
  platform: Platform;
  open: boolean;
  onClose: () => void;
}

const RCS_ORDER: Record<string, number> = {
  VLO: 1.0, LO: 0.8, reduced: 0.55, conventional: 0.3, large: 0.1,
};

function statAxes(p: Platform) {
  return [
    { label: "Radius",  value: Math.min(1, p.combat_radius_km / 2500) },
    { label: "Payload", value: Math.min(1, p.payload_kg / 12000) },
    { label: "Radar",   value: Math.min(1, p.radar_range_km / 300) },
    { label: "Cost",    value: Math.max(0, 1 - p.cost_cr / 8000) },
    { label: "Era",     value: Math.min(1, Math.max(0, (p.intro_year - 2000) / 40)) },
    { label: "Stealth", value: RCS_ORDER[p.rcs_band] ?? 0.3 },
  ];
}

export function PlatformDossier({ platform, open, onClose }: PlatformDossierProps) {
  const [imgBroken, setImgBroken] = useState(false);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`${platform.name} dossier`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="close dossier"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          ×
        </button>

        <div className="flex items-center gap-4">
          {imgBroken ? (
            <PlatformSilhouette />
          ) : (
            <img
              src={`/platforms/${platform.id}/hero.jpg`}
              alt={platform.name}
              onError={() => setImgBroken(true)}
              className="w-40 h-24 object-cover rounded-lg bg-slate-800"
            />
          )}
          <div>
            <h2 className="text-xl font-bold">{platform.name}</h2>
            <p className="text-xs opacity-70">
              {platform.origin} • {platform.role} • gen {platform.generation}
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <RadarChart axes={statAxes(platform)} size={260} />
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div><dt className="opacity-60">Combat radius</dt>
               <dd>{platform.combat_radius_km.toLocaleString()} km</dd></div>
          <div><dt className="opacity-60">Payload</dt>
               <dd>{platform.payload_kg.toLocaleString()} kg</dd></div>
          <div><dt className="opacity-60">Radar range</dt>
               <dd>{platform.radar_range_km} km</dd></div>
          <div><dt className="opacity-60">RCS band</dt>
               <dd>{platform.rcs_band}</dd></div>
          <div><dt className="opacity-60">Unit cost</dt>
               <dd>₹{platform.cost_cr.toLocaleString()} cr</dd></div>
          <div><dt className="opacity-60">Introduced</dt>
               <dd>{platform.intro_year}</dd></div>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run PlatformDossier`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/primitives/PlatformSilhouette.tsx \
        frontend/src/components/primitives/PlatformDossier.tsx \
        frontend/src/components/primitives/__tests__/PlatformDossier.test.tsx
git commit -m "feat(primitives): PlatformDossier modal with radar-chart stats"
```

---

## Task 10: `SquadronCard`

**Files:**
- Create: `frontend/src/components/primitives/SquadronCard.tsx`
- Test: `frontend/src/components/primitives/__tests__/SquadronCard.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SquadronCard } from "../SquadronCard";
import type { BaseSquadronSummary, Platform } from "../../../lib/types";

const sq: BaseSquadronSummary = {
  id: 17, name: "17 Sqn Golden Arrows", call_sign: "GA",
  platform_id: "rafale_f4", strength: 18, readiness_pct: 82,
  xp: 0, ace_name: null,
};
const platform: Platform = {
  id: "rafale_f4", name: "Rafale F4", origin: "FR", role: "multirole",
  generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
  rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
};

describe("SquadronCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders name + platform + strength + readiness", () => {
    render(<SquadronCard squadron={sq} platform={platform} />);
    expect(screen.getByText(/17 Sqn Golden Arrows/)).toBeInTheDocument();
    expect(screen.getByText(/Rafale F4/)).toBeInTheDocument();
    expect(screen.getByText(/18/)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it("surfaces ace name when present", () => {
    render(<SquadronCard squadron={{ ...sq, ace_name: "Sqn Ldr X 'Vajra'" }}
                         platform={platform} />);
    expect(screen.getByText(/Vajra/)).toBeInTheDocument();
  });

  it("fires onLongPress after 400ms hold", () => {
    const onLongPress = vi.fn();
    render(<SquadronCard squadron={sq} platform={platform} onLongPress={onLongPress} />);
    const card = screen.getByRole("button");
    fireEvent.pointerDown(card, { pointerId: 1 });
    vi.advanceTimersByTime(450);
    fireEvent.pointerUp(card, { pointerId: 1 });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run SquadronCard`
Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/components/primitives/SquadronCard.tsx`**

```tsx
import type { BaseSquadronSummary, Platform } from "../../lib/types";
import { useLongPress } from "./useLongPress";

export interface SquadronCardProps {
  squadron: BaseSquadronSummary;
  platform?: Platform;
  onLongPress?: () => void;
  onClick?: () => void;
  className?: string;
}

export function SquadronCard({
  squadron, platform, onLongPress, onClick, className = "",
}: SquadronCardProps) {
  const handlers = useLongPress({
    onLongPress: () => onLongPress?.(),
    onClick: () => onClick?.(),
    durationMs: 400,
  });

  const readinessHue =
    squadron.readiness_pct >= 75 ? "text-emerald-300"
    : squadron.readiness_pct >= 55 ? "text-amber-300"
    : "text-rose-300";

  return (
    <div
      role="button"
      tabIndex={0}
      {...handlers}
      className={[
        "bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 select-none",
        "hover:border-slate-700 active:border-amber-600 cursor-pointer",
        className,
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold truncate">{squadron.name}</div>
        <span className="text-xs opacity-60">{squadron.call_sign}</span>
      </div>
      <div className="text-xs opacity-80">
        {platform?.name ?? squadron.platform_id}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>Strength: <span className="font-semibold">{squadron.strength}</span></span>
        <span className={readinessHue}>Ready: {squadron.readiness_pct}%</span>
      </div>
      {squadron.ace_name && (
        <div className="text-[11px] italic opacity-80 pt-1 border-t border-slate-800">
          {squadron.ace_name}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run SquadronCard`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/SquadronCard.tsx \
        frontend/src/components/primitives/__tests__/SquadronCard.test.tsx
git commit -m "feat(primitives): SquadronCard with long-press to open dossier"
```

---

## Task 11: Platform asset fetcher script + manifest

**Files:**
- Create: `backend/content/asset_manifest.yaml`
- Create: `scripts/fetch_platform_assets.py`
- Create: `frontend/public/platforms/.gitignore`

- [ ] **Step 1: Create `backend/content/asset_manifest.yaml`**

Seed with 6 platforms that definitely exist in `platforms.yaml`. For each, a Wikimedia Commons direct-image URL (not the wiki-page URL). These are manually curated — verify each URL in a browser before committing. The URLs below are examples of the right *shape*; the implementer must replace with verified live URLs when implementing. If a URL 404s at fetch time, the script skips and logs — it does NOT fail the batch.

```yaml
# Hand-curated Wikimedia Commons hero-image URLs for platform dossiers.
# Fetcher: scripts/fetch_platform_assets.py. Results land in
# frontend/public/platforms/{id}/hero.jpg + attribution.json.
platforms:
  - id: rafale_f4
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Dassault_Rafale_%28sideview%29.jpg/960px-Dassault_Rafale_%28sideview%29.jpg"
    license: "CC BY-SA 4.0"
    attribution: "Dassault Rafale — Wikimedia Commons"
  - id: tejas_mk1a
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/HAL_Tejas_MK1.jpg/960px-HAL_Tejas_MK1.jpg"
    license: "CC BY-SA 4.0"
    attribution: "HAL Tejas — Wikimedia Commons"
  - id: su30_mki
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Sukhoi_Su-30MKI_Indian_Air_Force.jpg/960px-Sukhoi_Su-30MKI_Indian_Air_Force.jpg"
    license: "CC BY-SA 4.0"
    attribution: "Su-30MKI — Wikimedia Commons"
  - id: mirage2000
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Mirage_2000H.jpg/960px-Mirage_2000H.jpg"
    license: "CC BY-SA 4.0"
    attribution: "Mirage 2000 — Wikimedia Commons"
  - id: j20a
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Chengdu_J-20_at_Airshow_China_2016.jpg/960px-Chengdu_J-20_at_Airshow_China_2016.jpg"
    license: "CC BY-SA 4.0"
    attribution: "Chengdu J-20 — Wikimedia Commons"
  - id: j35a
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Shenyang_J-35.jpg/960px-Shenyang_J-35.jpg"
    license: "CC BY-SA 4.0"
    attribution: "Shenyang J-35 — Wikimedia Commons"
```

**Verification note:** Before committing, open each URL in a browser. If any 404, find a valid replacement on Commons (license field = CC-BY-SA or similar free license). If fewer than 6 can be verified, reduce the manifest — the fallback silhouette covers the rest, and this is just a seed.

- [ ] **Step 2: Create `scripts/fetch_platform_assets.py`**

```python
#!/usr/bin/env python3
"""Download platform hero images per asset_manifest.yaml.

Usage:
  python3 scripts/fetch_platform_assets.py            # fetch all
  python3 scripts/fetch_platform_assets.py rafale_f4  # fetch one

Output:
  frontend/public/platforms/{id}/hero.jpg
  frontend/public/platforms/{id}/attribution.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "backend" / "content" / "asset_manifest.yaml"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "platforms"


def load_manifest() -> list[dict]:
    with MANIFEST.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("platforms", [])


def fetch_one(entry: dict) -> bool:
    pid = entry["id"]
    url = entry["hero_url"]
    dest = OUT_DIR / pid
    dest.mkdir(parents=True, exist_ok=True)
    hero = dest / "hero.jpg"
    attr = dest / "attribution.json"

    print(f"[{pid}] {url}")
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=30.0,
            headers={"User-Agent": "sovereign-shield-asset-fetcher/0.1"},
        ) as client:
            r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  FAILED: {e}")
        return False

    hero.write_bytes(r.content)
    attr.write_text(json.dumps({
        "platform_id": pid,
        "source_url": url,
        "license": entry.get("license", "unknown"),
        "attribution": entry.get("attribution", ""),
    }, indent=2), encoding="utf-8")
    print(f"  saved {hero.relative_to(REPO_ROOT)} ({len(r.content):,} bytes)")
    return True


def main(argv: list[str]) -> int:
    manifest = load_manifest()
    if argv:
        wanted = set(argv)
        manifest = [e for e in manifest if e["id"] in wanted]
        missing = wanted - {e["id"] for e in manifest}
        if missing:
            print(f"unknown platforms in manifest: {sorted(missing)}")
            return 2
    ok = sum(fetch_one(e) for e in manifest)
    print(f"\n{ok}/{len(manifest)} fetched successfully.")
    return 0 if ok == len(manifest) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 3: Create `frontend/public/platforms/.gitignore`**

```
# Fetched hero images are large binaries — regenerated by
# scripts/fetch_platform_assets.py. Commit attribution files, not images.
*.jpg
*.jpeg
*.png
*.webp
!attribution.json
```

- [ ] **Step 4: Smoke-test the script (no commit-time network required)**

Run: `cd /Users/rsumit123/work/defense-game && python3 scripts/fetch_platform_assets.py rafale_f4`
Expected: either prints `saved frontend/public/platforms/rafale_f4/hero.jpg (N bytes)` OR prints `FAILED: ...` without crashing.

If FAILED, update `asset_manifest.yaml:rafale_f4.hero_url` with a verified URL and retry. If every URL in the manifest is broken (extremely unlikely — Wikimedia Commons is stable), STOP and report — the fetcher is fine; the manifest needs manual curation.

**Important:** if the script succeeded, `frontend/public/platforms/rafale_f4/hero.jpg` is a real binary. Do NOT commit that file (`.gitignore` blocks it). Commit only `attribution.json`.

- [ ] **Step 5: Ensure the hero-JPG is ignored**

Run: `cd /Users/rsumit123/work/defense-game && git status --short frontend/public/platforms/`
Expected: may show `frontend/public/platforms/rafale_f4/attribution.json` as untracked. Must NOT show `hero.jpg`.

- [ ] **Step 6: Commit**

```bash
git add backend/content/asset_manifest.yaml \
        scripts/fetch_platform_assets.py \
        frontend/public/platforms/.gitignore
# Include the attribution.json if it was generated in Step 4
git add frontend/public/platforms/*/attribution.json 2>/dev/null || true
git commit -m "feat(assets): platform asset manifest + fetcher script"
```

---

## Task 12: Map store + `SubcontinentMap` scaffold

**Files:**
- Create: `frontend/src/store/mapStore.ts`
- Modify: `frontend/src/index.css` (MapLibre CSS import)
- Modify: `frontend/package.json` (add maplibre-gl)
- Create: `frontend/src/components/map/markerProjection.ts` — pure helper for SVG overlays
- Create: `frontend/src/components/map/__tests__/markerProjection.test.ts`
- Create: `frontend/src/components/map/SubcontinentMap.tsx`

- [ ] **Step 1: Add `maplibre-gl` dependency**

Run: `cd frontend && npm install --save maplibre-gl@^4.7.1`

Then import CSS in `frontend/src/index.css`:

Add at the very top (before the existing `@import "tailwindcss";`):

```css
@import "maplibre-gl/dist/maplibre-gl.css";
```

- [ ] **Step 2: Create `frontend/src/store/mapStore.ts`**

```typescript
import { create } from "zustand";

export type MapLayerKey = "ad_coverage" | "intel_contacts";

interface MapState {
  selectedBaseId: number | null;
  activeLayers: Record<MapLayerKey, boolean>;
  setSelectedBase: (id: number | null) => void;
  toggleLayer: (key: MapLayerKey) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedBaseId: null,
  activeLayers: { ad_coverage: false, intel_contacts: false },
  setSelectedBase: (id) => set({ selectedBaseId: id }),
  toggleLayer: (key) => set((s) => ({
    activeLayers: { ...s.activeLayers, [key]: !s.activeLayers[key] },
  })),
}));
```

- [ ] **Step 3: Write failing test at `frontend/src/components/map/__tests__/markerProjection.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { subcontinentBounds, fitsInsideSubcontinent } from "../markerProjection";

describe("markerProjection helpers", () => {
  it("exposes a tight-ish bbox around the Indian subcontinent", () => {
    const b = subcontinentBounds();
    expect(b.west).toBeLessThan(70);
    expect(b.east).toBeGreaterThan(95);
    expect(b.south).toBeLessThan(10);
    expect(b.north).toBeGreaterThan(35);
  });

  it("fitsInsideSubcontinent returns true for Ambala", () => {
    expect(fitsInsideSubcontinent(76.78, 30.37)).toBe(true);
  });

  it("fitsInsideSubcontinent returns false for Moscow", () => {
    expect(fitsInsideSubcontinent(37.6, 55.75)).toBe(false);
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

Run: `cd frontend && npm test -- --run markerProjection`
Expected: FAIL.

- [ ] **Step 5: Implement `frontend/src/components/map/markerProjection.ts`**

```typescript
export interface BBox {
  west: number;  // lng min
  east: number;  // lng max
  south: number; // lat min
  north: number; // lat max
}

export function subcontinentBounds(): BBox {
  // Rough cut: covers Indian mainland + some buffer for LAC / CBG AOs.
  return { west: 65, east: 100, south: 5, north: 38 };
}

export function fitsInsideSubcontinent(lng: number, lat: number): boolean {
  const b = subcontinentBounds();
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}
```

- [ ] **Step 6: Run tests — expect 3 passed**

Run: `cd frontend && npm test -- --run markerProjection`
Expected: 3 passed.

- [ ] **Step 7: Implement `frontend/src/components/map/SubcontinentMap.tsx`**

```tsx
import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";
import { subcontinentBounds } from "./markerProjection";

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

export interface SubcontinentMapProps {
  markers: BaseMarker[];
  onMarkerClick?: (baseId: number) => void;
  onReady?: (map: MLMap) => void;
  className?: string;
}

export function SubcontinentMap({
  markers, onMarkerClick, onReady, className = "",
}: SubcontinentMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerObjsRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const b = subcontinentBounds();
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      bounds: [[b.west, b.south], [b.east, b.north]],
      fitBoundsOptions: { padding: 40 },
    });
    mapRef.current = m;
    m.on("load", () => onReady?.(m));
    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    // Clear old markers
    markerObjsRef.current.forEach((mk) => mk.remove());
    markerObjsRef.current = [];
    for (const b of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${b.name} airbase`);
      el.className =
        "w-3 h-3 rounded-full bg-amber-400 border border-amber-900 " +
        "shadow hover:scale-125 transition-transform";
      el.addEventListener("click", () => onMarkerClick?.(b.id));
      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([b.lon, b.lat])
        .addTo(m);
      markerObjsRef.current.push(mk);
    }
  }, [markers, onMarkerClick]);

  return (
    <div
      ref={containerRef}
      className={["w-full h-full bg-slate-900 rounded-lg", className].join(" ")}
    />
  );
}
```

- [ ] **Step 8: Run full vitest suite — expect all existing + new tests pass**

Run: `cd frontend && npm test`
Expected: All tests pass. (SubcontinentMap has no unit test — WebGL/canvas.)

- [ ] **Step 9: TypeScript build**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/store/mapStore.ts \
        frontend/src/components/map/SubcontinentMap.tsx \
        frontend/src/components/map/markerProjection.ts \
        frontend/src/components/map/__tests__/markerProjection.test.ts \
        frontend/src/index.css \
        frontend/package.json frontend/package-lock.json
git commit -m "feat(map): SubcontinentMap with OSM tiles + mapStore"
```

---

## Task 13: Overlay layers + toggle panel + base sheet

**Files:**
- Create: `frontend/src/components/map/ADCoverageLayer.tsx`
- Create: `frontend/src/components/map/IntelContactsLayer.tsx`
- Create: `frontend/src/components/map/LayerTogglePanel.tsx`
- Create: `frontend/src/components/map/BaseSheet.tsx`

No unit tests for these — they're wiring. The primitives they compose (`useLongPress`, `SquadronCard`, `PlatformDossier`) are already tested.

- [ ] **Step 1: `ADCoverageLayer.tsx`**

```tsx
import type { Map as MLMap } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";

export interface ADCoverageLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
  projectionVersion: number;   // bumps force re-projection
}

const AD_RADIUS_KM_PER_SQUADRON = 40;

function kmToPixels(map: MLMap, centerLngLat: [number, number], km: number): number {
  const [lng, lat] = centerLngLat;
  const offset = lat + km / 110.574; // deg latitude per km — good enough
  const a = map.project([lng, lat]);
  const b = map.project([lng, offset]);
  return Math.max(4, Math.abs(b.y - a.y));
}

export function ADCoverageLayer({ map, bases, projectionVersion }: ADCoverageLayerProps) {
  // Intentionally consume the version so React rerenders when MapLibre pans/zooms.
  void projectionVersion;
  if (!map) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full">
      {bases.map((b) => {
        if (!b.squadrons.length) return null;
        const p = map.project([b.lon, b.lat]);
        const r = kmToPixels(map, [b.lon, b.lat],
          b.squadrons.length * AD_RADIUS_KM_PER_SQUADRON);
        return (
          <circle
            key={b.id}
            cx={p.x} cy={p.y} r={r}
            fill="rgba(251, 191, 36, 0.08)"
            stroke="rgba(251, 191, 36, 0.45)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: `IntelContactsLayer.tsx`**

Plan 6 MVP renders a dot at each known intel-card's implied AO. Since the MVP intel payload schema doesn't carry lat/lon, this layer reads from a `contacts: Contact[]` prop so the wiring stays clean — `CampaignMapView` will synthesize contacts from the loaded intel cards + adversary forward bases (fallback to an empty array for MVP).

```tsx
import type { Map as MLMap } from "maplibre-gl";

export interface IntelContact {
  id: string;           // stable key
  lng: number;
  lat: number;
  confidence: number;   // 0..1
  source_type: string;
}

export interface IntelContactsLayerProps {
  map: MLMap | null;
  contacts: IntelContact[];
  projectionVersion: number;
}

const SOURCE_COLOR: Record<string, string> = {
  HUMINT: "#a78bfa",
  SIGINT: "#34d399",
  IMINT:  "#60a5fa",
  OSINT:  "#fbbf24",
  ELINT:  "#f472b6",
};

export function IntelContactsLayer({ map, contacts, projectionVersion }: IntelContactsLayerProps) {
  void projectionVersion;
  if (!map) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full">
      {contacts.map((c) => {
        const p = map.project([c.lng, c.lat]);
        const color = SOURCE_COLOR[c.source_type] ?? "#94a3b8";
        return (
          <g key={c.id} opacity={0.5 + c.confidence * 0.5}>
            <circle cx={p.x} cy={p.y} r={4} fill={color} />
            <circle cx={p.x} cy={p.y} r={10 + (1 - c.confidence) * 6}
                    fill="none" stroke={color} strokeWidth={0.8} />
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 3: `LayerTogglePanel.tsx`**

```tsx
import { useMapStore, type MapLayerKey } from "../../store/mapStore";

const LABELS: Record<MapLayerKey, string> = {
  ad_coverage: "AD coverage",
  intel_contacts: "Intel contacts",
};

export function LayerTogglePanel() {
  const active = useMapStore((s) => s.activeLayers);
  const toggle = useMapStore((s) => s.toggleLayer);

  return (
    <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-800 p-2 space-y-1 z-10">
      {(Object.keys(active) as MapLayerKey[]).map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          className={[
            "block w-full text-left text-xs px-2 py-1 rounded",
            active[k] ? "bg-amber-600 text-slate-900 font-semibold"
                      : "text-slate-300 hover:bg-slate-800",
          ].join(" ")}
        >
          {active[k] ? "●" : "○"} {LABELS[k]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `BaseSheet.tsx`**

```tsx
import { useState } from "react";
import type { BaseMarker, Platform } from "../../lib/types";
import { SquadronCard } from "../primitives/SquadronCard";
import { PlatformDossier } from "../primitives/PlatformDossier";

export interface BaseSheetProps {
  base: BaseMarker | null;
  platforms: Record<string, Platform>;
  onClose: () => void;
}

export function BaseSheet({ base, platforms, onClose }: BaseSheetProps) {
  const [dossierFor, setDossierFor] = useState<Platform | null>(null);
  if (!base) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label={`${base.name} squadron stack`}
        className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
      >
        <div className="flex items-baseline justify-between pb-3">
          <div>
            <h3 className="text-lg font-bold">{base.name}</h3>
            <p className="text-xs opacity-60">
              {base.lat.toFixed(2)}°N, {base.lon.toFixed(2)}°E
              • {base.squadrons.length} squadron(s)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="close base sheet"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            ×
          </button>
        </div>

        {base.squadrons.length === 0 ? (
          <p className="text-sm opacity-60 p-4">No squadrons stationed.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {base.squadrons.map((sq) => (
              <SquadronCard
                key={sq.id}
                squadron={sq}
                platform={platforms[sq.platform_id]}
                onLongPress={() => {
                  const p = platforms[sq.platform_id];
                  if (p) setDossierFor(p);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {dossierFor && (
        <PlatformDossier
          platform={dossierFor}
          open={!!dossierFor}
          onClose={() => setDossierFor(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Build + run vitest to confirm nothing broke**

Run: `cd frontend && npm run build && npm test`
Expected: both succeed, no regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/map/ADCoverageLayer.tsx \
        frontend/src/components/map/IntelContactsLayer.tsx \
        frontend/src/components/map/LayerTogglePanel.tsx \
        frontend/src/components/map/BaseSheet.tsx
git commit -m "feat(map): overlay layers (AD coverage + intel contacts), toggle panel, base sheet"
```

---

## Task 14: `CampaignMapView` page + route restructure

**Files:**
- Rename: `frontend/src/pages/CampaignConsole.tsx` → `frontend/src/pages/CampaignConsoleRaw.tsx`
- Create: `frontend/src/pages/CampaignMapView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/store/campaignStore.ts` — add `loadBases`, `loadPlatforms`

- [ ] **Step 1: Extend `campaignStore.ts`**

```typescript
import { create } from "zustand";
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
} from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  bases: BaseMarker[];
  platformsById: Record<string, Platform>;
  loading: boolean;
  error: string | null;

  createCampaign: (payload: CampaignCreatePayload) => Promise<void>;
  loadCampaign: (id: number) => Promise<void>;
  advanceTurn: () => Promise<void>;
  loadBases: (id: number) => Promise<void>;
  loadPlatforms: () => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
  bases: [],
  platformsById: {},
  loading: false,
  error: null,

  createCampaign: async (payload) => {
    set({ loading: true, error: null });
    try {
      const campaign = await api.createCampaign(payload);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadCampaign: async (id) => {
    set({ loading: true, error: null });
    try {
      const campaign = await api.getCampaign(id);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  advanceTurn: async () => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const campaign = await api.advanceTurn(current.id);
      set({ campaign, loading: false });
      // Bases may have changed (squadron rebase, new deliveries); refresh.
      void get().loadBases(campaign.id);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadBases: async (id) => {
    try {
      const { bases } = await api.getBases(id);
      set({ bases });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadPlatforms: async () => {
    if (Object.keys(get().platformsById).length > 0) return;
    try {
      const { platforms } = await api.getPlatforms();
      const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
      set({ platformsById: byId });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    loading: false, error: null,
  }),
}));
```

- [ ] **Step 2: Rename `CampaignConsole.tsx` → `CampaignConsoleRaw.tsx`**

Run: `git mv frontend/src/pages/CampaignConsole.tsx frontend/src/pages/CampaignConsoleRaw.tsx`

Then open the renamed file and change the component name:
- `export function CampaignConsole()` → `export function CampaignConsoleRaw()`
Everything else stays.

- [ ] **Step 3: Create `frontend/src/pages/CampaignMapView.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Map as MLMap } from "maplibre-gl";

import { useCampaignStore } from "../store/campaignStore";
import { useMapStore } from "../store/mapStore";

import { SubcontinentMap } from "../components/map/SubcontinentMap";
import { ADCoverageLayer } from "../components/map/ADCoverageLayer";
import { IntelContactsLayer } from "../components/map/IntelContactsLayer";
import { LayerTogglePanel } from "../components/map/LayerTogglePanel";
import { BaseSheet } from "../components/map/BaseSheet";

export function CampaignMapView() {
  const { id } = useParams<{ id: string }>();
  const campaign = useCampaignStore((s) => s.campaign);
  const bases = useCampaignStore((s) => s.bases);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const advanceTurn = useCampaignStore((s) => s.advanceTurn);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);

  const selectedBaseId = useMapStore((s) => s.selectedBaseId);
  const setSelectedBase = useMapStore((s) => s.setSelectedBase);
  const activeLayers = useMapStore((s) => s.activeLayers);

  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);

  // Initial load
  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  // Secondary loads once the campaign is known
  useEffect(() => {
    if (campaign) {
      loadBases(campaign.id);
      loadPlatforms();
    }
  }, [campaign, loadBases, loadPlatforms]);

  // Re-project overlays on move/zoom
  useEffect(() => {
    if (!mapInstance) return;
    const bump = () => setProjectionVersion((v) => v + 1);
    mapInstance.on("move", bump);
    return () => { mapInstance.off("move", bump); };
  }, [mapInstance]);

  const selectedBase = useMemo(
    () => bases.find((b) => b.id === selectedBaseId) ?? null,
    [bases, selectedBaseId],
  );

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Top ribbon */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">{campaign.name}</h1>
          <p className="text-xs opacity-70">
            {campaign.current_year} • Q{campaign.current_quarter} • ₹
            {campaign.budget_cr.toLocaleString()} cr
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/campaign/${campaign.id}/raw`}
            className="text-xs opacity-60 hover:opacity-100 underline"
          >
            raw
          </Link>
          <button
            onClick={advanceTurn}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-3 py-1.5 text-sm"
          >
            {loading ? "Ending…" : "End Turn"}
          </button>
        </div>
      </header>

      {/* Map canvas + overlays */}
      <div className="relative flex-1">
        <SubcontinentMap
          markers={bases}
          onMarkerClick={(bid) => setSelectedBase(bid)}
          onReady={(m) => setMapInstance(m)}
        />
        {activeLayers.ad_coverage && (
          <ADCoverageLayer
            map={mapInstance}
            bases={bases}
            projectionVersion={projectionVersion}
          />
        )}
        {activeLayers.intel_contacts && (
          <IntelContactsLayer
            map={mapInstance}
            contacts={[]}   // Plan-6 MVP: empty; Plan 8 wires intel cards here
            projectionVersion={projectionVersion}
          />
        )}
        <LayerTogglePanel />

        {error && (
          <div className="absolute top-3 left-3 bg-red-900/80 border border-red-800 rounded-lg p-2 text-xs text-red-200 max-w-xs">
            {error}
          </div>
        )}
      </div>

      <BaseSheet
        base={selectedBase}
        platforms={platformsById}
        onClose={() => setSelectedBase(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Update `frontend/src/App.tsx`**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignMapView } from "./pages/CampaignMapView";
import { CampaignConsoleRaw } from "./pages/CampaignConsoleRaw";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignMapView />} />
      <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Build + test**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds; all vitest tests still pass.

- [ ] **Step 6: Manual smoke test (optional but recommended)**

Start backend (separate shell): `cd backend && python3 -m uvicorn main:app --port 8010 --reload`
Start frontend: `cd frontend && npm run dev`
Open http://localhost:5173. Create campaign, land on map, confirm base pins appear, click one → bottom sheet shows squadrons, long-press a squadron → platform dossier opens, toggle AD coverage → circles appear, end turn → turn advances.

If any of these fail, STOP and report — don't commit half-working UI.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx \
        frontend/src/pages/CampaignConsoleRaw.tsx \
        frontend/src/pages/CampaignMapView.tsx \
        frontend/src/store/campaignStore.ts
# git mv already staged the rename in Step 2
git commit -m "feat(frontend): CampaignMapView — map-first campaign page with layer toggles + base sheet"
```

---

## Task 15: Docs + ROADMAP status update

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Flip Plan 6 to 🟢 done in `ROADMAP.md`**

Replace the Plan 6 row in Current Status Summary:

```markdown
| 6 | Frontend — Map + Core UI Primitives | 🟢 done | [2026-04-17-frontend-map-primitives-plan.md](2026-04-17-frontend-map-primitives-plan.md) |
```

Bump top "Last updated" to `2026-04-17 (Plan 6 done)`.

- [ ] **Step 2: Add Plan 6 line to `CLAUDE.md` authoritative-docs section**

Under the existing Plan 5 bullet, add:

```markdown
- `docs/superpowers/plans/2026-04-17-frontend-map-primitives-plan.md` — Plan 6 (Frontend — Map + Core UI Primitives). **Done.**
```

- [ ] **Step 3: Update `CLAUDE.md` Current status**

Replace the Plan 5/Next-up block. Add a "done" summary for Plan 6, mirroring the Plan 5 format, then set "Next up" to Plan 7:

```markdown
- **Plan 6 (Frontend — Map + Core UI Primitives)** — ✅ done. MapLibre subcontinent map with OSM tiles as the new `/campaign/:id` landing view; raw JSON moved to `/campaign/:id/raw`. Reusable primitives under `components/primitives/`: `useLongPress`, `CommitHoldButton` (2s hold fires `onCommit`), `RadarChart` (SVG, 3–8 axes), `SwipeStack` (touch+mouse drag, 80px threshold), `PlatformDossier` (modal with radar chart + hero image / fallback silhouette), `SquadronCard` (long-press opens dossier). Map components under `components/map/`: `SubcontinentMap`, `BaseMarkerLayer`, `ADCoverageLayer`, `IntelContactsLayer`, `LayerTogglePanel`, `BaseSheet`. Backend adds two read-only endpoints: `GET /api/content/platforms` and `GET /api/campaigns/{id}/bases` (bases joined with squadrons). Vitest + testing-library wired; 6 new test files cover every primitive + API client + marker-projection helper. Platform media pipeline (`scripts/fetch_platform_assets.py` + `backend/content/asset_manifest.yaml`) fetches Wikimedia hero images into `frontend/public/platforms/{id}/` with `attribution.json` siblings; images are gitignored, commit attribution only.
- **Next up: Plan 7 (Frontend — Procurement Flows)** — six procurement subsystems as mobile-first screens: budget allocator (5-bucket stepper), R&D dashboard, acquisition pipeline (Gantt), force structure, airbase management, diplomacy panel. Scope in `ROADMAP.md` §Plan 7.
```

- [ ] **Step 4: Record carry-overs**

Append to the "Known carry-overs / tuning backlog" list in `CLAUDE.md`:

```markdown
- **`IntelContactsLayer` is wired but fed empty data in Plan 6.** Plan 8 should synthesize `IntelContact[]` from loaded intel cards: HUMINT/IMINT cards have `subject_faction` → use PLAAF/PAF/PLAN base lat/lon; OSINT/SIGINT cards that reference a specific system could anchor at the adversary's forward-base list. For MVP, the empty-array default is deliberate. (Plan 6 → Plan 8)
- **Fetched platform hero images are not committed.** `frontend/public/platforms/.gitignore` blocks `*.jpg` etc. Deployment pipeline (Vercel build) must run `python3 scripts/fetch_platform_assets.py` at pre-build time, OR the manifest should be expanded + committed via CI. Plan 10 will revisit when the full 60-platform content set lands. (Plan 6 → Plan 10)
- **`SubcontinentMap` has no unit test** — WebGL/canvas isn't viable under jsdom. The pure marker-projection math is tested (`markerProjection.test.ts`). An E2E Playwright smoke test against a real deployed URL is the intended complement; wire one once a staging environment is stable. (Plan 6)
- **`kmToPixels` inside `ADCoverageLayer`** uses a latitude-only approximation (good to ~±3% within the subcontinent bbox). If the map zooms out enough to stretch longitude fudging becomes visible; add cosine-correction if AO extent exceeds ~20° latitude span. (Plan 6)
- **Platform asset manifest seeds 6 platforms.** Every other platform (~24) falls back to the generic `PlatformSilhouette`. Plan 10's content expansion should expand the manifest and re-run the fetcher. (Plan 6 → Plan 10)
- **`mapStore.activeLayers` is session-local** (not persisted to backend or localStorage). A reload loses layer toggles. Intentional for MVP; add localStorage persistence if playtesting shows friction. (Plan 6)
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 6 done — frontend map + core UI primitives"
```

---

## Self-review notes

- **Spec coverage (ROADMAP §Plan 6):**
  - Subcontinent map (MapLibre + OSM) ✓ Task 12
  - AD coverage layer ✓ Task 13
  - Intel contacts layer ✓ Task 13 (wired with empty data; populated in Plan 8)
  - Tap-base → squadron stack ✓ Task 13 (BaseSheet) + Task 14
  - Long-press platform → dossier modal ✓ Tasks 9–10 + Task 13
  - Commit-hold button ✓ Task 6 (primitive; consumed in Plan 7/8)
  - Radar chart ✓ Task 7
  - Swipe stack ✓ Task 8 (primitive; consumed in Plan 8 intel stack)
  - Platform media pipeline + Wikimedia fetcher ✓ Task 11
  - Fallback SVG silhouettes ✓ Task 9 (`PlatformSilhouette`)
  - Vitest tests for primitives ✓ Tasks 5–10 + 12
  - Extra scope: `package.json` adds `maplibre-gl`, `recharts`-equivalent custom SVG (no recharts — we hand-rolled), `react-spring` — parked (we do gestures via pointer events, no spring lib needed for Plan 6 motion).

- **Placeholder scan:** none. Every step has complete code or an exact command.

- **Type consistency:**
  - `BaseMarker`, `Platform`, `BaseSquadronSummary` declared in Task 4, used consistently in Tasks 9/10/12/13/14.
  - `MapLayerKey = "ad_coverage" | "intel_contacts"` declared in Task 12, consumed consistently in Task 13's `LayerTogglePanel`.
  - `LongPressHandlers` returns `onPointerMove` (Task 5); `SquadronCard` spreads `{...handlers}` so all pointer handlers — including `onPointerMove` — flow through. Correct.
  - `IntelContact` declared in Task 13 (`IntelContactsLayer.tsx`), consumed as `contacts={[]}` in Task 14's `CampaignMapView`.

- **Test count delta:** backend baseline 296 → 300 after Tasks 2 + 3. Frontend: adds ~20 unit tests across 7 new test files (sanity + api + 5 primitive tests + markerProjection).

- **Scope discipline:** no touches to `app/engine/`, `app/llm/`, or existing `app/crud/` (other than the tiny `crud/base.py` addition that's cleanly Plan-6-owned). No schema migrations beyond the two new endpoints' Pydantic models.

---

## Carry-overs / tuning backlog to flag at handoff

(Also flagged in Task 15 for CLAUDE.md.)

- `IntelContactsLayer` wired but fed empty data in Plan 6. Plan 8 populates.
- Platform hero images not committed; fetcher runs manually or in CI.
- `SubcontinentMap` has no unit test (WebGL). E2E Playwright is the planned complement.
- `kmToPixels` in `ADCoverageLayer` uses a latitude-only approximation (~3% drift at subcontinent extents).
- Asset manifest seeds only 6 platforms; rest fall back to silhouette.
- `mapStore.activeLayers` is session-local — reload loses toggles. Intentional MVP.
