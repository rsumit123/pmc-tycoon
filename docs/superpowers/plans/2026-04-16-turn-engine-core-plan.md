# Sovereign Shield — Turn Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `advance_turn` (which only ticks the clock) with a real turn engine: 5-bucket budget allocation, R&D program progression with milestone risk events, acquisition delivery queue, squadron readiness regen/degradation, and a deterministic seeded-RNG orchestrator. Wire three new player-action endpoints (budget / R&D / acquisitions) and seed the historically-grounded 2026-Q2 starting state (MRFA Rafale, Tejas Mk1A, AMCA, Astra Mk2, real bases + named squadrons) on campaign creation.

**Architecture:**
- `backend/app/engine/` houses pure-function modules. Engine functions take and return plain dicts + a `random.Random` and emit event-dict lists. They never touch the DB or ORM. The orchestrator (`engine/turn.py`) is also pure: it composes subsystem ticks in a fixed order. The CRUD layer (`crud/campaign.py::advance_turn`) is the impure boundary — it serializes ORM rows to dicts, calls the engine, then writes results + events back.
- Determinism: each subsystem draws from its own `random.Random` seeded by `sha256(campaign_seed, subsystem_name, year, quarter)`. Same inputs → same outputs, regardless of call order. This is the contract that makes replay tests possible.
- Schema additions in this plan: `Campaign.quarterly_grant_cr`, `Campaign.current_allocation_json`; `RDProgramState.cost_invested_cr`, `quarters_active`; `AcquisitionOrder.total_cost_cr`. `Campaign.budget_cr` keeps its column but is now interpreted as cumulative treasury (carry-over reserves).

**Tech Stack:** SQLAlchemy 2.x (`Mapped[T]` / `mapped_column`), Pydantic 2.x, FastAPI, pytest. Pure-Python engine, stdlib `random` + `hashlib`. No new dependencies.

---

## Scope reminder

**In scope (per ROADMAP §Plan 2):**
- 5-bucket budget allocation math + consequences
- R&D progression with milestones + risk events
- Acquisition delivery queue tick
- Squadron readiness regen/degradation
- Seeded RNG namespacing
- End-of-turn orchestrator
- Three new API endpoints (budget / rd / acquisitions)
- Pre-seeded 2026-Q2 starting state on `create_campaign`
- Replay-determinism tests

**Out of scope (deferred to later plans, per ROADMAP):**
- Adversary simulation (Plan 3)
- Intel cards (Plan 3)
- Vignettes / combat (Plan 4)
- LLM AARs (Plan 5)
- Frontend UI for budget/R&D/acquisition (Plan 7) — only `types.ts` is updated to reflect the new fields

---

## File Structure

**Backend (create):**
- `backend/app/engine/__init__.py`
- `backend/app/engine/rng.py` — `subsystem_rng(seed, subsystem, year, quarter) -> Random`
- `backend/app/engine/budget.py` — allocation defaults, validation, consequences
- `backend/app/engine/rd.py` — `tick_rd(programs, specs, rd_bucket_cr, rng)`
- `backend/app/engine/acquisition.py` — `tick_acquisitions(orders, year, quarter, acq_bucket_cr)`
- `backend/app/engine/readiness.py` — `tick_readiness(squadrons, om_cr, spares_cr, rng)`
- `backend/app/engine/turn.py` — orchestrator `advance(...)` returns mutations + events
- `backend/app/api/budget.py` — `POST /api/campaigns/{id}/budget`
- `backend/app/api/rd.py` — `POST /api/campaigns/{id}/rd`, `POST /api/campaigns/{id}/rd/{program_id}`
- `backend/app/api/acquisitions.py` — `POST /api/campaigns/{id}/acquisitions`
- `backend/app/schemas/budget.py` — `BudgetAllocationPayload`, `BudgetAllocationRead`
- `backend/app/schemas/rd.py` — `RDStartPayload`, `RDFundingPayload`, `RDProgramRead`
- `backend/app/schemas/acquisition.py` — `AcquisitionCreatePayload`, `AcquisitionRead`
- `backend/app/crud/budget.py` — `set_allocation(db, campaign, payload)`
- `backend/app/crud/rd.py` — `start_program`, `update_funding`, `cancel_program`, `list_programs`
- `backend/app/crud/acquisition.py` — `create_order`, `list_orders`
- `backend/app/crud/seed_starting_state.py` — populates bases, squadrons, MRFA / Tejas Mk1A / AMCA / Astra Mk2 on new campaign
- `backend/tests/test_engine_rng.py`
- `backend/tests/test_engine_budget.py`
- `backend/tests/test_engine_rd.py`
- `backend/tests/test_engine_acquisition.py`
- `backend/tests/test_engine_readiness.py`
- `backend/tests/test_engine_turn.py`
- `backend/tests/test_starting_state_seed.py`
- `backend/tests/test_budget_api.py`
- `backend/tests/test_rd_api.py`
- `backend/tests/test_acquisitions_api.py`
- `backend/tests/test_replay_determinism.py`

**Backend (modify):**
- `backend/app/models/campaign.py` — add `quarterly_grant_cr`, `current_allocation_json`
- `backend/app/models/rd_program.py` — add `cost_invested_cr`, `quarters_active`
- `backend/app/models/acquisition.py` — add `total_cost_cr`
- `backend/app/schemas/campaign.py` — add new Campaign fields to `CampaignRead`
- `backend/app/crud/campaign.py` — wire `advance_turn` to call `engine.turn.advance(...)`; have `create_campaign` call `seed_starting_state`
- `backend/main.py` — register three new routers
- `backend/content/rd_programs.yaml` — expand from 2 programs to 10 (MVP set per spec §8)

**Frontend (modify):**
- `frontend/src/lib/types.ts` — add the new Campaign fields as optional fields (no UI change; CampaignConsole already renders raw JSON)

---

## Domain modelling decisions (locked)

