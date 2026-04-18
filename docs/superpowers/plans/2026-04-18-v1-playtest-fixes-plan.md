# V1 Playtest Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues found during the first real playtest: combat reasoning display, mobile/tablet responsive fixes, objective selection at campaign start, multi-campaign support, how-to-play guide, and OpenRouter API key operational fix.

**Architecture:** Backend-first for new API endpoints (objectives catalog, campaign list), then frontend components. Mobile responsiveness is a sweep across all existing pages. Combat reasoning is pure frontend logic parsing existing `event_trace` data.

**Tech Stack:** FastAPI + SQLAlchemy 2.x, React 19 + Vite 8 + Tailwind v4 + Zustand, axios.

**Test baselines at start:** Backend 409, Frontend 119.

---

### Task 1: OpenRouter API Key Operational Fix

**Files:**
- Modify: `deploy.sh` (verify OPENROUTER_API_KEY passthrough)
- No code changes — operational verification only

The deployed GCP VM has an empty `OPENROUTER_API_KEY` env var, causing all LLM narrative features to show "(narrative service unavailable — fallback summary)". This is an operational fix, not a code bug.

- [ ] **Step 1: Verify deploy.sh passes the env var correctly**

Read `deploy.sh` and confirm the Docker run command includes `-e OPENROUTER_API_KEY`. The script already does this — the issue is the VM environment not having the key set.

- [ ] **Step 2: Document the fix**

Add a comment block at the top of `deploy.sh` near existing env var docs:

```bash
# Required env vars on the deployment VM:
#   OPENROUTER_API_KEY  — OpenRouter API key for LLM narratives (AARs, intel briefs, recaps)
#                         If empty, all narrative features fall back to placeholder text.
#                         Set via: export OPENROUTER_API_KEY="sk-or-..."
```

- [ ] **Step 3: Commit**

```bash
git add deploy.sh
git commit -m "docs: document OPENROUTER_API_KEY requirement in deploy.sh

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Objectives API Endpoint

**Files:**
- Modify: `backend/app/schemas/content.py` (add ObjectiveOut + ObjectiveListResponse)
- Modify: `backend/app/api/content.py` (add /objectives endpoint)
- Test: `backend/tests/test_objectives_api.py` (new)

The objectives catalog (`backend/content/objectives.yaml`) has 12 objectives with id, title, description, weight, target_year. The registry function `objectives()` exists in `backend/app/content/registry.py` but there's no API endpoint to serve them to the frontend.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_objectives_api.py`:

```python
"""Test GET /api/content/objectives endpoint."""
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_objectives_returns_all():
    resp = client.get("/api/content/objectives")
    assert resp.status_code == 200
    data = resp.json()
    assert "objectives" in data
    assert len(data["objectives"]) >= 12


def test_objective_has_required_fields():
    resp = client.get("/api/content/objectives")
    obj = resp.json()["objectives"][0]
    assert "id" in obj
    assert "title" in obj
    assert "description" in obj
    assert "weight" in obj
    assert "target_year" in obj
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_objectives_api.py -v`
Expected: FAIL — 404 on `/api/content/objectives`.

- [ ] **Step 3: Add ObjectiveOut schema**

In `backend/app/schemas/content.py`, add:

```python
class ObjectiveOut(BaseModel):
    id: str
    title: str
    description: str
    weight: int
    target_year: int


class ObjectiveListResponse(BaseModel):
    objectives: list[ObjectiveOut]
```

- [ ] **Step 4: Add the endpoint**

In `backend/app/api/content.py`, add:

```python
from app.schemas.content import ObjectiveListResponse, ObjectiveOut

@router.get("/objectives", response_model=ObjectiveListResponse)
def list_objectives_endpoint():
    from app.content.registry import objectives
    specs = objectives()
    return ObjectiveListResponse(
        objectives=[
            ObjectiveOut(
                id=s.id, title=s.title, description=s.description,
                weight=s.weight, target_year=s.target_year,
            )
            for s in specs.values()
        ]
    )
```

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/test_objectives_api.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/content.py backend/app/api/content.py backend/tests/test_objectives_api.py
git commit -m "feat: add GET /api/content/objectives endpoint

Serves the 12-objective catalog from objectives.yaml for the
objective selector UI on the landing page.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Campaign List API Endpoint

**Files:**
- Modify: `backend/app/api/campaigns.py` (add list endpoint)
- Modify: `backend/app/schemas/campaign.py` (add CampaignListResponse)
- Test: `backend/tests/test_campaign_list_api.py` (new)

