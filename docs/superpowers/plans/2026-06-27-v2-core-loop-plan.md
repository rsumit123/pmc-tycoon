# Chakravyuh v2 Phase 2 — Streamline the Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Commit directly to `main` (repo convention).

**Goal:** Reduce every-turn friction — one-tap budget presets, a live objective tracker, and a "Situation Report" turn briefing — surfacing existing mechanics without changing any engine math.

**Architecture:** A new pure `objective_progress` engine helper + a slim read-only `GET /api/campaigns/{id}/objectives` endpoint feed a frontend Objective Tracker (dedicated screen + a compact summary in the post-turn report). `BudgetAllocator` is reworked to presets-first with the existing steppers behind an "Advanced" disclosure and an autopilot pre-fill from the campaign's last allocation. All mobile-first + Android-verified.

**Tech Stack:** Backend FastAPI + SQLAlchemy 2.x + Pydantic 2; engine layer is pure functions. Frontend React 19 + TS + Zustand + Vitest. Capacitor Android target.

**Platform rule (all frontend tasks):** tap not hover; `safe-pt`/`safe-pb`; back-button via `useBackButtonClose`; touch targets ≥44px.

---

### Task 1: `objective_progress` engine helper (pure)

**Files:**
- Create: `backend/app/engine/objectives.py`
- Test: `backend/tests/test_objective_progress.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_objective_progress.py
from app.engine.objectives import ObjectiveInputs, objective_progress

def _inputs(**kw):
    base = dict(
        squad_count=0, modern_frac=0.0, indigenous_count=0, vlo_count=0,
        has_amca_squadron=False, amca_rd_progress=0.0,
        tedbf_completed=False, tedbf_rd_progress=0.0,
        missile_sov_completed=0, deterrence_completed=0, ace_count=0,
        treasury_cr=10000, vignettes_won=0, vignettes_total=0,
    )
    base.update(kw)
    return ObjectiveInputs(**base)

def test_maintain_42_in_progress_then_met():
    p = objective_progress("maintain_42_squadrons", _inputs(squad_count=21))
    assert p.status == "in_progress" and abs(p.progress - 0.5) < 1e-9 and "21/42" in p.detail
    p2 = objective_progress("maintain_42_squadrons", _inputs(squad_count=42))
    assert p2.status == "met" and p2.progress == 1.0

def test_amca_uses_rd_progress_until_squadron_exists():
    p = objective_progress("amca_operational_by_2035", _inputs(amca_rd_progress=0.4))
    assert p.status == "in_progress" and abs(p.progress - 0.4) < 1e-9 and "40%" in p.detail
    p2 = objective_progress("amca_operational_by_2035", _inputs(has_amca_squadron=True))
    assert p2.status == "met"

def test_budget_discipline_at_risk_when_broke():
    assert objective_progress("budget_discipline", _inputs(treasury_cr=5000)).status == "met"
    assert objective_progress("budget_discipline", _inputs(treasury_cr=0)).status == "at_risk"

def test_combat_excellence_at_risk_after_enough_losses():
    p = objective_progress("combat_excellence", _inputs(vignettes_won=1, vignettes_total=6))
    assert p.status == "at_risk"
    p2 = objective_progress("combat_excellence", _inputs(vignettes_won=5, vignettes_total=6))
    assert p2.status == "met"
    p3 = objective_progress("combat_excellence", _inputs(vignettes_won=0, vignettes_total=0))
    assert p3.status == "in_progress"

def test_no_territorial_loss_flips_to_at_risk_on_a_loss():
    assert objective_progress("no_territorial_loss", _inputs(vignettes_won=3, vignettes_total=3)).status == "met"
    assert objective_progress("no_territorial_loss", _inputs(vignettes_won=2, vignettes_total=3)).status == "at_risk"

def test_unknown_objective_is_safe():
    p = objective_progress("not_a_real_objective", _inputs())
    assert p.status == "in_progress" and p.progress == 0.0
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd backend && python3 -m pytest tests/test_objective_progress.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/app/engine/objectives.py`**

