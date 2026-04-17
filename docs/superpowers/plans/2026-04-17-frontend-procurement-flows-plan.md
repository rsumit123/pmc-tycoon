# Sovereign Shield — Frontend MVP Part 2: Procurement Flows (Plan 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three core procurement subsystems — Budget allocation, R&D, Acquisitions — real playable screens that drive the turn loop. After this plan, a player can meaningfully spend ₹1.55L cr/quarter, start and cancel R&D programs across the full content registry, and sign deals for new squadrons with realistic delivery windows.

**Architecture:**
- New backend read endpoints matching the existing write endpoints from Plan 2: `GET /api/content/rd-programs` (catalog), `GET /api/campaigns/{id}/rd` (active states), `GET /api/campaigns/{id}/acquisitions` (order book). Pure serializers — no engine logic.
- A new reusable `Stepper` primitive (`+`/`−` buttons with keyboard support) backs both the budget allocator and the acquisition-quantity picker. Tested with Vitest alongside Plan 6's primitives.
- Three screens under `frontend/src/components/procurement/`: `BudgetAllocator`, `RDDashboard` (catalog + active in one screen with a segmented control), `AcquisitionPipeline` (offers + active-orders Gantt in one screen). Mobile-first: stacked cards on phone, two-column on laptop.
- A `ProcurementHub.tsx` page at `/campaign/:id/procurement` hosts a 3-tab nav (Budget / R&D / Acquisitions). Reached from a new header button in `CampaignMapView`. The map stays the default `/campaign/:id` view — procurement is one click away.
- Zustand `campaignStore` grows three new slices (`rdCatalog`, `rdActive`, `acquisitions`) + loader actions. Existing `createCampaign` / `advanceTurn` are unchanged.

**Scope deliberately narrowed vs ROADMAP §Plan 7:** Force-structure *rebase* (drag-to-rebase) is parked at V1.1 per the decision log; force-structure *view* already exists in Plan 6's `BaseSheet`. Airbase upgrades + diplomacy are **explicitly deferred** and documented as carry-overs to Plan 10 content expansion — they are not dopamine-critical for the MVP playable slice (spec §1 pins "spec-porn procurement decision-making" as the dopamine target, which Budget+R&D+Acquisitions fully cover).

**Tech Stack:** React 19, TS 5.9, Zustand 5, React Router 7, Tailwind v4 (all existing). No new dependencies. Reuses `CommitHoldButton` (Plan 6) for physical-weight confirmation on big spends per spec §7.2.

---

## Scope reminder

**In scope:**
- Backend GET endpoints for R&D catalog + active state + acquisition orders
- `Stepper` primitive with Vitest test
- Budget allocator screen (5-bucket stepper, live remaining, validation, hold-to-commit)
- R&D dashboard (catalog browse with "Start", active list with funding-level + cancel)
- Acquisitions pipeline (platform offers with quantity stepper + sign, active orders as Gantt rows)
- Procurement hub page with 3-tab nav
- Header nav link from `CampaignMapView` to procurement hub
- Store extensions for rd + acquisitions state
- Docs / ROADMAP flip to done

**Out of scope (explicit deferrals):**
- Force-structure rebase UI (V1.1 per D11) — `BaseSheet` already shows squadrons read-only
- Airbase upgrades (fuel depots, AD integration, runway class) — Plan 10 content expansion
- Diplomacy relations panel (France/US/Russia/Israel/UK gates) — Plan 10; for MVP the relations are static content rendered in the R&D/acquisition catalogs where they gate offers
- Sankey budget-flow diagrams — V1.5+
- Animated signing-stamp ceremony — V1.5+ per ROADMAP
- Tinder-style platform-comparison swipes — ROADMAP explicitly prefers radar-chart modal (Plan 6 already shipped)
- Under-funding consequences visualization — carry-over from Plan 2 already flagged
- Refund-on-cancel math — Plan 2's `update_program(status="cancelled")` stops further R&D tick spend; the cash invested is gone per current engine semantics. Surface this clearly in the cancel confirmation UI.

---

## File Structure

**Backend (create):**
- `backend/app/schemas/rd.py` — EXTEND with `RDProgramSpecOut`, `RDProgramListResponse`, `RDProgramStateListResponse`
- `backend/app/schemas/acquisition.py` — EXTEND with `AcquisitionListResponse`
- `backend/app/crud/rd.py` — EXTEND with `list_active_programs(db, campaign_id)`
- `backend/app/crud/acquisition.py` — EXTEND with `list_orders(db, campaign_id)`
- `backend/app/api/content.py` — EXTEND with `GET /api/content/rd-programs`
- `backend/app/api/rd.py` — EXTEND with `GET /api/campaigns/{id}/rd`
- `backend/app/api/acquisitions.py` — EXTEND with `GET /api/campaigns/{id}/acquisitions`
- `backend/tests/test_rd_api.py` — NEW file (or extend existing)
- `backend/tests/test_acquisitions_api.py` — NEW file (or extend existing)
- `backend/tests/test_content_api.py` — EXTEND with rd-programs test

**Frontend (create — primitive):**
- `frontend/src/components/primitives/Stepper.tsx`
- `frontend/src/components/primitives/__tests__/Stepper.test.tsx`

**Frontend (create — procurement screens):**
- `frontend/src/components/procurement/BudgetAllocator.tsx`
- `frontend/src/components/procurement/RDDashboard.tsx`
- `frontend/src/components/procurement/AcquisitionPipeline.tsx`
- `frontend/src/components/procurement/__tests__/BudgetAllocator.test.tsx`
- `frontend/src/components/procurement/__tests__/RDDashboard.test.tsx`
- `frontend/src/components/procurement/__tests__/AcquisitionPipeline.test.tsx`

**Frontend (create — page):**
- `frontend/src/pages/ProcurementHub.tsx`

**Frontend (modify):**
- `frontend/src/App.tsx` — add `/campaign/:id/procurement` route
- `frontend/src/lib/api.ts` — add `getRdCatalog`, `getRdActive`, `getAcquisitions`, `setBudget`, `startRdProgram`, `updateRdProgram`, `createAcquisition`
- `frontend/src/lib/types.ts` — add `RDProgramSpec`, `RDProgramState`, `AcquisitionOrder`, list-response wrappers, and allocation/start/update/acquisition payload types
- `frontend/src/store/campaignStore.ts` — add `rdCatalog`, `rdActive`, `acquisitions` state + `loadRdCatalog`, `loadRdActive`, `loadAcquisitions`, `setBudget`, `startRdProgram`, `cancelRdProgram`, `changeRdFunding`, `createAcquisition` actions
- `frontend/src/pages/CampaignMapView.tsx` — add a "Procurement" link button alongside the existing "raw" / "End Turn" controls

**Docs (modify):**
- `docs/superpowers/plans/ROADMAP.md` — flip Plan 7 to 🟢 done + note force-structure-rebase/airbase/diplomacy deferrals
- `CLAUDE.md` — update current-status block + carry-overs

---

## Domain modelling decisions (locked)

### R&D catalog shape (backend → frontend)

```typescript
interface RDProgramSpec {
  id: string;
  name: string;
  description: string;
  base_duration_quarters: number;
  base_cost_cr: number;
  dependencies: string[];
}
```

Response: `{ programs: RDProgramSpec[] }`, sorted by `id`.

### Active R&D state shape

Already defined in `backend/app/schemas/rd.py::RDProgramRead`. Add a list-response wrapper:

```python
class RDProgramStateListResponse(BaseModel):
    programs: list[RDProgramRead]
```

Frontend mirror:

```typescript
interface RDProgramState {
  id: number;
  program_id: string;
  progress_pct: number;
  funding_level: "slow" | "standard" | "accelerated";
  status: "active" | "completed" | "cancelled";
  milestones_hit: number[];
  cost_invested_cr: number;
  quarters_active: number;
}
```

### Acquisition order shape

Already in `backend/app/schemas/acquisition.py::AcquisitionRead`. Add wrapper `AcquisitionListResponse`. Frontend mirror matches all fields.

### Budget UI math

The allocator shows five rows (R&D, Acquisition, O&M, Spares, Infrastructure). Each row has a Stepper in ₹5,000 cr increments. The screen:

- Loads `campaign.quarterly_grant_cr` (default grant — not yet-added treasury carryover) plus treasury carryover = `campaign.budget_cr + campaign.quarterly_grant_cr` = the "available" cap.
- On mount, initializes from `campaign.current_allocation_json` if set, else from `default_allocation(grant)` computed client-side to match `backend/app/engine/budget.py::DEFAULT_PCT` (rd=25, acquisition=35, om=20, spares=15, infrastructure=5).
- Live-displays total + remaining. Remaining < 0 disables the commit button.
- `CommitHoldButton` fires `setBudget(allocation)`. Backend validates again (existing POST behavior — 400 on overspend).

**Stepper step size:** ₹5,000 cr — chosen because the grant is ₹1.55L cr so 5k is ~3.2% granularity (~30 steps across the grant). Fine-grained editing is still possible via direct keyboard input per stepper contract.

### R&D dashboard UX

Two sections rendered in sequence (mobile) or side-by-side (≥`sm:` breakpoint):

**Active programs** (top priority — top of scroll on mobile): list of `rdActive` rows, each showing:
- Program name + current funding level + progress bar (pct)
- Funding-level radio group (slow / standard / accelerated) → `PATCH` via `POST /api/campaigns/{id}/rd/{program_id}` with `{funding_level: ...}`
- "Cancel" button with a `<details>` confirmation block explaining "Invested cash is lost" → fires `updateRdProgram(program_id, {status: "cancelled"})`.
- Completed programs render read-only ("Completed 20XX-QX") for the remainder of the campaign — filtered from cancellation UI.