Currently there's no `GET /api/campaigns` endpoint. The DB supports multiple campaigns but the frontend can't list or resume them.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_campaign_list_api.py`:

```python
"""Test GET /api/campaigns list endpoint."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from main import app
from app.core.database import Base, get_db

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(bind=engine)


def override_get_db():
    with Session(engine) as session:
        yield session


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def test_list_campaigns_empty():
    resp = client.get("/api/campaigns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["campaigns"] == []


def test_list_campaigns_returns_created():
    client.post("/api/campaigns", json={"name": "Test Alpha"})
    client.post("/api/campaigns", json={"name": "Test Bravo"})
    resp = client.get("/api/campaigns")
    assert resp.status_code == 200
    campaigns = resp.json()["campaigns"]
    assert len(campaigns) == 2
    names = {c["name"] for c in campaigns}
    assert "Test Alpha" in names
    assert "Test Bravo" in names


def test_list_campaigns_ordered_by_updated_at():
    client.post("/api/campaigns", json={"name": "Older"})
    client.post("/api/campaigns", json={"name": "Newer"})
    resp = client.get("/api/campaigns")
    campaigns = resp.json()["campaigns"]
    assert campaigns[0]["name"] == "Newer"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_campaign_list_api.py -v`
Expected: FAIL — 405 or 200 with wrong shape on `GET /api/campaigns`.

- [ ] **Step 3: Add CampaignListResponse schema**

In `backend/app/schemas/campaign.py`, add:

```python
class CampaignListItem(BaseModel):
    id: int
    name: str
    current_year: int
    current_quarter: int
    difficulty: Difficulty
    budget_cr: int
    reputation: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CampaignListResponse(BaseModel):
    campaigns: list[CampaignListItem]
```

- [ ] **Step 4: Add the list endpoint**

In `backend/app/api/campaigns.py`, add above the existing `create_campaign_endpoint`:

```python
from app.schemas.campaign import CampaignListResponse, CampaignListItem

@router.get("", response_model=CampaignListResponse)
def list_campaigns_endpoint(db: Session = Depends(get_db)):
    from app.models.campaign import Campaign
    campaigns = db.query(Campaign).order_by(Campaign.updated_at.desc()).all()
    return CampaignListResponse(
        campaigns=[CampaignListItem.model_validate(c) for c in campaigns]
    )
```

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/test_campaign_list_api.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/campaigns.py backend/app/schemas/campaign.py backend/tests/test_campaign_list_api.py
git commit -m "feat: add GET /api/campaigns list endpoint

Returns all campaigns ordered by most recently updated. Enables
campaign resume and multi-session support on the landing page.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Frontend Types + API Methods for Objectives & Campaign List

**Files:**
- Modify: `frontend/src/lib/types.ts` (add ObjectiveSpec, ObjectiveListResponse, CampaignListItem, CampaignListResponse)
- Modify: `frontend/src/lib/api.ts` (add getObjectives, listCampaigns)
- Test: `frontend/src/lib/__tests__/api.test.ts` (extend)

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts`, add after the existing `CampaignSummary` interface:

```typescript
export interface ObjectiveSpec {
  id: string;
  title: string;
  description: string;
  weight: number;
  target_year: number;
}

export interface ObjectiveListResponse {
  objectives: ObjectiveSpec[];
}

export interface CampaignListItem {
  id: number;
  name: string;
  current_year: number;
  current_quarter: number;
  difficulty: string;
  budget_cr: number;
  reputation: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignListResponse {
  campaigns: CampaignListItem[];
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`, add to the `api` object:

```typescript
  async getObjectives(): Promise<ObjectiveListResponse> {
    const { data } = await http.get<ObjectiveListResponse>("/api/content/objectives");
    return data;
  },

  async listCampaigns(): Promise<CampaignListResponse> {
    const { data } = await http.get<CampaignListResponse>("/api/campaigns");
    return data;
  },
```

Update the import to include the new types.

- [ ] **Step 3: Write tests**

Add to `frontend/src/lib/__tests__/api.test.ts`:

```typescript
import type { ObjectiveListResponse, CampaignListResponse } from "../types";

  it("getObjectives returns the list", async () => {
    const body: ObjectiveListResponse = {
      objectives: [{
        id: "amca_operational_by_2035", title: "Operational AMCA Mk1 squadron by 2035",
        description: "Field a combat-ready squadron.", weight: 3, target_year: 2035,
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getObjectives();
    expect(out.objectives).toHaveLength(1);
    expect(http.get).toHaveBeenCalledWith("/api/content/objectives");
  });

  it("listCampaigns returns the list", async () => {
    const body: CampaignListResponse = {
      campaigns: [{
        id: 1, name: "Iron Spear", current_year: 2028, current_quarter: 3,
        difficulty: "realistic", budget_cr: 50000, reputation: 70,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.listCampaigns();
    expect(out.campaigns).toHaveLength(1);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns");
  });
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib/__tests__/api.test.ts`
Expected: PASS (4 tests — 2 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/__tests__/api.test.ts
git commit -m "feat: add frontend types + API methods for objectives and campaign list

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Landing Page — Objective Selector + Campaign List + Resume

**Files:**
- Modify: `frontend/src/pages/Landing.tsx` (full rewrite)
- Modify: `frontend/src/store/campaignStore.ts` (add listCampaigns action)
- Test: `frontend/src/pages/__tests__/Landing.test.tsx` (new)

Redesign the Landing page to:
1. Show existing campaigns with Resume buttons (if any exist)
2. "New Campaign" section with name input + objective selector (pick 3–5 from catalog) + difficulty picker
3. Design spec says player should "pick 3-5 objectives from ~12"

- [ ] **Step 1: Add store actions**

In `frontend/src/store/campaignStore.ts`, add to the store state:

```typescript
campaignList: CampaignListItem[];
objectivesCatalog: ObjectiveSpec[];
```

Add actions:

```typescript
loadCampaignList: async () => {
  const resp = await api.listCampaigns();
  set({ campaignList: resp.campaigns });
},
loadObjectivesCatalog: async () => {
  const resp = await api.getObjectives();
  set({ objectivesCatalog: resp.objectives });
},
```

Initialize both to `[]` in the default state.

- [ ] **Step 2: Rewrite Landing.tsx**

Replace `frontend/src/pages/Landing.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import type { Difficulty } from "../lib/types";

const MIN_OBJECTIVES = 3;
const MAX_OBJECTIVES = 5;

export function Landing() {
  const [name, setName] = useState("Singh-era modernization");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [selectedObjectives, setSelectedObjectives] = useState<Set<string>>(new Set());
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const campaignList = useCampaignStore((s) => s.campaignList);
  const objectivesCatalog = useCampaignStore((s) => s.objectivesCatalog);
  const loadCampaignList = useCampaignStore((s) => s.loadCampaignList);
  const loadObjectivesCatalog = useCampaignStore((s) => s.loadObjectivesCatalog);
  const navigate = useNavigate();

  useEffect(() => {
    loadCampaignList();
    loadObjectivesCatalog();
  }, [loadCampaignList, loadObjectivesCatalog]);

  useEffect(() => {
    if (campaignList.length === 0) setShowNewCampaign(true);
  }, [campaignList]);

  function toggleObjective(id: string) {
    setSelectedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_OBJECTIVES) next.add(id);
      return next;
    });
  }

  async function handleStart() {
    await createCampaign({
      name,
      difficulty,
      objectives: Array.from(selectedObjectives),
    });
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
  }

  const canStart = name.trim().length > 0
    && selectedObjectives.size >= MIN_OBJECTIVES
    && selectedObjectives.size <= MAX_OBJECTIVES;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sovereign Shield</h1>
          <p className="text-sm opacity-70 mt-1">
            Head of Defense Integration — New Delhi, 2026
          </p>
        </div>

        {campaignList.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Resume Campaign</h2>
            {campaignList.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/campaign/${c.id}`)}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-3 text-left"
              >
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs opacity-70 mt-1">
                  {c.current_year} Q{c.current_quarter} • ₹{c.budget_cr.toLocaleString("en-US")} cr • {c.difficulty}
                </div>
              </button>
            ))}
          </section>
        )}

        {campaignList.length > 0 && !showNewCampaign && (
          <button
            onClick={() => setShowNewCampaign(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 border-dashed rounded-lg px-4 py-3 text-sm opacity-80"
          >
            + New Campaign
          </button>
        )}

        {showNewCampaign && (
          <section className="space-y-4 border-t border-slate-700 pt-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">New Campaign</h2>

            <div className="space-y-2">
              <label className="block text-xs opacity-80">Campaign name</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs opacity-80">Difficulty</label>
              <div className="grid grid-cols-2 gap-2">
                {(["relaxed", "realistic", "hard_peer", "worst_case"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`text-xs px-3 py-2 rounded-lg border ${
                      d === difficulty
                        ? "bg-amber-600 border-amber-500 text-slate-900 font-bold"
                        : "bg-slate-800 border-slate-700 text-slate-300"
                    }`}
                  >
                    {d.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs opacity-80">
                Select {MIN_OBJECTIVES}–{MAX_OBJECTIVES} objectives ({selectedObjectives.size} selected)
              </label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {objectivesCatalog.map((obj) => {
                  const selected = selectedObjectives.has(obj.id);
                  const disabled = !selected && selectedObjectives.size >= MAX_OBJECTIVES;
                  return (
                    <button
                      key={obj.id}
                      onClick={() => toggleObjective(obj.id)}
                      disabled={disabled}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs ${
                        selected
                          ? "bg-amber-600/20 border-amber-500 text-amber-200"
                          : disabled
                            ? "bg-slate-900 border-slate-800 opacity-40 cursor-not-allowed"
                            : "bg-slate-800 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className="font-semibold">{obj.title}</div>
                      <div className="opacity-70 mt-0.5">{obj.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={loading || !canStart}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg px-4 py-3"
            >
              {loading ? "Starting…" : "Assume Command"}
            </button>
            {!canStart && name.trim().length > 0 && (
              <p className="text-xs text-amber-400 opacity-80 text-center">
                Select {MIN_OBJECTIVES}–{MAX_OBJECTIVES} objectives to begin
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add Difficulty type to types.ts**

In `frontend/src/lib/types.ts`, add (if not already present):

```typescript
export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";
```

- [ ] **Step 4: Write tests**

Create `frontend/src/pages/__tests__/Landing.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Landing } from "../Landing";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const defaultStore = {
  loading: false,
  error: null,
  campaignList: [],
  objectivesCatalog: [
    { id: "obj1", title: "Objective One", description: "Desc 1", weight: 2, target_year: 2036 },
    { id: "obj2", title: "Objective Two", description: "Desc 2", weight: 3, target_year: 2035 },
    { id: "obj3", title: "Objective Three", description: "Desc 3", weight: 1, target_year: 2036 },
    { id: "obj4", title: "Objective Four", description: "Desc 4", weight: 2, target_year: 2036 },
  ],
  loadCampaignList: vi.fn(),
  loadObjectivesCatalog: vi.fn(),
  createCampaign: vi.fn(),
  campaign: null,
};

function setup(overrides = {}) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((sel: (s: typeof store) => unknown) => sel(store));
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

describe("Landing", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders title", () => {
    setup();
    expect(screen.getByText(/Sovereign Shield/)).toBeTruthy();
  });

  it("shows new campaign form when no existing campaigns", () => {
    setup();
    expect(screen.getByText(/New Campaign/)).toBeTruthy();
  });

  it("shows resume buttons for existing campaigns", () => {
    setup({
      campaignList: [
        { id: 1, name: "Iron Spear", current_year: 2028, current_quarter: 2, difficulty: "realistic", budget_cr: 50000, reputation: 70, created_at: "", updated_at: "" },
      ],
    });
    expect(screen.getByText(/Iron Spear/)).toBeTruthy();
  });

  it("disables start button until 3 objectives selected", () => {
    setup();
    const startBtn = screen.getByText("Assume Command");
    expect(startBtn.getAttribute("disabled")).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/pages/__tests__/Landing.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/store/campaignStore.ts frontend/src/lib/types.ts frontend/src/pages/__tests__/Landing.test.tsx
git commit -m "feat: landing page with objective selector + campaign list/resume

Players can now pick 3-5 objectives from the 12-objective catalog,
choose difficulty, and resume existing campaigns. Replaces the
hardcoded 3-objective + realistic-only landing page.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Combat Reasoning Component

**Files:**
- Create: `frontend/src/components/vignette/CombatReasoning.tsx`
- Modify: `frontend/src/pages/VignetteAAR.tsx` (mount CombatReasoning between AARReader and TacticalReplay)
- Test: `frontend/src/components/vignette/__tests__/CombatReasoning.test.tsx` (new)

Pure frontend component that parses existing `event_trace` + `planning_state` data to explain WHY the player won or lost. No new backend fields needed.

Key factors to extract and display:
- **Detection advantage** — who detected whom first (from `detection` event: `advantage` field)
- **Generation gap** — compare committed IAF platform generations vs adversary
- **Stealth factor** — if adversary has VLO/LO platforms, explain reduced PK
- **Numbers mismatch** — committed airframes vs adversary airframes
- **ROE impact** — if `visual_id_required` was chosen, explain BVR skip penalty
- **Support assets** — AWACS gives +0.05 PK bonus
- **Kill exchange ratio** — derived from outcome

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/vignette/__tests__/CombatReasoning.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CombatReasoning } from "../CombatReasoning";
import type { EventTraceEntry, PlanningState, VignetteOutcome, VignetteCommitPayload } from "../../../lib/types";

const basePlanningState: PlanningState = {
  scenario_id: "test",
  scenario_name: "Test Scenario",
  ao: { region: "LAC", name: "Ladakh", lat: 34, lon: 78 },
  response_clock_minutes: 30,
  adversary_force: [
    { platform_id: "j20a", count: 4, faction: "PLAAF", role: "cap" },
  ],
  eligible_squadrons: [],
  allowed_ind_roles: ["multirole"],
  roe_options: ["weapons_free", "weapons_tight", "visual_id_required"],
  objective: { kind: "air_superiority", success_threshold: { adv_kills_min: 3, ind_losses_max: 4 } },
};

const baseOutcome: VignetteOutcome = {
  ind_kia: 7,
  adv_kia: 1,
  ind_airframes_lost: 7,
  adv_airframes_lost: 1,
  objective_met: false,
  roe: "weapons_free",
  support: { awacs: false, tanker: false, sead_package: false },
};

const baseTrace: EventTraceEntry[] = [
  { t_min: 0, kind: "detection", advantage: "adv", ind_radar_km: 200, adv_radar_km: 300 },
  { t_min: 3, kind: "bvr_launch", side: "adv", weapon: "pl15", attacker_platform: "j20a", target_platform: "su30_mki", pk: 0.45, distance_km: 120 },
  { t_min: 3, kind: "kill", side: "adv", attacker_platform: "j20a", victim_platform: "su30_mki", weapon: "pl15" },
  { t_min: 12, kind: "egress", ind_survivors: 1, adv_survivors: 3 },
  { t_min: 12, kind: "outcome", outcome: baseOutcome },
];

const baseCommittedForce: VignetteCommitPayload = {
  squadrons: [{ squadron_id: 1, airframes: 4 }],
  support: { awacs: false, tanker: false, sead_package: false },
  roe: "weapons_free",
};

describe("CombatReasoning", () => {
  it("renders detection disadvantage warning", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/detection/i)).toBeTruthy();
  });

  it("renders stealth factor for VLO adversary", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/stealth/i)).toBeTruthy();
  });

  it("renders AWACS note when not deployed", () => {
    render(
      <CombatReasoning
        eventTrace={baseTrace}
        planningState={basePlanningState}
        outcome={baseOutcome}
        committedForce={baseCommittedForce}
      />
    );
    expect(screen.getByText(/AWACS/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/vignette/__tests__/CombatReasoning.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CombatReasoning.tsx**

Create `frontend/src/components/vignette/CombatReasoning.tsx`:

```tsx
import { useMemo } from "react";
import type { EventTraceEntry, PlanningState, VignetteOutcome, VignetteCommitPayload } from "../../lib/types";

export interface CombatReasoningProps {
  eventTrace: EventTraceEntry[];
  planningState: PlanningState;
  outcome: VignetteOutcome;
  committedForce: VignetteCommitPayload;
}

interface Factor {
  icon: string;
  label: string;
  detail: string;
  impact: "positive" | "negative" | "neutral";
}

const GEN_ORDER: Record<string, number> = {
  "3": 3, "4": 4, "4.5": 4.5, "5": 5,
};

const RCS_STEALTH: Record<string, boolean> = {
  VLO: true, LO: true, reduced: false, conventional: false, large: false,
};

function analyzeFactors(
  trace: EventTraceEntry[],
  ps: PlanningState,
  outcome: VignetteOutcome,
  committed: VignetteCommitPayload,
): Factor[] {
  const factors: Factor[] = [];

  const detection = trace.find((e) => e.kind === "detection");
  if (detection) {
    const adv = detection.advantage as string;
    if (adv === "adv") {
      factors.push({
        icon: "🔴", label: "Detection disadvantage",
        detail: `Adversary detected you first (their radar: ${detection.adv_radar_km}km vs yours: ${detection.ind_radar_km}km). They got the first BVR shot.`,
        impact: "negative",
      });
    } else if (adv === "ind") {
      factors.push({
        icon: "🟢", label: "Detection advantage",
        detail: `You detected the adversary first (your radar: ${detection.ind_radar_km}km vs theirs: ${detection.adv_radar_km}km). You fired first.`,
        impact: "positive",
      });
    } else {
      factors.push({
        icon: "🟡", label: "Mutual detection",
        detail: "Both sides detected each other simultaneously — no first-mover advantage.",
        impact: "neutral",
      });
    }
  }

  const hasStealthAdv = ps.adversary_force.some((f) => {
    const pid = f.platform_id.toLowerCase();
    return pid.includes("j20") || pid.includes("j35") || pid.includes("f35") || pid.includes("f22");
  });
  if (hasStealthAdv) {
    factors.push({
      icon: "🔴", label: "Adversary stealth advantage",
      detail: "Enemy deployed stealth (VLO) platforms. Your missiles have significantly reduced probability of kill against low-observable targets.",
      impact: "negative",
    });
  }

  const indAirframes = committed.squadrons.reduce((a, b) => a + b.airframes, 0);
  const advAirframes = ps.adversary_force.reduce((a, b) => a + b.count, 0);
  if (indAirframes < advAirframes) {
    factors.push({
      icon: "🔴", label: "Outnumbered",
      detail: `You committed ${indAirframes} airframes against ${advAirframes} adversary aircraft. Numerical disadvantage reduces survivability.`,
      impact: "negative",
    });
  } else if (indAirframes > advAirframes * 1.5) {
    factors.push({
      icon: "🟢", label: "Numerical superiority",
      detail: `You committed ${indAirframes} airframes against ${advAirframes} — strong numerical advantage.`,
      impact: "positive",
    });
  }

  if (!committed.support.awacs) {
    factors.push({
      icon: "🟡", label: "No AWACS deployed",
      detail: "AWACS provides +5% hit probability to all your missiles and extends detection range. Consider deploying it next time.",
      impact: "negative",
    });
  } else {
    factors.push({
      icon: "🟢", label: "AWACS support active",
      detail: "Your AWACS provided +5% hit probability to all missiles and improved detection.",
      impact: "positive",
    });
  }

  if (outcome.roe === "visual_id_required") {
    factors.push({
      icon: "🔴", label: "Visual ID ROE restricted BVR",
      detail: "Visual ID Required rules of engagement forced your pilots to skip BVR rounds entirely. The adversary fired first at long range while you closed to visual range.",
      impact: "negative",
    });
  } else if (outcome.roe === "weapons_tight") {
    factors.push({
      icon: "🟡", label: "Weapons Tight ROE penalty",
      detail: "Weapons Tight rules of engagement reduced your missile hit probability by 5%. More restrictive than Weapons Free.",
      impact: "negative",
    });
  }

  const vidSkip = trace.find((e) => e.kind === "vid_skip_bvr");
  if (vidSkip) {
    factors.push({
      icon: "🔴", label: "BVR rounds skipped",
      detail: String(vidSkip.reason || "ROE required visual identification before engagement — adversary fired BVR while you closed distance."),
      impact: "negative",
    });
  }

  const launches = trace.filter((e) => e.kind === "bvr_launch" || e.kind === "wvr_launch");
  const indLaunches = launches.filter((e) => e.side === "ind");
  const advLaunches = launches.filter((e) => e.side === "adv");
  const avgIndPk = indLaunches.length > 0
    ? indLaunches.reduce((a, e) => a + (e.pk as number), 0) / indLaunches.length
    : 0;
  const avgAdvPk = advLaunches.length > 0
    ? advLaunches.reduce((a, e) => a + (e.pk as number), 0) / advLaunches.length
    : 0;

  if (indLaunches.length > 0 && advLaunches.length > 0) {
    const diff = avgIndPk - avgAdvPk;
    if (diff < -0.05) {
      factors.push({
        icon: "🔴", label: "Lower missile effectiveness",
        detail: `Your average missile PK was ${(avgIndPk * 100).toFixed(0)}% vs adversary's ${(avgAdvPk * 100).toFixed(0)}%. Platform generation and target stealth drive this gap.`,
        impact: "negative",
      });
    } else if (diff > 0.05) {
      factors.push({
        icon: "🟢", label: "Higher missile effectiveness",
        detail: `Your average missile PK was ${(avgIndPk * 100).toFixed(0)}% vs adversary's ${(avgAdvPk * 100).toFixed(0)}%.`,
        impact: "positive",
      });
    }
  }

  const exchangeRatio = outcome.adv_kia > 0 ? outcome.ind_kia / outcome.adv_kia : outcome.ind_kia > 0 ? Infinity : 0;
  if (outcome.objective_met) {
    factors.push({
      icon: "🟢", label: "Objective achieved",
      detail: `Exchange ratio: ${outcome.ind_kia} IAF losses vs ${outcome.adv_kia} adversary kills. Mission objective met.`,
      impact: "positive",
    });
  } else {
    factors.push({
      icon: "🔴", label: "Objective failed",
      detail: `Exchange ratio: ${outcome.ind_kia} IAF losses vs ${outcome.adv_kia} adversary kills. Unfavorable result — review force composition and support assets.`,
      impact: "negative",
    });
  }

  return factors;
}

export function CombatReasoning({ eventTrace, planningState, outcome, committedForce }: CombatReasoningProps) {
  const factors = useMemo(
    () => analyzeFactors(eventTrace, planningState, outcome, committedForce),
    [eventTrace, planningState, outcome, committedForce],
  );

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mt-4">
      <h3 className="text-sm font-bold mb-3 text-slate-300">Combat Analysis</h3>
      <div className="space-y-2">
        {factors.map((f, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 text-xs border ${
              f.impact === "positive"
                ? "bg-emerald-950/30 border-emerald-800"
                : f.impact === "negative"
                  ? "bg-red-950/30 border-red-800"
                  : "bg-slate-800 border-slate-700"
            }`}
          >
            <div className="font-semibold mb-1">
              {f.icon} {f.label}
            </div>
            <div className="opacity-80 leading-relaxed">{f.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount in VignetteAAR page**

In `frontend/src/pages/VignetteAAR.tsx`, import and render `CombatReasoning` between `AARReader` and `TacticalReplay`:

```tsx
import { CombatReasoning } from "../components/vignette/CombatReasoning";
```

After `<AARReader>` and before the `TacticalReplay` block, add:

```tsx
{vignette.outcome && "objective_met" in vignette.outcome && vignette.committed_force && (
  <CombatReasoning
    eventTrace={vignette.event_trace}
    planningState={ps}
    outcome={vignette.outcome as VignetteOutcome}
    committedForce={vignette.committed_force}
  />
)}
```

Add `VignetteOutcome` to the type import.

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/components/vignette/__tests__/CombatReasoning.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/vignette/CombatReasoning.tsx frontend/src/pages/VignetteAAR.tsx frontend/src/components/vignette/__tests__/CombatReasoning.test.tsx
git commit -m "feat: combat reasoning display on AAR page

Parses event_trace to explain WHY the player won or lost: detection
advantage, stealth factor, numerical balance, AWACS support, ROE
impact, missile effectiveness, and exchange ratio. Pure frontend logic.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: How-to-Play Guide

**Files:**
- Create: `frontend/src/components/guide/HowToPlayGuide.tsx`
- Modify: `frontend/src/pages/Landing.tsx` (add guide button)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (add guide button in header)
- Test: `frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx` (new)

A modal/overlay that explains the game in concise steps. Triggered from Landing page and from the map header.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HowToPlayGuide } from "../HowToPlayGuide";

describe("HowToPlayGuide", () => {
  it("renders when open", () => {
    render(<HowToPlayGuide open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/How to Play/i)).toBeTruthy();
  });

  it("does not render when closed", () => {
    render(<HowToPlayGuide open={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/How to Play/i)).toBeNull();
  });

  it("calls onClose when dismiss button clicked", () => {
    const onClose = vi.fn();
    render(<HowToPlayGuide open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close|got it/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/guide/__tests__/HowToPlayGuide.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HowToPlayGuide.tsx**

Create `frontend/src/components/guide/HowToPlayGuide.tsx`:

```tsx
export interface HowToPlayGuideProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Your Role",
    text: "You are India's Head of Defense Integration (2026–2036). Over 40 quarterly turns, you'll modernize the IAF through procurement, R&D, and force management to meet strategic objectives.",
  },
  {
    title: "Each Turn",
    text: "1. Allocate your quarterly budget across 5 categories (maintenance, R&D, acquisitions, infrastructure, reserves).\n2. Manage R&D programs and acquisition orders in the Procurement hub.\n3. Review intelligence reports in the Intel inbox.\n4. Click 'End Turn' to advance the quarter.",
  },
  {
    title: "Vignettes (Combat)",
    text: "Periodically, a security event will fire. You'll enter the Ops Room to commit squadrons, choose support assets (AWACS, tankers), and set rules of engagement. Combat resolves automatically based on platform capabilities, numbers, and stealth.",
  },
  {
    title: "Winning Fights",
    text: "Detection advantage matters — better radar + AWACS lets you shoot first. Stealth aircraft (VLO) are harder to hit. Numbers help but generation gap can overcome them. Weapons Free ROE gives the best missile performance.",
  },
  {
    title: "Objectives",
    text: "Your 3–5 chosen objectives (e.g., field AMCA squadrons, maintain 42 squadrons, achieve missile sovereignty) are evaluated at campaign end. The Defense White Paper grades your performance.",
  },
  {
    title: "Key Tips",
    text: "• Invest in R&D early — programs take years to complete.\n• Don't neglect maintenance budget — low readiness reduces combat effectiveness.\n• AWACS support gives +5% missile hit probability.\n• Stealth platforms (J-20, J-35) are very hard to kill — you need numbers or your own 5th-gen fighters.",
  },
];

export function HowToPlayGuide({ open, onClose }: HowToPlayGuideProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-100">How to Play</h2>
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h3 className="text-sm font-semibold text-amber-400 mb-1">{s.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{s.text}</p>
          </div>
        ))}
        <button
          onClick={onClose}
          className="w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into Landing.tsx and CampaignMapView.tsx**

In `Landing.tsx`, add state `const [showGuide, setShowGuide] = useState(false);` and render:

```tsx
<button
  onClick={() => setShowGuide(true)}
  className="text-xs text-amber-400 underline opacity-80 hover:opacity-100"
>
  How to play
</button>
<HowToPlayGuide open={showGuide} onClose={() => setShowGuide(false)} />
```

In `CampaignMapView.tsx`, add the same state + import and add a "?" button in the header next to the audio toggle:

```tsx
<button
  onClick={() => setShowGuide(true)}
  className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800"
  title="How to play"
>
  ?
</button>
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/components/guide/__tests__/HowToPlayGuide.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/guide/HowToPlayGuide.tsx frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx frontend/src/pages/Landing.tsx frontend/src/pages/CampaignMapView.tsx
git commit -m "feat: how-to-play guide modal on landing + map pages

6-section guide covering role, turn flow, combat mechanics, objectives,
and strategy tips. Accessible from landing page and map header.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Mobile Responsive — CampaignMapView Header

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

The header has 8+ buttons in `flex items-center gap-2` with no wrapping. On 375px screens, buttons overflow off-screen. This is the most critical mobile fix.

- [ ] **Step 1: Refactor header to collapsible mobile menu**

Replace the header in `CampaignMapView.tsx` with a responsive design. On mobile, show only essential info (campaign name, year/quarter) and a hamburger menu that expands to show navigation buttons. On tablet+, show the full button row.

```tsx
<header className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
  <div className="min-w-0 flex-shrink">
    <h1 className="text-sm font-bold truncate">{campaign.name}</h1>
    <p className="text-xs opacity-70">
      {campaign.current_year} Q{campaign.current_quarter} • ₹{campaign.budget_cr.toLocaleString("en-US")} cr
    </p>
  </div>
  <div className="flex items-center gap-1.5 flex-shrink-0">
    {pendingVignettes.length > 0 && (
      <Link
        to={`/campaign/${campaign.id}/vignette/${pendingVignettes[0].id}`}
        className="bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-semibold rounded px-2 py-1 animate-pulse"
      >
        ⚠ Ops
      </Link>
    )}
    <Link to={`/campaign/${campaign.id}/intel`} className="bg-slate-800 hover:bg-slate-700 text-xs rounded px-2 py-1">Intel</Link>
    <Link to={`/campaign/${campaign.id}/procurement`} className="bg-slate-800 hover:bg-slate-700 text-xs rounded px-2 py-1">Proc</Link>
    <button
      onClick={() => setShowMenu(!showMenu)}
      className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 sm:hidden"
    >
      ☰
    </button>
    <div className="hidden sm:flex items-center gap-1.5">
      <Link to={`/campaign/${campaign.id}/raw`} className="text-xs opacity-60 hover:opacity-100 underline">raw</Link>
      <ThemeToggle />
      <button onClick={() => { setAudioEnabled(!audioOn); setAudioOn(!audioOn); }}
        className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800" title={audioOn ? "Mute" : "Unmute"}>
        {audioOn ? "♪" : "♪̶"}
      </button>
      <button onClick={() => setShowGuide(true)} className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800" title="How to play">?</button>
      {isCampaignComplete && (
        <Link to={`/campaign/${campaign.id}/white-paper`} className="bg-amber-600 hover:bg-amber-500 text-slate-900 text-xs font-semibold rounded px-2 py-1">White Paper</Link>
      )}
    </div>
    <button
      onClick={handleAdvanceTurn}
      disabled={loading || isCampaignComplete}
      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded px-2 py-1.5 text-xs"
    >
      {loading ? "…" : "End Turn"}
    </button>
  </div>
</header>
{showMenu && (
  <div className="flex flex-wrap gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 sm:hidden">
    <Link to={`/campaign/${campaign.id}/raw`} className="text-xs opacity-60 hover:opacity-100 underline">raw</Link>
    <ThemeToggle />
    <button onClick={() => { setAudioEnabled(!audioOn); setAudioOn(!audioOn); }}
      className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800">
      {audioOn ? "♪" : "♪̶"}
    </button>
    <button onClick={() => setShowGuide(true)} className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800">? Help</button>
    {isCampaignComplete && (
      <Link to={`/campaign/${campaign.id}/white-paper`} className="bg-amber-600 text-slate-900 text-xs font-semibold rounded px-2 py-1">White Paper</Link>
    )}
    <Link to="/" className="text-xs opacity-60 hover:opacity-100 underline">Home</Link>
  </div>
)}
```

Add `const [showMenu, setShowMenu] = useState(false);` to the component state.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "fix: responsive header for mobile — collapsible menu on small screens

Essential actions (Intel, Procurement, End Turn, pending vignette)
stay visible. Secondary actions collapse into hamburger menu on <640px.
Shortened button labels to fit 375px screens.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Mobile Responsive — TacticalReplay SVG Scaling

**Files:**
- Modify: `frontend/src/components/vignette/TacticalReplay.tsx`

SVG is hardcoded at 360×300px which overflows narrow screens and wastes space on tablets.

- [ ] **Step 1: Make SVG responsive with viewBox**

Replace the hardcoded `width={W} height={H}` with a `viewBox` + responsive container:

```tsx
const W = 360;
const H = 300;
```

Change the SVG element to:

```tsx
<svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[360px] mx-auto" role="img" aria-label={`tactical replay phase ${phase}`}>
```

This makes the SVG scale down on narrow screens while staying crisp.

- [ ] **Step 2: Make phase buttons wrap on narrow screens**

Change the phase buttons container from `flex gap-1` to `flex flex-wrap gap-1`:

```tsx
<div className="flex flex-wrap gap-1 mb-3">
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/vignette/TacticalReplay.tsx
git commit -m "fix: responsive tactical replay SVG — scales on narrow screens

Uses viewBox instead of fixed width/height. Phase buttons wrap on
small screens.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Mobile Responsive — DefenseWhitePaper + YearEndRecapToast

**Files:**
- Modify: `frontend/src/pages/DefenseWhitePaper.tsx`
- Modify: `frontend/src/components/endgame/YearEndRecapToast.tsx`

WhitePaper uses `grid-cols-3` which breaks on 375px. Toast uses `max-w-lg` (512px) which exceeds phone width.

- [ ] **Step 1: Fix WhitePaper summary grid**

Change `grid grid-cols-3 gap-3` to responsive:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
```

This wraps to 2 columns on mobile, 3 on tablet+.

- [ ] **Step 2: Fix toast width**

Change `max-w-lg` to `max-w-[calc(100vw-2rem)]` so it never overflows:

```tsx
className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] sm:max-w-lg px-4 py-3 bg-amber-600/90 text-slate-900 text-sm font-semibold rounded-xl shadow-lg cursor-pointer"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DefenseWhitePaper.tsx frontend/src/components/endgame/YearEndRecapToast.tsx
git commit -m "fix: responsive white paper grid + toast width for mobile

Summary grid: 2-col on mobile, 3-col on tablet+. Toast constrained
to viewport width minus padding.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Mobile Responsive — OpsRoom, Procurement, Intel Screens

**Files:**
- Modify: `frontend/src/pages/OpsRoom.tsx` (header truncation + sticky bottom)
- Modify: `frontend/src/components/procurement/BudgetAllocator.tsx` (stepper row wrapping)
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx` (Gantt horizontal scroll)
- Modify: `frontend/src/pages/IntelInbox.tsx` (if any overflow issues)

Sweep the remaining screens for mobile issues.

- [ ] **Step 1: Fix OpsRoom header**

In `OpsRoom.tsx`, the header scenario name can overflow. Add `truncate` to the h1 and reduce padding:

```tsx
<h1 className="text-sm font-bold truncate">{ps.scenario_name}</h1>
```

Reduce header padding from `px-4 py-3` to `px-3 py-2`.

- [ ] **Step 2: Fix BudgetAllocator stepper rows**

If the 5-bucket stepper row overflows on narrow screens, wrap each bucket as a full-width row on mobile. Change the stepper container to:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
```

Each budget bucket should be a card that stacks vertically on mobile.

- [ ] **Step 3: Fix AcquisitionPipeline Gantt**

The 40-quarter Gantt timeline likely overflows. Wrap it in a horizontally scrollable container:

```tsx
<div className="overflow-x-auto -mx-4 px-4">
  {/* existing Gantt content */}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OpsRoom.tsx frontend/src/components/procurement/BudgetAllocator.tsx frontend/src/components/procurement/AcquisitionPipeline.tsx
git commit -m "fix: responsive OpsRoom, budget allocator, and acquisition pipeline

OpsRoom header truncates long scenario names. Budget allocator
stacks vertically on mobile. Gantt timeline scrolls horizontally.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Mobile Responsive — AARReader, ForceCommitter, IntelCards

**Files:**
- Modify: `frontend/src/components/vignette/AARReader.tsx` (outcome grid responsive)
- Modify: `frontend/src/components/vignette/ForceCommitter.tsx` (squadron cards stacking)
- Modify: `frontend/src/components/intel/IntelCard.tsx` (if overflow issues)

- [ ] **Step 1: Fix AARReader outcome grid**

The outcome grid `grid grid-cols-2` is fine for mobile, but check the col-span-2 status line. Ensure text doesn't overflow — add `text-sm` and `truncate` if needed.

- [ ] **Step 2: Fix ForceCommitter**

Ensure squadron checkboxes and airframes steppers stack cleanly on narrow screens. Each squadron row should be a full-width card:

```tsx
<div className="space-y-2">
```

instead of any horizontal grid layout.

- [ ] **Step 3: Fix IntelCard**

Ensure confidence bar + source badge don't overflow on 375px. The source badge should truncate if needed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/vignette/AARReader.tsx frontend/src/components/vignette/ForceCommitter.tsx frontend/src/components/intel/IntelCard.tsx
git commit -m "fix: responsive vignette + intel components for mobile

Outcome grid, force committer squadron rows, and intel card badges
all handle 375px screens without overflow.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Update ROADMAP.md + CLAUDE.md

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Plan 12 row to ROADMAP.md**

In the Current Status Summary table, add:

```markdown
| 12 | V1 Playtest Fixes | 🟡 in progress | [2026-04-18-v1-playtest-fixes-plan.md](2026-04-18-v1-playtest-fixes-plan.md) |
```

Update "Last updated" to `2026-04-18 (Plan 12 in progress)`.

- [ ] **Step 2: Add Plan 12 section to ROADMAP.md**

After the Plan 11 section, add:

```markdown
## Plan 12 — V1 Playtest Fixes

**Goal:** Fix all issues found during the first real playtest: combat reasoning display explaining why the player won/lost, mobile/tablet responsive fixes across all screens, objective selection at campaign start, multi-campaign support with campaign list/resume, how-to-play guide, and OpenRouter API key operational fix.

**Deliverable:** A mobile-playable V1 with all first-playtest issues resolved. Players can choose objectives, resume campaigns, understand combat outcomes, and read a how-to-play guide.

**Depends on:** Plans 1–11 (complete V1).

**Work:**

### A. Backend API Additions
1. **GET /api/content/objectives** — serve the 12-objective catalog
2. **GET /api/campaigns** — list all campaigns ordered by most recently updated

### B. Landing Page Overhaul
3. **Objective selector** — pick 3–5 objectives from catalog, difficulty picker
4. **Campaign list/resume** — show existing campaigns with resume buttons

### C. Combat Understanding
5. **CombatReasoning component** — pure frontend, parses event_trace to explain detection advantage, stealth, numbers, ROE, AWACS, missile effectiveness
6. **How-to-play guide** — modal accessible from landing + map header

### D. Mobile/Tablet Responsive Sweep
7. **CampaignMapView header** — collapsible hamburger menu on mobile
8. **TacticalReplay SVG** — viewBox scaling, wrapping phase buttons
9. **DefenseWhitePaper** — responsive grid, toast width
10. **OpsRoom, Procurement, Intel** — comprehensive sweep

### E. Operational
11. **OpenRouter API key** — document env var requirement in deploy.sh
12. **Push + deploy** — deploy all changes to production

**Explicitly NOT in scope:** V1.5+ backlog items.
```

- [ ] **Step 3: Update CLAUDE.md current status**

Add Plan 12 to the current status block and update test baselines.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: add Plan 12 (V1 Playtest Fixes) to ROADMAP + CLAUDE.md

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: Push + Deploy

**Files:**
- No file changes — deployment task

Push all Plan 12 commits to remote and deploy both frontend and backend.

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python3 -m pytest -v
```

Expected: All tests pass (409 + new tests from Tasks 2–3).

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass (119 + new tests from Tasks 4–7).

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

- [ ] **Step 5: Deploy**

```bash
./deploy.sh both
```

- [ ] **Step 6: Verify deployment**

Verify both `pmc-tycoon.skdev.one` and `pmc-tycoon-api.skdev.one` are healthy.

- [ ] **Step 7: Update ROADMAP.md status to done**

Update Plan 12 status from `🟡 in progress` to `🟢 done` and update "Last updated".

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 12 done — V1 playtest fixes complete

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