```python
"""Pure per-objective progress evaluation for the live tracker.

Takes already-derived metrics (no DB/content access) so it stays a pure,
deterministic engine function. The API layer assembles ObjectiveInputs.
Constants mirror app/api/summary.py::_evaluate_objective (left untouched).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ObjectiveStatus = Literal["met", "in_progress", "at_risk"]

INDIGENOUS_PLATFORMS = {
    "tejas_mk1", "tejas_mk1a", "tejas_mk2", "amca_mk1", "tedbf", "ghatak_ucav",
}
DETERRENCE_PROGRAMS = {
    "astra_mk3", "brahmos_ng", "rudram_2", "rudram_3", "pralay_srbm",
    "long_range_sam", "maya_ew", "ngarm", "air_brahmos2", "mrsam_air", "saaw",
}


@dataclass(frozen=True)
class ObjectiveInputs:
    squad_count: int
    modern_frac: float
    indigenous_count: int
    vlo_count: int
    has_amca_squadron: bool
    amca_rd_progress: float       # 0..1 (1.0 if AMCA Mk1 R&D completed)
    tedbf_completed: bool
    tedbf_rd_progress: float      # 0..1
    missile_sov_completed: int    # of {astra_mk3, brahmos_ng}, 0..2
    deterrence_completed: int     # of DETERRENCE_PROGRAMS
    ace_count: int
    treasury_cr: int
    vignettes_won: int
    vignettes_total: int


@dataclass(frozen=True)
class ObjectiveProgress:
    status: ObjectiveStatus
    progress: float               # 0..1
    detail: str


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _pct(x: float) -> int:
    return int(round(_clamp01(x) * 100))


def objective_progress(obj_id: str, i: ObjectiveInputs) -> ObjectiveProgress:
    if obj_id == "maintain_42_squadrons":
        met = i.squad_count >= 42
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.squad_count / 42), f"{i.squad_count}/42 squadrons")

    if obj_id == "amca_operational_by_2035":
        if i.has_amca_squadron:
            return ObjectiveProgress("met", 1.0, "AMCA squadron operational")
        return ObjectiveProgress("in_progress", _clamp01(i.amca_rd_progress),
                                 f"AMCA R&D {_pct(i.amca_rd_progress)}%")

    if obj_id == "modernize_fleet":
        met = i.modern_frac > 0.5
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.modern_frac), f"{_pct(i.modern_frac)}% 4.5-gen+")

    if obj_id == "indigenous_backbone":
        met = i.indigenous_count >= 5
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.indigenous_count / 5), f"{i.indigenous_count}/5 indigenous sqns")

    if obj_id == "missile_sovereignty":
        met = i.missile_sov_completed >= 2
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.missile_sov_completed / 2), f"{i.missile_sov_completed}/2 programs")

    if obj_id == "maritime_reach":
        if i.tedbf_completed:
            return ObjectiveProgress("met", 1.0, "TEDBF complete")
        return ObjectiveProgress("in_progress", _clamp01(i.tedbf_rd_progress),
                                 f"TEDBF R&D {_pct(i.tedbf_rd_progress)}%")

    if obj_id == "stealth_fleet":
        met = i.vlo_count >= 2
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.vlo_count / 2), f"{i.vlo_count}/2 stealth sqns")

    if obj_id == "ace_squadrons":
        met = i.ace_count >= 3
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.ace_count / 3), f"{i.ace_count}/3 aces")

    if obj_id == "deterrence_posture":
        met = i.deterrence_completed >= 4
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.deterrence_completed / 4), f"{i.deterrence_completed}/4 R&D programs")

    if obj_id == "budget_discipline":
        if i.treasury_cr > 0:
            return ObjectiveProgress("met", 1.0, f"₹{i.treasury_cr:,} cr treasury")
        return ObjectiveProgress("at_risk", 0.0, "Treasury depleted")

    if obj_id == "combat_excellence":
        if i.vignettes_total == 0:
            return ObjectiveProgress("in_progress", 0.0, "No engagements yet")
        rate = i.vignettes_won / i.vignettes_total
        detail = f"{i.vignettes_won}/{i.vignettes_total} won ({_pct(rate)}%)"
        if rate > 0.65:
            return ObjectiveProgress("met", _clamp01(rate), detail)
        if rate < 0.5 and i.vignettes_total >= 5:
            return ObjectiveProgress("at_risk", _clamp01(rate), detail)
        return ObjectiveProgress("in_progress", _clamp01(rate), detail)

    if obj_id == "no_territorial_loss":
        lost = i.vignettes_total - i.vignettes_won
        if lost > 0:
            rate = i.vignettes_won / i.vignettes_total if i.vignettes_total else 1.0
            return ObjectiveProgress("at_risk", _clamp01(rate), f"{lost} losses")
        return ObjectiveProgress("met", 1.0, "No losses")

    return ObjectiveProgress("in_progress", 0.0, "")
```

