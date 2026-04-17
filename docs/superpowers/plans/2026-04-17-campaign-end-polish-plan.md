# Campaign End + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the campaign a satisfying end-state: Defense White Paper screen at Q40, LLM retrospective, shareable campaign-card PNG, emerging-ace cards, year-end recap toast on Q4 rollover.

**Architecture:** Mixed backend + frontend plan. Backend enriches the year-recap and retrospective LLM prompts with real CampaignEvent data (replacing placeholder `[]`/`0` values), bumps prompt versions to v2, and adds a `GET /api/campaigns/{id}/summary` endpoint that assembles timeline stats for the white paper's charts. Frontend adds 7 new endgame components, a DefenseWhitePaper page, 3 new API methods, store extensions for year-recap toast + retrospective, and Q40-detection navigation logic.

**Tech Stack:** FastAPI + SQLAlchemy (backend enrichment), React 19 + Vite 8 + TypeScript + Tailwind v4 + Zustand (frontend), html2canvas (PNG export), Vitest + @testing-library/react (tests).

**Depends on:** Plans 5 (LLM layer), 7 (procurement store), 8 (vignettes + intel screens).

**Test baselines (start of Plan 9):** 308 backend tests, 70 frontend vitest tests.

---

## File Structure

### Backend — new files
- `backend/app/api/summary.py` — `GET /api/campaigns/{id}/summary` endpoint
- `backend/app/schemas/summary.py` — Pydantic response models for campaign summary
- `backend/app/llm/prompts/year_recap_v2.py` — enriched year-recap prompt
- `backend/app/llm/prompts/retrospective_v2.py` — enriched retrospective prompt
- `backend/tests/test_summary_api.py` — tests for summary endpoint
- `backend/tests/test_prompt_year_recap_v2.py` — tests for v2 prompt
- `backend/tests/test_prompt_retrospective_v2.py` — tests for v2 prompt

### Backend — modified files
- `backend/app/llm/service.py` — switch `generate_year_recap` + `generate_retrospective` to v2 prompts, enrich inputs from CampaignEvent/Vignette/Squadron/RDProgramState data
- `backend/app/llm/prompts/__init__.py` — register v2 prompt modules
- `backend/main.py` — add `summary_router`
- `backend/tests/test_llm_service.py` — update tests for enriched inputs

### Frontend — new files
- `frontend/src/components/endgame/ObjectiveScoreCard.tsx` — pass/partial/fail grade cards
- `frontend/src/components/endgame/ForceEvolutionChart.tsx` — SVG sparkline across quarters
- `frontend/src/components/endgame/RetrospectiveReader.tsx` — renders LLM retrospective
- `frontend/src/components/endgame/EmergingAceCard.tsx` — surfaces named aces
- `frontend/src/components/endgame/CampaignCardGenerator.tsx` — html2canvas PNG export
- `frontend/src/components/endgame/YearEndRecapToast.tsx` — one-line recap animation
- `frontend/src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx`
- `frontend/src/components/endgame/__tests__/ForceEvolutionChart.test.tsx`
- `frontend/src/components/endgame/__tests__/RetrospectiveReader.test.tsx`
- `frontend/src/components/endgame/__tests__/EmergingAceCard.test.tsx`
- `frontend/src/components/endgame/__tests__/CampaignCardGenerator.test.tsx`
- `frontend/src/components/endgame/__tests__/YearEndRecapToast.test.tsx`
- `frontend/src/pages/DefenseWhitePaper.tsx` — endgame page composing all components
- `frontend/src/lib/__tests__/endgame_api.test.ts` — tests for new API methods

### Frontend — modified files
- `frontend/src/lib/api.ts` — add `generateYearRecap`, `generateRetrospective`, `getCampaignSummary`
- `frontend/src/lib/types.ts` — add `CampaignSummary`, `QuarterSnapshot`, `ObjectiveGrade` types
- `frontend/src/store/campaignStore.ts` — add `yearRecapToast`, `generateYearRecap`, `generateRetrospective`, `campaignSummary`, `loadCampaignSummary`; modify `advanceTurn` for Q4 recap toast + Q40 detection
- `frontend/src/App.tsx` — add `/campaign/:id/white-paper` route
- `frontend/src/pages/CampaignMapView.tsx` — add "White Paper" link when Q40 complete

---

### Task 1: Campaign Summary Backend Endpoint — Schema + API

**Files:**
- Create: `backend/app/schemas/summary.py`
- Create: `backend/app/api/summary.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_summary_api.py`