**Catalog** (browse): list of all `rdCatalog` entries, filtered to those not already active in `rdActive` (by `program_id`). Each row shows name, description, duration, base cost, dependencies. "Start" button with a funding-level picker and a `CommitHoldButton` to fire `startRdProgram`.

### Acquisitions pipeline UX

**Offers** (top half): list of platforms from `platformsById` (loaded by Plan 6). Each offer card shows name + stats + a quantity `Stepper` (default 16, range 4–36 in steps of 2) + computed `total_cost_cr` (= `platform.cost_cr * quantity`) + default delivery window (`first_delivery_year = current_year + 2`, `foc_year = current_year + 4`, both Q1). A `CommitHoldButton` fires `createAcquisition` with those values. No cost-feasibility pre-check client-side — the backend's POST validates treasury.

**Active orders timeline** (bottom half): Gantt-style rows, one per order. Each row shows:
- Platform name + quantity + `delivered` count
- A horizontal bar from `first_delivery_year-Q_first` to `foc_year-Q_foc`
- A tick/marker at `current_year-current_quarter` to show where we are on the timeline

Gantt is a simple flexbox — no chart lib. Time axis: Jan 2026 → Dec 2036, 40 quarters wide. Bar position = `(q_idx_first / 40) * 100%` width `((q_idx_foc - q_idx_first + 1) / 40) * 100%`.

### Route and nav

- `/` — Landing (unchanged)
- `/campaign/:id` — `CampaignMapView` (unchanged, now with "Procurement" link)
- `/campaign/:id/procurement` — NEW `ProcurementHub`
- `/campaign/:id/raw` — CampaignConsoleRaw (unchanged)
- `*` — Navigate to `/` (unchanged)

`ProcurementHub` uses React Router's `useSearchParams` (`?tab=budget|rd|acquisitions`, default `budget`) so tab state is URL-shareable.

### Stepper contract

```typescript
interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;          // default 1
  min?: number;           // default -Infinity (effectively)
  max?: number;           // default Infinity
  formatValue?: (v: number) => string;   // default String(v)
  unitSuffix?: string;    // e.g. " cr"
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}
```

Behavior:
- `+` / `−` buttons apply `step`, clamped to `[min, max]`.
- Disabled when `disabled` or at bounds.
- Keyboard: `ArrowUp`/`ArrowRight` = +step, `ArrowDown`/`ArrowLeft` = −step when focused.
- No long-press auto-repeat (YAGNI for MVP).

---

## Task 1: Backend `GET /api/content/rd-programs` endpoint

**Files:**
- Modify: `backend/app/schemas/content.py` — add `RDProgramSpecOut`, `RDProgramSpecListResponse`
- Modify: `backend/app/api/content.py` — add new endpoint
- Modify: `backend/tests/test_content_api.py` — add test

- [ ] **Step 1: Write failing tests (append to `backend/tests/test_content_api.py`)**

Append these functions after the existing tests:

```python
def test_list_rd_programs_returns_catalog():
    client, eng = _client()
    try:
        r = client.get("/api/content/rd-programs")
        assert r.status_code == 200
        body = r.json()
        assert "programs" in body
        assert len(body["programs"]) > 0
        first = body["programs"][0]
        for key in ("id", "name", "description", "base_duration_quarters",
                    "base_cost_cr", "dependencies"):
            assert key in first, f"missing {key} in {first}"


def test_rd_programs_includes_amca_mk1():
    client, eng = _client()
    try:
        r = client.get("/api/content/rd-programs")
        ids = {p["id"] for p in r.json()["programs"]}
        assert "amca_mk1" in ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

Note: the existing tests in this file may already `_client()`-teardown inside `finally` — match the existing pattern exactly. If the existing test file uses `try/finally` with `app.dependency_overrides.clear()` + `Base.metadata.drop_all()`, copy that shape into both new tests.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && pytest tests/test_content_api.py -v`
Expected: 2 new tests fail with 404.

- [ ] **Step 3: Extend `backend/app/schemas/content.py`**

Append to the file (alongside existing `PlatformOut` / `PlatformListResponse`):

```python
class RDProgramSpecOut(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str]


class RDProgramSpecListResponse(BaseModel):
    programs: list[RDProgramSpecOut]
```

- [ ] **Step 4: Extend `backend/app/api/content.py`**

Add the new endpoint below the existing `list_platforms_endpoint`:

```python
from app.content.registry import rd_programs as rd_programs_reg
from app.schemas.content import RDProgramSpecOut, RDProgramSpecListResponse


@router.get("/rd-programs", response_model=RDProgramSpecListResponse)
def list_rd_programs_endpoint():
    registry = rd_programs_reg()
    out: list[RDProgramSpecOut] = []
    for spec in registry.values():
        out.append(RDProgramSpecOut(
            id=spec.id,
            name=spec.name,
            description=spec.description,
            base_duration_quarters=int(spec.base_duration_quarters),
            base_cost_cr=int(spec.base_cost_cr),
            dependencies=list(spec.dependencies),
        ))
    out.sort(key=lambda p: p.id)
    return RDProgramSpecListResponse(programs=out)
```

Make sure the `from app.content.registry import rd_programs as rd_programs_reg` import is at the top of the file alongside the existing `from app.content.registry import platforms as platforms_reg`.

- [ ] **Step 5: Run tests — expect 4 passed** (2 existing + 2 new)

Run: `cd backend && pytest tests/test_content_api.py -v`

- [ ] **Step 6: Full suite — expect 302 passed** (300 baseline + 2 new)

Run: `cd backend && pytest -q`

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/content.py backend/app/api/content.py \
        backend/tests/test_content_api.py
git commit -m "feat(api): GET /api/content/rd-programs catalog"
```

---

## Task 2: Backend `GET /api/campaigns/{id}/rd` endpoint

**Files:**
- Modify: `backend/app/schemas/rd.py` — add `RDProgramStateListResponse`
- Modify: `backend/app/crud/rd.py` — add `list_active_programs`
- Modify: `backend/app/api/rd.py` — add GET endpoint
- Create: `backend/tests/test_rd_api.py`

- [ ] **Step 1: Write failing test at `backend/tests/test_rd_api.py`**

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


def test_list_rd_programs_404_for_missing_campaign():
    client, eng = _client()
    try:
        r = client.get("/api/campaigns/99999/rd")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_rd_programs_returns_seeded_programs():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "rd", "difficulty": "realistic", "objectives": [], "seed": 5,
        }).json()
        cid = created["id"]
        r = client.get(f"/api/campaigns/{cid}/rd")
        assert r.status_code == 200
        body = r.json()
        assert "programs" in body
        # At least one seeded active program exists (per seed_starting_state)
        assert len(body["programs"]) >= 1
        first = body["programs"][0]
        for key in ("id", "program_id", "progress_pct", "funding_level",
                    "status", "milestones_hit", "cost_invested_cr",
                    "quarters_active"):
            assert key in first
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_rd_programs_includes_cancelled_and_completed():
    """GET should return ALL program states, not just active — the frontend
    needs historic completed programs for the 'Completed 20XX' display."""
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "rd2", "difficulty": "realistic", "objectives": [], "seed": 6,
        }).json()
        cid = created["id"]
        # Start a program then cancel it
        s = client.post(f"/api/campaigns/{cid}/rd", json={
            "program_id": "ghatak_ucav", "funding_level": "standard",
        })
        assert s.status_code == 201
        c = client.post(f"/api/campaigns/{cid}/rd/ghatak_ucav", json={
            "status": "cancelled",
        })
        assert c.status_code == 200

        r = client.get(f"/api/campaigns/{cid}/rd")
        program_ids = [p["program_id"] for p in r.json()["programs"]]
        assert "ghatak_ucav" in program_ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && pytest tests/test_rd_api.py -v`

- [ ] **Step 3: Extend `backend/app/schemas/rd.py`**

Append to the end of the file:

```python
class RDProgramStateListResponse(BaseModel):
    programs: list[RDProgramRead]
```

- [ ] **Step 4: Extend `backend/app/crud/rd.py`**

Append a new function (put it below the existing `update_program` / `start_program`):

```python
def list_active_programs(db: Session, campaign_id: int):
    """Return ALL RDProgramState rows for a campaign (active, completed,
    and cancelled). The function name is a historical artifact — we want
    the full state so the frontend can render status badges."""
    return db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id
    ).order_by(RDProgramState.id.asc()).all()
```

Also make sure `from sqlalchemy.orm import Session` and `from app.models.rd_program import RDProgramState` are imported at the top (they almost certainly already are — verify).

- [ ] **Step 5: Extend `backend/app/api/rd.py`**

Add the GET endpoint above the existing `start_program_endpoint`:

```python
from app.crud.rd import list_active_programs
from app.schemas.rd import RDProgramStateListResponse


@router.get("/{campaign_id}/rd", response_model=RDProgramStateListResponse)
def list_rd_programs_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_active_programs(db, campaign_id)
    return RDProgramStateListResponse(
        programs=[RDProgramRead.model_validate(r) for r in rows]
    )
```