- [ ] **Step 4: Run the test, verify PASS**

Run: `cd backend && python3 -m pytest tests/test_objective_progress.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/engine/objectives.py backend/tests/test_objective_progress.py
git commit -m "feat(v2): objective_progress pure engine helper"
```

---

### Task 2: `GET /api/campaigns/{id}/objectives` endpoint

**Files:**
- Create: `backend/app/schemas/objectives.py`, `backend/app/api/objectives.py`
- Modify: `backend/main.py` (register router with the ownership guard)
- Test: `backend/tests/test_objectives_api.py`

- [ ] **Step 1: Write the failing test** (use the standard in-memory-SQLite fixture pattern from `tests/test_campaigns_api.py`)

```python
# backend/tests/test_objectives_api.py
from tests.conftest import client_for_new_campaign  # if a shared helper exists; else mirror test_campaigns_api fixture

def test_objectives_endpoint_returns_progress_for_each_chosen_objective(client_and_campaign):
    client, cid = client_and_campaign
    r = client.get(f"/api/campaigns/{cid}/objectives")
    assert r.status_code == 200
    body = r.json()
    assert "objectives" in body
    ids = {o["id"] for o in body["objectives"]}
    # campaign was created with at least 3 objectives
    assert len(ids) >= 3
    for o in body["objectives"]:
        assert o["status"] in ("met", "in_progress", "at_risk")
        assert 0.0 <= o["progress"] <= 1.0
        assert isinstance(o["name"], str) and o["name"]
```

> NOTE: match the exact fixture style used by the other API test files in `backend/tests/` (in-memory SQLite + StaticPool + auth header / ownership). Read `tests/test_campaigns_api.py` and an existing guarded-route test (e.g. `tests/test_summary_api.py` if present, or `tests/test_router_protection_sweep.py`) to reuse the campaign-creation + auth fixture. Create a campaign with a known objective set, then GET the endpoint.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd backend && python3 -m pytest tests/test_objectives_api.py -q`
Expected: FAIL — 404/route missing.

- [ ] **Step 3: Implement schema + endpoint**

`backend/app/schemas/objectives.py`:
```python
from pydantic import BaseModel


class ObjectiveProgressEntry(BaseModel):
    id: str
    name: str
    status: str
    progress: float
    detail: str


class ObjectiveProgressListResponse(BaseModel):
    objectives: list[ObjectiveProgressEntry]
```

`backend/app/api/objectives.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.campaign_narrative import CampaignNarrative
from app.models.rd_program import RDProgramState
from app.models.squadron import Squadron
from app.models.vignette import Vignette
from app.engine.objectives import (
    ObjectiveInputs, objective_progress,
    INDIGENOUS_PLATFORMS, DETERRENCE_PROGRAMS,
)
from app.schemas.objectives import ObjectiveProgressEntry, ObjectiveProgressListResponse

router = APIRouter(prefix="/api/campaigns", tags=["objectives"])