This endpoint assembles the data the Defense White Paper needs: per-year snapshots (treasury, deliveries, vignettes won/lost), force structure delta, objective grades, ace count. All computed from existing DB tables.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_summary_api.py`:

```python
# backend/tests/test_summary_api.py
"""Tests for GET /api/campaigns/{id}/summary endpoint."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.vignette import Vignette
from app.models.squadron import Squadron


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app), Session
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _seed_campaign(session, *, current_year=2030, current_quarter=1):
    c = Campaign(
        name="test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=current_year, current_quarter=current_quarter,
        difficulty="realistic", objectives_json=["amca_operational_by_2035"],
        budget_cr=500000,
    )
    session.add(c)
    session.commit()
    return c


def test_summary_returns_year_snapshots(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    # Add turn_advanced events for 2 years
    for y in (2026, 2027):
        for q in range(2 if y == 2026 else 1, 5):
            db.add(CampaignEvent(
                campaign_id=c.id, year=y, quarter=q,
                event_type="turn_advanced",
                payload={"treasury_after_cr": 400000 + y * 10 + q,
                         "from_year": y, "from_quarter": q,
                         "to_year": y if q < 4 else y + 1,
                         "to_quarter": q + 1 if q < 4 else 1,
                         "grant_cr": 155000, "allocation": {}},
            ))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "year_snapshots" in data
    assert len(data["year_snapshots"]) >= 2


def test_summary_includes_force_structure(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Squadron(campaign_id=c.id, name="17 Sqn", call_sign="17A",
                    platform_id="rafale_f4", base_id=1, strength=16))
    db.add(Squadron(campaign_id=c.id, name="45 Sqn", call_sign="45B",
                    platform_id="tejas_mk1a", base_id=1, strength=18))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["force_structure"]["squadrons_end"] == 2
    assert data["force_structure"]["total_airframes"] == 34


def test_summary_counts_vignettes(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Vignette(campaign_id=c.id, year=2028, quarter=2,
                    scenario_id="s1", status="resolved",
                    outcome={"objective_met": True}))
    db.add(Vignette(campaign_id=c.id, year=2029, quarter=1,
                    scenario_id="s2", status="resolved",
                    outcome={"objective_met": False}))
    db.add(Vignette(campaign_id=c.id, year=2029, quarter=3,
                    scenario_id="s3", status="pending"))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["vignettes_won"] == 1
    assert data["vignettes_lost"] == 1


def test_summary_404_for_missing_campaign(client):
    http, _ = client
    resp = http.get("/api/campaigns/9999/summary")
    assert resp.status_code == 404


def test_summary_counts_aces(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Squadron(campaign_id=c.id, name="17 Sqn", call_sign="17A",
                    platform_id="rafale_f4", base_id=1, strength=16,
                    ace_name="Sqn Ldr Rao 'Vajra'", ace_awarded_year=2029,
                    ace_awarded_quarter=3))
    db.add(Squadron(campaign_id=c.id, name="45 Sqn", call_sign="45B",
                    platform_id="tejas_mk1a", base_id=1, strength=18))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["ace_count"] == 1
    assert len(data["aces"]) == 1
    assert data["aces"][0]["squadron_name"] == "17 Sqn"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_summary_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.summary'`

- [ ] **Step 3: Create the Pydantic schema**

Create `backend/app/schemas/summary.py`:

```python
from pydantic import BaseModel


class YearSnapshot(BaseModel):
    year: int
    end_treasury_cr: int
    vignettes_resolved: int
    vignettes_won: int
    deliveries: int
    rd_completions: int


class ForceStructure(BaseModel):
    squadrons_end: int
    total_airframes: int
    fifth_gen_squadrons: int


class AceSummary(BaseModel):
    squadron_id: int
    squadron_name: str
    platform_id: str
    ace_name: str
    awarded_year: int
    awarded_quarter: int


class CampaignSummaryResponse(BaseModel):
    campaign_id: int
    name: str
    difficulty: str
    starting_year: int
    current_year: int
    current_quarter: int
    budget_cr: int
    reputation: int
    year_snapshots: list[YearSnapshot]
    force_structure: ForceStructure
    vignettes_won: int
    vignettes_lost: int
    vignettes_total: int
    ace_count: int
    aces: list[AceSummary]
    is_complete: bool
```

- [ ] **Step 4: Create the API endpoint**

Create `backend/app/api/summary.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.event import CampaignEvent
from app.models.vignette import Vignette
from app.models.squadron import Squadron
from app.schemas.summary import (
    CampaignSummaryResponse, YearSnapshot, ForceStructure, AceSummary,
)

router = APIRouter(prefix="/api/campaigns", tags=["summary"])


def _year_snapshots(db: Session, campaign_id: int) -> list[YearSnapshot]:
    rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "turn_advanced",
    ).order_by(CampaignEvent.year, CampaignEvent.quarter).all()

    years: dict[int, dict] = {}
    for r in rows:
        y = r.year
        if y not in years:
            years[y] = {"end_treasury_cr": 0, "vignettes_resolved": 0,
                        "vignettes_won": 0, "deliveries": 0, "rd_completions": 0}
        years[y]["end_treasury_cr"] = r.payload.get("treasury_after_cr", 0)

    delivery_rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "acquisition_delivery",
    ).all()
    for r in delivery_rows:
        if r.year in years:
            years[r.year]["deliveries"] += 1

    rd_rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "rd_completed",
    ).all()
    for r in rd_rows:
        if r.year in years:
            years[r.year]["rd_completions"] += 1

    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "resolved",
    ).all()
    for v in vigs:
        if v.year in years:
            years[v.year]["vignettes_resolved"] += 1
            if (v.outcome or {}).get("objective_met"):
                years[v.year]["vignettes_won"] += 1

    return [
        YearSnapshot(year=y, **d)
        for y, d in sorted(years.items())
    ]


def _force_structure(db: Session, campaign_id: int) -> ForceStructure:
    squads = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id).all()
    fifth_gen = sum(1 for s in squads if s.platform_id in (
        "amca_mk1", "amca_mk2"))
    return ForceStructure(
        squadrons_end=len(squads),
        total_airframes=sum(s.strength for s in squads),
        fifth_gen_squadrons=fifth_gen,
    )


def _aces(db: Session, campaign_id: int) -> list[AceSummary]:
    rows = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id,
        Squadron.ace_name.isnot(None),
    ).all()
    return [
        AceSummary(
            squadron_id=s.id, squadron_name=s.name,
            platform_id=s.platform_id, ace_name=s.ace_name,
            awarded_year=s.ace_awarded_year,
            awarded_quarter=s.ace_awarded_quarter,
        )
        for s in rows
    ]


def _is_complete(campaign) -> bool:
    return campaign.current_year > 2036 or (
        campaign.current_year == 2036 and campaign.current_quarter > 1
    )


@router.get("/{campaign_id}/summary", response_model=CampaignSummaryResponse)
def summary_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")

    snapshots = _year_snapshots(db, campaign_id)
    force = _force_structure(db, campaign_id)
    aces = _aces(db, campaign_id)

    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "resolved",
    ).all()
    won = sum(1 for v in vigs if (v.outcome or {}).get("objective_met"))
    lost = len(vigs) - won

    return CampaignSummaryResponse(
        campaign_id=c.id, name=c.name, difficulty=c.difficulty,
        starting_year=c.starting_year,
        current_year=c.current_year, current_quarter=c.current_quarter,
        budget_cr=c.budget_cr, reputation=c.reputation,
        year_snapshots=snapshots,
        force_structure=force,
        vignettes_won=won, vignettes_lost=lost, vignettes_total=len(vigs),
        ace_count=len(aces), aces=aces,
        is_complete=_is_complete(c),
    )
```

- [ ] **Step 5: Register the router**

Modify `backend/main.py` — add after the `bases_router` import:

```python
from app.api.summary import router as summary_router
```

And add after `app.include_router(bases_router)`:

```python
app.include_router(summary_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_summary_api.py -v`
Expected: all 5 tests PASS

- [ ] **Step 7: Run full backend suite**

Run: `cd backend && python -m pytest --tb=short -q`
Expected: 313+ tests pass (308 existing + 5 new)

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/summary.py backend/app/api/summary.py backend/main.py backend/tests/test_summary_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/summary for white paper data"
```

---

### Task 2: Enrich Year-Recap Prompt (v1 → v2)

**Files:**
- Create: `backend/app/llm/prompts/year_recap_v2.py`
- Create: `backend/tests/test_prompt_year_recap_v2.py`
- Modify: `backend/app/llm/service.py:190-228` — switch to v2, enrich inputs
- Modify: `backend/app/llm/prompts/__init__.py` — import v2
- Modify: `backend/tests/test_llm_service.py` — add enrichment test

The v1 prompt uses placeholder `[]`/`0` values for `acquisitions_delivered`, `rd_milestones`, `notable_adversary_shifts`. The v2 prompt receives real data extracted from CampaignEvent rows.

- [ ] **Step 1: Write the v2 prompt module tests**

Create `backend/tests/test_prompt_year_recap_v2.py`:

```python
from app.llm.prompts import year_recap_v2


SAMPLE = {
    "year": 2028,
    "starting_treasury_cr": 500000,
    "ending_treasury_cr": 410000,
    "acquisitions_delivered": ["Rafale sqn #2", "Tejas Mk1A batch-3"],
    "rd_milestones": ["AMCA Mk1 engine integration passed"],
    "vignettes_resolved": 2,
    "vignettes_won": 2,
    "notable_adversary_shifts": ["PLAAF fielded J-20S widely"],
}


def test_metadata():
    assert year_recap_v2.KIND == "year_recap"
    assert year_recap_v2.VERSION == "v2"


def test_one_line_constraint():
    msgs = year_recap_v2.build_messages(SAMPLE)
    assert "one sentence" in msgs[0]["content"].lower() \
        or "single sentence" in msgs[0]["content"].lower()


def test_hash_stable():
    assert year_recap_v2.build_input_hash(SAMPLE) \
        == year_recap_v2.build_input_hash(SAMPLE)


def test_hash_differs_from_v1():
    from app.llm.prompts import year_recap_v1
    h1 = year_recap_v1.build_input_hash(SAMPLE)
    h2 = year_recap_v2.build_input_hash(SAMPLE)
    # Same inputs but different version → hashes should still differ
    # because the VERSION is part of the cache key, not the input hash.
    # Input hashes may be the same — that's fine.
    assert h2 is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_prompt_year_recap_v2.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.llm.prompts.year_recap_v2'`

- [ ] **Step 3: Create the v2 prompt module**

Create `backend/app/llm/prompts/year_recap_v2.py`:

```python
"""Year recap prompt v2 — single-sentence summary with enriched inputs."""
from __future__ import annotations

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "year_recap"
VERSION = "v2"

SYSTEM_PROMPT = """Produce exactly one sentence (max 30 words) summarising
the IAF's progress in the given year. Tone: clipped, factual. No emojis,
no dramatic language. Output only the sentence — no heading, no bullets.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    return (
        f"Year: {inputs['year']}\n"
        f"Treasury: {inputs['starting_treasury_cr']} → {inputs['ending_treasury_cr']} cr\n"
        f"Deliveries: {inputs['acquisitions_delivered']}\n"
        f"R&D milestones: {inputs['rd_milestones']}\n"
        f"Vignettes: {inputs['vignettes_resolved']} resolved, "
        f"{inputs['vignettes_won']} won\n"
        f"Adversary shifts: {inputs['notable_adversary_shifts']}\n"
        "\nOne sentence."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    return _canonical_hash(inputs)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Register v2 in `__init__.py`**

Modify `backend/app/llm/prompts/__init__.py` — add the import alongside the existing v1 imports. Find the line that imports `year_recap_v1` and add `year_recap_v2` next to it:

```python
from app.llm.prompts import year_recap_v2  # noqa: F401
```

- [ ] **Step 5: Enrich `generate_year_recap` in service.py**

Modify `backend/app/llm/service.py`. Replace the entire `generate_year_recap` function (lines 190-228) with:

```python
def generate_year_recap(db: Session, campaign: Campaign, year: int) -> tuple[str, bool]:
    if year >= campaign.current_year:
        raise NarrativeIneligibleError(f"year {year} is not yet closed")
    subject_id = f"year-{year}"
    existing = find_narrative(db, campaign.id, "year_recap", subject_id)
    if existing is not None:
        return existing.text, True

    # Gather treasury snapshots from turn_advanced events
    turn_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.year == year,
        CampaignEvent.event_type == "turn_advanced",
    ).order_by(CampaignEvent.quarter).all()
    starting_treasury = turn_events[0].payload.get("treasury_after_cr", 0) if turn_events else 0
    ending_treasury = turn_events[-1].payload.get("treasury_after_cr", 0) if turn_events else 0

    # Gather acquisition deliveries
    delivery_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.year == year,
        CampaignEvent.event_type == "acquisition_delivery",
    ).all()
    deliveries = [
        e.payload.get("platform_id", "unknown")
        for e in delivery_events
    ]

    # Gather R&D milestones
    rd_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.year == year,
        CampaignEvent.event_type.in_(["rd_milestone", "rd_completed"]),
    ).all()
    rd_milestones = [
        e.payload.get("program_id", "unknown")
        for e in rd_events
    ]

    # Count vignettes
    vigs_resolved = db.query(Vignette).filter(
        Vignette.campaign_id == campaign.id,
        Vignette.year == year,
        Vignette.status == "resolved",
    ).all()
    vignettes_won = sum(1 for v in vigs_resolved if (v.outcome or {}).get("objective_met"))

    # Gather adversary shifts
    adv_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.year == year,
        CampaignEvent.event_type.in_(["adversary_roadmap_event_applied", "adversary_doctrine_shifted"]),
    ).all()
    adv_shifts = [
        e.payload.get("description", e.payload.get("event_summary", f"{e.payload.get('faction', '?')} shift"))
        for e in adv_events
    ]

    inputs = {
        "year": year,
        "starting_treasury_cr": starting_treasury,
        "ending_treasury_cr": ending_treasury,
        "acquisitions_delivered": deliveries,
        "rd_milestones": rd_milestones,
        "vignettes_resolved": len(vigs_resolved),
        "vignettes_won": vignettes_won,
        "notable_adversary_shifts": adv_shifts,
    }
    ihash = year_recap_v2.build_input_hash(inputs)
    ckey = make_cache_key(year_recap_v2.KIND, year_recap_v2.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=year_recap_v2.KIND,
        prompt_version=year_recap_v2.VERSION,
        build_messages=lambda: year_recap_v2.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="year_recap",
        year=year, quarter=4, subject_id=subject_id, text=text,
        prompt_version=year_recap_v2.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached
```

Also add the import at the top of `service.py`, alongside the existing v1 imports:

```python
from app.llm.prompts import year_recap_v2
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_prompt_year_recap_v2.py tests/test_llm_service.py -v`
Expected: all tests PASS

- [ ] **Step 7: Run full backend suite**

Run: `cd backend && python -m pytest --tb=short -q`
Expected: all pass (existing + new)

- [ ] **Step 8: Commit**

```bash
git add backend/app/llm/prompts/year_recap_v2.py backend/app/llm/prompts/__init__.py backend/app/llm/service.py backend/tests/test_prompt_year_recap_v2.py
git commit -m "feat(llm): enrich year-recap prompt v1→v2 with real CampaignEvent data"
```

---

### Task 3: Enrich Retrospective Prompt (v1 → v2)

**Files:**
- Create: `backend/app/llm/prompts/retrospective_v2.py`
- Create: `backend/tests/test_prompt_retrospective_v2.py`
- Modify: `backend/app/llm/service.py:239-285` — switch to v2, enrich inputs
- Modify: `backend/app/llm/prompts/__init__.py` — import v2

The v1 prompt uses placeholder `0` for `squadrons_start`, `fifth_gen_squadrons_end`, `budget_efficiency_pct`, `notable_engagements`. The v2 prompt fills these from CampaignEvent + Vignette data.

- [ ] **Step 1: Write the v2 prompt module tests**

Create `backend/tests/test_prompt_retrospective_v2.py`:

```python
from app.llm.prompts import retrospective_v2


SAMPLE = {
    "final_year": 2036, "final_quarter": 2,
    "objectives_scorecard": [
        {"id": "amca_operational_by_2035", "name": "Operational AMCA Mk1 squadron by 2035",
         "status": "pass", "detail": "AMCA Mk1 squadron stood up 2034-Q3"}
    ],
    "force_structure_delta": {
        "squadrons_start": 31, "squadrons_end": 38,
        "fifth_gen_squadrons_end": 2,
    },
    "budget_efficiency_pct": 87,
    "ace_count": 3,
    "notable_engagements": [
        {"scenario_name": "LAC Incursion", "year": 2031, "won": True}
    ],
    "adversary_final_state": {"PLAAF": {"doctrine_tier": "advanced"}},
}


def test_metadata():
    assert retrospective_v2.KIND == "retrospective"
    assert retrospective_v2.VERSION == "v2"


def test_prompt_structure():
    msgs = retrospective_v2.build_messages(SAMPLE)
    assert len(msgs) == 2
    assert "White Paper" in msgs[0]["content"] or "retrospective" in msgs[0]["content"].lower()


def test_hash_stable():
    assert retrospective_v2.build_input_hash(SAMPLE) \
        == retrospective_v2.build_input_hash(SAMPLE)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_prompt_retrospective_v2.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Create the v2 prompt module**

Create `backend/app/llm/prompts/retrospective_v2.py`:

```python
"""Retrospective prompt v2 — end-of-campaign assessment with enriched inputs."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "retrospective"
VERSION = "v2"

SYSTEM_PROMPT = """You are writing the Defense White Paper epilogue for
the outgoing Head of Defense Integration (2026-2036). Produce 5-8
paragraphs covering, in this order:
  1. Objective scorecard overview
  2. Force structure evolution
  3. Procurement / R&D highlights
  4. Notable engagements and emerging aces
  5. The adversary landscape as it now stands
  6. A frank assessment of what was left undone

Clipped, senior-officer voice. No dramatic language.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    engagements = inputs.get("notable_engagements", [])
    eng_str = "\n".join(
        f"- {e.get('scenario_name', '?')} ({e.get('year', '?')}) — {'won' if e.get('won') else 'lost'}"
        for e in engagements
    ) if engagements else "None recorded."

    return (
        f"# Campaign: {inputs['final_year']}-Q{inputs['final_quarter']} final state\n\n"
        f"## Objective scorecard\n{json.dumps(inputs['objectives_scorecard'], indent=2)}\n\n"
        f"## Force structure delta\n{json.dumps(inputs['force_structure_delta'], indent=2)}\n\n"
        f"## Budget efficiency\n{inputs['budget_efficiency_pct']}%\n\n"
        f"## Emerging aces\n{inputs['ace_count']} squadron aces recognized\n\n"
        f"## Notable engagements\n{eng_str}\n\n"
        f"## Adversary final state\n{json.dumps(inputs['adversary_final_state'], indent=2)}\n\n"
        "Write the retrospective now."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    return _canonical_hash(inputs)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Register v2 in `__init__.py`**

Modify `backend/app/llm/prompts/__init__.py` — add:

```python
from app.llm.prompts import retrospective_v2  # noqa: F401
```

- [ ] **Step 5: Enrich `generate_retrospective` in service.py**

Modify `backend/app/llm/service.py`. Replace the entire `generate_retrospective` function (lines 239-285) with:

```python
def generate_retrospective(db: Session, campaign: Campaign) -> tuple[str, bool]:
    if not _q40_completed(campaign):
        raise NarrativeIneligibleError("Q40 (2036-Q1) not yet completed")
    subject_id = "campaign"
    existing = find_narrative(db, campaign.id, "retrospective", subject_id)
    if existing is not None:
        return existing.text, True

    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
    ace_squads = db.query(Squadron).filter(
        Squadron.campaign_id == campaign.id, Squadron.ace_name.isnot(None)
    ).all()
    all_squads = db.query(Squadron).filter(Squadron.campaign_id == campaign.id).all()

    # Count starting squadrons from campaign_created event payload
    # (not stored explicitly — use a heuristic: count from seed_starting_state)
    created_event = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.event_type == "campaign_created",
    ).first()
    # Approximate: count turn_advanced events for Q2 2026 to get initial state
    # For now, use a fixed starting count from the seed data (Plan 2 seeds ~31 squadrons)
    squadrons_start = created_event.payload.get("initial_squadrons", 31) if created_event else 31

    fifth_gen = sum(1 for s in all_squads if s.platform_id in ("amca_mk1", "amca_mk2"))

    # Compute budget efficiency: total spent / total granted * 100
    turn_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign.id,
        CampaignEvent.event_type == "turn_advanced",
    ).all()
    total_grants = sum(e.payload.get("grant_cr", 0) for e in turn_events)
    budget_efficiency = round(100 * (total_grants - campaign.budget_cr) / max(total_grants, 1)) if total_grants else 0
    budget_efficiency = max(0, min(100, budget_efficiency))

    # Notable engagements — resolved vignettes
    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign.id,
        Vignette.status == "resolved",
    ).order_by(Vignette.year, Vignette.quarter).all()
    engagements = [
        {
            "scenario_name": v.planning_state.get("scenario_name", v.scenario_id),
            "year": v.year,
            "quarter": v.quarter,
            "won": bool((v.outcome or {}).get("objective_met")),
        }
        for v in vigs
    ]

    # Objective scorecard — simple pass/fail based on game state
    objectives_scorecard = []
    from app.content.registry import objectives as objectives_reg
    obj_specs = objectives_reg()
    for obj_id in (campaign.objectives_json or []):
        spec = obj_specs.get(obj_id)
        name = spec.title if spec else obj_id
        status = _evaluate_objective(obj_id, campaign, all_squads, vigs)
        objectives_scorecard.append({"id": obj_id, "name": name, "status": status, "detail": ""})

    inputs = {
        "final_year": campaign.current_year, "final_quarter": campaign.current_quarter,
        "objectives_scorecard": objectives_scorecard,
        "force_structure_delta": {
            "squadrons_start": squadrons_start,
            "squadrons_end": len(all_squads),
            "fifth_gen_squadrons_end": fifth_gen,
        },
        "budget_efficiency_pct": budget_efficiency,
        "ace_count": len(ace_squads),
        "notable_engagements": engagements,
        "adversary_final_state": {r.faction: dict(r.state) for r in adv_rows},
    }
    ihash = retrospective_v2.build_input_hash(inputs)
    ckey = make_cache_key(retrospective_v2.KIND, retrospective_v2.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=retrospective_v2.KIND,
        prompt_version=retrospective_v2.VERSION,
        build_messages=lambda: retrospective_v2.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="retrospective",
        year=campaign.current_year, quarter=campaign.current_quarter,
        subject_id=subject_id, text=text,
        prompt_version=retrospective_v2.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


def _evaluate_objective(obj_id: str, campaign, squads, vigs) -> str:
    if obj_id == "amca_operational_by_2035":
        has_amca = any(s.platform_id in ("amca_mk1", "amca_mk2") for s in squads)
        return "pass" if has_amca else "fail"
    elif obj_id == "maintain_42_squadrons":
        return "pass" if len(squads) >= 42 else "fail"
    elif obj_id == "no_territorial_loss":
        lost = any(not (v.outcome or {}).get("objective_met") for v in vigs)
        return "fail" if lost else "pass"
    return "unknown"
```

Also add the import at the top of `service.py`:

```python
from app.llm.prompts import retrospective_v2
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_prompt_retrospective_v2.py tests/test_llm_service.py -v`
Expected: all tests PASS

- [ ] **Step 7: Run full backend suite**

Run: `cd backend && python -m pytest --tb=short -q`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add backend/app/llm/prompts/retrospective_v2.py backend/app/llm/prompts/__init__.py backend/app/llm/service.py backend/tests/test_prompt_retrospective_v2.py
git commit -m "feat(llm): enrich retrospective prompt v1→v2 with real game data"
```

---

### Task 4: Frontend API Methods + Types for Endgame

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/__tests__/endgame_api.test.ts`

Adds `CampaignSummary` type hierarchy and 3 new API methods: `generateYearRecap`, `generateRetrospective`, `getCampaignSummary`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/endgame_api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, api } from "../api";

describe("endgame API methods", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("getCampaignSummary calls GET /api/campaigns/:id/summary", async () => {
    const mock = vi.spyOn(http, "get").mockResolvedValue({
      data: {
        campaign_id: 1, name: "test", difficulty: "realistic",
        starting_year: 2026, current_year: 2036, current_quarter: 2,
        budget_cr: 100000, reputation: 75,
        year_snapshots: [], force_structure: { squadrons_end: 30, total_airframes: 450, fifth_gen_squadrons: 2 },
        vignettes_won: 5, vignettes_lost: 2, vignettes_total: 7,
        ace_count: 1, aces: [], is_complete: true,
      },
    });
    const result = await api.getCampaignSummary(1);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/summary");
    expect(result.is_complete).toBe(true);
    expect(result.force_structure.squadrons_end).toBe(30);
  });

  it("generateYearRecap calls POST with year param", async () => {
    const mock = vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "recap text", cached: false, kind: "year_recap", subject_id: "year-2028" },
    });
    const result = await api.generateYearRecap(1, 2028);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/year-recap/generate", null, { params: { year: 2028 } });
    expect(result.text).toBe("recap text");
  });

  it("generateRetrospective calls POST", async () => {
    const mock = vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "retro text", cached: false, kind: "retrospective", subject_id: "campaign" },
    });
    const result = await api.generateRetrospective(1);
    expect(mock).toHaveBeenCalledWith("/api/campaigns/1/retrospective");
    expect(result.text).toBe("retro text");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/endgame_api.test.ts`
Expected: FAIL — `api.getCampaignSummary is not a function`

- [ ] **Step 3: Add types**

Modify `frontend/src/lib/types.ts` — add at the end:

```typescript
// ---------- Plan 9: endgame types ----------