Ensure `RDProgramRead` is already imported from `app.schemas.rd` (it's used by the existing POST endpoints — it already is).

- [ ] **Step 6: Run tests — expect 3 passed**

Run: `cd backend && pytest tests/test_rd_api.py -v`

- [ ] **Step 7: Full suite — expect 305 passed** (302 + 3)

Run: `cd backend && pytest -q`

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/rd.py backend/app/crud/rd.py \
        backend/app/api/rd.py backend/tests/test_rd_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/rd active+historic program states"
```

---

## Task 3: Backend `GET /api/campaigns/{id}/acquisitions` endpoint

**Files:**
- Modify: `backend/app/schemas/acquisition.py` — add `AcquisitionListResponse`
- Modify: `backend/app/crud/acquisition.py` — add `list_orders`
- Modify: `backend/app/api/acquisitions.py` — add GET endpoint
- Create: `backend/tests/test_acquisitions_api.py`

- [ ] **Step 1: Write failing test at `backend/tests/test_acquisitions_api.py`**

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


def test_list_acquisitions_404_for_missing_campaign():
    client, eng = _client()
    try:
        r = client.get("/api/campaigns/99999/acquisitions")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_acquisitions_returns_seeded_orders():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "acq", "difficulty": "realistic", "objectives": [], "seed": 1,
        }).json()
        cid = created["id"]
        r = client.get(f"/api/campaigns/{cid}/acquisitions")
        assert r.status_code == 200
        body = r.json()
        assert "orders" in body
        assert len(body["orders"]) >= 1
        first = body["orders"][0]
        for key in ("id", "platform_id", "quantity", "signed_year",
                    "signed_quarter", "first_delivery_year",
                    "first_delivery_quarter", "foc_year", "foc_quarter",
                    "delivered", "total_cost_cr"):
            assert key in first
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_acquisitions_includes_newly_created():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "acq2", "difficulty": "realistic", "objectives": [], "seed": 2,
        }).json()
        cid = created["id"]
        # Sign a new order via the existing POST
        s = client.post(f"/api/campaigns/{cid}/acquisitions", json={
            "platform_id": "tejas_mk1a", "quantity": 16,
            "first_delivery_year": 2028, "first_delivery_quarter": 1,
            "foc_year": 2030, "foc_quarter": 4,
            "total_cost_cr": 8000,
        })
        assert s.status_code == 201
        r = client.get(f"/api/campaigns/{cid}/acquisitions")
        platform_ids = [o["platform_id"] for o in r.json()["orders"]]
        # The new order appears alongside any seeded ones
        assert "tejas_mk1a" in platform_ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && pytest tests/test_acquisitions_api.py -v`

- [ ] **Step 3: Extend `backend/app/schemas/acquisition.py`**

Append:

```python
class AcquisitionListResponse(BaseModel):
    orders: list[AcquisitionRead]
```

- [ ] **Step 4: Extend `backend/app/crud/acquisition.py`**

Append at the end of the file:

```python
def list_orders(db: Session, campaign_id: int):
    return db.query(AcquisitionOrder).filter(
        AcquisitionOrder.campaign_id == campaign_id
    ).order_by(AcquisitionOrder.id.asc()).all()
```

Verify `from sqlalchemy.orm import Session` and `from app.models.acquisition import AcquisitionOrder` are imported (they are — used by `create_order`).

- [ ] **Step 5: Extend `backend/app/api/acquisitions.py`**

Add the GET endpoint above the existing POST:

```python
from app.crud.acquisition import list_orders
from app.schemas.acquisition import AcquisitionListResponse


@router.get("/{campaign_id}/acquisitions", response_model=AcquisitionListResponse)
def list_acquisitions_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_orders(db, campaign_id)
    return AcquisitionListResponse(
        orders=[AcquisitionRead.model_validate(r) for r in rows]
    )
```

- [ ] **Step 6: Run tests — expect 3 passed**

Run: `cd backend && pytest tests/test_acquisitions_api.py -v`

- [ ] **Step 7: Full suite — expect 308 passed** (305 + 3)

Run: `cd backend && pytest -q`

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/acquisition.py backend/app/crud/acquisition.py \
        backend/app/api/acquisitions.py backend/tests/test_acquisitions_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/acquisitions order book"
```

---

## Task 4: Frontend types + API client additions

**Files:**
- Modify: `frontend/src/lib/types.ts` — append new types
- Modify: `frontend/src/lib/api.ts` — append new methods
- Test: `frontend/src/lib/__tests__/procurement_api.test.ts` (new file)

- [ ] **Step 1: Write failing test at `frontend/src/lib/__tests__/procurement_api.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, api } from "../api";
import type {
  RDProgramSpecListResponse, RDProgramStateListResponse,
  AcquisitionListResponse, Campaign, RDProgramState, AcquisitionOrder,
} from "../types";