@router.get("/{campaign_id}/objectives", response_model=ObjectiveProgressListResponse)
def objectives_progress_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")

    from app.content import registry
    from app.content.registry import objectives as objectives_reg
    plat_map = registry.platforms()
    obj_specs = objectives_reg()

    squads = db.query(Squadron).filter(Squadron.campaign_id == campaign_id).all()
    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id, Vignette.status == "resolved",
    ).all()
    rd_states = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id).all()
    rd_by_id = {r.program_id: r for r in rd_states}
    completed_ids = {r.program_id for r in rd_states if r.status == "completed"}
    ace_count = db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign_id,
        CampaignNarrative.kind == "ace_name",
    ).count()

    def rd_progress(pid: str) -> float:
        if pid in completed_ids:
            return 1.0
        r = rd_by_id.get(pid)
        return (r.progress_pct / 100.0) if r else 0.0

    total = len(squads)
    modern = sum(
        1 for s in squads
        if s.platform_id in plat_map and float(plat_map[s.platform_id].generation) >= 4.5
    )
    vlo = sum(
        1 for s in squads
        if s.platform_id in plat_map and plat_map[s.platform_id].rcs_band == "VLO"
    )
    indigenous = sum(1 for s in squads if s.platform_id in INDIGENOUS_PLATFORMS)
    won = sum(1 for v in vigs if (v.outcome or {}).get("objective_met"))

    inputs = ObjectiveInputs(
        squad_count=total,
        modern_frac=(modern / total) if total else 0.0,
        indigenous_count=indigenous,
        vlo_count=vlo,
        has_amca_squadron=any(s.platform_id in ("amca_mk1", "amca_mk2") for s in squads),
        amca_rd_progress=rd_progress("amca_mk1"),
        tedbf_completed=("tedbf" in completed_ids),
        tedbf_rd_progress=rd_progress("tedbf"),
        missile_sov_completed=len({"astra_mk3", "brahmos_ng"} & completed_ids),
        deterrence_completed=len(DETERRENCE_PROGRAMS & completed_ids),
        ace_count=ace_count,
        treasury_cr=c.budget_cr,
        vignettes_won=won,
        vignettes_total=len(vigs),
    )

    out = []
    for obj_id in (c.objectives_json or []):
        spec = obj_specs.get(obj_id)
        name = spec.title if spec else obj_id.replace("_", " ")
        p = objective_progress(obj_id, inputs)
        out.append(ObjectiveProgressEntry(
            id=obj_id, name=name, status=p.status, progress=p.progress, detail=p.detail))
    return ObjectiveProgressListResponse(objectives=out)
```

- [ ] **Step 4: Register the router WITH the ownership guard in `backend/main.py`**

Add import alongside the other routers:
```python
from app.api.objectives import router as objectives_router
```
And register it in the guarded block (next to `summary_router`):
```python
app.include_router(objectives_router, dependencies=_guard)
```
(The `test_router_protection_sweep.py` introspection test REQUIRES this guard — registering without it will fail CI.)

- [ ] **Step 5: Run tests, verify PASS**

Run: `cd backend && python3 -m pytest tests/test_objectives_api.py tests/test_router_protection_sweep.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/schemas/objectives.py backend/app/api/objectives.py backend/main.py backend/tests/test_objectives_api.py
git commit -m "feat(v2): GET /campaigns/{id}/objectives progress endpoint"
```

---

### Task 3: Frontend types + api method + store action for objective progress

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/store/campaignStore.ts`
- Test: `frontend/src/lib/__tests__/api-objectives.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/api-objectives.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { api, http } from "../api";

afterEach(() => vi.restoreAllMocks());

describe("api.getObjectiveProgress", () => {
  it("GETs the objectives endpoint and returns the list", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({
      data: { objectives: [{ id: "maintain_42_squadrons", name: "Maintain 42+", status: "in_progress", progress: 0.5, detail: "21/42 squadrons" }] },
    } as never);
    const res = await api.getObjectiveProgress(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/objectives");
    expect(res.objectives[0].status).toBe("in_progress");
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- api-objectives`
Expected: FAIL — `getObjectiveProgress` undefined.

- [ ] **Step 3: Implement**

In `frontend/src/lib/types.ts` add:
```ts
export interface ObjectiveProgressEntry {
  id: string;
  name: string;
  status: "met" | "in_progress" | "at_risk";
  progress: number; // 0..1
  detail: string;
}

export interface ObjectiveProgressListResponse {
  objectives: ObjectiveProgressEntry[];
}
```

In `frontend/src/lib/api.ts` add a method (follow the existing `http.get` pattern, near `getCampaignSummary`):
```ts
  getObjectiveProgress: (campaignId: number) =>
    http.get<ObjectiveProgressListResponse>(`/api/campaigns/${campaignId}/objectives`).then((r) => r.data),
```
(import `ObjectiveProgressListResponse` from `./types` with the other type imports.)