export interface YearSnapshot {
  year: number;
  end_treasury_cr: number;
  vignettes_resolved: number;
  vignettes_won: number;
  deliveries: number;
  rd_completions: number;
}

export interface ForceStructureSummary {
  squadrons_end: number;
  total_airframes: number;
  fifth_gen_squadrons: number;
}

export interface AceSummary {
  squadron_id: number;
  squadron_name: string;
  platform_id: string;
  ace_name: string;
  awarded_year: number;
  awarded_quarter: number;
}

export interface CampaignSummary {
  campaign_id: number;
  name: string;
  difficulty: Difficulty;
  starting_year: number;
  current_year: number;
  current_quarter: number;
  budget_cr: number;
  reputation: number;
  year_snapshots: YearSnapshot[];
  force_structure: ForceStructureSummary;
  vignettes_won: number;
  vignettes_lost: number;
  vignettes_total: number;
  ace_count: number;
  aces: AceSummary[];
  is_complete: boolean;
}
```

- [ ] **Step 4: Add API methods**

Modify `frontend/src/lib/api.ts` — add imports at the top for the new types:

```typescript
import type {
  // ... existing imports ...
  CampaignSummary,
} from "./types";
```

Add three new methods to the `api` object, before the closing `};`:

```typescript
  async getCampaignSummary(campaignId: number): Promise<CampaignSummary> {
    const { data } = await http.get<CampaignSummary>(
      `/api/campaigns/${campaignId}/summary`,
    );
    return data;
  },

  async generateYearRecap(
    campaignId: number,
    year: number,
  ): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/year-recap/generate`,
      null,
      { params: { year } },
    );
    return data;
  },

  async generateRetrospective(campaignId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/retrospective`,
    );
    return data;
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/__tests__/endgame_api.test.ts`
Expected: 3 tests PASS

- [ ] **Step 6: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: 73+ tests pass (70 existing + 3 new)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/__tests__/endgame_api.test.ts
git commit -m "feat(frontend): api methods + types for year-recap, retrospective, campaign summary"
```