describe("procurement api methods", () => {
  const getSpy = vi.spyOn(http, "get");
  const postSpy = vi.spyOn(http, "post");

  beforeEach(() => {
    getSpy.mockReset();
    postSpy.mockReset();
  });

  it("getRdCatalog hits /api/content/rd-programs", async () => {
    const body: RDProgramSpecListResponse = { programs: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    const out = await api.getRdCatalog();
    expect(out.programs).toEqual([]);
    expect(getSpy).toHaveBeenCalledWith("/api/content/rd-programs");
  });

  it("getRdActive hits /api/campaigns/:id/rd", async () => {
    const body: RDProgramStateListResponse = { programs: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    await api.getRdActive(42);
    expect(getSpy).toHaveBeenCalledWith("/api/campaigns/42/rd");
  });

  it("getAcquisitions hits /api/campaigns/:id/acquisitions", async () => {
    const body: AcquisitionListResponse = { orders: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    await api.getAcquisitions(42);
    expect(getSpy).toHaveBeenCalledWith("/api/campaigns/42/acquisitions");
  });

  it("setBudget POSTs to /api/campaigns/:id/budget", async () => {
    const campaign = { id: 42 } as Campaign;
    postSpy.mockResolvedValueOnce({ data: campaign } as any);
    await api.setBudget(42, {
      rd: 50000, acquisition: 60000, om: 30000, spares: 15000, infrastructure: 5000,
    });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/budget",
      { allocation: { rd: 50000, acquisition: 60000, om: 30000, spares: 15000, infrastructure: 5000 } },
    );
  });

  it("startRdProgram POSTs to /api/campaigns/:id/rd", async () => {
    const state = { program_id: "ghatak_ucav" } as RDProgramState;
    postSpy.mockResolvedValueOnce({ data: state } as any);
    await api.startRdProgram(42, "ghatak_ucav", "accelerated");
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/rd",
      { program_id: "ghatak_ucav", funding_level: "accelerated" },
    );
  });

  it("updateRdProgram POSTs to /api/campaigns/:id/rd/:programId", async () => {
    const state = { program_id: "ghatak_ucav" } as RDProgramState;
    postSpy.mockResolvedValueOnce({ data: state } as any);
    await api.updateRdProgram(42, "ghatak_ucav", { status: "cancelled" });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/rd/ghatak_ucav",
      { status: "cancelled" },
    );
  });

  it("createAcquisition POSTs to /api/campaigns/:id/acquisitions", async () => {
    const order = { id: 1 } as AcquisitionOrder;
    postSpy.mockResolvedValueOnce({ data: order } as any);
    await api.createAcquisition(42, {
      platform_id: "tejas_mk1a", quantity: 16,
      first_delivery_year: 2028, first_delivery_quarter: 1,
      foc_year: 2030, foc_quarter: 4, total_cost_cr: 8000,
    });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/acquisitions",
      expect.objectContaining({ platform_id: "tejas_mk1a", quantity: 16 }),
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run procurement_api`

- [ ] **Step 3: Append types to `frontend/src/lib/types.ts`**

```typescript
// ---------- Plan 7: procurement types ----------

export interface RDProgramSpec {
  id: string;
  name: string;
  description: string;
  base_duration_quarters: number;
  base_cost_cr: number;
  dependencies: string[];
}

export interface RDProgramSpecListResponse {
  programs: RDProgramSpec[];
}

export type RDFundingLevel = "slow" | "standard" | "accelerated";
export type RDStatus = "active" | "completed" | "cancelled";

export interface RDProgramState {
  id: number;
  program_id: string;
  progress_pct: number;
  funding_level: RDFundingLevel;
  status: RDStatus;
  milestones_hit: number[];
  cost_invested_cr: number;
  quarters_active: number;
}

export interface RDProgramStateListResponse {
  programs: RDProgramState[];
}

export interface AcquisitionOrder {
  id: number;
  platform_id: string;
  quantity: number;
  signed_year: number;
  signed_quarter: number;
  first_delivery_year: number;
  first_delivery_quarter: number;
  foc_year: number;
  foc_quarter: number;
  delivered: number;
  total_cost_cr: number;
}

export interface AcquisitionListResponse {
  orders: AcquisitionOrder[];
}

export interface AcquisitionCreatePayload {
  platform_id: string;
  quantity: number;
  first_delivery_year: number;
  first_delivery_quarter: number;
  foc_year: number;
  foc_quarter: number;
  total_cost_cr: number;
}

export interface RDUpdatePayload {
  funding_level?: RDFundingLevel;
  status?: RDStatus;
}
```

- [ ] **Step 4: Append methods to `frontend/src/lib/api.ts`**

Add to the `api` object, and also add the type imports at the top:

Top of file — extend the existing `import type { ... } from "./types";`:

```typescript
import type {
  Campaign,
  CampaignCreatePayload,
  PlatformListResponse,
  BaseListResponse,
  RDProgramSpecListResponse,
  RDProgramStateListResponse,
  RDProgramState,
  RDFundingLevel,
  RDUpdatePayload,
  AcquisitionListResponse,
  AcquisitionOrder,
  AcquisitionCreatePayload,
  BudgetAllocation,
} from "./types";
```

And add these methods inside the `api` object (anywhere after the existing `getBases`):

```typescript
  async getRdCatalog(): Promise<RDProgramSpecListResponse> {
    const { data } = await http.get<RDProgramSpecListResponse>("/api/content/rd-programs");
    return data;
  },

  async getRdActive(campaignId: number): Promise<RDProgramStateListResponse> {
    const { data } = await http.get<RDProgramStateListResponse>(
      `/api/campaigns/${campaignId}/rd`,
    );
    return data;
  },

  async getAcquisitions(campaignId: number): Promise<AcquisitionListResponse> {
    const { data } = await http.get<AcquisitionListResponse>(
      `/api/campaigns/${campaignId}/acquisitions`,
    );
    return data;
  },

  async setBudget(campaignId: number, allocation: BudgetAllocation): Promise<Campaign> {
    const { data } = await http.post<Campaign>(
      `/api/campaigns/${campaignId}/budget`,
      { allocation },
    );
    return data;
  },

  async startRdProgram(
    campaignId: number,
    programId: string,
    fundingLevel: RDFundingLevel,
  ): Promise<RDProgramState> {
    const { data } = await http.post<RDProgramState>(
      `/api/campaigns/${campaignId}/rd`,
      { program_id: programId, funding_level: fundingLevel },
    );
    return data;
  },

  async updateRdProgram(
    campaignId: number,
    programId: string,
    payload: RDUpdatePayload,
  ): Promise<RDProgramState> {
    const { data } = await http.post<RDProgramState>(
      `/api/campaigns/${campaignId}/rd/${programId}`,
      payload,
    );
    return data;
  },

  async createAcquisition(
    campaignId: number,
    payload: AcquisitionCreatePayload,
  ): Promise<AcquisitionOrder> {
    const { data } = await http.post<AcquisitionOrder>(
      `/api/campaigns/${campaignId}/acquisitions`,
      payload,
    );
    return data;
  },
```

- [ ] **Step 5: Run tests — expect 7 passed for procurement_api, all existing still green**

Run: `cd frontend && npm test`

- [ ] **Step 6: Build to confirm TS is clean**

Run: `cd frontend && npm run build`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts \
        frontend/src/lib/__tests__/procurement_api.test.ts
git commit -m "feat(frontend): procurement types + api methods for budget/rd/acquisitions"
```

---

## Task 5: `Stepper` primitive

**Files:**
- Create: `frontend/src/components/primitives/Stepper.tsx`
- Test: `frontend/src/components/primitives/__tests__/Stepper.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Stepper } from "../Stepper";

describe("Stepper", () => {
  it("renders current value with formatter and suffix", () => {
    render(
      <Stepper
        value={50000}
        onChange={() => {}}
        formatValue={(v) => v.toLocaleString()}
        unitSuffix=" cr"
        ariaLabel="R&D allocation"
      />,
    );
    expect(screen.getByText(/50,000 cr/)).toBeInTheDocument();
  });

  it("calls onChange(+step) when + is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} />);
    fireEvent.click(screen.getByLabelText(/increment/i));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it("calls onChange(-step) when - is clicked", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} />);
    fireEvent.click(screen.getByLabelText(/decrement/i));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("clamps to max", () => {
    const onChange = vi.fn();
    render(<Stepper value={98} onChange={onChange} step={5} max={100} />);
    fireEvent.click(screen.getByLabelText(/increment/i));
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("clamps to min", () => {
    const onChange = vi.fn();
    render(<Stepper value={2} onChange={onChange} step={5} min={0} />);
    fireEvent.click(screen.getByLabelText(/decrement/i));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("disables + at max", () => {
    render(<Stepper value={100} onChange={() => {}} step={5} max={100} />);
    expect(screen.getByLabelText(/increment/i)).toBeDisabled();
  });

  it("disables both at disabled", () => {
    render(<Stepper value={50} onChange={() => {}} disabled />);
    expect(screen.getByLabelText(/increment/i)).toBeDisabled();
    expect(screen.getByLabelText(/decrement/i)).toBeDisabled();
  });

  it("ArrowUp key increments", () => {
    const onChange = vi.fn();
    render(<Stepper value={10} onChange={onChange} step={5} ariaLabel="Test stepper" />);
    const root = screen.getByLabelText("Test stepper");
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(15);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run Stepper`

- [ ] **Step 3: Implement `frontend/src/components/primitives/Stepper.tsx`**

```tsx
import { useCallback } from "react";

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  formatValue?: (v: number) => string;
  unitSuffix?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  formatValue = (v) => String(v),
  unitSuffix = "",
  disabled = false,
  className = "",
  ariaLabel,
}: StepperProps) {
  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  const inc = useCallback(() => {
    if (!canInc) return;
    onChange(Math.min(max, value + step));
  }, [canInc, max, value, step, onChange]);

  const dec = useCallback(() => {
    if (!canDec) return;
    onChange(Math.max(min, value - step));
  }, [canDec, min, value, step, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        inc();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        dec();
      }
    },
    [inc, dec],
  );

  return (
    <div
      className={[
        "inline-flex items-stretch rounded-lg border border-slate-800 bg-slate-900/60 select-none",
        className,
      ].join(" ")}
      role="group"
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="decrement"
        disabled={!canDec}
        onClick={dec}
        className={[
          "w-9 flex items-center justify-center text-lg",
          canDec ? "hover:bg-slate-800 active:bg-slate-700" : "opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        −
      </button>
      <div className="flex-1 px-3 py-1.5 text-center font-mono text-sm tabular-nums">
        {formatValue(value)}
        {unitSuffix}
      </div>
      <button
        type="button"
        aria-label="increment"
        disabled={!canInc}
        onClick={inc}
        className={[
          "w-9 flex items-center justify-center text-lg",
          canInc ? "hover:bg-slate-800 active:bg-slate-700" : "opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect 8 passed**

Run: `cd frontend && npm test -- --run Stepper`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/Stepper.tsx \
        frontend/src/components/primitives/__tests__/Stepper.test.tsx
git commit -m "feat(primitives): Stepper component with keyboard + bounds"
```

---

## Task 6: Campaign store extensions for procurement

**Files:**
- Modify: `frontend/src/store/campaignStore.ts`

No test file — store wiring is exercised by the screen tests that follow. But type the final file carefully.

- [ ] **Step 1: Rewrite `frontend/src/store/campaignStore.ts`**

```typescript
import { create } from "zustand";
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
  RDProgramSpec, RDProgramState, AcquisitionOrder,
  BudgetAllocation, RDFundingLevel, RDUpdatePayload, AcquisitionCreatePayload,
} from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  bases: BaseMarker[];
  platformsById: Record<string, Platform>;
  rdCatalog: RDProgramSpec[];
  rdActive: RDProgramState[];
  acquisitions: AcquisitionOrder[];
  loading: boolean;
  error: string | null;

  createCampaign: (payload: CampaignCreatePayload) => Promise<void>;
  loadCampaign: (id: number) => Promise<void>;
  advanceTurn: () => Promise<void>;
  loadBases: (id: number) => Promise<void>;
  loadPlatforms: () => Promise<void>;
  loadRdCatalog: () => Promise<void>;
  loadRdActive: (id: number) => Promise<void>;
  loadAcquisitions: (id: number) => Promise<void>;
  setBudget: (allocation: BudgetAllocation) => Promise<void>;
  startRdProgram: (programId: string, fundingLevel: RDFundingLevel) => Promise<void>;
  updateRdProgram: (programId: string, payload: RDUpdatePayload) => Promise<void>;
  createAcquisition: (payload: AcquisitionCreatePayload) => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
  bases: [],
  platformsById: {},
  rdCatalog: [],
  rdActive: [],
  acquisitions: [],
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
      const cid = campaign.id;
      void get().loadBases(cid);
      void get().loadRdActive(cid);
      void get().loadAcquisitions(cid);
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

  loadRdCatalog: async () => {
    if (get().rdCatalog.length > 0) return;
    try {
      const { programs } = await api.getRdCatalog();
      set({ rdCatalog: programs });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadRdActive: async (id) => {
    try {
      const { programs } = await api.getRdActive(id);
      set({ rdActive: programs });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadAcquisitions: async (id) => {
    try {
      const { orders } = await api.getAcquisitions(id);
      set({ acquisitions: orders });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setBudget: async (allocation) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const campaign = await api.setBudget(current.id, allocation);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  startRdProgram: async (programId, fundingLevel) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.startRdProgram(current.id, programId, fundingLevel);
      await get().loadRdActive(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateRdProgram: async (programId, payload) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.updateRdProgram(current.id, programId, payload);
      await get().loadRdActive(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createAcquisition: async (payload) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.createAcquisition(current.id, payload);
      await get().loadAcquisitions(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    rdCatalog: [], rdActive: [], acquisitions: [],
    loading: false, error: null,
  }),
}));
```

- [ ] **Step 2: Build to catch type errors**

Run: `cd frontend && npm run build`
Expected: build succeeds. The existing `CampaignMapView.tsx` uses `campaign`, `bases`, `platformsById`, `loading`, `error`, `loadCampaign`, `loadBases`, `loadPlatforms`, `advanceTurn` — all preserved.

- [ ] **Step 3: Run existing vitest to confirm no regressions**

Run: `cd frontend && npm test`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/campaignStore.ts
git commit -m "feat(frontend): campaignStore extensions for rd + acquisitions + budget"
```

---

## Task 7: `BudgetAllocator` screen

**Files:**
- Create: `frontend/src/components/procurement/BudgetAllocator.tsx`
- Test: `frontend/src/components/procurement/__tests__/BudgetAllocator.test.tsx`

We also need a `BudgetAllocation` type that matches backend keys. Add it in this task to `types.ts` if it doesn't already exist.

- [ ] **Step 1: Add `BudgetAllocation` type if missing**

Check `frontend/src/lib/types.ts`. If `BudgetAllocation` is not defined, append:

```typescript
export interface BudgetAllocation {
  rd: number;
  acquisition: number;
  om: number;
  spares: number;
  infrastructure: number;
}
```

If it's already defined (it might be as `Record<BudgetBucket, number>` from Plan 1), leave it — just confirm the shape has exactly those 5 keys.

- [ ] **Step 2: Write failing test at `frontend/src/components/procurement/__tests__/BudgetAllocator.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetAllocator } from "../BudgetAllocator";
import type { BudgetAllocation } from "../../../lib/types";

describe("BudgetAllocator", () => {
  const defaultAllocation: BudgetAllocation = {
    rd: 38750, acquisition: 54250, om: 31000, spares: 23250, infrastructure: 7750,
  };

  it("renders all 5 buckets with values", () => {
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={500000}
        initialAllocation={defaultAllocation}
        onCommit={() => {}}
      />,
    );
    expect(screen.getByText(/R&D/)).toBeInTheDocument();
    expect(screen.getByText(/Acquisition/)).toBeInTheDocument();
    expect(screen.getByText(/O&M/)).toBeInTheDocument();
    expect(screen.getByText(/Spares/)).toBeInTheDocument();
    expect(screen.getByText(/Infrastructure/)).toBeInTheDocument();
    // Total + remaining visible
    expect(screen.getByText(/Total/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining/)).toBeInTheDocument();
  });

  it("computes remaining = available - total", () => {
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={100000}
        initialAllocation={defaultAllocation}
        onCommit={() => {}}
      />,
    );
    // Available = 155k + 100k = 255k. Total default ≈ 155k. Remaining ≈ 100k.
    const totals = screen.getAllByText(/1(00,000|01,000)|100,000/);
    expect(totals.length).toBeGreaterThan(0);
  });

  it("disables commit when total exceeds available", () => {
    // Feed an over-allocated state: total > grant + treasury
    render(
      <BudgetAllocator
        grantCr={155000}
        treasuryCr={0}
        initialAllocation={{
          rd: 100000, acquisition: 100000, om: 0, spares: 0, infrastructure: 0,
        }}
        onCommit={() => {}}
      />,
    );
    const commit = screen.getByRole("button", { name: /hold|commit/i });
    expect(commit).toBeDisabled();
  });

  it("resets to default allocation on Reset", () => {
    const onCommit = vi.fn();
    render(
      <BudgetAllocator
        grantCr={100000}
        treasuryCr={0}
        initialAllocation={{
          rd: 0, acquisition: 100000, om: 0, spares: 0, infrastructure: 0,
        }}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    // Reset writes DEFAULT_PCT of 100k: rd=25k, acquisition=35k, om=20k, spares=15k, infrastructure=5k
    expect(screen.getByText("25,000")).toBeInTheDocument();
    expect(screen.getByText("35,000")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd frontend && npm test -- --run BudgetAllocator`

- [ ] **Step 4: Implement `frontend/src/components/procurement/BudgetAllocator.tsx`**

```tsx
import { useMemo, useState } from "react";
import type { BudgetAllocation } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface BudgetAllocatorProps {
  grantCr: number;          // quarterly grant
  treasuryCr: number;       // existing treasury available this quarter
  initialAllocation: BudgetAllocation;
  onCommit: (allocation: BudgetAllocation) => void;
  disabled?: boolean;
}

const BUCKET_LABELS: Record<keyof BudgetAllocation, string> = {
  rd: "R&D",
  acquisition: "Acquisition",
  om: "O&M",
  spares: "Spares",
  infrastructure: "Infrastructure",
};

const BUCKET_HELP: Record<keyof BudgetAllocation, string> = {
  rd: "Funds active R&D programs. Underfunding slips milestone rolls.",
  acquisition: "Settles acquisition invoices. Underfunding slips deliveries.",
  om: "Readiness regen for existing squadrons.",
  spares: "Caps readiness ceiling. Chronic underfunding erodes strength.",
  infrastructure: "Airbase hardening + AD integration (Plan 10 consumes).",
};

const DEFAULT_PCT: BudgetAllocation = {
  rd: 25, acquisition: 35, om: 20, spares: 15, infrastructure: 5,
};

const STEP_CR = 5000;

function defaultFromGrant(grantCr: number): BudgetAllocation {
  return {
    rd: Math.floor((grantCr * DEFAULT_PCT.rd) / 100),
    acquisition: Math.floor((grantCr * DEFAULT_PCT.acquisition) / 100),
    om: Math.floor((grantCr * DEFAULT_PCT.om) / 100),
    spares: Math.floor((grantCr * DEFAULT_PCT.spares) / 100),
    infrastructure: Math.floor((grantCr * DEFAULT_PCT.infrastructure) / 100),
  };
}

export function BudgetAllocator({
  grantCr, treasuryCr, initialAllocation, onCommit, disabled = false,
}: BudgetAllocatorProps) {
  const [alloc, setAlloc] = useState<BudgetAllocation>(initialAllocation);

  const available = grantCr + treasuryCr;
  const total = useMemo(
    () => alloc.rd + alloc.acquisition + alloc.om + alloc.spares + alloc.infrastructure,
    [alloc],
  );
  const remaining = available - total;
  const overspent = remaining < 0;

  const setBucket = (key: keyof BudgetAllocation, next: number) => {
    setAlloc((a) => ({ ...a, [key]: Math.max(0, next) }));
  };

  const reset = () => setAlloc(defaultFromGrant(grantCr));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between text-sm">
        <div>
          <span className="opacity-60">Quarterly grant</span>{" "}
          <span className="font-semibold">₹{grantCr.toLocaleString()} cr</span>
          {treasuryCr > 0 && (
            <>
              {" "}
              <span className="opacity-60">+ reserves</span>{" "}
              <span className="font-semibold">₹{treasuryCr.toLocaleString()} cr</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs opacity-60 hover:opacity-100 underline"
        >
          Reset
        </button>
      </div>

      <div className="space-y-3">
        {(Object.keys(BUCKET_LABELS) as Array<keyof BudgetAllocation>).map((key) => (
          <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <div className="text-sm font-semibold">{BUCKET_LABELS[key]}</div>
              <div className="text-xs opacity-60">{BUCKET_HELP[key]}</div>
            </div>
            <Stepper
              value={alloc[key]}
              onChange={(v) => setBucket(key, v)}
              step={STEP_CR}
              min={0}
              max={available}
              formatValue={(v) => v.toLocaleString()}
              disabled={disabled}
              ariaLabel={`${BUCKET_LABELS[key]} allocation`}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-sm">
        <div>
          <span className="opacity-60">Total</span>{" "}
          <span className="font-semibold">₹{total.toLocaleString()} cr</span>
        </div>
        <div>
          <span className="opacity-60">Remaining</span>{" "}
          <span
            className={[
              "font-semibold",
              overspent ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            ₹{remaining.toLocaleString()} cr
          </span>
        </div>
      </div>

      <div className="pt-2">
        <CommitHoldButton
          label={overspent ? "Over-allocated" : "Hold to commit"}
          holdMs={1800}
          disabled={disabled || overspent}
          onCommit={() => onCommit(alloc)}
          className="w-full"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect 4 passed**

Run: `cd frontend && npm test -- --run BudgetAllocator`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/procurement/BudgetAllocator.tsx \
        frontend/src/components/procurement/__tests__/BudgetAllocator.test.tsx \
        frontend/src/lib/types.ts
git commit -m "feat(procurement): BudgetAllocator — 5-bucket stepper with hold-to-commit"
```

---

## Task 8: `RDDashboard` screen

**Files:**
- Create: `frontend/src/components/procurement/RDDashboard.tsx`
- Test: `frontend/src/components/procurement/__tests__/RDDashboard.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RDDashboard } from "../RDDashboard";
import type { RDProgramSpec, RDProgramState } from "../../../lib/types";

const catalog: RDProgramSpec[] = [
  { id: "amca_mk1", name: "AMCA Mk1", description: "5th-gen stealth fighter.",
    base_duration_quarters: 36, base_cost_cr: 150000, dependencies: [] },
  { id: "astra_mk2", name: "Astra Mk2", description: "240km BVR AAM.",
    base_duration_quarters: 4, base_cost_cr: 8000, dependencies: [] },
];

const active: RDProgramState[] = [
  { id: 1, program_id: "amca_mk1", progress_pct: 25, funding_level: "standard",
    status: "active", milestones_hit: [1], cost_invested_cr: 30000, quarters_active: 9 },
];

describe("RDDashboard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders active programs with progress + funding level", () => {
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("AMCA Mk1")).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
  });

  it("hides catalog entries for already-active programs", () => {
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={() => {}}
      />,
    );
    // Astra Mk2 is in the catalog but NOT active — should show in the catalog section
    expect(screen.getAllByText("Astra Mk2").length).toBeGreaterThan(0);
    // AMCA Mk1 appears only ONCE (in active section), not duplicated in catalog
    const amcaEls = screen.getAllByText("AMCA Mk1");
    expect(amcaEls).toHaveLength(1);
  });

  it("fires onStart when a catalog Start button is held", () => {
    const onStart = vi.fn();
    render(
      <RDDashboard
        catalog={catalog}
        active={[]}
        onStart={onStart}
        onUpdate={() => {}}
      />,
    );
    // Find the first Start button and simulate the 1.8s hold
    const startButtons = screen.getAllByRole("button", { name: /hold|start/i });
    const startBtn = startButtons[0];
    fireEvent.pointerDown(startBtn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onStart).toHaveBeenCalled();
    const [programId, fundingLevel] = onStart.mock.calls[0];
    expect(catalog.find((p) => p.id === programId)).toBeDefined();
    expect(["slow", "standard", "accelerated"]).toContain(fundingLevel);
  });

  it("fires onUpdate cancel when an active Cancel button is clicked", () => {
    const onUpdate = vi.fn();
    render(
      <RDDashboard
        catalog={catalog}
        active={active}
        onStart={() => {}}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Cancel button uses a confirmation pattern — may open a confirm sub-ui.
    // The final "Confirm cancel" click or the Cancel click directly should fire onUpdate.
    // Allow either: if a confirmation appears, click it.
    const confirmBtn = screen.queryByRole("button", { name: /confirm cancel/i });
    if (confirmBtn) fireEvent.click(confirmBtn);
    expect(onUpdate).toHaveBeenCalledWith("amca_mk1", { status: "cancelled" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run RDDashboard`

- [ ] **Step 3: Implement `frontend/src/components/procurement/RDDashboard.tsx`**

```tsx
import { useMemo, useState } from "react";
import type {
  RDProgramSpec, RDProgramState, RDFundingLevel, RDUpdatePayload,
} from "../../lib/types";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface RDDashboardProps {
  catalog: RDProgramSpec[];
  active: RDProgramState[];
  onStart: (programId: string, fundingLevel: RDFundingLevel) => void;
  onUpdate: (programId: string, payload: RDUpdatePayload) => void;
  disabled?: boolean;
}

const FUNDING_LEVELS: RDFundingLevel[] = ["slow", "standard", "accelerated"];

function specOf(catalog: RDProgramSpec[], programId: string): RDProgramSpec | undefined {
  return catalog.find((s) => s.id === programId);
}

function ActiveRow({
  state, spec, onUpdate,
}: { state: RDProgramState; spec?: RDProgramSpec; onUpdate: RDDashboardProps["onUpdate"] }) {
  const [confirming, setConfirming] = useState(false);

  const statusBadge =
    state.status === "completed"
      ? { text: "Completed", classes: "bg-emerald-900/50 text-emerald-200" }
      : state.status === "cancelled"
      ? { text: "Cancelled", classes: "bg-slate-800 text-slate-300" }
      : { text: "Active", classes: "bg-amber-900/50 text-amber-200" };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{spec?.name ?? state.program_id}</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${statusBadge.classes}`}>
          {statusBadge.text}
        </span>
      </div>
      <div className="relative h-1.5 rounded bg-slate-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-amber-500"
          style={{ width: `${Math.min(100, state.progress_pct)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>Progress {state.progress_pct}%</span>
        <span>Invested ₹{state.cost_invested_cr.toLocaleString()} cr</span>
      </div>

      {state.status === "active" && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-60">Funding</span>
            <div className="flex gap-1">
              {FUNDING_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onUpdate(state.program_id, { funding_level: lvl })}
                  className={[
                    "text-xs px-2 py-0.5 rounded",
                    lvl === state.funding_level
                      ? "bg-amber-600 text-slate-900 font-semibold"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200",
                  ].join(" ")}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {confirming ? (
            <div className="border border-rose-800 rounded p-2 bg-rose-900/20 text-xs space-y-2">
              <div className="text-rose-200">
                Cancelling will stop further spend.
                <strong className="block">
                  ₹{state.cost_invested_cr.toLocaleString()} cr already invested is
                  written off — it is not refunded.
                </strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(state.program_id, { status: "cancelled" });
                    setConfirming(false);
                  }}
                  className="text-xs px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                >
                  Confirm cancel
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                >
                  Keep running
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-rose-300 hover:text-rose-200 underline"
            >
              Cancel program
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CatalogRow({
  spec, onStart, disabled,
}: { spec: RDProgramSpec; onStart: RDDashboardProps["onStart"]; disabled?: boolean }) {
  const [funding, setFunding] = useState<RDFundingLevel>("standard");
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="text-sm font-semibold">{spec.name}</div>
      <div className="text-xs opacity-70">{spec.description}</div>
      <div className="text-xs opacity-60">
        Duration ~{spec.base_duration_quarters}q • Base cost ₹
        {spec.base_cost_cr.toLocaleString()} cr
        {spec.dependencies.length > 0 && (
          <> • Depends on: {spec.dependencies.join(", ")}</>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Funding</span>
        <div className="flex gap-1">
          {FUNDING_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFunding(lvl)}
              className={[
                "text-xs px-2 py-0.5 rounded",
                lvl === funding
                  ? "bg-amber-600 text-slate-900 font-semibold"
                  : "bg-slate-800 hover:bg-slate-700",
              ].join(" ")}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>
      <CommitHoldButton
        label={`Hold to start (${funding})`}
        holdMs={1800}
        disabled={disabled}
        onCommit={() => onStart(spec.id, funding)}
        className="w-full"
      />
    </div>
  );
}

export function RDDashboard({
  catalog, active, onStart, onUpdate, disabled,
}: RDDashboardProps) {
  const activeIds = useMemo(
    () => new Set(
      active.filter((a) => a.status === "active" || a.status === "completed")
            .map((a) => a.program_id),
    ),
    [active],
  );
  const availableCatalog = useMemo(
    () => catalog.filter((s) => !activeIds.has(s.id)),
    [catalog, activeIds],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Active programs
        </h3>
        {active.length === 0 ? (
          <p className="text-xs opacity-60">No R&D programs underway.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.map((a) => (
              <ActiveRow
                key={a.id}
                state={a}
                spec={specOf(catalog, a.program_id)}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Catalog
        </h3>
        {availableCatalog.length === 0 ? (
          <p className="text-xs opacity-60">All catalog programs are already underway.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableCatalog.map((spec) => (
              <CatalogRow
                key={spec.id}
                spec={spec}
                onStart={onStart}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect 4 passed**

Run: `cd frontend && npm test -- --run RDDashboard`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/procurement/RDDashboard.tsx \
        frontend/src/components/procurement/__tests__/RDDashboard.test.tsx
git commit -m "feat(procurement): RDDashboard — catalog + active programs with cancel confirmation"
```

---

## Task 9: `AcquisitionPipeline` screen

**Files:**
- Create: `frontend/src/components/procurement/AcquisitionPipeline.tsx`
- Test: `frontend/src/components/procurement/__tests__/AcquisitionPipeline.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AcquisitionPipeline } from "../AcquisitionPipeline";
import type { Platform, AcquisitionOrder } from "../../../lib/types";

const platforms: Platform[] = [
  { id: "tejas_mk1a", name: "Tejas Mk1A", origin: "IND", role: "multirole",
    generation: "4.5", combat_radius_km: 500, payload_kg: 5300,
    rcs_band: "reduced", radar_range_km: 150, cost_cr: 500, intro_year: 2024 },
  { id: "rafale_f5", name: "Rafale F5", origin: "FR", role: "multirole",
    generation: "4.75", combat_radius_km: 1900, payload_kg: 9500,
    rcs_band: "reduced", radar_range_km: 220, cost_cr: 5000, intro_year: 2030 },
];

const orders: AcquisitionOrder[] = [
  { id: 1, platform_id: "rafale_f5", quantity: 36,
    signed_year: 2026, signed_quarter: 2,
    first_delivery_year: 2028, first_delivery_quarter: 4,
    foc_year: 2032, foc_quarter: 2,
    delivered: 0, total_cost_cr: 180000 },
];

describe("AcquisitionPipeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders offers for each platform with quantity + total cost", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    expect(screen.getByText("Tejas Mk1A")).toBeInTheDocument();
    expect(screen.getByText("Rafale F5")).toBeInTheDocument();
    // Default quantity 16 → Tejas total 8,000 cr
    expect(screen.getByText(/8,000 cr/)).toBeInTheDocument();
  });

  it("updating quantity recomputes total cost", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    // Find the Tejas card's increment button — there are multiple "increment"
    // labels across the page; scope by card heading.
    const tejasCard = screen.getByText("Tejas Mk1A").closest("div")!;
    const incBtns = Array.from(tejasCard.querySelectorAll<HTMLButtonElement>(
      "[aria-label='increment']",
    ));
    expect(incBtns.length).toBeGreaterThan(0);
    fireEvent.click(incBtns[0]);  // +2 → 18
    fireEvent.click(incBtns[0]);  // +2 → 20
    // 20 * 500 cr = 10,000 cr
    expect(screen.getByText(/10,000 cr/)).toBeInTheDocument();
  });

  it("renders active orders in the timeline section", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={orders}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    // Timeline label with platform + quantity
    expect(screen.getByText(/Rafale F5/)).toBeInTheDocument();
    expect(screen.getByText(/36/)).toBeInTheDocument();
  });

  it("fires onSign with the correct payload when Sign hold completes", () => {
    const onSign = vi.fn();
    render(
      <AcquisitionPipeline
        platforms={[platforms[0]]}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={onSign}
      />,
    );
    const signBtn = screen.getByRole("button", { name: /hold|sign/i });
    fireEvent.pointerDown(signBtn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onSign).toHaveBeenCalled();
    const [payload] = onSign.mock.calls[0];
    expect(payload.platform_id).toBe("tejas_mk1a");
    expect(payload.quantity).toBe(16);
    expect(payload.total_cost_cr).toBe(16 * 500);
    // Default delivery = current + 2 / FOC = current + 4 (Q1 for both)
    expect(payload.first_delivery_year).toBe(2028);
    expect(payload.first_delivery_quarter).toBe(1);
    expect(payload.foc_year).toBe(2030);
    expect(payload.foc_quarter).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run AcquisitionPipeline`

- [ ] **Step 3: Implement `frontend/src/components/procurement/AcquisitionPipeline.tsx`**

```tsx
import { useState } from "react";
import type {
  Platform, AcquisitionOrder, AcquisitionCreatePayload,
} from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface AcquisitionPipelineProps {
  platforms: Platform[];
  orders: AcquisitionOrder[];
  currentYear: number;
  currentQuarter: number;
  onSign: (payload: AcquisitionCreatePayload) => void;
  disabled?: boolean;
}

const DEFAULT_QTY = 16;
const MIN_QTY = 4;
const MAX_QTY = 36;
const QTY_STEP = 2;

// Timeline is 2026-Q2 to 2036-Q1 = 40 quarters, matching the campaign window.
const TIMELINE_START_Y = 2026;
const TIMELINE_START_Q = 2;
const TIMELINE_QUARTERS = 40;

function qIndex(year: number, quarter: number): number {
  // 0 = 2026-Q2
  return (year - TIMELINE_START_Y) * 4 + (quarter - TIMELINE_START_Q);
}

function qFraction(year: number, quarter: number): number {
  const i = Math.max(0, Math.min(TIMELINE_QUARTERS - 1, qIndex(year, quarter)));
  return i / TIMELINE_QUARTERS;
}

function OfferCard({
  platform, currentYear, onSign, disabled,
}: {
  platform: Platform;
  currentYear: number;
  onSign: AcquisitionPipelineProps["onSign"];
  disabled?: boolean;
}) {
  const [qty, setQty] = useState<number>(DEFAULT_QTY);
  const totalCost = qty * platform.cost_cr;
  // Default windows: first delivery = current_year + 2 Q1, FOC = current_year + 4 Q1
  const firstDeliveryYear = currentYear + 2;
  const focYear = currentYear + 4;

  const sign = () => {
    onSign({
      platform_id: platform.id,
      quantity: qty,
      first_delivery_year: firstDeliveryYear,
      first_delivery_quarter: 1,
      foc_year: focYear,
      foc_quarter: 1,
      total_cost_cr: totalCost,
    });
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{platform.name}</div>
        <span className="text-[10px] opacity-60">{platform.origin}</span>
      </div>
      <div className="text-xs opacity-70">
        {platform.role} • gen {platform.generation}
        {" • "}₹{platform.cost_cr.toLocaleString()} cr/unit
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Quantity</span>
        <Stepper
          value={qty}
          onChange={setQty}
          step={QTY_STEP}
          min={MIN_QTY}
          max={MAX_QTY}
          formatValue={(v) => String(v)}
          ariaLabel={`${platform.name} quantity`}
        />
      </div>
      <div className="text-xs opacity-70">
        Total: <span className="font-semibold">₹{totalCost.toLocaleString()} cr</span>
        {" • First delivery "}{firstDeliveryYear}-Q1
        {" • FOC "}{focYear}-Q1
      </div>
      <CommitHoldButton
        label={`Hold to sign ₹${totalCost.toLocaleString()} cr`}
        holdMs={1800}
        disabled={disabled}
        onCommit={sign}
        className="w-full"
      />
    </div>
  );
}

function TimelineBar({
  order, platformName, currentYear, currentQuarter,
}: {
  order: AcquisitionOrder;
  platformName: string;
  currentYear: number;
  currentQuarter: number;
}) {
  const startFrac = qFraction(order.first_delivery_year, order.first_delivery_quarter);
  const endFrac = qFraction(order.foc_year, order.foc_quarter);
  const widthFrac = Math.max(0.02, endFrac - startFrac);
  const nowFrac = qFraction(currentYear, currentQuarter);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span>
          <span className="font-semibold">{platformName}</span>{" "}
          <span className="opacity-60">×{order.quantity}</span>
        </span>
        <span className="opacity-60">
          {order.delivered}/{order.quantity} delivered
        </span>
      </div>
      <div className="relative h-3 bg-slate-800 rounded">
        <div
          className="absolute inset-y-0 bg-amber-700/60 border border-amber-500 rounded"
          style={{ left: `${startFrac * 100}%`, width: `${widthFrac * 100}%` }}
        />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-emerald-300"
          style={{ left: `${nowFrac * 100}%` }}
          aria-label="current quarter"
        />
      </div>
      <div className="flex justify-between text-[10px] opacity-50">
        <span>
          {order.first_delivery_year}-Q{order.first_delivery_quarter}
        </span>
        <span>
          {order.foc_year}-Q{order.foc_quarter}
        </span>
      </div>
    </div>
  );
}

export function AcquisitionPipeline({
  platforms, orders, currentYear, currentQuarter, onSign, disabled,
}: AcquisitionPipelineProps) {
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Offers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {platforms.map((p) => (
            <OfferCard
              key={p.id}
              platform={p}
              currentYear={currentYear}
              onSign={onSign}
              disabled={disabled}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Active orders
        </h3>
        {orders.length === 0 ? (
          <p className="text-xs opacity-60">No active orders.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <TimelineBar
                key={o.id}
                order={o}
                platformName={byId[o.platform_id]?.name ?? o.platform_id}
                currentYear={currentYear}
                currentQuarter={currentQuarter}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect 4 passed**

Run: `cd frontend && npm test -- --run AcquisitionPipeline`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/procurement/AcquisitionPipeline.tsx \
        frontend/src/components/procurement/__tests__/AcquisitionPipeline.test.tsx
git commit -m "feat(procurement): AcquisitionPipeline — offers + active-order Gantt timeline"
```

---

## Task 10: `ProcurementHub` page + route

**Files:**
- Create: `frontend/src/pages/ProcurementHub.tsx`
- Modify: `frontend/src/App.tsx`

No unit test for this — it's wiring. The screens it composes are already tested.

- [ ] **Step 1: Implement `frontend/src/pages/ProcurementHub.tsx`**

```tsx
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { BudgetAllocator } from "../components/procurement/BudgetAllocator";
import { RDDashboard } from "../components/procurement/RDDashboard";
import { AcquisitionPipeline } from "../components/procurement/AcquisitionPipeline";
import type { BudgetAllocation } from "../lib/types";

type Tab = "budget" | "rd" | "acquisitions";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "budget", label: "Budget" },
  { key: "rd", label: "R&D" },
  { key: "acquisitions", label: "Acquisitions" },
];

export function ProcurementHub() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: Tab =
    rawTab === "rd" || rawTab === "acquisitions" ? rawTab : "budget";

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const rdCatalog = useCampaignStore((s) => s.rdCatalog);
  const rdActive = useCampaignStore((s) => s.rdActive);
  const acquisitions = useCampaignStore((s) => s.acquisitions);
  const loadRdCatalog = useCampaignStore((s) => s.loadRdCatalog);
  const loadRdActive = useCampaignStore((s) => s.loadRdActive);
  const loadAcquisitions = useCampaignStore((s) => s.loadAcquisitions);
  const setBudget = useCampaignStore((s) => s.setBudget);
  const startRd = useCampaignStore((s) => s.startRdProgram);
  const updateRd = useCampaignStore((s) => s.updateRdProgram);
  const createAcquisition = useCampaignStore((s) => s.createAcquisition);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  useEffect(() => {
    if (campaign) {
      loadPlatforms();
      loadRdCatalog();
      loadRdActive(campaign.id);
      loadAcquisitions(campaign.id);
    }
  }, [campaign, loadPlatforms, loadRdCatalog, loadRdActive, loadAcquisitions]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  const defaultAllocation: BudgetAllocation =
    campaign.current_allocation_json ?? {
      rd: Math.floor((campaign.quarterly_grant_cr * 25) / 100),
      acquisition: Math.floor((campaign.quarterly_grant_cr * 35) / 100),
      om: Math.floor((campaign.quarterly_grant_cr * 20) / 100),
      spares: Math.floor((campaign.quarterly_grant_cr * 15) / 100),
      infrastructure: Math.floor((campaign.quarterly_grant_cr * 5) / 100),
    };

  const platformList = Object.values(platformsById)
    .filter((p) => p.origin !== "CHN" && p.origin !== "PAK")   // player-procurable only
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">{campaign.name}</h1>
          <p className="text-xs opacity-70">
            Procurement • {campaign.current_year}-Q{campaign.current_quarter}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/campaign/${campaign.id}`}
            className="text-xs opacity-60 hover:opacity-100 underline"
          >
            ← Map
          </Link>
        </div>
      </header>

      <nav className="flex border-b border-slate-800 bg-slate-950/50">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSearchParams({ tab: t.key })}
            className={[
              "flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
              activeTab === t.key
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="m-4 bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
        {activeTab === "budget" && (
          <BudgetAllocator
            key={`${campaign.id}-${campaign.current_year}-${campaign.current_quarter}`}
            grantCr={campaign.quarterly_grant_cr}
            treasuryCr={campaign.budget_cr}
            initialAllocation={defaultAllocation}
            onCommit={(alloc) => setBudget(alloc)}
            disabled={loading}
          />
        )}
        {activeTab === "rd" && (
          <RDDashboard
            catalog={rdCatalog}
            active={rdActive}
            onStart={(programId, level) => startRd(programId, level)}
            onUpdate={(programId, payload) => updateRd(programId, payload)}
            disabled={loading}
          />
        )}
        {activeTab === "acquisitions" && (
          <AcquisitionPipeline
            platforms={platformList}
            orders={acquisitions}
            currentYear={campaign.current_year}
            currentQuarter={campaign.current_quarter}
            onSign={(payload) => createAcquisition(payload)}
            disabled={loading}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/App.tsx` to include the new route**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignMapView } from "./pages/CampaignMapView";
import { CampaignConsoleRaw } from "./pages/CampaignConsoleRaw";
import { ProcurementHub } from "./pages/ProcurementHub";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignMapView />} />
      <Route path="/campaign/:id/procurement" element={<ProcurementHub />} />
      <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 3: Build + run full test suite**

Run: `cd frontend && npm run build && npm test`
Expected: both succeed; no regressions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProcurementHub.tsx frontend/src/App.tsx
git commit -m "feat(frontend): ProcurementHub page with Budget/R&D/Acquisitions tab nav"
```

---

## Task 11: Link procurement hub from `CampaignMapView`

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: READ the existing header block in `CampaignMapView.tsx`**

The current header has a "raw" link + "End Turn" button. We add a "Procurement" link between them.

- [ ] **Step 2: Modify the header JSX**

Find this block:

```tsx
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
```

Replace with:

```tsx
        <div className="flex items-center gap-2">
          <Link
            to={`/campaign/${campaign.id}/procurement`}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5"
          >
            Procurement
          </Link>
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
```

- [ ] **Step 3: Build to confirm TS is clean**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Run vitest — expect all existing tests still pass**

Run: `cd frontend && npm test`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(frontend): Procurement link in CampaignMapView header"
```

---

## Task 12: Manual smoke test + docs + ROADMAP

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Manual smoke test (optional but recommended)**

Start backend + frontend (two shells):

```
# Shell 1
cd backend && python3 -m uvicorn main:app --port 8010 --reload

# Shell 2
cd frontend && npm run dev
```

Open http://localhost:5173. Walk the flow:
1. Create a campaign.
2. Land on map — confirm bases visible.
3. Click "Procurement" in header.
4. Default tab = Budget. Confirm 5 steppers, total matches grant, hold-to-commit works (the button fills and then fires — watch for a 200 response in the Network tab).
5. Switch to R&D tab. Confirm active programs render (seeded state includes some). Start one new program. Cancel one — confirm the write-off copy appears. Change funding level on one.
6. Switch to Acquisitions tab. Confirm offers render (excluding CHN/PAK platforms). Sign a Tejas Mk1A order — confirm it appears in "Active orders" with the timeline bar.
7. Click "← Map" to return. Click "End Turn". Confirm the tick advances and that returning to Procurement shows the new progress + delivery counts.

If any step fails, STOP and report — don't commit half-working UI.

- [ ] **Step 2: Flip Plan 7 to 🟢 done in `ROADMAP.md`**

Replace the Plan 7 row:

```markdown
| 7 | Frontend — Procurement Flows | 🟢 done | [2026-04-17-frontend-procurement-flows-plan.md](2026-04-17-frontend-procurement-flows-plan.md) |
```

Bump the top "Last updated" line to `2026-04-17 (Plan 7 done)`.

In the Plan 7 detail section below (around line ~221 of ROADMAP), add a note under "Explicitly NOT in scope" (or alongside existing deferrals) — append:

```markdown
- **Shipped in Plan 7:** budget allocator, R&D dashboard, acquisitions pipeline (offers + Gantt timeline). **Deferred to Plan 10:** airbase management, diplomacy panel. **Deferred to V1.1 per D11:** force-structure drag-to-rebase (Plan 6 already renders the read-only squadron stack in `BaseSheet`).
```

- [ ] **Step 3: Add Plan 7 line to `CLAUDE.md` authoritative-docs section**

Under the Plan 6 bullet (currently):

```markdown
- `docs/superpowers/plans/2026-04-17-frontend-map-primitives-plan.md` — Plan 6 (Frontend — Map + Core UI Primitives). **Done.**
```

Append:

```markdown
- `docs/superpowers/plans/2026-04-17-frontend-procurement-flows-plan.md` — Plan 7 (Frontend — Procurement Flows). **Done.**
```

- [ ] **Step 4: Update `CLAUDE.md` Current status block**

Replace the Plan 6 "Next up" line with Plan 7 done + Plan 8 next-up:

Find the existing block:

```markdown
- **Next up: Plan 7 (Frontend — Procurement Flows)** — six procurement subsystems as mobile-first screens: budget allocator (5-bucket stepper), R&D dashboard, acquisition pipeline (Gantt), force structure, airbase management, diplomacy panel. Scope in `ROADMAP.md` §Plan 7.
```

Replace with:

```markdown
- **Plan 7 (Frontend — Procurement Flows)** — ✅ done. 3 new backend GET endpoints (`/api/content/rd-programs`, `/api/campaigns/{id}/rd`, `/api/campaigns/{id}/acquisitions`). New route `/campaign/:id/procurement` hosts a 3-tab hub (Budget / R&D / Acquisitions). New `Stepper` primitive (keyboard + bounds) + 3 procurement screens under `components/procurement/`: `BudgetAllocator` (5-bucket stepper in ₹5k cr steps with hold-to-commit + live remaining), `RDDashboard` (catalog browse hiding already-active programs + active-programs list with funding radio + cancel-with-invested-writeoff confirmation), `AcquisitionPipeline` (platform offers with quantity stepper + hold-to-sign + 40-quarter Gantt timeline for active orders with current-quarter marker). `CampaignMapView` header now has a "Procurement" link. campaignStore extended with `rdCatalog`, `rdActive`, `acquisitions` + corresponding loaders and action methods. Vitest: 40+ tests passing (Plan 6 baseline + new primitive + 3 screen tests + backend api tests). **Scope narrowed intentionally vs ROADMAP §Plan 7:** airbase management + diplomacy deferred to Plan 10; force-structure drag-to-rebase deferred to V1.1 per D11 (Plan 6's `BaseSheet` already renders the read-only squadron stack).
- **Next up: Plan 8 (Frontend — Vignettes + Intel Screens)** — Ops Room planning screen for vignettes (geography-aware force commitment), intel swipe-stack each quarter, AAR reader that renders the LLM narrative. Scope in `ROADMAP.md` §Plan 8.
```

- [ ] **Step 5: Append Plan 7 carry-overs to `CLAUDE.md` carry-over list**

Append these at the bottom of the "Known carry-overs / tuning backlog" section:

```markdown
- **Airbase management UI** is unshipped. Plan 7 was scoped down. Pick up in Plan 10 alongside content expansion — per spec §2.6 airbase upgrades include shelters, fuel depots, AD integration, runway class, forward-repair. Existing `CampaignBase.config` JSON column is the natural persistence target. (Plan 7 → Plan 10)
- **Diplomacy panel** is unshipped. Per spec §2 diplomacy is "lightweight" (relations with France/US/Russia/Israel/UK gate offers). A dedicated screen is probably overkill; a "Relations" read-only strip in the Acquisitions tab may be enough. Decide in Plan 10. (Plan 7 → Plan 10)
- **Force-structure rebase UI** is unshipped — drag-to-rebase is a V1.1 candidate per ROADMAP §V1.5+ Backlog. Plan 6's `BaseSheet` renders the read-only squadron stack, which covers the MVP "see force structure" need. (Plan 7 → V1.1)
- **Acquisition offers use hard-coded default delivery windows** (first delivery = +2 years Q1, FOC = +4 years Q1). Real-world timelines vary by platform (e.g. Rafale F5 has longer integration than Tejas Mk1A). Plan 10 should load per-platform default windows from `platforms.yaml` and let the player adjust within bounds. (Plan 7 → Plan 10)
- **Acquisition offers filter out CHN/PAK origin platforms by hardcoded string match** in `ProcurementHub.tsx::platformList`. A `procurable_by: ["IND"]` field on `PlatformSpec` would be cleaner. Worth a tiny refactor when Plan 10 touches the schema. (Plan 7 → Plan 10)
- **R&D program cancellation writes off invested cash** per existing Plan 2 engine semantics. The confirmation UI makes this explicit. Some players may expect partial refunds. Current behavior is deliberate (sunk-cost realism); revisit if playtesting feedback says otherwise. (Plan 7)
- **`BudgetAllocator` shows treasury carryover in the available cap** (grant + treasury). The backend validates against the same cap. If treasury > 0 and the player allocates from it, they're draining reserves — the current UI doesn't flag this specifically. Acceptable for MVP. (Plan 7)
- **Budget allocator Reset button computes defaults using `Math.floor`** (matching backend's integer-arithmetic `DEFAULT_PCT`), which leaves a few cr unspent. Acceptable; the allocator's Remaining display shows the shortfall honestly. (Plan 7)
- **Cancel-then-restart a program creates a duplicate `rd_program_states` row** — this is the Plan 2 carry-over that became user-facing in Plan 7. Before Plan 10 ships a real playtest, add `UniqueConstraint("campaign_id", "program_id")` or update `start_program` to re-activate a cancelled row. (Plan 2 → Plan 7 observation → Plan 10)
- **ProcurementHub tab state lives in URL search params** (`?tab=budget|rd|acquisitions`). Survives navigation but not a full page reload without the query string. Good enough for MVP. (Plan 7)
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 7 done — frontend procurement flows"
```

---

## Self-review notes

**Spec coverage:**
- Budget allocator (5-bucket stepper) ✓ Task 7
- R&D dashboard ✓ Task 8
- Acquisition pipeline (Gantt-style delivery timeline) ✓ Task 9 (40-quarter horizontal bars with current-quarter marker)
- Force structure — covered by Plan 6 `BaseSheet` (read-only); drag-to-rebase deferred to V1.1 per D11 ✓ (documented deferral)
- Airbase management — deferred to Plan 10 ✓ (documented carry-over)
- Diplomacy — deferred to Plan 10 ✓ (documented carry-over)
- Backend read endpoints ✓ Tasks 1–3
- Stepper primitive ✓ Task 5
- Hold-to-commit ✓ reuses Plan 6's `CommitHoldButton`
- Mobile-first card stacks ✓ `grid-cols-1 sm:grid-cols-2`

**Placeholder scan:** none — every step has complete code or an exact command. The one "optional" item is Task 12 Step 1 (manual smoke test) which is explicitly marked optional but recommended.

**Type consistency:**
- `BudgetAllocation` declared in Task 7 (if missing) — consumed identically in Task 10.
- `RDFundingLevel` / `RDStatus` / `RDUpdatePayload` declared in Task 4, consumed by Tasks 6, 8, 10.
- `AcquisitionCreatePayload` declared in Task 4, consumed by Tasks 6, 9, 10.
- `RDDashboard` props name `onUpdate` and `onStart` — matched between Task 8 and Task 10.
- `AcquisitionPipeline` prop `onSign` — matched between Task 9 and Task 10.

**Backend test counts:**
- Baseline at end of Plan 6: 300 passing.
- Task 1: +2 (302).
- Task 2: +3 (305).
- Task 3: +3 (308).

**Frontend test counts:**
- Baseline at end of Plan 6: 25 passing.
- Task 4: +7 (32).
- Task 5: +8 (40).
- Tasks 7–9: +12 (52).

Tests-to-pass targets assume no existing tests regress (store changes shouldn't break anything since additions are append-only).

**Scope discipline:** touched paths are strictly `backend/app/{schemas,crud,api}/` + matching test files, and `frontend/src/{components/procurement,components/primitives,pages,store,lib}/` + matching tests. No engine, no llm, no model schema changes, no migration.