In `frontend/src/store/campaignStore.ts` add state + action (mirror `loadNotifications`):
- state: `objectiveProgress: ObjectiveProgressEntry[]` (init `[]`)
- action:
```ts
  loadObjectiveProgress: async (campaignId: number) => {
    try {
      const res = await api.getObjectiveProgress(campaignId);
      set({ objectiveProgress: res.objectives });
    } catch {
      /* non-fatal: leave previous */
    }
  },
```
(add `ObjectiveProgressEntry` to the store's type imports and declare `loadObjectiveProgress` + `objectiveProgress` in the store's TS interface.)

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- api-objectives && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts frontend/src/lib/__tests__/api-objectives.test.ts
git commit -m "feat(v2): objective-progress types + api + store action"
```

---

### Task 4: ObjectiveTracker component + Objectives screen + route + menu link

**Files:**
- Create: `frontend/src/components/objectives/ObjectiveTracker.tsx`, `frontend/src/pages/ObjectivesPage.tsx`
- Modify: `frontend/src/App.tsx` (route), `frontend/src/pages/CampaignMapView.tsx` (menu link)
- Test: `frontend/src/components/objectives/__tests__/ObjectiveTracker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/objectives/__tests__/ObjectiveTracker.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectiveTracker } from "../ObjectiveTracker";
import type { ObjectiveProgressEntry } from "../../../lib/types";

const ENTRIES: ObjectiveProgressEntry[] = [
  { id: "maintain_42_squadrons", name: "Maintain 42+ squadrons", status: "in_progress", progress: 0.5, detail: "21/42 squadrons" },
  { id: "budget_discipline", name: "Maintain fiscal discipline", status: "at_risk", progress: 0, detail: "Treasury depleted" },
  { id: "modernize_fleet", name: "Modernize fleet", status: "met", progress: 1, detail: "60% 4.5-gen+" },
];