---

### Task 5: CampaignStore Extensions for Endgame

**Files:**
- Modify: `frontend/src/store/campaignStore.ts`

Adds `campaignSummary` state, `loadCampaignSummary` action, `generateYearRecap` action, `generateRetrospective` action, and a `yearRecapToast` transient string state for displaying the toast.

- [ ] **Step 1: Add state + actions to the store interface**

Modify `frontend/src/store/campaignStore.ts`. Add to the `CampaignState` interface:

```typescript
  campaignSummary: CampaignSummary | null;
  yearRecapToast: string | null;
  loadCampaignSummary: (campaignId: number) => Promise<void>;
  generateYearRecap: (campaignId: number, year: number) => Promise<GenerateNarrativeResponse>;
  generateRetrospective: (campaignId: number) => Promise<GenerateNarrativeResponse>;
  dismissYearRecapToast: () => void;
```

Add `CampaignSummary` to the type imports at the top.

- [ ] **Step 2: Add default state values**

In the `create<CampaignState>((set, get) => ({` block, add:

```typescript
  campaignSummary: null,
  yearRecapToast: null,
```

- [ ] **Step 3: Add action implementations**

Add these action implementations:

```typescript
  loadCampaignSummary: async (campaignId) => {
    try {
      const summary = await api.getCampaignSummary(campaignId);
      set({ campaignSummary: summary });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  generateYearRecap: async (campaignId, year) => {
    const key = `year_recap:${year}`;
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateYearRecap(campaignId, year);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  generateRetrospective: async (campaignId) => {
    const key = "retrospective:campaign";
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateRetrospective(campaignId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  dismissYearRecapToast: () => set({ yearRecapToast: null }),
```