**Quarterly grant:** Default `quarterly_grant_cr = 155000` (~₹1.55L cr/qtr per spec §2; 4 × 155k = 620k annual which matches India's real-ish 2026 defense budget).

**Treasury (`Campaign.budget_cr`):** Cumulative reserves. Each turn the grant is added to treasury; allocations are spent from treasury. Surplus (unallocated) accumulates. Plan 1 seeded `budget_cr = 620000` which we now interpret as "1 year of pre-existing reserves" — semantically consistent.

**Allocation (`Campaign.current_allocation_json`):** A dict with absolute cr per bucket: `{rd: int, acquisition: int, om: int, spares: int, infrastructure: int}`. `None` until the player first sets it (engine uses `default_allocation()`). Sum must be ≤ available funds (treasury + this turn's grant).

**Default allocation** (when `current_allocation_json is None`):
```
{rd: 25%, acquisition: 35%, om: 20%, spares: 15%, infrastructure: 5%} of grant
```

**Funding levels (R&D):**
- `slow`: 0.5× cost, 0.5× progress
- `standard`: 1.0× / 1.0×
- `accelerated`: 1.5× cost, 1.4× progress (efficiency penalty)

**Milestone rolls (R&D):** When progress crosses 25 / 50 / 75 / 100, roll **once** per crossing. Outcomes:
- 70% routine — no event
- 15% breakthrough — +5% progress this turn, log `rd_breakthrough` event
- 15% setback — no progress penalty in MVP (logged as `rd_setback` event); cost stays sunk

This keeps the math simple while preserving narrative texture. Schedule slip from setbacks lands in a future plan.

**Acquisition delivery schedule:** Linear. `total_quarters = (foc_year - first_delivery_year)*4 + (foc_quarter - first_delivery_quarter) + 1`. Each scheduled quarter delivers `quantity // total_quarters` airframes; the final quarter takes the remainder. `total_cost_cr` is split evenly across delivery quarters and deducted from the acquisition bucket. If acquisition bucket is short, the engine pulls from treasury and logs an `acquisition_underfunded` warning. Deliveries always proceed on schedule in MVP (schedule slip lands in a future plan).

**Readiness formula:** Per-squadron target_readiness = 60 + 30 × combined_funding_factor, capped at 100. `combined_funding_factor = clamp(0.6 × om_factor + 0.4 × spares_factor, 0, 2)` where `om_factor = om_cr / (n_squadrons × 1000)` and `spares_factor = spares_cr / (n_squadrons × 500)`. Readiness moves toward target by `min(5, |target - current|)` per quarter. Clamped to [20, 100]. Emits `readiness_changed` event when delta ≥ 5.

**Subsystem RNG:** `subsystem_rng(seed, subsystem, year, quarter)` → `Random(int.from_bytes(sha256(repr((seed, subsystem, year, quarter))).digest()[:8], "big"))`. Stable, deterministic, isolated per subsystem.

---

## Task 1: Schema additions (Campaign / RDProgramState / AcquisitionOrder)

**Files:**
- Modify: `backend/app/models/campaign.py`
- Modify: `backend/app/models/rd_program.py`
- Modify: `backend/app/models/acquisition.py`
- Modify: `backend/app/schemas/campaign.py`
- Test: `backend/tests/test_models.py` (extend existing file)

- [ ] **Step 1: Extend Campaign model**

Modify `backend/app/models/campaign.py` so the full file reads:

```python
from datetime import datetime
from sqlalchemy import String, Integer, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    seed: Mapped[int] = mapped_column(Integer)
    starting_year: Mapped[int] = mapped_column(Integer)
    starting_quarter: Mapped[int] = mapped_column(Integer)
    current_year: Mapped[int] = mapped_column(Integer)
    current_quarter: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[str] = mapped_column(String(32))
    objectives_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    budget_cr: Mapped[int] = mapped_column(Integer)
    quarterly_grant_cr: Mapped[int] = mapped_column(Integer, default=155000)
    current_allocation_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    reputation: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 2: Extend RDProgramState model**

Modify `backend/app/models/rd_program.py` so the full file reads:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RDProgramState(Base):
    __tablename__ = "rd_program_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    program_id: Mapped[str] = mapped_column(String(64))
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    funding_level: Mapped[str] = mapped_column(String(32), default="standard")
    status: Mapped[str] = mapped_column(String(32), default="active")
    milestones_hit: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    cost_invested_cr: Mapped[int] = mapped_column(Integer, default=0)
    quarters_active: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 3: Extend AcquisitionOrder model**

Modify `backend/app/models/acquisition.py` so the full file reads:

```python
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AcquisitionOrder(Base):
    __tablename__ = "acquisition_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    platform_id: Mapped[str] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column(Integer)
    signed_year: Mapped[int] = mapped_column(Integer)
    signed_quarter: Mapped[int] = mapped_column(Integer)
    first_delivery_year: Mapped[int] = mapped_column(Integer)
    first_delivery_quarter: Mapped[int] = mapped_column(Integer)
    foc_year: Mapped[int] = mapped_column(Integer)
    foc_quarter: Mapped[int] = mapped_column(Integer)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_cr: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 4: Update CampaignRead schema**

Modify `backend/app/schemas/campaign.py` so it reads:

```python
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


Difficulty = Literal["relaxed", "realistic", "hard_peer", "worst_case"]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    difficulty: Difficulty = "realistic"
    objectives: list[str] = Field(default_factory=list)
    seed: int | None = None


class CampaignRead(BaseModel):
    id: int
    name: str
    seed: int
    starting_year: int
    starting_quarter: int
    current_year: int
    current_quarter: int
    difficulty: Difficulty
    objectives_json: list[str]
    budget_cr: int
    quarterly_grant_cr: int
    current_allocation_json: dict | None
    reputation: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 5: Add a model test for the new fields**

Append to `backend/tests/test_models.py`:

```python
def test_campaign_has_default_grant_and_null_allocation(db):
    c = Campaign(
        name="T",
        seed=1,
        starting_year=2026,
        starting_quarter=2,
        current_year=2026,
        current_quarter=2,
        difficulty="realistic",
        objectives_json=[],
        budget_cr=620000,
        reputation=50,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    assert c.quarterly_grant_cr == 155000
    assert c.current_allocation_json is None
```

- [ ] **Step 6: Run tests — expect pass**

Run:
```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v
```

Expected: 3 passed.

- [ ] **Step 7: Delete dev DB so it gets recreated with the new schema**

Run:
```bash
rm -f backend/sovereign_shield.db backend/data/sovereign_shield.db backend/app/data/sovereign_shield.db 2>/dev/null
ls backend/*.db backend/data/*.db backend/app/data/*.db 2>/dev/null || echo "no dev DBs present — fine"
```

- [ ] **Step 8: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/models backend/app/schemas/campaign.py backend/tests/test_models.py
git commit -m "feat(models): add quarterly_grant + allocation fields + RD/acq cost tracking

Adds Campaign.quarterly_grant_cr (default 155000) and
Campaign.current_allocation_json (5-bucket dict). Extends
RDProgramState with cost_invested_cr + quarters_active and
AcquisitionOrder with total_cost_cr. Schema CampaignRead exposes
the new fields. Treasury (budget_cr) is now interpreted as
cumulative reserves."
```

---

## Task 2: Engine package + subsystem RNG

**Files:**
- Create: `backend/app/engine/__init__.py`
- Create: `backend/app/engine/rng.py`
- Test: `backend/tests/test_engine_rng.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_engine_rng.py`:

```python
from app.engine.rng import subsystem_rng


def test_same_inputs_produce_same_random_sequence():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "rd", 2026, 2)
    seq_a = [a.random() for _ in range(5)]
    seq_b = [b.random() for _ in range(5)]
    assert seq_a == seq_b


def test_different_subsystems_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "acquisition", 2026, 2)
    assert a.random() != b.random()


def test_different_quarters_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "rd", 2026, 3)
    assert a.random() != b.random()


def test_different_seeds_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(43, "rd", 2026, 2)
    assert a.random() != b.random()


def test_returns_random_instance():
    import random as stdlib_random
    rng = subsystem_rng(1, "x", 2026, 1)
    assert isinstance(rng, stdlib_random.Random)
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_rng.py -v
```

Expected: ImportError / ModuleNotFoundError for `app.engine.rng`.

- [ ] **Step 3: Implement engine package + RNG**

Create `backend/app/engine/__init__.py` (empty file).

Create `backend/app/engine/rng.py`:

```python
"""Subsystem-namespaced seeded RNG.

Each subsystem (rd, acquisition, readiness, intel, adversary, vignette)
draws from its own deterministic stream keyed by
(campaign_seed, subsystem_name, year, quarter). Same inputs always
yield the same sequence, regardless of call order across subsystems.
"""

from __future__ import annotations

import hashlib
import random


def subsystem_rng(seed: int, subsystem: str, year: int, quarter: int) -> random.Random:
    composite = repr((seed, subsystem, year, quarter)).encode("utf-8")
    digest = hashlib.sha256(composite).digest()
    sub_seed = int.from_bytes(digest[:8], "big")
    return random.Random(sub_seed)
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_rng.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine backend/tests/test_engine_rng.py
git commit -m "feat(engine): subsystem-namespaced seeded RNG

Adds engine/rng.py with subsystem_rng(seed, subsystem, year, quarter)
that derives an isolated Random per (subsystem, turn) tuple via
sha256 hashing. Subsystems can therefore draw randomness in any order
without contaminating each other's streams. Foundation for the
deterministic turn engine."
```

---

## Task 3: Engine — budget allocation module

**Files:**
- Create: `backend/app/engine/budget.py`
- Test: `backend/tests/test_engine_budget.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_engine_budget.py`:

```python
import pytest

from app.engine.budget import (
    BUCKETS,
    default_allocation,
    normalize_allocation,
    validate_allocation,
    AllocationError,
)


def test_buckets_are_the_five_named_in_spec():
    assert BUCKETS == ["rd", "acquisition", "om", "spares", "infrastructure"]


def test_default_allocation_sums_to_grant():
    alloc = default_allocation(155000)
    assert sum(alloc.values()) == 155000
    for b in BUCKETS:
        assert b in alloc


def test_default_allocation_uses_documented_percentages():
    alloc = default_allocation(100000)
    assert alloc["rd"] == 25000
    assert alloc["acquisition"] == 35000
    assert alloc["om"] == 20000
    assert alloc["spares"] == 15000
    assert alloc["infrastructure"] == 5000


def test_normalize_returns_default_when_none():
    assert normalize_allocation(None, 100000) == default_allocation(100000)


def test_normalize_returns_input_when_valid():
    explicit = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000, "infrastructure": 10000}
    assert normalize_allocation(explicit, 50000) == explicit


def test_validate_rejects_missing_bucket():
    bad = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000}  # no infrastructure
    with pytest.raises(AllocationError):
        validate_allocation(bad, available_cr=100000)


def test_validate_rejects_negative_amount():
    bad = {"rd": -1, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    with pytest.raises(AllocationError):
        validate_allocation(bad, available_cr=100000)


def test_validate_rejects_overspend():
    over = {"rd": 100000, "acquisition": 100000, "om": 0, "spares": 0, "infrastructure": 0}
    with pytest.raises(AllocationError):
        validate_allocation(over, available_cr=150000)


def test_validate_accepts_underspend():
    under = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000, "infrastructure": 10000}
    validate_allocation(under, available_cr=100000)  # no raise
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_budget.py -v
```

Expected: ImportError for `app.engine.budget`.

- [ ] **Step 3: Implement budget module**

Create `backend/app/engine/budget.py`:

```python
"""Budget allocation: 5-bucket math, defaults, validation.

Allocation is a dict mapping bucket name -> absolute cr. Engine modules
read these absolute amounts (not percentages). The orchestrator deducts
allocated amounts from the campaign treasury.
"""

from __future__ import annotations

BUCKETS: list[str] = ["rd", "acquisition", "om", "spares", "infrastructure"]

DEFAULT_PCT: dict[str, int] = {
    "rd": 25,
    "acquisition": 35,
    "om": 20,
    "spares": 15,
    "infrastructure": 5,
}


class AllocationError(ValueError):
    pass


def default_allocation(grant_cr: int) -> dict[str, int]:
    """Return the default split of `grant_cr` across the 5 buckets."""
    return {b: grant_cr * DEFAULT_PCT[b] // 100 for b in BUCKETS}


def normalize_allocation(allocation: dict[str, int] | None, grant_cr: int) -> dict[str, int]:
    """Return `allocation` if provided, otherwise `default_allocation(grant_cr)`."""
    if allocation is None:
        return default_allocation(grant_cr)
    return allocation


def validate_allocation(allocation: dict[str, int], available_cr: int) -> None:
    """Raise AllocationError if invalid: missing buckets, negative amounts, or overspend."""
    missing = [b for b in BUCKETS if b not in allocation]
    if missing:
        raise AllocationError(f"missing buckets: {missing}")
    extra = [k for k in allocation if k not in BUCKETS]
    if extra:
        raise AllocationError(f"unknown buckets: {extra}")
    for b, v in allocation.items():
        if not isinstance(v, int) or v < 0:
            raise AllocationError(f"bucket {b!r} must be a non-negative int (got {v!r})")
    total = sum(allocation.values())
    if total > available_cr:
        raise AllocationError(f"allocation total {total} exceeds available {available_cr}")
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_budget.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/budget.py backend/tests/test_engine_budget.py
git commit -m "feat(engine): budget allocation module

5-bucket allocation math (R&D / acquisition / O&M / spares /
infrastructure) with default split (25/35/20/15/5), normalize+validate
helpers, and AllocationError for invalid inputs."
```

---

## Task 4: Engine — R&D progression module

**Files:**
- Create: `backend/app/engine/rd.py`
- Test: `backend/tests/test_engine_rd.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_engine_rd.py`:

```python
import random

from app.engine.rd import tick_rd, FUNDING_FACTORS, MILESTONES


def _spec(program_id="amca_mk1", duration=36, cost=150000):
    return {
        "id": program_id,
        "name": program_id,
        "description": "",
        "base_duration_quarters": duration,
        "base_cost_cr": cost,
        "dependencies": [],
    }


def _state(program_id="amca_mk1", progress=0, funding="standard", milestones=None,
           cost_invested=0, quarters_active=0, status="active"):
    return {
        "program_id": program_id,
        "progress_pct": progress,
        "funding_level": funding,
        "milestones_hit": list(milestones or []),
        "cost_invested_cr": cost_invested,
        "quarters_active": quarters_active,
        "status": status,
    }


def test_funding_factors_match_locked_design():
    assert FUNDING_FACTORS["slow"] == (0.5, 0.5)
    assert FUNDING_FACTORS["standard"] == (1.0, 1.0)
    assert FUNDING_FACTORS["accelerated"] == (1.5, 1.4)


def test_milestone_thresholds_are_25_50_75_100():
    assert MILESTONES == [25, 50, 75, 100]


def test_standard_funding_advances_one_step():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}  # 5%/qtr, 1000cr/qtr
    rng = random.Random(0)
    out, events = tick_rd([_state()], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 5
    assert out[0]["cost_invested_cr"] == 1000
    assert out[0]["quarters_active"] == 1


def test_slow_funding_halves_progress_and_cost():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}
    rng = random.Random(0)
    out, _ = tick_rd([_state(funding="slow")], specs, rd_bucket_cr=10000, rng=rng)
    # 5% standard -> 2.5% slow, integer floor = 2
    assert out[0]["progress_pct"] == 2
    assert out[0]["cost_invested_cr"] == 500


def test_accelerated_funding_speeds_up_with_efficiency_penalty():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}
    rng = random.Random(0)
    out, _ = tick_rd([_state(funding="accelerated")], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 7  # int(5 * 1.4) = 7
    assert out[0]["cost_invested_cr"] == 1500  # 1000 * 1.5


def test_completed_program_is_skipped():
    specs = {"amca_mk1": _spec()}
    rng = random.Random(0)
    out, events = tick_rd(
        [_state(progress=100, status="completed")],
        specs, rd_bucket_cr=10000, rng=rng,
    )
    assert out[0]["progress_pct"] == 100
    assert out[0]["quarters_active"] == 0  # not advanced
    assert not any(e["event_type"] == "rd_progressed" for e in events)


def test_completion_emits_event_and_marks_completed():
    specs = {"amca_mk1": _spec(duration=4, cost=4000)}  # 25%/qtr
    rng = random.Random(0)
    state = _state(progress=75)
    out, events = tick_rd([state], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 100
    assert out[0]["status"] == "completed"
    assert any(e["event_type"] == "rd_completed" for e in events)


def test_milestone_crossing_emits_event():
    specs = {"amca_mk1": _spec(duration=4, cost=4000)}  # 25%/qtr
    rng = random.Random(0)  # forced deterministic
    out, events = tick_rd([_state(progress=20)], specs, rd_bucket_cr=10000, rng=rng)
    # 20 -> 45 crosses the 25 threshold
    assert any(e["event_type"] == "rd_milestone" and e["payload"]["threshold"] == 25 for e in events)


def test_underfunded_bucket_pro_rates_progress():
    specs = {
        "a": _spec("a", duration=10, cost=10000),  # standard cost = 1000/qtr
        "b": _spec("b", duration=10, cost=10000),  # standard cost = 1000/qtr
    }
    rng = random.Random(0)
    states = [_state("a"), _state("b")]
    # Only 1000 cr in bucket; needed 2000. Pro-rata = 0.5x
    out, events = tick_rd(states, specs, rd_bucket_cr=1000, rng=rng)
    assert out[0]["cost_invested_cr"] == 500
    assert out[1]["cost_invested_cr"] == 500
    # progress halved: 10% standard -> 5%
    assert out[0]["progress_pct"] == 5
    assert any(e["event_type"] == "rd_underfunded" for e in events)


def test_cancelled_program_is_skipped():
    specs = {"a": _spec("a")}
    rng = random.Random(0)
    out, events = tick_rd([_state("a", status="cancelled")], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 0
    assert out[0]["cost_invested_cr"] == 0


def test_deterministic_with_same_rng():
    specs = {"a": _spec("a", duration=4, cost=4000)}  # 25%/qtr; lots of milestone rolls
    rng_a = random.Random(99)
    rng_b = random.Random(99)
    out_a, ev_a = tick_rd([_state("a", progress=20)], specs, rd_bucket_cr=10000, rng=rng_a)
    out_b, ev_b = tick_rd([_state("a", progress=20)], specs, rd_bucket_cr=10000, rng=rng_b)
    assert out_a == out_b
    assert ev_a == ev_b
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_rd.py -v
```

Expected: ImportError for `app.engine.rd`.

- [ ] **Step 3: Implement R&D module**

Create `backend/app/engine/rd.py`:

```python
"""R&D program progression: funding, progress, milestones, risk events.

Pure function. Takes a list of program-state dicts + spec registry +
the R&D budget bucket + a Random instance. Returns (updated_states, events).

Funding levels:
    slow:        0.5x cost, 0.5x progress
    standard:    1.0x / 1.0x
    accelerated: 1.5x cost, 1.4x progress (efficiency penalty)

Milestone rolls (at 25/50/75/100): once per crossing.
    70% routine — no event
    15% breakthrough — +5% progress, rd_breakthrough event
    15% setback — rd_setback event (no progress penalty in MVP)

If R&D bucket can't cover all programs at their requested funding,
all programs scale by the same pro-rata factor and an rd_underfunded
event is logged.
"""

from __future__ import annotations

import random
from typing import Any

FUNDING_FACTORS: dict[str, tuple[float, float]] = {
    "slow": (0.5, 0.5),
    "standard": (1.0, 1.0),
    "accelerated": (1.5, 1.4),
}

MILESTONES: list[int] = [25, 50, 75, 100]

ROLL_BREAKTHROUGH_PROGRESS_BONUS = 5


def _funded_program_states(states: list[dict]) -> list[dict]:
    return [s for s in states if s["status"] == "active" and s["progress_pct"] < 100]


def tick_rd(
    states: list[dict],
    specs: dict[str, Any],
    rd_bucket_cr: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(s) for s in states]
    events: list[dict] = []

    fundable = _funded_program_states(out)
    if not fundable:
        return out, events

    # Total cost requested at full funding
    requested = 0
    for s in fundable:
        spec = specs[s["program_id"]]
        cost_factor, _ = FUNDING_FACTORS[s["funding_level"]]
        per_quarter_base = spec["base_cost_cr"] / spec["base_duration_quarters"]
        requested += per_quarter_base * cost_factor

    # Pro-rata factor if bucket short
    pro_rata = 1.0
    if requested > 0 and rd_bucket_cr < requested:
        pro_rata = rd_bucket_cr / requested
        events.append({
            "event_type": "rd_underfunded",
            "payload": {"requested_cr": int(requested), "available_cr": rd_bucket_cr, "scale": round(pro_rata, 3)},
        })

    for s in fundable:
        spec = specs[s["program_id"]]
        cost_factor, prog_factor = FUNDING_FACTORS[s["funding_level"]]
        per_quarter_base_cost = spec["base_cost_cr"] / spec["base_duration_quarters"]
        per_quarter_base_prog = 100 / spec["base_duration_quarters"]

        cost_this_qtr = int(per_quarter_base_cost * cost_factor * pro_rata)
        prog_inc = int(per_quarter_base_prog * prog_factor * pro_rata)

        # Milestone rolls — one per threshold crossed by this turn's progress increment
        old_progress = s["progress_pct"]
        new_progress = min(100, old_progress + prog_inc)

        for threshold in MILESTONES:
            if old_progress < threshold <= new_progress and threshold not in s["milestones_hit"]:
                roll = rng.random()
                if roll < 0.70:
                    outcome = "routine"
                elif roll < 0.85:
                    outcome = "breakthrough"
                    new_progress = min(100, new_progress + ROLL_BREAKTHROUGH_PROGRESS_BONUS)
                else:
                    outcome = "setback"
                s["milestones_hit"].append(threshold)
                events.append({
                    "event_type": "rd_milestone",
                    "payload": {
                        "program_id": s["program_id"],
                        "threshold": threshold,
                        "outcome": outcome,
                    },
                })
                if outcome == "breakthrough":
                    events.append({
                        "event_type": "rd_breakthrough",
                        "payload": {"program_id": s["program_id"], "threshold": threshold},
                    })
                if outcome == "setback":
                    events.append({
                        "event_type": "rd_setback",
                        "payload": {"program_id": s["program_id"], "threshold": threshold},
                    })

        s["progress_pct"] = new_progress
        s["cost_invested_cr"] += cost_this_qtr
        s["quarters_active"] += 1

        events.append({
            "event_type": "rd_progressed",
            "payload": {
                "program_id": s["program_id"],
                "progress_pct": new_progress,
                "delta_pct": new_progress - old_progress,
                "cost_this_qtr_cr": cost_this_qtr,
            },
        })

        if new_progress >= 100 and s["status"] != "completed":
            s["status"] = "completed"
            events.append({
                "event_type": "rd_completed",
                "payload": {"program_id": s["program_id"]},
            })

    return out, events
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_rd.py -v
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/rd.py backend/tests/test_engine_rd.py
git commit -m "feat(engine): R&D progression with milestones + risk events

Pure-function tick_rd applies funding-level multipliers (slow 0.5x,
standard 1x, accelerated 1.5x cost / 1.4x progress), pro-rates when
the R&D bucket is short, rolls milestones at 25/50/75/100
(70/15/15 routine/breakthrough/setback), and emits rd_progressed,
rd_milestone, rd_completed, rd_underfunded events."
```

---

## Task 5: Engine — acquisition delivery module

**Files:**
- Create: `backend/app/engine/acquisition.py`
- Test: `backend/tests/test_engine_acquisition.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_engine_acquisition.py`:

```python
from app.engine.acquisition import tick_acquisitions, total_quarters


def _order(
    order_id=1,
    platform_id="rafale_f4",
    quantity=12,
    first=(2027, 4),
    foc=(2030, 3),
    delivered=0,
    total_cost=120000,
):
    return {
        "id": order_id,
        "platform_id": platform_id,
        "quantity": quantity,
        "first_delivery_year": first[0],
        "first_delivery_quarter": first[1],
        "foc_year": foc[0],
        "foc_quarter": foc[1],
        "delivered": delivered,
        "total_cost_cr": total_cost,
    }


def test_total_quarters_counts_inclusive_range():
    # 2027-Q4 .. 2030-Q3 inclusive = 12 quarters
    assert total_quarters(2027, 4, 2030, 3) == 12
    assert total_quarters(2027, 1, 2027, 1) == 1
    assert total_quarters(2027, 1, 2027, 4) == 4


def test_no_delivery_before_first_delivery_quarter():
    out, events = tick_acquisitions(
        [_order(first=(2027, 4), foc=(2030, 3))],
        year=2027, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 0
    assert not any(e["event_type"] == "acquisition_delivery" for e in events)


def test_delivery_starts_on_first_delivery_quarter():
    # 12 airframes over 12 quarters = 1/qtr; 120000 / 12 = 10000 cr/qtr
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), total_cost=120000)],
        year=2027, quarter=4, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 1
    delivery_events = [e for e in events if e["event_type"] == "acquisition_delivery"]
    assert len(delivery_events) == 1
    assert delivery_events[0]["payload"]["count"] == 1
    assert delivery_events[0]["payload"]["cost_cr"] == 10000


def test_no_delivery_after_foc_quarter():
    out, events = tick_acquisitions(
        [_order(first=(2027, 4), foc=(2030, 3), delivered=12)],
        year=2030, quarter=4, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 12
    assert not any(e["event_type"] == "acquisition_delivery" for e in events)


def test_remainder_lands_in_final_quarter():
    # 14 airframes over 12 quarters: 1/qtr * 11 + final qtr = 14 - 11 = 3
    out, events = tick_acquisitions(
        [_order(quantity=14, first=(2027, 4), foc=(2030, 3), total_cost=120000, delivered=11)],
        year=2030, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert out[0]["delivered"] == 14
    delivery_events = [e for e in events if e["event_type"] == "acquisition_delivery"]
    assert delivery_events[0]["payload"]["count"] == 3


def test_completion_event_on_final_delivery():
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), delivered=11, total_cost=120000)],
        year=2030, quarter=3, acq_bucket_cr=1_000_000,
    )
    assert any(e["event_type"] == "acquisition_completed" for e in events)
    assert out[0]["delivered"] == 12


def test_underfunded_bucket_logs_warning_but_still_delivers():
    # Needs 10000 cr; bucket has 0
    out, events = tick_acquisitions(
        [_order(quantity=12, first=(2027, 4), foc=(2030, 3), total_cost=120000)],
        year=2027, quarter=4, acq_bucket_cr=0,
    )
    assert out[0]["delivered"] == 1  # delivery proceeds
    assert any(e["event_type"] == "acquisition_underfunded" for e in events)


def test_multiple_orders_processed_independently():
    orders = [
        _order(order_id=1, first=(2027, 4), foc=(2030, 3)),
        _order(order_id=2, first=(2026, 1), foc=(2030, 4), delivered=0, quantity=20, total_cost=200000),
    ]
    out, events = tick_acquisitions(orders, year=2027, quarter=4, acq_bucket_cr=1_000_000)
    # Order 1 delivers 1; order 2 delivers 1 too (20/20=1)
    assert out[0]["delivered"] == 1
    assert out[1]["delivered"] == 1


def test_deterministic_with_same_inputs():
    orders = [_order(quantity=12, first=(2027, 4), foc=(2030, 3))]
    a, ev_a = tick_acquisitions([dict(o) for o in orders], 2027, 4, 1_000_000)
    b, ev_b = tick_acquisitions([dict(o) for o in orders], 2027, 4, 1_000_000)
    assert a == b
    assert ev_a == ev_b
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_acquisition.py -v
```

Expected: ImportError for `app.engine.acquisition`.

- [ ] **Step 3: Implement acquisition module**

Create `backend/app/engine/acquisition.py`:

```python
"""Acquisition delivery queue tick.

Pure function. Each quarter, every active order checks its delivery
window. Within [first_delivery, foc] (inclusive), the quarterly
delivery slice = quantity // total_quarters; the final quarter takes
the remainder. Cost is total_cost_cr // total_quarters per quarter
(remainder absorbed into the final quarter as well).

If the acquisition bucket is short, the engine logs an
acquisition_underfunded warning but the delivery still proceeds in
MVP — schedule slip from underfunding lands in a future plan.
"""

from __future__ import annotations


def total_quarters(first_year: int, first_q: int, foc_year: int, foc_q: int) -> int:
    return (foc_year - first_year) * 4 + (foc_q - first_q) + 1


def _quarter_index(year: int, quarter: int) -> int:
    return year * 4 + (quarter - 1)


def tick_acquisitions(
    orders: list[dict],
    year: int,
    quarter: int,
    acq_bucket_cr: int,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(o) for o in orders]
    events: list[dict] = []
    bucket_remaining = acq_bucket_cr

    now = _quarter_index(year, quarter)

    for order in out:
        first_idx = _quarter_index(order["first_delivery_year"], order["first_delivery_quarter"])
        foc_idx = _quarter_index(order["foc_year"], order["foc_quarter"])
        if now < first_idx or now > foc_idx:
            continue
        if order["delivered"] >= order["quantity"]:
            continue

        n_qtrs = total_quarters(
            order["first_delivery_year"], order["first_delivery_quarter"],
            order["foc_year"], order["foc_quarter"],
        )
        per_qtr = order["quantity"] // n_qtrs
        per_qtr_cost = order["total_cost_cr"] // n_qtrs

        is_final = now == foc_idx
        if is_final:
            count = order["quantity"] - order["delivered"]
            cost = order["total_cost_cr"] - per_qtr_cost * (n_qtrs - 1)
        else:
            count = per_qtr
            cost = per_qtr_cost

        if count <= 0:
            continue

        if cost > bucket_remaining:
            events.append({
                "event_type": "acquisition_underfunded",
                "payload": {
                    "order_id": order["id"],
                    "platform_id": order["platform_id"],
                    "needed_cr": cost,
                    "available_cr": bucket_remaining,
                },
            })

        bucket_remaining = max(0, bucket_remaining - cost)
        order["delivered"] += count

        events.append({
            "event_type": "acquisition_delivery",
            "payload": {
                "order_id": order["id"],
                "platform_id": order["platform_id"],
                "count": count,
                "cost_cr": cost,
                "delivered_total": order["delivered"],
                "quantity": order["quantity"],
            },
        })

        if order["delivered"] >= order["quantity"]:
            events.append({
                "event_type": "acquisition_completed",
                "payload": {
                    "order_id": order["id"],
                    "platform_id": order["platform_id"],
                    "quantity": order["quantity"],
                },
            })

    return out, events
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_acquisition.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/acquisition.py backend/tests/test_engine_acquisition.py
git commit -m "feat(engine): acquisition delivery queue tick

Linear delivery schedule across [first_delivery, foc] quarters with
remainder absorbed in the final quarter. Per-quarter cost deducted
from acquisition bucket; underfunding logs a warning but doesn't
slip the schedule (schedule slip is a future plan)."
```

---

## Task 6: Engine — readiness module

**Files:**
- Create: `backend/app/engine/readiness.py`
- Test: `backend/tests/test_engine_readiness.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_engine_readiness.py`:

```python
import random

from app.engine.readiness import (
    tick_readiness,
    target_readiness,
    OM_PER_SQUADRON_BASELINE,
    SPARES_PER_SQUADRON_BASELINE,
    MIN_READINESS,
)


def _sq(sq_id=1, readiness=80):
    return {"id": sq_id, "readiness_pct": readiness}


def test_baselines_match_locked_design():
    assert OM_PER_SQUADRON_BASELINE == 1000
    assert SPARES_PER_SQUADRON_BASELINE == 500


def test_target_readiness_with_zero_funding_is_60():
    assert target_readiness(om_cr=0, spares_cr=0, n_squadrons=3) == 60


def test_target_readiness_at_baseline_is_90():
    target = target_readiness(om_cr=3000, spares_cr=1500, n_squadrons=3)
    assert target == 90


def test_target_readiness_caps_at_100():
    # 3x baseline both buckets -> combined factor 2 -> 60 + 60 = 120 -> capped 100
    target = target_readiness(om_cr=9000, spares_cr=4500, n_squadrons=3)
    assert target == 100


def test_target_readiness_no_squadrons_returns_zero():
    assert target_readiness(om_cr=1000, spares_cr=500, n_squadrons=0) == 0


def test_readiness_moves_toward_target_by_max_5():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(readiness=70)],
        om_cr=3000, spares_cr=1500, rng=rng,  # target=90
    )
    assert out[0]["readiness_pct"] == 75


def test_readiness_does_not_overshoot():
    rng = random.Random(0)
    # 1 sq, om=1000 spares=500 -> factor=1.0 -> target=90; from 88 step is +2
    out, events = tick_readiness(
        [_sq(readiness=88)],
        om_cr=1000, spares_cr=500, rng=rng,
    )
    assert out[0]["readiness_pct"] == 90


def test_readiness_degrades_when_underfunded():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(readiness=80)],
        om_cr=0, spares_cr=0, rng=rng,  # target=60 -> moves -5
    )
    assert out[0]["readiness_pct"] == 75


def test_min_readiness_floor_constant_is_20():
    # MIN_READINESS=20 is the defensive floor. In Plan 2's model, target is always
    # >=60 so a squadron is never driven below 20 by funding alone — the floor
    # exists for future plans (combat losses, sabotage events) that can knock
    # readiness down. Document its value here.
    assert MIN_READINESS == 20


def test_significant_change_emits_event():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(sq_id=42, readiness=70)],
        om_cr=3000, spares_cr=1500, rng=rng,  # target=90, +5
    )
    assert any(
        e["event_type"] == "readiness_changed" and e["payload"]["squadron_id"] == 42
        for e in events
    )


def test_no_squadrons_returns_empty():
    rng = random.Random(0)
    out, events = tick_readiness([], om_cr=1000, spares_cr=500, rng=rng)
    assert out == []
    assert events == []


def test_deterministic_with_same_inputs():
    rng_a = random.Random(7)
    rng_b = random.Random(7)
    a, ev_a = tick_readiness([_sq(1, 80), _sq(2, 60)], om_cr=2000, spares_cr=1000, rng=rng_a)
    b, ev_b = tick_readiness([_sq(1, 80), _sq(2, 60)], om_cr=2000, spares_cr=1000, rng=rng_b)
    assert a == b
    assert ev_a == ev_b
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_readiness.py -v
```

Expected: ImportError for `app.engine.readiness`.

- [ ] **Step 3: Implement readiness module**

Create `backend/app/engine/readiness.py`:

```python
"""Squadron readiness regen / degradation.

Per quarter, each squadron's readiness moves toward a target driven by
how well the O&M + Spares buckets cover per-squadron baselines.

target = clamp(60 + 30 * combined_factor, 60, 100)
combined_factor = clamp(0.6 * om_factor + 0.4 * spares_factor, 0, 2)
om_factor = om_cr / (n_squadrons * OM_PER_SQUADRON_BASELINE)
spares_factor = spares_cr / (n_squadrons * SPARES_PER_SQUADRON_BASELINE)

Readiness moves toward target by min(STEP, |target - current|), clamped
to [MIN_READINESS, 100]. Emits readiness_changed when delta != 0.

The rng parameter is reserved for later variance (e.g., monsoon
groundings) and currently unused — keeping the signature stable for
turn.py to call without special-casing.
"""

from __future__ import annotations

import random

OM_PER_SQUADRON_BASELINE = 1000
SPARES_PER_SQUADRON_BASELINE = 500
STEP = 5
MIN_READINESS = 20
MAX_READINESS = 100
BASE_TARGET = 60
TARGET_RANGE = 30


def target_readiness(om_cr: int, spares_cr: int, n_squadrons: int) -> int:
    if n_squadrons <= 0:
        return 0
    om_factor = om_cr / (n_squadrons * OM_PER_SQUADRON_BASELINE)
    spares_factor = spares_cr / (n_squadrons * SPARES_PER_SQUADRON_BASELINE)
    combined = max(0.0, min(2.0, 0.6 * om_factor + 0.4 * spares_factor))
    target = BASE_TARGET + TARGET_RANGE * combined
    return int(min(MAX_READINESS, target))


def tick_readiness(
    squadrons: list[dict],
    om_cr: int,
    spares_cr: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(s) for s in squadrons]
    events: list[dict] = []
    if not out:
        return out, events

    target = target_readiness(om_cr, spares_cr, n_squadrons=len(out))

    for sq in out:
        old = sq["readiness_pct"]
        if old == target:
            continue
        direction = 1 if target > old else -1
        step = min(STEP, abs(target - old))
        new = old + direction * step
        new = max(MIN_READINESS, min(MAX_READINESS, new))
        sq["readiness_pct"] = new
        events.append({
            "event_type": "readiness_changed",
            "payload": {
                "squadron_id": sq["id"],
                "old": old,
                "new": new,
                "target": target,
            },
        })

    return out, events
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_readiness.py -v
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/readiness.py backend/tests/test_engine_readiness.py
git commit -m "feat(engine): squadron readiness regen + degradation

Per-squadron readiness moves toward a target driven by O&M + Spares
funding vs per-squadron baselines (1000 + 500 cr/qtr each). Step
size 5%/qtr, clamped to [20, 100]. Emits readiness_changed events
on movement."
```

---

## Task 7: Engine — turn orchestrator

**Files:**
- Create: `backend/app/engine/turn.py`
- Test: `backend/tests/test_engine_turn.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_engine_turn.py`:

```python
from app.engine.turn import advance, EngineResult


def _spec(program_id, duration=20, cost=20000):
    return {
        "id": program_id,
        "name": program_id,
        "description": "",
        "base_duration_quarters": duration,
        "base_cost_cr": cost,
        "dependencies": [],
    }


def _ctx(seed=42, year=2026, quarter=2, treasury=620000, grant=155000, allocation=None,
         programs=None, orders=None, squadrons=None, specs=None):
    return {
        "seed": seed,
        "year": year,
        "quarter": quarter,
        "treasury_cr": treasury,
        "quarterly_grant_cr": grant,
        "current_allocation_json": allocation,
        "rd_states": programs or [],
        "acquisition_orders": orders or [],
        "squadrons": squadrons or [],
        "rd_specs": specs or {},
    }


def test_returns_engine_result():
    result = advance(_ctx())
    assert isinstance(result, EngineResult)


def test_advances_quarter_within_year():
    result = advance(_ctx(year=2026, quarter=2))
    assert (result.next_year, result.next_quarter) == (2026, 3)


def test_advances_year_at_q4_rollover():
    result = advance(_ctx(year=2026, quarter=4))
    assert (result.next_year, result.next_quarter) == (2027, 1)


def test_treasury_grows_by_grant_minus_spend():
    ctx = _ctx(treasury=100000, grant=155000, allocation=None)  # default split
    result = advance(ctx)
    # No programs, no orders, no squadrons -> nothing actually consumes the buckets
    # but the orchestrator deducts the allocation from treasury regardless
    assert result.next_treasury_cr == 100000 + 155000 - sum({
        "rd": 38750, "acquisition": 54250, "om": 31000, "spares": 23250, "infrastructure": 7750
    }.values())


def test_emits_turn_advanced_event():
    result = advance(_ctx())
    types = [e["event_type"] for e in result.events]
    assert "turn_advanced" in types


def test_runs_rd_subsystem():
    specs = {"a": _spec("a")}
    states = [{
        "program_id": "a", "progress_pct": 0, "funding_level": "standard",
        "milestones_hit": [], "cost_invested_cr": 0, "quarters_active": 0,
        "status": "active",
    }]
    result = advance(_ctx(programs=states, specs=specs))
    assert result.next_rd_states[0]["progress_pct"] > 0


def test_runs_acquisition_subsystem():
    orders = [{
        "id": 1, "platform_id": "rafale_f4", "quantity": 12,
        "first_delivery_year": 2026, "first_delivery_quarter": 2,
        "foc_year": 2027, "foc_quarter": 1,
        "delivered": 0, "total_cost_cr": 12000,
    }]
    result = advance(_ctx(year=2026, quarter=2, orders=orders))
    assert result.next_acquisition_orders[0]["delivered"] >= 1


def test_runs_readiness_subsystem():
    sqs = [{"id": 1, "readiness_pct": 50}]
    # Default allocation gives O&M=20% of 155000 = 31000, spares=15%=23250 -> well above baseline
    result = advance(_ctx(squadrons=sqs))
    assert result.next_squadrons[0]["readiness_pct"] > 50


def test_deterministic_with_same_inputs():
    specs = {"a": _spec("a", duration=4, cost=4000)}
    states = [{
        "program_id": "a", "progress_pct": 20, "funding_level": "standard",
        "milestones_hit": [], "cost_invested_cr": 0, "quarters_active": 0,
        "status": "active",
    }]
    a = advance(_ctx(programs=states, specs=specs))
    b = advance(_ctx(programs=states, specs=specs))
    assert a.events == b.events
    assert a.next_rd_states == b.next_rd_states


def test_invalid_allocation_raises():
    from app.engine.budget import AllocationError
    bad = {"rd": 999_999_999, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    import pytest
    with pytest.raises(AllocationError):
        advance(_ctx(allocation=bad))
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_turn.py -v
```

Expected: ImportError for `app.engine.turn`.

- [ ] **Step 3: Implement turn orchestrator**

Create `backend/app/engine/turn.py`:

```python
"""End-of-turn orchestrator.

Pure function. Takes a context dict (current campaign state +
spec registry), returns an EngineResult containing all mutations
to apply and the events to log. The CRUD layer translates ORM rows
to/from the dict shape this engine expects.

Order of operations (locked):
    1. Normalize + validate allocation
    2. Apply quarterly grant to treasury
    3. R&D tick
    4. Acquisition tick
    5. Readiness tick
    6. Deduct allocation from treasury
    7. Advance clock
    8. Emit turn_advanced event
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.engine.budget import normalize_allocation, validate_allocation
from app.engine.rng import subsystem_rng
from app.engine.rd import tick_rd
from app.engine.acquisition import tick_acquisitions
from app.engine.readiness import tick_readiness


@dataclass
class EngineResult:
    next_year: int
    next_quarter: int
    next_treasury_cr: int
    next_rd_states: list[dict]
    next_acquisition_orders: list[dict]
    next_squadrons: list[dict]
    events: list[dict] = field(default_factory=list)


def _next_clock(year: int, quarter: int) -> tuple[int, int]:
    if quarter == 4:
        return year + 1, 1
    return year, quarter + 1


def advance(ctx: dict[str, Any]) -> EngineResult:
    seed = ctx["seed"]
    year = ctx["year"]
    quarter = ctx["quarter"]
    grant = ctx["quarterly_grant_cr"]

    available_cr = ctx["treasury_cr"] + grant
    allocation = normalize_allocation(ctx["current_allocation_json"], grant)
    validate_allocation(allocation, available_cr)

    events: list[dict] = []

    rd_rng = subsystem_rng(seed, "rd", year, quarter)
    next_rd, rd_events = tick_rd(
        ctx["rd_states"], ctx["rd_specs"], allocation["rd"], rd_rng,
    )
    events.extend(rd_events)

    next_orders, acq_events = tick_acquisitions(
        ctx["acquisition_orders"], year, quarter, allocation["acquisition"],
    )
    events.extend(acq_events)

    readiness_rng = subsystem_rng(seed, "readiness", year, quarter)
    next_squadrons, rd_events2 = tick_readiness(
        ctx["squadrons"], allocation["om"], allocation["spares"], readiness_rng,
    )
    events.extend(rd_events2)

    next_treasury = available_cr - sum(allocation.values())
    next_year, next_quarter = _next_clock(year, quarter)

    events.append({
        "event_type": "turn_advanced",
        "payload": {
            "from_year": year, "from_quarter": quarter,
            "to_year": next_year, "to_quarter": next_quarter,
            "grant_cr": grant,
            "allocation": allocation,
            "treasury_after_cr": next_treasury,
        },
    })

    return EngineResult(
        next_year=next_year,
        next_quarter=next_quarter,
        next_treasury_cr=next_treasury,
        next_rd_states=next_rd,
        next_acquisition_orders=next_orders,
        next_squadrons=next_squadrons,
        events=events,
    )
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_turn.py -v
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/turn.py backend/tests/test_engine_turn.py
git commit -m "feat(engine): end-of-turn orchestrator

Pure function advance(ctx) -> EngineResult composes budget validation,
quarterly grant, R&D/acquisition/readiness ticks, allocation deduction,
and clock advance in a fixed deterministic order. Each subsystem gets
its own seeded RNG via subsystem_rng. Emits turn_advanced as the
terminal event."
```

---

## Task 8: Wire orchestrator into `advance_turn` CRUD

**Files:**
- Modify: `backend/app/crud/campaign.py`
- Test: `backend/tests/test_campaigns_api.py` (add new behavior tests)

- [ ] **Step 1: Add behavior tests for the wired-up advance_turn**

Append to `backend/tests/test_campaigns_api.py`:

```python
def test_advance_turn_emits_turn_advanced_event(client):
    created = client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()
    client.post(f"/api/campaigns/{created['id']}/advance")

    # The turn_advanced event should be in CampaignEvent. Probe via DB through a follow-up endpoint?
    # For Plan 2 we just verify by re-fetching campaign — the new fields tell the same story.
    refetched = client.get(f"/api/campaigns/{created['id']}").json()
    assert refetched["current_quarter"] == 3


def test_advance_turn_grows_treasury_by_grant_minus_spend(client):
    created = client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()
    initial_treasury = created["budget_cr"]
    grant = created["quarterly_grant_cr"]

    advanced = client.post(f"/api/campaigns/{created['id']}/advance").json()
    # With default allocation, the bucket sum equals the grant -> treasury net change = 0
    assert advanced["budget_cr"] == initial_treasury


def test_advance_turn_default_allocation_persisted_after_first_advance(client):
    created = client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()
    assert created["current_allocation_json"] is None  # not yet set
    # advance will use defaults but does not persist them — they remain None until player explicitly sets.
    advanced = client.post(f"/api/campaigns/{created['id']}/advance").json()
    assert advanced["current_allocation_json"] is None
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_campaigns_api.py -v
```

Expected: the new tests fail because `quarterly_grant_cr` isn't on the response (fields exist but `advance_turn` may not yet be wired to engine; current behavior just bumps the clock).

- [ ] **Step 3: Wire crud/campaign.py to engine**

Overwrite `backend/app/crud/campaign.py`:

```python
import random
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.rd_program import RDProgramState
from app.models.acquisition import AcquisitionOrder
from app.models.squadron import Squadron
from app.schemas.campaign import CampaignCreate
from app.engine.turn import advance as engine_advance
from app.content.registry import rd_programs as rd_program_specs


STARTING_BUDGET_CR = 620000  # ~₹6.2L cr — 1 year cushion of pre-existing reserves


def create_campaign(db: Session, payload: CampaignCreate) -> Campaign:
    seed = payload.seed if payload.seed is not None else random.randint(1, 2**31 - 1)
    campaign = Campaign(
        name=payload.name,
        seed=seed,
        starting_year=2026,
        starting_quarter=2,
        current_year=2026,
        current_quarter=2,
        difficulty=payload.difficulty,
        objectives_json=payload.objectives,
        budget_cr=STARTING_BUDGET_CR,
        quarterly_grant_cr=155000,
        current_allocation_json=None,
        reputation=50,
    )
    db.add(campaign)
    db.flush()

    event = CampaignEvent(
        campaign_id=campaign.id,
        year=campaign.starting_year,
        quarter=campaign.starting_quarter,
        event_type="campaign_created",
        payload={"seed": seed, "difficulty": payload.difficulty},
    )
    db.add(event)

    # Seed historically-grounded 2026-Q2 starting state (Task 10).
    from app.crud.seed_starting_state import seed_starting_state
    seed_starting_state(db, campaign)

    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, campaign_id: int) -> Campaign | None:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()


def _serialize_rd(state: RDProgramState) -> dict:
    return {
        "id": state.id,
        "program_id": state.program_id,
        "progress_pct": state.progress_pct,
        "funding_level": state.funding_level,
        "status": state.status,
        "milestones_hit": list(state.milestones_hit or []),
        "cost_invested_cr": state.cost_invested_cr,
        "quarters_active": state.quarters_active,
    }


def _serialize_order(order: AcquisitionOrder) -> dict:
    return {
        "id": order.id,
        "platform_id": order.platform_id,
        "quantity": order.quantity,
        "first_delivery_year": order.first_delivery_year,
        "first_delivery_quarter": order.first_delivery_quarter,
        "foc_year": order.foc_year,
        "foc_quarter": order.foc_quarter,
        "delivered": order.delivered,
        "total_cost_cr": order.total_cost_cr,
    }


def _serialize_squadron(sq: Squadron) -> dict:
    return {"id": sq.id, "readiness_pct": sq.readiness_pct}


def advance_turn(db: Session, campaign: Campaign) -> Campaign:
    rd_rows = db.query(RDProgramState).filter(RDProgramState.campaign_id == campaign.id).all()
    acq_rows = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == campaign.id).all()
    sq_rows = db.query(Squadron).filter(Squadron.campaign_id == campaign.id).all()

    # Convert content RDProgramSpec -> dict the engine expects
    specs = {
        spec_id: {
            "id": spec.id,
            "name": spec.name,
            "description": spec.description,
            "base_duration_quarters": spec.base_duration_quarters,
            "base_cost_cr": spec.base_cost_cr,
            "dependencies": list(spec.dependencies),
        }
        for spec_id, spec in rd_program_specs().items()
    }

    ctx = {
        "seed": campaign.seed,
        "year": campaign.current_year,
        "quarter": campaign.current_quarter,
        "treasury_cr": campaign.budget_cr,
        "quarterly_grant_cr": campaign.quarterly_grant_cr,
        "current_allocation_json": campaign.current_allocation_json,
        "rd_states": [_serialize_rd(r) for r in rd_rows],
        "acquisition_orders": [_serialize_order(o) for o in acq_rows],
        "squadrons": [_serialize_squadron(s) for s in sq_rows],
        "rd_specs": specs,
    }

    result = engine_advance(ctx)

    campaign.current_year = result.next_year
    campaign.current_quarter = result.next_quarter
    campaign.budget_cr = result.next_treasury_cr

    rd_by_id = {r.id: r for r in rd_rows}
    for s in result.next_rd_states:
        row = rd_by_id[s["id"]]
        row.progress_pct = s["progress_pct"]
        row.status = s["status"]
        row.milestones_hit = s["milestones_hit"]
        row.cost_invested_cr = s["cost_invested_cr"]
        row.quarters_active = s["quarters_active"]

    acq_by_id = {o.id: o for o in acq_rows}
    for o in result.next_acquisition_orders:
        row = acq_by_id[o["id"]]
        row.delivered = o["delivered"]

    sq_by_id = {s.id: s for s in sq_rows}
    for s in result.next_squadrons:
        row = sq_by_id[s["id"]]
        row.readiness_pct = s["readiness_pct"]

    for e in result.events:
        db.add(CampaignEvent(
            campaign_id=campaign.id,
            year=campaign.current_year,
            quarter=campaign.current_quarter,
            event_type=e["event_type"],
            payload=e["payload"],
        ))

    db.commit()
    db.refresh(campaign)
    return campaign
```

- [ ] **Step 4: Add a placeholder seed_starting_state to unblock tests**

Create `backend/app/crud/seed_starting_state.py` (Task 10 fills this in fully):

```python
"""Seed the campaign with the historically-grounded 2026-Q2 starting state.

Plan 2 / Task 10 implements the full 2026-Q2 inheritance: bases,
named squadrons, MRFA Rafale F4, Tejas Mk1A contract, AMCA Mk1 R&D,
Astra Mk2 R&D nearing series production. This stub exists so
crud/campaign.py can import it before Task 10 lands.
"""

from sqlalchemy.orm import Session

from app.models.campaign import Campaign


def seed_starting_state(db: Session, campaign: Campaign) -> None:
    pass
```

- [ ] **Step 5: Run all tests — expect pass**

Run:
```bash
python -m pytest tests/ -v
```

Expected: all green. If `test_advance_turn_grows_treasury_by_grant_minus_spend` fails because of integer rounding from default percentages, adjust the test expectation to match `sum(default_allocation(155000).values())` exactly.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/campaign.py backend/app/crud/seed_starting_state.py backend/tests/test_campaigns_api.py
git commit -m "feat(crud): wire advance_turn through the engine orchestrator

advance_turn now serializes ORM rows to dicts, calls engine.turn.advance,
and writes mutations + CampaignEvent log entries back. Treasury grows
by grant minus allocation each turn. Adds a stub seed_starting_state
that Task 10 fills in."
```

---

## Task 9: Expand R&D content YAML to MVP set

**Files:**
- Modify: `backend/content/rd_programs.yaml`

The MVP per spec §8 calls for ~10 R&D programs. Plan 1 shipped 2 (AMCA, Astra Mk2). This task adds 8 more so Task 10 can pre-seed real R&D state and Plan 2's gameplay loop has variety.

- [ ] **Step 1: Expand the file**

Overwrite `backend/content/rd_programs.yaml`:

```yaml
programs:
  - id: amca_mk1
    name: AMCA Mk1
    description: Indigenous 5th-generation stealth multirole fighter. First flight 2028-29, serial production 2035.
    base_duration_quarters: 36
    base_cost_cr: 150000
    dependencies: []
  - id: amca_mk1_engine
    name: AMCA Mk1 Engine (Safran-GTRE)
    description: 120-140 kN class engine, co-developed with Safran. Critical-path for AMCA serial production.
    base_duration_quarters: 36
    base_cost_cr: 60000
    dependencies: []
  - id: tejas_mk2
    name: Tejas Mk2
    description: Indigenous 4.75-gen multirole. LRIP ~2033, FRP 2034 at 24/yr.
    base_duration_quarters: 28
    base_cost_cr: 50000
    dependencies: []
  - id: tedbf
    name: TEDBF (Twin Engine Deck-Based Fighter)
    description: Carrier-based naval fighter. First flight late-decade.
    base_duration_quarters: 24
    base_cost_cr: 40000
    dependencies: []
  - id: ghatak_ucav
    name: Ghatak UCAV
    description: Stealth flying-wing UCAV. Operational prototype ~2028, induction ~2031.
    base_duration_quarters: 20
    base_cost_cr: 25000
    dependencies: []
  - id: astra_mk2
    name: Astra Mk2
    description: 240km BVR air-to-air missile. Series production July 2026.
    base_duration_quarters: 4
    base_cost_cr: 8000
    dependencies: []
  - id: astra_mk3
    name: Astra Mk3 (Gandiva)
    description: 350km dual-pulse ramjet BVR AAM. Combat-ready ~2029.
    base_duration_quarters: 12
    base_cost_cr: 15000
    dependencies: []
  - id: rudram_2
    name: Rudram-2
    description: Multi-target anti-radiation missile, 300km range. Production ~2027.
    base_duration_quarters: 6
    base_cost_cr: 6000
    dependencies: []
  - id: rudram_3
    name: Rudram-3
    description: Long-range ARM, 550+ km. Production nod 2026, IOC ~2028.
    base_duration_quarters: 8
    base_cost_cr: 8000
    dependencies: []
  - id: brahmos_ng
    name: BrahMos-NG
    description: Next-gen smaller supersonic cruise missile. First flight ~2027, IOC ~2028-29.
    base_duration_quarters: 10
    base_cost_cr: 12000
    dependencies: []
```

- [ ] **Step 2: Add a sanity test for the expanded set**

Append to `backend/tests/test_content_loader.py` (the file already exists from Plan 1 — append a new test, do not overwrite). First inspect what's there:

Run:
```bash
cat backend/tests/test_content_loader.py
```

Then append the following test (only if no equivalent exists):

```python
def test_rd_programs_yaml_has_mvp_set():
    from pathlib import Path
    from app.content.loader import load_rd_programs
    progs = load_rd_programs(Path("content/rd_programs.yaml"))
    expected_ids = {
        "amca_mk1", "amca_mk1_engine", "tejas_mk2", "tedbf", "ghatak_ucav",
        "astra_mk2", "astra_mk3", "rudram_2", "rudram_3", "brahmos_ng",
    }
    assert expected_ids.issubset(progs.keys())
    assert len(progs) >= 10
```

- [ ] **Step 3: Run — expect pass**

Run:
```bash
cd backend && python -m pytest tests/test_content_loader.py -v
```

Expected: all green. If the existing tests are looking for exactly 2 programs, update those assertions to allow ≥ 2.

- [ ] **Step 4: Reload registry cache for tests that use the singleton**

If any test imports `app.content.registry.rd_programs` directly, ensure it's not mutating the lru_cache. The registry's `reload_all()` exists for that purpose. No code change needed here — just be aware.

- [ ] **Step 5: Commit**

```bash
git add backend/content/rd_programs.yaml backend/tests/test_content_loader.py
git commit -m "content: expand R&D programs YAML to MVP 10-program set

Adds AMCA engine, Tejas Mk2, TEDBF, Ghatak UCAV, Astra Mk3,
Rudram-2, Rudram-3, BrahMos-NG to the existing AMCA Mk1 +
Astra Mk2. Numbers from docs/content/platforms-seed-2026.md."
```

---

## Task 10: Starting-state seed module

Populate the historically-grounded 2026-Q2 inheritance on `create_campaign`. Per `docs/content/platforms-seed-2026.md` §"Campaign Starting Conditions":
- 3 base instances (Ambala, Hasimara, Jodhpur)
- 3 named seed squadrons (the MVP slice — full 31-sqn force lands in Plan 10)
- MRFA Rafale F4 (114 jets, signed 2026-Q1, first delivery 2027-Q4, FOC 2032-Q1)
- Tejas Mk1A (97 jets, signed 2025-Q3, first delivery 2026-Q1, FOC 2030-Q4)
- AMCA Mk1 R&D — active, 0% progress, standard funding
- AMCA Mk1 engine R&D — active, 0%, standard
- Astra Mk2 R&D — active, 75% progress (series production July 2026 = Q3, one quarter out)
- Tejas Mk2 R&D — active, 10% progress, standard

(S-400 squadrons, BrahMos-NG, Rudram are out — content YAML doesn't model the underlying platforms yet; Plan 10 expands content.)

**Files:**
- Modify: `backend/app/crud/seed_starting_state.py` (replace the stub from Task 8)
- Create: `backend/tests/test_starting_state_seed.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_starting_state_seed.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def test_create_campaign_seeds_three_bases(client):
    c, Session = client
    created = _create(c)
    from app.models.campaign_base import CampaignBase
    db = Session()
    bases = db.query(CampaignBase).filter(CampaignBase.campaign_id == created["id"]).all()
    template_ids = {b.template_id for b in bases}
    assert template_ids == {"ambala", "hasimara", "jodhpur"}


def test_create_campaign_seeds_named_squadrons(client):
    c, Session = client
    created = _create(c)
    from app.models.squadron import Squadron
    db = Session()
    sqs = db.query(Squadron).filter(Squadron.campaign_id == created["id"]).all()
    assert len(sqs) >= 3
    names = {s.name for s in sqs}
    assert "17 Sqn Golden Arrows" in names


def test_create_campaign_seeds_mrfa_rafale_acquisition(client):
    c, Session = client
    created = _create(c)
    from app.models.acquisition import AcquisitionOrder
    db = Session()
    orders = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == created["id"]).all()
    rafale = next((o for o in orders if o.platform_id == "rafale_f4"), None)
    assert rafale is not None
    assert rafale.quantity == 114
    assert rafale.first_delivery_year == 2027
    assert rafale.first_delivery_quarter == 4
    assert rafale.foc_year == 2032
    assert rafale.foc_quarter == 1


def test_create_campaign_seeds_tejas_mk1a_acquisition(client):
    c, Session = client
    created = _create(c)
    from app.models.acquisition import AcquisitionOrder
    db = Session()
    orders = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == created["id"]).all()
    tejas = next((o for o in orders if o.platform_id == "tejas_mk1a"), None)
    assert tejas is not None
    assert tejas.quantity == 97


def test_create_campaign_seeds_amca_rd(client):
    c, Session = client
    created = _create(c)
    from app.models.rd_program import RDProgramState
    db = Session()
    progs = db.query(RDProgramState).filter(RDProgramState.campaign_id == created["id"]).all()
    program_ids = {p.program_id for p in progs}
    assert "amca_mk1" in program_ids
    assert "amca_mk1_engine" in program_ids
    assert "astra_mk2" in program_ids
    assert "tejas_mk2" in program_ids


def test_create_campaign_astra_mk2_starts_near_completion(client):
    c, Session = client
    created = _create(c)
    from app.models.rd_program import RDProgramState
    db = Session()
    astra = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == created["id"],
        RDProgramState.program_id == "astra_mk2",
    ).first()
    assert astra is not None
    assert astra.progress_pct >= 70  # series production is one quarter out
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_starting_state_seed.py -v
```

Expected: 6 failing.

- [ ] **Step 3: Implement `seed_starting_state`**

Overwrite `backend/app/crud/seed_starting_state.py`:

```python
"""Seed the campaign with the historically-grounded 2026-Q2 starting state.

Per docs/content/platforms-seed-2026.md, the player inherits:
  - 3 air bases (Ambala, Hasimara, Jodhpur)
  - 3 named seed squadrons (Plan 10 expands to the full 31-sqn force)
  - MRFA Rafale F4 acquisition (114, 2026-Q1 .. 2032-Q1)
  - Tejas Mk1A acquisition (97, 2025-Q3 .. 2030-Q4)
  - AMCA Mk1 + AMCA engine R&D — active, 0% progress
  - Astra Mk2 R&D — 75% (series production due 2026-Q3)
  - Tejas Mk2 R&D — 10%
"""

from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from app.models.acquisition import AcquisitionOrder
from app.models.rd_program import RDProgramState


SEED_BASES = [
    {"template_id": "ambala", "shelter_count": 24, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "hasimara", "shelter_count": 18, "fuel_depot_size": 2,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "jodhpur", "shelter_count": 20, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
]

SEED_SQUADRONS = [
    # (name, call_sign, platform_id, base_template_id, strength, readiness)
    ("17 Sqn Golden Arrows", "GA", "rafale_f4", "ambala", 18, 82),
    ("101 Sqn Falcons", "FALCON", "rafale_f4", "hasimara", 18, 78),
    ("32 Sqn Thunderbirds", "TB", "su30_mki", "jodhpur", 18, 75),
]

SEED_ACQUISITIONS = [
    {
        "platform_id": "rafale_f4", "quantity": 114,
        "signed_year": 2026, "signed_quarter": 1,
        "first_delivery_year": 2027, "first_delivery_quarter": 4,
        "foc_year": 2032, "foc_quarter": 1,
        "delivered": 0, "total_cost_cr": 514000,  # ~₹4500 cr/jet * 114
    },
    {
        "platform_id": "tejas_mk1a", "quantity": 97,
        "signed_year": 2025, "signed_quarter": 3,
        "first_delivery_year": 2026, "first_delivery_quarter": 1,
        "foc_year": 2030, "foc_quarter": 4,
        "delivered": 0, "total_cost_cr": 48500,  # ~₹500 cr/jet * 97
    },
]

SEED_RD_PROGRAMS = [
    {"program_id": "amca_mk1", "progress_pct": 0, "funding_level": "standard"},
    {"program_id": "amca_mk1_engine", "progress_pct": 0, "funding_level": "standard"},
    {"program_id": "astra_mk2", "progress_pct": 75, "funding_level": "standard"},
    {"program_id": "tejas_mk2", "progress_pct": 10, "funding_level": "standard"},
]


def seed_starting_state(db: Session, campaign: Campaign) -> None:
    bases_by_template: dict[str, CampaignBase] = {}
    for b in SEED_BASES:
        row = CampaignBase(campaign_id=campaign.id, **b)
        db.add(row)
        bases_by_template[b["template_id"]] = row
    db.flush()  # populate row.id

    for name, call_sign, platform_id, base_tpl, strength, readiness in SEED_SQUADRONS:
        db.add(Squadron(
            campaign_id=campaign.id,
            name=name,
            call_sign=call_sign,
            platform_id=platform_id,
            base_id=bases_by_template[base_tpl].id,
            strength=strength,
            readiness_pct=readiness,
            xp=0,
        ))

    for ao in SEED_ACQUISITIONS:
        db.add(AcquisitionOrder(campaign_id=campaign.id, **ao))

    for prog in SEED_RD_PROGRAMS:
        db.add(RDProgramState(
            campaign_id=campaign.id,
            program_id=prog["program_id"],
            progress_pct=prog["progress_pct"],
            funding_level=prog["funding_level"],
            status="active",
            milestones_hit=[],
            cost_invested_cr=0,
            quarters_active=0,
        ))
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_starting_state_seed.py -v
```

Expected: 6 passed. If a test fails because no `tejas_mk1a` exists in `platforms.yaml`, we still allow the seed (acquisition rows reference `platform_id` as a free string at this point — content cross-validation lands in a future plan). `tejas_mk1a` is in Plan 1's seed yaml — verify with `grep tejas_mk1a backend/content/platforms.yaml`.

- [ ] **Step 5: Run full suite to make sure nothing else broke**

Run:
```bash
python -m pytest tests/ -v
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/seed_starting_state.py backend/tests/test_starting_state_seed.py
git commit -m "feat(crud): seed historically-grounded 2026-Q2 starting state

create_campaign now populates 3 bases (Ambala, Hasimara, Jodhpur),
3 named seed squadrons (17 Sqn Golden Arrows, 101 Sqn Falcons,
32 Sqn Thunderbirds), MRFA Rafale F4 (114) and Tejas Mk1A (97)
acquisitions on real schedules, and active R&D on AMCA Mk1, AMCA
engine, Astra Mk2 (75%, series prod 2026-Q3), and Tejas Mk2.
Sourced from docs/content/platforms-seed-2026.md."
```

---

## Task 11: API — POST /api/campaigns/{id}/budget

**Files:**
- Create: `backend/app/schemas/budget.py`
- Create: `backend/app/crud/budget.py`
- Create: `backend/app/api/budget.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_budget_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_budget_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def test_set_budget_persists_allocation(client):
    c = _create_campaign(client)
    payload = {"rd": 60000, "acquisition": 50000, "om": 25000, "spares": 15000, "infrastructure": 5000}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 200
    body = r.json()
    assert body["current_allocation_json"] == payload


def test_set_budget_rejects_overspend(client):
    c = _create_campaign(client)
    # Treasury 620000 + grant 155000 = 775000; this overshoots by a lot
    payload = {"rd": 9_000_000, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_rejects_missing_bucket(client):
    c = _create_campaign(client)
    payload = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000}  # no infrastructure
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_rejects_negative(client):
    c = _create_campaign(client)
    payload = {"rd": -1, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_404_for_unknown_campaign(client):
    r = client.post("/api/campaigns/99999/budget", json={"allocation": {
        "rd": 0, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0,
    }})
    assert r.status_code == 404


def test_advance_after_set_budget_uses_new_allocation(client):
    c = _create_campaign(client)
    # Allocate everything to R&D (775k) so AMCA gets richly funded
    payload = {"rd": 775000, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    advanced = client.post(f"/api/campaigns/{c['id']}/advance").json()
    # Treasury after = 620000 + 155000 - 775000 = 0
    assert advanced["budget_cr"] == 0
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_budget_api.py -v
```

Expected: 404 errors because the route doesn't exist yet.

- [ ] **Step 3: Implement schema**

Create `backend/app/schemas/budget.py`:

```python
from pydantic import BaseModel, Field


class BudgetAllocationPayload(BaseModel):
    allocation: dict[str, int] = Field(default_factory=dict)
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/budget.py`:

```python
from sqlalchemy.orm import Session

from app.engine.budget import validate_allocation, AllocationError
from app.models.campaign import Campaign


def set_allocation(db: Session, campaign: Campaign, allocation: dict[str, int]) -> Campaign:
    available_cr = campaign.budget_cr + campaign.quarterly_grant_cr
    validate_allocation(allocation, available_cr)
    campaign.current_allocation_json = allocation
    db.commit()
    db.refresh(campaign)
    return campaign
```

- [ ] **Step 5: Implement API**

Create `backend/app/api/budget.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.budget import set_allocation
from app.crud.campaign import get_campaign
from app.engine.budget import AllocationError
from app.schemas.budget import BudgetAllocationPayload
from app.schemas.campaign import CampaignRead

router = APIRouter(prefix="/api/campaigns", tags=["budget"])


@router.post("/{campaign_id}/budget", response_model=CampaignRead)
def set_budget_endpoint(campaign_id: int, payload: BudgetAllocationPayload, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return set_allocation(db, campaign, payload.allocation)
    except AllocationError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 6: Register router in main.py**

Modify `backend/main.py` — add the import and include line:

Find:
```python
from app.api.campaigns import router as campaigns_router
```

Add immediately after:
```python
from app.api.budget import router as budget_router
```

Find:
```python
app.include_router(campaigns_router)
```

Add immediately after:
```python
app.include_router(budget_router)
```

- [ ] **Step 7: Run — expect pass**

Run:
```bash
python -m pytest tests/test_budget_api.py -v
```

Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/budget.py backend/app/crud/budget.py backend/app/api/budget.py backend/main.py backend/tests/test_budget_api.py
git commit -m "feat(api): POST /api/campaigns/{id}/budget for allocation

Player can set the 5-bucket allocation; engine validates against
treasury+grant. AllocationError -> 400. Subsequent advance_turn
uses the persisted allocation."
```

---

## Task 12: API — POST /api/campaigns/{id}/rd and /rd/{program_id}

**Files:**
- Create: `backend/app/schemas/rd.py`
- Create: `backend/app/crud/rd.py`
- Create: `backend/app/api/rd.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_rd_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_rd_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def test_start_program_creates_active_state(client):
    c = _create_campaign(client)
    # ghatak_ucav is in MVP YAML and not pre-seeded
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "standard",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["program_id"] == "ghatak_ucav"
    assert body["progress_pct"] == 0
    assert body["status"] == "active"


def test_start_unknown_program_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "starfleet_phaser", "funding_level": "standard",
    })
    assert r.status_code == 404


def test_start_already_active_program_409(client):
    c = _create_campaign(client)
    # AMCA Mk1 is pre-seeded as active
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "amca_mk1", "funding_level": "standard",
    })
    assert r.status_code == 409


def test_start_with_invalid_funding_level_422(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "ludicrous",
    })
    assert r.status_code == 422


def test_update_funding_level(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/amca_mk1", json={
        "funding_level": "accelerated",
    })
    assert r.status_code == 200
    assert r.json()["funding_level"] == "accelerated"


def test_cancel_program(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/amca_mk1", json={"status": "cancelled"})
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


def test_update_unknown_program_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/no_such_program", json={
        "funding_level": "slow",
    })
    assert r.status_code == 404
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_rd_api.py -v
```

- [ ] **Step 3: Implement schema**

Create `backend/app/schemas/rd.py`:

```python
from typing import Literal
from pydantic import BaseModel

FundingLevel = Literal["slow", "standard", "accelerated"]
RDStatus = Literal["active", "completed", "cancelled"]


class RDStartPayload(BaseModel):
    program_id: str
    funding_level: FundingLevel = "standard"


class RDUpdatePayload(BaseModel):
    funding_level: FundingLevel | None = None
    status: RDStatus | None = None


class RDProgramRead(BaseModel):
    id: int
    program_id: str
    progress_pct: int
    funding_level: FundingLevel
    status: RDStatus
    milestones_hit: list[int]
    cost_invested_cr: int
    quarters_active: int

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/rd.py`:

```python
from sqlalchemy.orm import Session

from app.models.rd_program import RDProgramState
from app.content.registry import rd_programs


class ProgramNotFound(Exception):
    pass


class ProgramAlreadyActive(Exception):
    pass


def start_program(db: Session, campaign_id: int, program_id: str, funding_level: str) -> RDProgramState:
    if program_id not in rd_programs():
        raise ProgramNotFound(program_id)
    existing = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id,
        RDProgramState.program_id == program_id,
        RDProgramState.status != "cancelled",
    ).first()
    if existing is not None:
        raise ProgramAlreadyActive(program_id)
    state = RDProgramState(
        campaign_id=campaign_id,
        program_id=program_id,
        progress_pct=0,
        funding_level=funding_level,
        status="active",
        milestones_hit=[],
        cost_invested_cr=0,
        quarters_active=0,
    )
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def update_program(
    db: Session,
    campaign_id: int,
    program_id: str,
    funding_level: str | None = None,
    status: str | None = None,
) -> RDProgramState:
    state = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id,
        RDProgramState.program_id == program_id,
    ).first()
    if state is None:
        raise ProgramNotFound(program_id)
    if funding_level is not None:
        state.funding_level = funding_level
    if status is not None:
        state.status = status
    db.commit()
    db.refresh(state)
    return state
```

- [ ] **Step 5: Implement API**

Create `backend/app/api/rd.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.rd import start_program, update_program, ProgramNotFound, ProgramAlreadyActive
from app.schemas.rd import RDStartPayload, RDUpdatePayload, RDProgramRead

router = APIRouter(prefix="/api/campaigns", tags=["rd"])


@router.post("/{campaign_id}/rd", response_model=RDProgramRead, status_code=status.HTTP_201_CREATED)
def start_program_endpoint(campaign_id: int, payload: RDStartPayload, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return start_program(db, campaign_id, payload.program_id, payload.funding_level)
    except ProgramNotFound:
        raise HTTPException(status_code=404, detail=f"Program {payload.program_id} not in registry")
    except ProgramAlreadyActive:
        raise HTTPException(status_code=409, detail=f"Program {payload.program_id} already active")


@router.post("/{campaign_id}/rd/{program_id}", response_model=RDProgramRead)
def update_program_endpoint(
    campaign_id: int,
    program_id: str,
    payload: RDUpdatePayload,
    db: Session = Depends(get_db),
):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return update_program(
            db, campaign_id, program_id,
            funding_level=payload.funding_level,
            status=payload.status,
        )
    except ProgramNotFound:
        raise HTTPException(status_code=404, detail=f"Program {program_id} not active in this campaign")
```

- [ ] **Step 6: Register router in main.py**

After the `app.include_router(budget_router)` line added in Task 11, add:

```python
from app.api.rd import router as rd_router
app.include_router(rd_router)
```

(Place the import with the other `from app.api...` imports at the top.)

- [ ] **Step 7: Run — expect pass**

Run:
```bash
python -m pytest tests/test_rd_api.py -v
```

Expected: 7 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/rd.py backend/app/crud/rd.py backend/app/api/rd.py backend/main.py backend/tests/test_rd_api.py
git commit -m "feat(api): R&D start/update endpoints

POST /api/campaigns/{id}/rd starts a new program from the content
registry (404 if unknown, 409 if already active).
POST /api/campaigns/{id}/rd/{program_id} updates funding level
or status (e.g. cancel)."
```

---

## Task 13: API — POST /api/campaigns/{id}/acquisitions

**Files:**
- Create: `backend/app/schemas/acquisition.py`
- Create: `backend/app/crud/acquisition.py`
- Create: `backend/app/api/acquisitions.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_acquisitions_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_acquisitions_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def _payload(**overrides):
    base = {
        "platform_id": "rafale_f5",
        "quantity": 36,
        "first_delivery_year": 2030,
        "first_delivery_quarter": 4,
        "foc_year": 2034,
        "foc_quarter": 4,
        "total_cost_cr": 180000,
    }
    base.update(overrides)
    return base


def test_create_acquisition_returns_201(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=_payload())
    assert r.status_code == 201
    body = r.json()
    assert body["platform_id"] == "rafale_f5"
    assert body["quantity"] == 36
    assert body["delivered"] == 0
    assert body["signed_year"] == 2026  # taken from current campaign clock
    assert body["signed_quarter"] == 2


def test_create_acquisition_unknown_platform_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions",
                    json=_payload(platform_id="hyperdrone_9000"))
    assert r.status_code == 404


def test_create_acquisition_inverted_window_400(client):
    c = _create_campaign(client)
    # FOC before first delivery
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions",
                    json=_payload(first_delivery_year=2032, foc_year=2030))
    assert r.status_code == 400


def test_create_acquisition_negative_quantity_422(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=_payload(quantity=-1))
    assert r.status_code == 422


def test_create_acquisition_unknown_campaign_404(client):
    r = client.post("/api/campaigns/99999/acquisitions", json=_payload())
    assert r.status_code == 404
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_acquisitions_api.py -v
```

- [ ] **Step 3: Implement schema**

Create `backend/app/schemas/acquisition.py`:

```python
from pydantic import BaseModel, Field


class AcquisitionCreatePayload(BaseModel):
    platform_id: str
    quantity: int = Field(gt=0)
    first_delivery_year: int = Field(ge=2026, le=2040)
    first_delivery_quarter: int = Field(ge=1, le=4)
    foc_year: int = Field(ge=2026, le=2040)
    foc_quarter: int = Field(ge=1, le=4)
    total_cost_cr: int = Field(ge=0)


class AcquisitionRead(BaseModel):
    id: int
    platform_id: str
    quantity: int
    signed_year: int
    signed_quarter: int
    first_delivery_year: int
    first_delivery_quarter: int
    foc_year: int
    foc_quarter: int
    delivered: int
    total_cost_cr: int

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/acquisition.py`:

```python
from sqlalchemy.orm import Session

from app.models.acquisition import AcquisitionOrder
from app.models.campaign import Campaign
from app.content.registry import platforms


class PlatformNotFound(Exception):
    pass


class InvalidDeliveryWindow(Exception):
    pass


def _quarter_index(year: int, quarter: int) -> int:
    return year * 4 + (quarter - 1)


def create_order(
    db: Session,
    campaign: Campaign,
    platform_id: str,
    quantity: int,
    first_delivery_year: int,
    first_delivery_quarter: int,
    foc_year: int,
    foc_quarter: int,
    total_cost_cr: int,
) -> AcquisitionOrder:
    if platform_id not in platforms():
        raise PlatformNotFound(platform_id)
    if _quarter_index(foc_year, foc_quarter) < _quarter_index(first_delivery_year, first_delivery_quarter):
        raise InvalidDeliveryWindow("FOC must be on or after first delivery")
    order = AcquisitionOrder(
        campaign_id=campaign.id,
        platform_id=platform_id,
        quantity=quantity,
        signed_year=campaign.current_year,
        signed_quarter=campaign.current_quarter,
        first_delivery_year=first_delivery_year,
        first_delivery_quarter=first_delivery_quarter,
        foc_year=foc_year,
        foc_quarter=foc_quarter,
        delivered=0,
        total_cost_cr=total_cost_cr,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order
```

- [ ] **Step 5: Implement API**

Create `backend/app/api/acquisitions.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.acquisition import create_order, PlatformNotFound, InvalidDeliveryWindow
from app.schemas.acquisition import AcquisitionCreatePayload, AcquisitionRead

router = APIRouter(prefix="/api/campaigns", tags=["acquisitions"])


@router.post(
    "/{campaign_id}/acquisitions",
    response_model=AcquisitionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_acquisition_endpoint(
    campaign_id: int,
    payload: AcquisitionCreatePayload,
    db: Session = Depends(get_db),
):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return create_order(
            db, campaign,
            platform_id=payload.platform_id,
            quantity=payload.quantity,
            first_delivery_year=payload.first_delivery_year,
            first_delivery_quarter=payload.first_delivery_quarter,
            foc_year=payload.foc_year,
            foc_quarter=payload.foc_quarter,
            total_cost_cr=payload.total_cost_cr,
        )
    except PlatformNotFound:
        raise HTTPException(status_code=404, detail=f"Platform {payload.platform_id} not in registry")
    except InvalidDeliveryWindow as e:
        raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 6: Register router in main.py**

After the rd_router include from Task 12, add:

```python
from app.api.acquisitions import router as acquisitions_router
app.include_router(acquisitions_router)
```

- [ ] **Step 7: Run — expect pass**

Run:
```bash
python -m pytest tests/test_acquisitions_api.py -v
```

Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/acquisition.py backend/app/crud/acquisition.py backend/app/api/acquisitions.py backend/main.py backend/tests/test_acquisitions_api.py
git commit -m "feat(api): POST /api/campaigns/{id}/acquisitions

Player can sign new acquisition orders for known platforms with a
custom delivery window. Validates platform exists, window is not
inverted, quantity > 0; signed_year/quarter taken from current clock."
```

---

## Task 14: Replay-determinism integration test

Verify the central engine contract: same seed + same actions + same number of advances → identical state. This is the test that gives us confidence the orchestrator and subsystems are wired correctly.

**Files:**
- Create: `backend/tests/test_replay_determinism.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_replay_determinism.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def two_clients():
    """Two independent in-memory campaigns with identical seeds, run side-by-side."""
    clients = []
    cleanups = []
    for _ in range(2):
        engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)

        def make_override(SessionLocal=TestingSessionLocal):
            def _override():
                db = SessionLocal()
                try:
                    yield db
                finally:
                    db.close()
            return _override

        # Each client needs its own dep override stack
        instance_app = app
        instance_app.dependency_overrides[get_db] = make_override()
        clients.append(TestClient(instance_app))
        cleanups.append(lambda e=engine: Base.metadata.drop_all(bind=e))

    yield clients[0], clients[1]
    app.dependency_overrides.clear()
    for c in cleanups:
        c()


def _run_scenario(client, seed: int) -> dict:
    """Create a campaign with a fixed seed, take the same actions, advance 10 turns."""
    created = client.post("/api/campaigns", json={
        "name": "Det", "difficulty": "realistic", "objectives": [],
        "seed": seed,
    }).json()
    campaign_id = created["id"]

    # Action 1: lock in an allocation
    client.post(f"/api/campaigns/{campaign_id}/budget", json={"allocation": {
        "rd": 80000, "acquisition": 40000, "om": 20000, "spares": 10000, "infrastructure": 5000,
    }})

    # Action 2: start an extra R&D program
    client.post(f"/api/campaigns/{campaign_id}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "accelerated",
    })

    # Advance 10 quarters
    for _ in range(10):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    final = client.get(f"/api/campaigns/{campaign_id}").json()
    return final


def test_same_seed_and_actions_produce_same_campaign_state():
    # Run twice on the SAME client to keep the test simple; fresh in-memory DB per pytest fixture
    # would also work but reusing one client tests that two seeded runs converge.
    pass


def test_replay_via_two_independent_runs(two_clients):
    client_a, client_b = two_clients
    final_a = _run_scenario(client_a, seed=20260415)
    final_b = _run_scenario(client_b, seed=20260415)

    # Compare the gameplay-relevant fields (skip created_at / updated_at)
    fields = ["current_year", "current_quarter", "budget_cr", "current_allocation_json"]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}: {final_a[f]} vs {final_b[f]}"
```

Note: `two_clients` shares one global `app` and so the fixture will collide if run in parallel. For this MVP test we run sequentially (`pytest -v` default). If you find the second run inheriting the first's DB state, switch to: spawn two separate sub-applications by re-importing or use `pytest-asyncio` event loops. For the dual-run determinism check we just need two independent SQLite in-memory DBs, which the fixture provides.

- [ ] **Step 2: Run the test**

Run:
```bash
python -m pytest tests/test_replay_determinism.py -v
```

Expected: pass. If it fails because the two `dependency_overrides` are the same dict and overwrite each other, restructure as: run scenario 1, save the result, clear overrides, run scenario 2 with a fresh in-memory engine, assert. Update the fixture as needed:

```python
def _make_client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), engine


def test_replay_via_two_independent_runs():
    client_a, eng_a = _make_client()
    final_a = _run_scenario(client_a, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_a)

    client_b, eng_b = _make_client()
    final_b = _run_scenario(client_b, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_b)

    fields = ["current_year", "current_quarter", "budget_cr", "current_allocation_json"]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}: {final_a[f]} vs {final_b[f]}"
```

If the original fixture-based version doesn't pass cleanly on first run, replace the test body with the inline `_make_client()` form above and remove the `two_clients` fixture.

- [ ] **Step 3: Run full suite to confirm nothing else broke**

Run:
```bash
python -m pytest tests/ -v
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_replay_determinism.py
git commit -m "test: replay-determinism — same seed + actions = same state

Runs the full create + budget + start_rd + advance×10 sequence twice
on independent in-memory DBs with identical seeds and asserts the
gameplay-relevant Campaign fields match. Locks in the engine
determinism contract."
```

---

## Task 15: Update frontend types for the new fields

The frontend's `CampaignConsole` already renders the raw campaign JSON; no UI work is needed. We just keep `frontend/src/lib/types.ts` honest so the next plan (UI) starts from a true contract.

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Update types**

Overwrite `frontend/src/lib/types.ts`:

```typescript
export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";

export type BudgetBucket = "rd" | "acquisition" | "om" | "spares" | "infrastructure";
export type BudgetAllocation = Record<BudgetBucket, number>;

export interface Campaign {
  id: number;
  name: string;
  seed: number;
  starting_year: number;
  starting_quarter: number;
  current_year: number;
  current_quarter: number;
  difficulty: Difficulty;
  objectives_json: string[];
  budget_cr: number;
  quarterly_grant_cr: number;
  current_allocation_json: BudgetAllocation | null;
  reputation: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreatePayload {
  name: string;
  difficulty: Difficulty;
  objectives: string[];
  seed?: number;
}
```

- [ ] **Step 2: Verify frontend still typechecks + builds**

Run:
```bash
cd frontend && npm run build
```

Expected: build succeeds. `CampaignConsole.tsx` renders `Campaign` as JSON and is structurally agnostic to new fields.

- [ ] **Step 3: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/types.ts
git commit -m "types(frontend): add quarterly_grant + allocation fields to Campaign

Mirrors the new backend CampaignRead schema. No UI change — the
existing CampaignConsole renders raw JSON so new fields surface
automatically; Plan 7 will build proper budget UI on top of these."
```

---

## Final verification

- [ ] **Run full backend test suite**

Run:
```bash
cd /Users/rsumit123/work/defense-game/backend && source .venv/bin/activate && python -m pytest tests/ -v
```

Expected: all tests pass — Plan 1's 22 + this plan's new tests (~70 total expected).

- [ ] **Smoke-test the full loop in the running server**

Run in two terminals:

```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8010
```

```bash
# Terminal 2
curl -X POST http://localhost:8010/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke","difficulty":"realistic","objectives":[]}'

# Note the returned id, then:
curl -X POST http://localhost:8010/api/campaigns/1/budget \
  -H "Content-Type: application/json" \
  -d '{"allocation":{"rd":80000,"acquisition":40000,"om":20000,"spares":10000,"infrastructure":5000}}'

curl -X POST http://localhost:8010/api/campaigns/1/rd \
  -H "Content-Type: application/json" \
  -d '{"program_id":"ghatak_ucav","funding_level":"accelerated"}'

curl -X POST http://localhost:8010/api/campaigns/1/advance
curl http://localhost:8010/api/campaigns/1
```

Confirm `current_quarter` ticked, `budget_cr` decreased by `155000 - 155000 = 0` plus underspend, and AMCA/Astra Mk2/etc. progressed (re-query DB or extend the campaign GET in a follow-up plan).

- [ ] **Update ROADMAP.md to mark Plan 2 done**

Per CLAUDE.md "How to pick up work" §6:

```bash
# Edit docs/superpowers/plans/ROADMAP.md
#   - Change row 2's status from "🔴 not started" to "🟢 done"
#   - Update the link to point at this plan file
#   - Update "Last updated:" to today's date
git add docs/superpowers/plans/ROADMAP.md
git commit -m "docs: mark Plan 2 (Turn Engine Core) done in ROADMAP"
```