describe("ObjectiveTracker", () => {
  it("renders each objective with name, detail and a status label", () => {
    render(<ObjectiveTracker objectives={ENTRIES} />);
    expect(screen.getByText("Maintain 42+ squadrons")).toBeInTheDocument();
    expect(screen.getByText("21/42 squadrons")).toBeInTheDocument();
    expect(screen.getByText(/at risk/i)).toBeInTheDocument();
    expect(screen.getByText(/met/i)).toBeInTheDocument();
  });

  it("renders an empty hint when there are no objectives", () => {
    render(<ObjectiveTracker objectives={[]} />);
    expect(screen.getByText(/no objectives/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- ObjectiveTracker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ObjectiveTracker.tsx`**

```tsx
import type { ObjectiveProgressEntry } from "../../lib/types";

const STATUS: Record<ObjectiveProgressEntry["status"], { label: string; pill: string; bar: string }> = {
  met:         { label: "✅ Met",         pill: "bg-emerald-700/40 text-emerald-200", bar: "bg-emerald-500" },
  in_progress: { label: "🟡 In progress", pill: "bg-amber-700/30 text-amber-200",     bar: "bg-amber-500" },
  at_risk:     { label: "🔴 At risk",     pill: "bg-rose-800/40 text-rose-200",        bar: "bg-rose-500" },
};

export interface ObjectiveTrackerProps {
  objectives: ObjectiveProgressEntry[];
}

export function ObjectiveTracker({ objectives }: ObjectiveTrackerProps) {
  if (objectives.length === 0) {
    return <p className="text-sm opacity-60">No objectives to track.</p>;
  }
  return (
    <div className="space-y-2">
      {objectives.map((o) => {
        const s = STATUS[o.status];
        return (
          <div key={o.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{o.name}</div>
              <span className={`text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap ${s.pill}`}>{s.label}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded bg-slate-800 overflow-hidden">
              <div className={`h-full ${s.bar}`} style={{ width: `${Math.round(o.progress * 100)}%` }} />
            </div>
            {o.detail && <div className="mt-1 text-xs opacity-70">{o.detail}</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `ObjectivesPage.tsx`**

```tsx
import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ObjectiveTracker } from "../components/objectives/ObjectiveTracker";

export function ObjectivesPage() {
  const { id } = useParams();
  const cid = Number(id);
  const objectives = useCampaignStore((s) => s.objectiveProgress);
  const loadObjectiveProgress = useCampaignStore((s) => s.loadObjectiveProgress);

  useEffect(() => {
    if (cid) void loadObjectiveProgress(cid);
  }, [cid]);

  return (
    <div className="min-h-screen p-4 safe-pt safe-pb">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display uppercase tracking-wider">Objectives</h1>
          <Link to={`/campaign/${cid}`} className="text-xs text-slate-400 underline">← Map</Link>
        </div>
        <p className="text-sm opacity-70">Your campaign objectives and how you're tracking against each.</p>
        <ObjectiveTracker objectives={objectives} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Route + menu link**

In `frontend/src/App.tsx`: import `ObjectivesPage` and add inside the protected block:
```tsx
          <Route path="/campaign/:id/objectives" element={<ObjectivesPage />} />
```
In `frontend/src/pages/CampaignMapView.tsx`, in the menu "Operations" section (e.g. after the Intel link), add:
```tsx
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/objectives`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >🎯 Objectives</Link>
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npm test -- ObjectiveTracker && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/components/objectives/ObjectiveTracker.tsx frontend/src/pages/ObjectivesPage.tsx frontend/src/components/objectives/__tests__/ObjectiveTracker.test.tsx frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(v2): live ObjectiveTracker + Objectives screen + menu link"
```

---

### Task 5: Budget presets + autopilot + Advanced toggle + readiness line

**Files:**
- Modify: `frontend/src/components/procurement/BudgetAllocator.tsx`
- Test: `frontend/src/components/procurement/__tests__/BudgetAllocator.presets.test.tsx`

**Context:** Read `BudgetAllocator.tsx` fully. It takes `grantCr`, `treasuryCr`, `initialAllocation`, `onCommit(allocation)`, `disabled`, plus commitment props; has 5 steppers, a reset, an auto-match, and a hold-to-commit button. Keep ALL of that — just restructure the default view. Buckets order: `rd, acquisition, om, spares, infrastructure`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/procurement/__tests__/BudgetAllocator.presets.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetAllocator } from "../BudgetAllocator";

const baseProps = {
  grantCr: 45000,
  treasuryCr: 45000,
  initialAllocation: { rd: 11250, acquisition: 15750, om: 9000, spares: 6750, infrastructure: 2250 },
  onCommit: vi.fn(),
};

describe("BudgetAllocator presets", () => {
  it("shows preset buttons and applies Tech Rush split of the grant", () => {
    render(<BudgetAllocator {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /tech rush/i }));
    // Tech Rush = rd 40% of 45000 = 18000 — surfaced somewhere in the UI
    expect(screen.getAllByText(/18,000/).length).toBeGreaterThan(0);
  });

  it("hides the raw bucket steppers until Advanced is expanded", () => {
    render(<BudgetAllocator {...baseProps} />);
    // The 'infrastructure' stepper label is only present under Advanced
    expect(screen.queryByText(/infrastructure/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /advanced|customize/i }));
    expect(screen.getByText(/infrastructure/i)).toBeInTheDocument();
  });
});
```

> Adjust the matchers to the component's real rendering if needed (e.g. how amounts are formatted) — keep the intent: a preset applies the correct split, and steppers are hidden until Advanced. Do NOT weaken the assertions to pass; fix the component to satisfy the intent.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- BudgetAllocator.presets`
Expected: FAIL — no preset buttons / steppers always visible.

- [ ] **Step 3: Implement the rework**

In `BudgetAllocator.tsx`:
(a) Add a presets table near the top of the file:
```tsx
const PRESETS: { key: string; label: string; pct: Record<string, number> }[] = [
  { key: "balanced",  label: "Balanced",           pct: { rd: 25, acquisition: 35, om: 20, spares: 15, infrastructure: 5 } },
  { key: "force",     label: "Build the Force",    pct: { rd: 15, acquisition: 50, om: 18, spares: 12, infrastructure: 5 } },
  { key: "tech",      label: "Tech Rush",          pct: { rd: 40, acquisition: 25, om: 18, spares: 12, infrastructure: 5 } },
  { key: "readiness", label: "Maintain Readiness", pct: { rd: 15, acquisition: 25, om: 35, spares: 20, infrastructure: 5 } },
];

function fromPct(pct: Record<string, number>, grant: number): Record<string, number> {
  return Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, Math.round((grant * v) / 100)]));
}
```
(b) Autopilot: the component already takes `initialAllocation`; ensure `alloc` initializes from it (it does). Add a `[advanced, setAdvanced] = useState(false)` and an `applyPreset(p)` that calls `setAlloc(fromPct(p.pct, grantCr))`.
(c) Render a row of 4 preset buttons (min-h-[44px], tappable) above the (now-collapsible) steppers. Show each preset's resulting R&D/Acq amounts compactly, OR at minimum apply on tap and reflect amounts in the existing summary. Highlight the preset whose split matches the current `alloc` (else show "Custom").
(d) Wrap the existing 5 steppers + commitment/auto-match/reset UI in `{advanced && ( … )}`, with an "⚙ Advanced / Customize" toggle button (`min-h-[44px]`) to reveal them.
(e) Add a readiness health line: accept a new optional prop `fleetReadinessPct?: number` and render a tier label + colored bar (≥75 emerald "Good", 55–74 amber "Strained", <55 rose "Critical"). If the prop is absent, omit the line. (ProcurementHub will pass it in Task 6 wiring or it can be left out for now — keep it optional so this task doesn't depend on plumbing.)
(f) Keep the hold-to-commit button calling `onCommit(alloc)` unchanged.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- BudgetAllocator && npx tsc --noEmit`
Expected: the new presets test + any existing BudgetAllocator tests PASS; tsc clean. If an existing test asserted the steppers are always visible, update it to expand Advanced first (the steppers still exist — just behind the toggle).

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/components/procurement/BudgetAllocator.tsx frontend/src/components/procurement/__tests__/BudgetAllocator.presets.test.tsx
git commit -m "feat(v2): budget presets + autopilot + Advanced toggle + readiness line"
```

---

### Task 6: Situation Report — enhance TurnReport + pass fleet readiness to BudgetAllocator

**Files:**
- Modify: `frontend/src/pages/TurnReport.tsx`, `frontend/src/pages/ProcurementHub.tsx`
- Test: `frontend/src/pages/__tests__/TurnReport.situation.test.tsx`

**Context:** Read `TurnReport.tsx` (loads via `loadTurnReport`, renders deliveries/R&D/intel sections + a CTA). It can read store state. Use `loadObjectiveProgress` + `loadNotifications` + the `objectiveProgress` / `notifications` store state.

- [ ] **Step 1: Write the failing test** (mock the store like other page tests; provide objectiveProgress with one at_risk + notifications with one warning)

```tsx
// frontend/src/pages/__tests__/TurnReport.situation.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TurnReport } from "../TurnReport";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({ useCampaignStore: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useParams: () => ({ id: "1", year: "2027", quarter: "2" }), useNavigate: () => vi.fn() };
});

function mockStore(over: Record<string, unknown> = {}) {
  const store = {
    turnReport: { campaign_id: 1, year: 2027, quarter: 2, events: [], deliveries: [], rd_milestones: [], adversary_shifts: [], intel_cards: [], vignette_fired: null, treasury_after_cr: 44000, allocation: null },
    loadTurnReport: vi.fn().mockResolvedValue(undefined),
    objectiveProgress: [{ id: "budget_discipline", name: "Fiscal discipline", status: "at_risk", progress: 0, detail: "Treasury depleted" }],
    loadObjectiveProgress: vi.fn().mockResolvedValue(undefined),
    notifications: [{ id: "n1", kind: "low_stock", severity: "warning", title: "Meteor low at Ambala", body: "reorder", action_url: "/campaign/1/procurement" }],
    loadNotifications: vi.fn().mockResolvedValue(undefined),
    readNotificationIds: new Set<string>(),
    pendingVignettes: [],
    ...over,
  };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((sel: (s: typeof store) => unknown) => sel(store));
  return store;
}

describe("TurnReport situation report", () => {
  it("shows objective standing + a needs-attention warning row", async () => {
    mockStore();
    render(<MemoryRouter><TurnReport /></MemoryRouter>);
    expect(await screen.findByText(/objective standing|objectives/i)).toBeInTheDocument();
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument();
    expect(screen.getByText(/Meteor low at Ambala/i)).toBeInTheDocument();
  });
});
```

> Match the real store-mock shape used by existing page tests (read another page test, e.g. `Landing.test.tsx`, for the selector-mock pattern). Adjust selectors as needed but keep the intent.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- TurnReport.situation`
Expected: FAIL — no situation sections.

- [ ] **Step 3: Implement**

In `TurnReport.tsx`:
(a) Pull `objectiveProgress`, `loadObjectiveProgress`, `notifications`, `loadNotifications` from the store; on mount (alongside the existing `loadTurnReport`) call `loadObjectiveProgress(cid)` + `loadNotifications(cid)`.
(b) At the TOP of the main content (above deliveries), add a **"Situation Report"** block with two parts:
- **Objective standing:** a one-line summary (`{met} met · {inProgress} in progress · {atRisk} at risk`) and, if any are `at_risk`, render those entries via `ObjectiveTracker` (filter to at_risk; import it). Link "View all →" to `/campaign/${cid}/objectives`.
- **Needs your attention:** filter `notifications` to `severity === "warning"`; if none, hide the section. Otherwise render each as a tappable row (a `<Link to={n.action_url}>`), showing `n.title`. Header text: "Needs your attention".

In `ProcurementHub.tsx`: compute a fleet-average readiness from the bases/squadrons already in the store (average of `squadron.readiness_pct` across all bases; guard divide-by-zero) and pass it to `<BudgetAllocator fleetReadinessPct={...} />`.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- TurnReport && npx tsc --noEmit`
Expected: new + existing TurnReport tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/pages/TurnReport.tsx frontend/src/pages/ProcurementHub.tsx frontend/src/pages/__tests__/TurnReport.situation.test.tsx
git commit -m "feat(v2): Situation Report (objective standing + needs-attention) + readiness line wiring"
```

---

### Task 7: Full suites, Android build, docs, debug APK

**Files:** `CLAUDE.md`, `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Backend + frontend suites + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit && npm test
```
Expected: backend grows from ~666; frontend grows from 235; all green; tsc clean. Fix regressions before proceeding.

- [ ] **Step 2: Android build verification**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build && npm run cap:sync
```
Expected: Vite build + Capacitor sync succeed.

- [ ] **Step 3: Update docs**

Add a "Current status" bullet to `CLAUDE.md` for v2 Phase 2 (budget presets/autopilot + Advanced toggle + readiness line; live objective tracker — `objective_progress` engine + `GET /objectives` endpoint + Objectives screen; Situation Report in TurnReport), note new test counts, link spec + plan, and note Phases 3–4 remain. Add a dated ROADMAP note + bump "Last updated".

- [ ] **Step 4: Commit + push**

```bash
cd /Users/rsumit123/work/defense-game
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(v2): mark Phase 2 core-loop streamlining done"
git push origin main
```

- [ ] **Step 5: Build the debug APK (controller does this after the phase)**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build && npm run cap:sync
cd android && JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk  (send to the user)
```

---

## Self-Review

**Spec coverage:** Budget presets/autopilot/Advanced/readiness (T5 + T6 wiring). Objective tracker — engine helper (T1), endpoint (T2), types/api/store (T3), component+screen+menu (T4). Situation Report (T6). Android verification + debug APK (T7). ✓

**Placeholder scan:** Full code given for new backend (engine + schema + endpoint) and the new frontend component/page; existing-file edits (T2 main.py, T3 api/store/types, T4 routes/menu, T5 BudgetAllocator, T6 TurnReport/ProcurementHub) specify exact snippets + anchors and instruct reading the file first where structure varies (BudgetAllocator, TurnReport). Test files note "match the existing fixture/mock pattern" with the intent fixed — not weakenable. ✓

**Type consistency:** `ObjectiveInputs`/`ObjectiveProgress`/`objective_progress`/`INDIGENOUS_PLATFORMS`/`DETERRENCE_PROGRAMS` (T1) consumed by the endpoint (T2). `ObjectiveProgressEntry`/`ObjectiveProgressListResponse` schema (T2) mirrored in TS (T3), consumed by `ObjectiveTracker` (T4) + TurnReport (T6) + store `objectiveProgress`/`loadObjectiveProgress` (T3). `fleetReadinessPct` prop added in T5, passed in T6. Statuses `met|in_progress|at_risk` consistent across backend + TS + component. ✓