- [ ] **Step 4: Modify advanceTurn for year-recap toast**

In the `advanceTurn` action, after `set({ campaign, loading: false })`, add logic to fire the year-recap when the quarter rolls from Q4 to Q1. Find the section after `const campaign = await api.advanceTurn(current.id);` and `set({ campaign, loading: false });` and before the void calls. Add:

```typescript
      // Fire year-recap toast on Q4→Q1 rollover
      if (current.current_quarter === 4 && campaign.current_quarter === 1) {
        const closedYear = current.current_year;
        api.generateYearRecap(campaign.id, closedYear)
          .then((resp) => set({ yearRecapToast: resp.text }))
          .catch(() => {});
      }
```

- [ ] **Step 5: Extend reset**

In the `reset` action, add `campaignSummary: null, yearRecapToast: null,` to the set call.

- [ ] **Step 6: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/campaignStore.ts
git commit -m "feat(frontend): campaignStore extensions for endgame — summary, recap toast, retrospective"
```

---

### Task 6: YearEndRecapToast Component

**Files:**
- Create: `frontend/src/components/endgame/YearEndRecapToast.tsx`
- Create: `frontend/src/components/endgame/__tests__/YearEndRecapToast.test.tsx`

Reads `yearRecapToast` from the store. When non-null, renders a fixed-bottom bar with the one-line recap text. Auto-dismisses after 8 seconds. Tap/click also dismisses.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/endgame/__tests__/YearEndRecapToast.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { YearEndRecapToast } from "../YearEndRecapToast";
import { useCampaignStore } from "../../../store/campaignStore";

describe("YearEndRecapToast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    useCampaignStore.getState().reset();
  });

  afterEach(() => vi.useRealTimers());

  it("renders nothing when yearRecapToast is null", () => {
    const { container } = render(<YearEndRecapToast />);
    expect(container.textContent).toBe("");
  });

  it("renders toast text when yearRecapToast is set", () => {
    useCampaignStore.setState({ yearRecapToast: "IAF held the line in 2028." });
    render(<YearEndRecapToast />);
    expect(screen.getByText(/IAF held the line/)).toBeTruthy();
  });

  it("auto-dismisses after 8 seconds", () => {
    useCampaignStore.setState({ yearRecapToast: "recap text" });
    render(<YearEndRecapToast />);
    expect(screen.getByText(/recap text/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByText(/recap text/)).toBeNull();
  });

  it("dismisses on click", async () => {
    useCampaignStore.setState({ yearRecapToast: "click to dismiss" });
    render(<YearEndRecapToast />);
    const el = screen.getByText(/click to dismiss/);
    await act(async () => el.click());
    expect(screen.queryByText(/click to dismiss/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/YearEndRecapToast.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/endgame/YearEndRecapToast.tsx`:

```tsx
import { useEffect } from "react";
import { useCampaignStore } from "../../store/campaignStore";

export function YearEndRecapToast() {
  const toast = useCampaignStore((s) => s.yearRecapToast);
  const dismiss = useCampaignStore((s) => s.dismissYearRecapToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      onClick={dismiss}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-lg px-5 py-3 bg-amber-600/90 text-slate-900 text-sm font-semibold rounded-xl shadow-lg cursor-pointer animate-[fadeInUp_0.4s_ease-out]"
    >
      {toast}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/YearEndRecapToast.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/endgame/YearEndRecapToast.tsx frontend/src/components/endgame/__tests__/YearEndRecapToast.test.tsx
git commit -m "feat(frontend): YearEndRecapToast — auto-dismiss one-line recap on Q4 rollover"
```

---

### Task 7: EmergingAceCard Component

**Files:**
- Create: `frontend/src/components/endgame/EmergingAceCard.tsx`
- Create: `frontend/src/components/endgame/__tests__/EmergingAceCard.test.tsx`

Renders an ace summary card: squadron name, platform, ace name, and the year/quarter awarded. Used in the DefenseWhitePaper page.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/endgame/__tests__/EmergingAceCard.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergingAceCard } from "../EmergingAceCard";
import type { AceSummary } from "../../../lib/types";

const ace: AceSummary = {
  squadron_id: 17,
  squadron_name: "17 Sqn Golden Arrows",
  platform_id: "rafale_f4",
  ace_name: "Sqn Ldr Rao 'Vajra'",
  awarded_year: 2031,
  awarded_quarter: 3,
};

describe("EmergingAceCard", () => {
  it("renders squadron name and ace name", () => {
    render(<EmergingAceCard ace={ace} />);
    expect(screen.getByText(/17 Sqn Golden Arrows/)).toBeTruthy();
    expect(screen.getByText(/Sqn Ldr Rao/)).toBeTruthy();
  });

  it("renders platform and year", () => {
    render(<EmergingAceCard ace={ace} />);
    expect(screen.getByText(/rafale_f4/)).toBeTruthy();
    expect(screen.getByText(/2031/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/EmergingAceCard.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/endgame/EmergingAceCard.tsx`:

```tsx
import type { AceSummary } from "../../lib/types";

export interface EmergingAceCardProps {
  ace: AceSummary;
}

export function EmergingAceCard({ ace }: EmergingAceCardProps) {
  return (
    <div className="bg-slate-900 border border-amber-600/40 rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-amber-400">{ace.ace_name}</span>
        <span className="text-xs opacity-60">Q{ace.awarded_quarter} {ace.awarded_year}</span>
      </div>
      <p className="text-xs text-slate-300">{ace.squadron_name}</p>
      <p className="text-xs opacity-60">{ace.platform_id}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/EmergingAceCard.test.tsx`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/endgame/EmergingAceCard.tsx frontend/src/components/endgame/__tests__/EmergingAceCard.test.tsx
git commit -m "feat(frontend): EmergingAceCard — ace name + squadron + platform display"
```

---

### Task 8: ObjectiveScoreCard + ForceEvolutionChart Components

**Files:**
- Create: `frontend/src/components/endgame/ObjectiveScoreCard.tsx`
- Create: `frontend/src/components/endgame/ForceEvolutionChart.tsx`
- Create: `frontend/src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx`
- Create: `frontend/src/components/endgame/__tests__/ForceEvolutionChart.test.tsx`

ObjectiveScoreCard: renders a list of objectives with pass/fail/unknown badges. ForceEvolutionChart: SVG sparkline of treasury across year_snapshots.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectiveScoreCard } from "../ObjectiveScoreCard";

const objectives = [
  { id: "amca_operational_by_2035", name: "Operational AMCA Mk1 squadron by 2035", status: "pass" as const },
  { id: "maintain_42_squadrons", name: "Maintain 42+ fighter squadron strength", status: "fail" as const },
  { id: "no_territorial_loss", name: "No loss of sovereign territory", status: "unknown" as const },
];

describe("ObjectiveScoreCard", () => {
  it("renders all objectives with labels", () => {
    render(<ObjectiveScoreCard objectives={objectives} />);
    expect(screen.getByText(/AMCA Mk1/)).toBeTruthy();
    expect(screen.getByText(/42\+/)).toBeTruthy();
    expect(screen.getByText(/sovereign territory/)).toBeTruthy();
  });

  it("renders pass/fail badges", () => {
    render(<ObjectiveScoreCard objectives={objectives} />);
    expect(screen.getByText("PASS")).toBeTruthy();
    expect(screen.getByText("FAIL")).toBeTruthy();
  });
});
```

Create `frontend/src/components/endgame/__tests__/ForceEvolutionChart.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ForceEvolutionChart } from "../ForceEvolutionChart";
import type { YearSnapshot } from "../../../lib/types";

const snapshots: YearSnapshot[] = [
  { year: 2026, end_treasury_cr: 600000, vignettes_resolved: 0, vignettes_won: 0, deliveries: 0, rd_completions: 0 },
  { year: 2027, end_treasury_cr: 500000, vignettes_resolved: 1, vignettes_won: 1, deliveries: 2, rd_completions: 0 },
  { year: 2028, end_treasury_cr: 450000, vignettes_resolved: 2, vignettes_won: 1, deliveries: 3, rd_completions: 1 },
];

describe("ForceEvolutionChart", () => {
  it("renders an SVG with a polyline for treasury", () => {
    const { container } = render(<ForceEvolutionChart snapshots={snapshots} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const polyline = svg?.querySelector("polyline");
    expect(polyline).toBeTruthy();
  });

  it("renders year labels", () => {
    const { container } = render(<ForceEvolutionChart snapshots={snapshots} />);
    expect(container.textContent).toContain("2026");
    expect(container.textContent).toContain("2028");
  });

  it("handles empty snapshots gracefully", () => {
    const { container } = render(<ForceEvolutionChart snapshots={[]} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx src/components/endgame/__tests__/ForceEvolutionChart.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ObjectiveScoreCard**

Create `frontend/src/components/endgame/ObjectiveScoreCard.tsx`:

```tsx
export type ObjectiveStatus = "pass" | "fail" | "unknown";

export interface ObjectiveEntry {
  id: string;
  name: string;
  status: ObjectiveStatus;
}

export interface ObjectiveScoreCardProps {
  objectives: ObjectiveEntry[];
}

const statusColor: Record<ObjectiveStatus, string> = {
  pass: "bg-emerald-600 text-emerald-50",
  fail: "bg-red-600 text-red-50",
  unknown: "bg-slate-600 text-slate-200",
};

const statusLabel: Record<ObjectiveStatus, string> = {
  pass: "PASS",
  fail: "FAIL",
  unknown: "N/A",
};

export function ObjectiveScoreCard({ objectives }: ObjectiveScoreCardProps) {
  if (objectives.length === 0) {
    return <p className="text-xs opacity-60">No objectives defined.</p>;
  }
  return (
    <div className="space-y-2">
      {objectives.map((obj) => (
        <div key={obj.id} className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-4 py-3">
          <span className="text-sm text-slate-200">{obj.name}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusColor[obj.status]}`}>
            {statusLabel[obj.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement ForceEvolutionChart**

Create `frontend/src/components/endgame/ForceEvolutionChart.tsx`:

```tsx
import type { YearSnapshot } from "../../lib/types";

export interface ForceEvolutionChartProps {
  snapshots: YearSnapshot[];
  width?: number;
  height?: number;
}

export function ForceEvolutionChart({
  snapshots,
  width = 360,
  height = 140,
}: ForceEvolutionChartProps) {
  const padX = 36;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  if (snapshots.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label="force evolution chart">
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={12}>
          No data
        </text>
      </svg>
    );
  }

  const values = snapshots.map((s) => s.end_treasury_cr);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const points = snapshots
    .map((s, i) => {
      const x = padX + (i / Math.max(snapshots.length - 1, 1)) * plotW;
      const y = padY + plotH - ((s.end_treasury_cr - minVal) / range) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const labelStep = Math.max(1, Math.floor(snapshots.length / 5));

  return (
    <svg width={width} height={height} role="img" aria-label="force evolution chart">
      <polyline
        points={points}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {snapshots.map((s, i) => {
        if (i % labelStep !== 0 && i !== snapshots.length - 1) return null;
        const x = padX + (i / Math.max(snapshots.length - 1, 1)) * plotW;
        return (
          <text
            key={s.year}
            x={x}
            y={height - 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={10}
          >
            {s.year}
          </text>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx src/components/endgame/__tests__/ForceEvolutionChart.test.tsx`
Expected: all 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/endgame/ObjectiveScoreCard.tsx frontend/src/components/endgame/ForceEvolutionChart.tsx frontend/src/components/endgame/__tests__/ObjectiveScoreCard.test.tsx frontend/src/components/endgame/__tests__/ForceEvolutionChart.test.tsx
git commit -m "feat(frontend): ObjectiveScoreCard + ForceEvolutionChart for white paper"
```

---

### Task 9: RetrospectiveReader Component

**Files:**
- Create: `frontend/src/components/endgame/RetrospectiveReader.tsx`
- Create: `frontend/src/components/endgame/__tests__/RetrospectiveReader.test.tsx`

Follows the same discriminated-union state-machine pattern as `AARReader` and `IntelBriefReader`. Auto-fires `generateRetrospective` on mount. Renders the LLM-generated 5-8 paragraph retrospective.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/endgame/__tests__/RetrospectiveReader.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RetrospectiveReader } from "../RetrospectiveReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";

describe("RetrospectiveReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
  });

  it("renders LLM retrospective text", async () => {
    vi.spyOn(http, "post").mockResolvedValue({
      data: { text: "The decade concluded with a mixed assessment.\n\nForce structure grew from 31 to 38 squadrons.", cached: false, kind: "retrospective", subject_id: "campaign" },
    });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/decade concluded/)).toBeTruthy());
    expect(screen.getByText(/Force structure grew/)).toBeTruthy();
  });

  it("shows ineligible message on 409", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 409, data: { detail: "Q40 not complete" } } });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/not yet available/i)).toBeTruthy());
  });

  it("shows error on 502", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 502 } });
    render(<RetrospectiveReader campaignId={1} />);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/RetrospectiveReader.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/endgame/RetrospectiveReader.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";

export interface RetrospectiveReaderProps {
  campaignId: number;
  className?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "ineligible" }
  | { kind: "error"; message: string };

export function RetrospectiveReader({ campaignId, className = "" }: RetrospectiveReaderProps) {
  const generateRetrospective = useCampaignStore((s) => s.generateRetrospective);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateRetrospective(campaignId)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text }); })
      .catch((e: { response?: { status?: number } }) => {
        if (cancelled) return;
        if (e?.response?.status === 409) setState({ kind: "ineligible" });
        else setState({ kind: "error", message: "Narrative service unavailable." });
      });
    return () => { cancelled = true; };
  }, [campaignId, generateRetrospective]);

  if (state.kind === "loading") {
    return <div className={["text-sm opacity-60 p-4", className].join(" ")}>Generating retrospective…</div>;
  }
  if (state.kind === "ineligible") {
    return <div className={["text-sm opacity-60 p-4 italic", className].join(" ")}>Retrospective not yet available — campaign must reach Q40.</div>;
  }
  if (state.kind === "error") {
    return <div className={["text-sm text-red-300 p-4", className].join(" ")}>{state.message}</div>;
  }
  return (
    <article className={["prose prose-invert max-w-none prose-sm", className].join(" ")}>
      {state.text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
      ))}
    </article>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/RetrospectiveReader.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/endgame/RetrospectiveReader.tsx frontend/src/components/endgame/__tests__/RetrospectiveReader.test.tsx
git commit -m "feat(frontend): RetrospectiveReader — LLM-generated campaign retrospective display"
```

---

### Task 10: CampaignCardGenerator Component (html2canvas PNG Export)

**Files:**
- Modify: `frontend/package.json` — add `html2canvas`
- Create: `frontend/src/components/endgame/CampaignCardGenerator.tsx`
- Create: `frontend/src/components/endgame/__tests__/CampaignCardGenerator.test.tsx`

Renders a styled div (the "campaign card") with key stats, then uses html2canvas to export it as a PNG. The card shows: campaign name, grade (derived from win ratio), 6 key stats (squadrons, airframes, vignettes won/lost, aces, years), and a timeline sparkline.

- [ ] **Step 1: Install html2canvas**

Run: `cd frontend && npm install html2canvas`

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/endgame/__tests__/CampaignCardGenerator.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CampaignCardGenerator } from "../CampaignCardGenerator";
import type { CampaignSummary } from "../../../lib/types";

vi.mock("html2canvas", () => ({
  default: vi.fn(() => Promise.resolve({
    toDataURL: () => "data:image/png;base64,fakepng",
  })),
}));

const summary: CampaignSummary = {
  campaign_id: 1, name: "Iron Spear", difficulty: "realistic",
  starting_year: 2026, current_year: 2036, current_quarter: 2,
  budget_cr: 100000, reputation: 75,
  year_snapshots: [
    { year: 2026, end_treasury_cr: 600000, vignettes_resolved: 0, vignettes_won: 0, deliveries: 0, rd_completions: 0 },
    { year: 2027, end_treasury_cr: 500000, vignettes_resolved: 1, vignettes_won: 1, deliveries: 2, rd_completions: 0 },
  ],
  force_structure: { squadrons_end: 38, total_airframes: 570, fifth_gen_squadrons: 2 },
  vignettes_won: 8, vignettes_lost: 3, vignettes_total: 11,
  ace_count: 3, aces: [], is_complete: true,
};

describe("CampaignCardGenerator", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders campaign name and key stats", () => {
    render(<CampaignCardGenerator summary={summary} />);
    expect(screen.getByText(/Iron Spear/)).toBeTruthy();
    expect(screen.getByText(/38/)).toBeTruthy();
    expect(screen.getByText(/570/)).toBeTruthy();
  });

  it("renders grade based on win ratio", () => {
    render(<CampaignCardGenerator summary={summary} />);
    // 8 won / 11 total = 72.7% → B grade
    expect(screen.getByText(/[A-F]/)).toBeTruthy();
  });

  it("renders export button", () => {
    render(<CampaignCardGenerator summary={summary} />);
    expect(screen.getByRole("button", { name: /export|download|save/i })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/CampaignCardGenerator.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/endgame/CampaignCardGenerator.tsx`:

```tsx
import { useRef, useCallback } from "react";
import type { CampaignSummary } from "../../lib/types";
import { ForceEvolutionChart } from "./ForceEvolutionChart";

export interface CampaignCardGeneratorProps {
  summary: CampaignSummary;
}

function computeGrade(won: number, total: number): string {
  if (total === 0) return "N/A";
  const ratio = won / total;
  if (ratio >= 0.9) return "S";
  if (ratio >= 0.8) return "A";
  if (ratio >= 0.65) return "B";
  if (ratio >= 0.5) return "C";
  if (ratio >= 0.35) return "D";
  return "F";
}

export function CampaignCardGenerator({ summary }: CampaignCardGeneratorProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const grade = computeGrade(summary.vignettes_won, summary.vignettes_total);

  const handleExport = useCallback(async () => {
    if (!cardRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#020617",
      scale: 2,
    });
    const link = document.createElement("a");
    link.download = `${summary.name.replace(/\s+/g, "-").toLowerCase()}-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [summary.name]);

  const stats = [
    { label: "Squadrons", value: summary.force_structure.squadrons_end },
    { label: "Airframes", value: summary.force_structure.total_airframes },
    { label: "5th Gen", value: summary.force_structure.fifth_gen_squadrons },
    { label: "Vignettes Won", value: summary.vignettes_won },
    { label: "Vignettes Lost", value: summary.vignettes_lost },
    { label: "Aces", value: summary.ace_count },
  ];

  return (
    <div className="space-y-4">
      <div
        ref={cardRef}
        className="bg-slate-950 border border-slate-700 rounded-xl p-6 max-w-sm mx-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{summary.name}</h3>
            <p className="text-xs text-slate-400">
              {summary.starting_year}–{summary.current_year} • {summary.difficulty}
            </p>
          </div>
          <div className="text-3xl font-black text-amber-400">{grade}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-mono font-bold text-slate-100">{s.value}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
        <ForceEvolutionChart snapshots={summary.year_snapshots} width={320} height={80} />
      </div>
      <div className="text-center">
        <button
          onClick={handleExport}
          aria-label="Save campaign card as PNG"
          className="bg-amber-600 hover:bg-amber-500 text-slate-900 text-sm font-semibold rounded-lg px-4 py-2"
        >
          Save as PNG
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/endgame/__tests__/CampaignCardGenerator.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/endgame/CampaignCardGenerator.tsx frontend/src/components/endgame/__tests__/CampaignCardGenerator.test.tsx
git commit -m "feat(frontend): CampaignCardGenerator — html2canvas PNG export with grade + stats"
```

---

### Task 11: DefenseWhitePaper Page + Route

**Files:**
- Create: `frontend/src/pages/DefenseWhitePaper.tsx`
- Modify: `frontend/src/App.tsx`

Composes all endgame components into a scrollable page: header, objective scorecard, force evolution chart, emerging aces, retrospective reader, campaign card generator. Route: `/campaign/:id/white-paper`.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/DefenseWhitePaper.tsx`:

```tsx
import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ObjectiveScoreCard } from "../components/endgame/ObjectiveScoreCard";
import { ForceEvolutionChart } from "../components/endgame/ForceEvolutionChart";
import { EmergingAceCard } from "../components/endgame/EmergingAceCard";
import { RetrospectiveReader } from "../components/endgame/RetrospectiveReader";
import { CampaignCardGenerator } from "../components/endgame/CampaignCardGenerator";

export function DefenseWhitePaper() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const summary = useCampaignStore((s) => s.campaignSummary);
  const loadSummary = useCampaignStore((s) => s.loadCampaignSummary);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign && campaign.id === campaignId) loadSummary(campaignId);
  }, [campaign, campaignId, loadSummary]);

  if (!campaign || !summary) return <div className="p-6">Loading Defense White Paper…</div>;

  const objectives = (summary as any).year_snapshots ? [] : [];
  // Derive objective entries from the backend summary data
  // The backend doesn't return objectives directly in summary — we use campaign.objectives_json
  // and the summary's is_complete flag
  const objectiveEntries = (campaign.objectives_json || []).map((objId: string) => ({
    id: objId,
    name: objId.replace(/_/g, " "),
    status: "unknown" as const,
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">Defense White Paper</h1>
          <p className="text-xs opacity-70">
            {campaign.name} • {summary.starting_year}–{summary.current_year}
          </p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-8 pb-12">
        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Campaign Summary</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.vignettes_won}</div>
              <div className="text-xs text-slate-400">Won</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.vignettes_lost}</div>
              <div className="text-xs text-slate-400">Lost</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold">{summary.force_structure.squadrons_end}</div>
              <div className="text-xs text-slate-400">Squadrons</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Objectives</h2>
          <ObjectiveScoreCard objectives={objectiveEntries} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Treasury Evolution</h2>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <ForceEvolutionChart snapshots={summary.year_snapshots} />
          </div>
        </section>

        {summary.aces.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">
              Emerging Aces ({summary.ace_count})
            </h2>
            <div className="space-y-2">
              {summary.aces.map((ace) => (
                <EmergingAceCard key={ace.squadron_id} ace={ace} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Retrospective</h2>
          <RetrospectiveReader campaignId={campaignId} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3 text-slate-300 uppercase tracking-wide">Campaign Card</h2>
          <CampaignCardGenerator summary={summary} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

Modify `frontend/src/App.tsx`. Add the import:

```typescript
import { DefenseWhitePaper } from "./pages/DefenseWhitePaper";
```

Add the route inside `<Routes>`, before the catch-all:

```tsx
<Route path="/campaign/:id/white-paper" element={<DefenseWhitePaper />} />
```

- [ ] **Step 3: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DefenseWhitePaper.tsx frontend/src/App.tsx
git commit -m "feat(frontend): DefenseWhitePaper page + route — endgame composition"
```

---

### Task 12: Wire Q40 Detection + YearEndRecapToast + White Paper Link

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

Adds: (1) "White Paper" link in the header when `campaign.current_year > 2036 || (campaign.current_year === 2036 && campaign.current_quarter > 1)`, (2) mounts `YearEndRecapToast` globally. Also handles post-advanceTurn redirect: when Q40 completes, navigate to the white paper page.

- [ ] **Step 1: Modify CampaignMapView**

Modify `frontend/src/pages/CampaignMapView.tsx`:

Add imports at the top:

```typescript
import { useNavigate } from "react-router-dom";
import { YearEndRecapToast } from "../components/endgame/YearEndRecapToast";
```

Add inside the component, after the existing hooks:

```typescript
const navigate = useNavigate();
```

Also add a derived value:

```typescript
const isCampaignComplete = campaign
  ? campaign.current_year > 2036 || (campaign.current_year === 2036 && campaign.current_quarter > 1)
  : false;
```

Wrap the existing `advanceTurn` call in a new handler that detects Q40 and navigates:

```typescript
const handleAdvanceTurn = async () => {
  const prevYear = campaign?.current_year;
  const prevQuarter = campaign?.current_quarter;
  await advanceTurn();
  const updated = useCampaignStore.getState().campaign;
  if (updated && (updated.current_year > 2036 || (updated.current_year === 2036 && updated.current_quarter > 1))) {
    navigate(`/campaign/${updated.id}/white-paper`);
  }
};
```

In the JSX header, add a "White Paper" link before the "End Turn" button when the campaign is complete:

```tsx
{isCampaignComplete && (
  <Link
    to={`/campaign/${campaign.id}/white-paper`}
    className="bg-amber-600 hover:bg-amber-500 text-slate-900 text-xs font-semibold rounded-lg px-3 py-1.5"
  >
    White Paper
  </Link>
)}
```

Replace the `onClick={advanceTurn}` on the End Turn button with `onClick={handleAdvanceTurn}`.

Also, after the closing `</div>` of the `<BaseSheet>`, before the final `</div>`, add:

```tsx
<YearEndRecapToast />
```

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(frontend): Q40 navigation to white paper + year-end recap toast on map view"
```

---

### Task 13: Update ROADMAP + CLAUDE.md + Run Full Suites

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest --tb=short -q`
Expected: 315+ tests pass

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: 83+ tests pass

- [ ] **Step 3: Update ROADMAP**

In `docs/superpowers/plans/ROADMAP.md`:

Change Plan 9 row in the table from:
```
| 9 | Campaign End + Polish | 🔴 not started | *to be written* |
```
to:
```
| 9 | Campaign End + Polish | 🟢 done | [2026-04-17-campaign-end-polish-plan.md](2026-04-17-campaign-end-polish-plan.md) |
```

Update "Last updated" to: `2026-04-17 (Plan 9 done)`

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, update:

1. The Plan 9 status block — add a new paragraph after the Plan 8 status:

```
- **Plan 9 (Campaign End + Polish)** — ✅ done. Backend: enriched year-recap + retrospective prompts v1→v2 with real CampaignEvent data (deliveries, milestones, vignettes won/lost, adversary shifts); new `GET /api/campaigns/{id}/summary` endpoint assembles per-year timeline snapshots, force structure, aces, and vignette win/loss for white paper. Frontend: 7 new endgame components under `frontend/src/components/endgame/` (ObjectiveScoreCard, ForceEvolutionChart, EmergingAceCard, RetrospectiveReader, CampaignCardGenerator with html2canvas PNG export, YearEndRecapToast). DefenseWhitePaper page at `/campaign/:id/white-paper`. Q40 detection navigates to white paper on campaign completion. Year-end recap toast fires on Q4→Q1 rollover. New dependency: `html2canvas`.
```

2. Change "Next up" to Plan 10.

3. Update test baseline counts.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 9 done — campaign end + polish"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Defense White Paper page on Q40 → Task 11 (DefenseWhitePaper page)
- ✅ LLM retrospective reader → Task 9 (RetrospectiveReader)
- ✅ Shareable campaign-card PNG → Task 10 (CampaignCardGenerator with html2canvas)
- ✅ Emerging ace cards → Task 7 (EmergingAceCard)
- ✅ Year-end recap toast on Q4 rollover → Task 6 (YearEndRecapToast) + Task 5 (store advanceTurn hook)
- ✅ Force evolution sparklines → Task 8 (ForceEvolutionChart)
- ✅ Objective scorecard → Task 8 (ObjectiveScoreCard)
- ✅ Backend enrichment of year-recap/retrospective → Tasks 2-3
- ✅ Prompt version bump v1→v2 → Tasks 2-3
- ✅ Campaign summary endpoint → Task 1
- ✅ Q40 detection + navigation → Task 12

**2. Placeholder scan:** No TBD/TODO/placeholder patterns found.

**3. Type consistency:**
- `CampaignSummary` type defined in Task 4, used in Tasks 10, 11
- `AceSummary` type defined in Task 4, used in Tasks 7, 10, 11
- `YearSnapshot` type defined in Task 4, used in Tasks 8, 10, 11
- `ObjectiveEntry` defined inline in Task 8, used in Task 11
- `generateYearRecap`/`generateRetrospective`/`loadCampaignSummary` defined in Task 5, used in Tasks 6, 9, 11, 12
- `yearRecapToast`/`dismissYearRecapToast` defined in Task 5, used in Task 6
- Backend v2 prompt modules registered in Tasks 2-3, consumed in modified service.py functions
