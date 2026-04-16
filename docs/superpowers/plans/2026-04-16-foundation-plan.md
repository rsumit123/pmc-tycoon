# Sovereign Shield — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune all obsolete PMC Tycoon code, stand up new Sovereign Shield backend models + content loaders, seed MVP content (10 platforms, 3 bases, 3 objectives, 2 R&D programs), wire a minimal `POST /api/campaigns` + `POST /api/campaigns/{id}/advance` + `GET /api/campaigns/{id}` loop end-to-end, and ship a barebones frontend shell that can create a campaign and advance turns (just JSON display — gameplay UI comes in a later plan).

**Architecture:** FastAPI + SQLAlchemy + SQLite backend in `backend/`. YAML content files in `backend/content/`. Pydantic schemas for API contracts. Tests with pytest using a per-test SQLite-in-memory DB. React 19 + Vite + TypeScript + Zustand + Tailwind frontend in `frontend/`, with an `axios` API client and a single-screen "campaign console" that proves the full-stack loop works. MapLibre, platform media fetching, dashboards, and gameplay logic are deferred to subsequent plans.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Pydantic 2.x, SQLite, PyYAML, pytest, pytest-asyncio, React 19, TypeScript, Vite 8, Tailwind v4, Zustand, axios, vitest.

---

## File Structure

**Backend (create):**
- `backend/requirements.txt` — explicit deps (replaces inline pip in Dockerfile)
- `backend/app/core/config.py` — settings via pydantic-settings
- `backend/app/core/rng.py` — seeded RNG helper (used later plans; stub here)
- `backend/app/db/base.py` — kept, SQLAlchemy declarative base (exists; verify)
- `backend/app/db/session.py` — kept, engine + SessionLocal (exists; verify)
- `backend/app/models/__init__.py` — exports all models
- `backend/app/models/campaign.py` — Campaign SQLAlchemy model
- `backend/app/models/squadron.py` — Squadron
- `backend/app/models/base.py` — Base (per-campaign instance)
- `backend/app/models/rd_program.py` — RDProgramState
- `backend/app/models/acquisition.py` — AcquisitionOrder
- `backend/app/models/intel.py` — IntelCard
- `backend/app/models/adversary.py` — AdversaryState
- `backend/app/models/vignette.py` — Vignette
- `backend/app/models/event.py` — CampaignEvent
- `backend/app/schemas/__init__.py`
- `backend/app/schemas/campaign.py` — Pydantic schemas for campaign create/read
- `backend/app/content/__init__.py`
- `backend/app/content/loader.py` — YAML content loader with validation
- `backend/app/content/registry.py` — in-memory singleton of loaded content
- `backend/app/crud/__init__.py`
- `backend/app/crud/campaign.py` — create_campaign, get_campaign, advance_turn
- `backend/app/api/__init__.py`
- `backend/app/api/campaigns.py` — new campaign router
- `backend/app/api/deps.py` — DB session dependency
- `backend/main.py` — rewritten, minimal
- `backend/content/platforms.yaml` — 10 platforms
- `backend/content/bases.yaml` — 3 bases
- `backend/content/objectives.yaml` — 3 objectives
- `backend/content/rd_programs.yaml` — 2 R&D programs
- `backend/tests/__init__.py`
- `backend/tests/conftest.py` — shared fixtures (in-memory DB, client)
- `backend/tests/test_content_loader.py`
- `backend/tests/test_campaigns_api.py`
- `backend/tests/test_models.py`
- `backend/.env.example` — template for required env vars

**Backend (delete):**
- All of `backend/app/engine/` (13 files — old air/naval/ground battle engines)
- All old models (14 files: aircraft, weapon, ship, battle, contract, contractor, ground_unit, owned_aircraft, owned_ship, owned_weapon, research, subsystem, unit, user)
- All old schemas (7 files)
- All old APIs (11 files: aircraft, battle, contractors, contracts, ground_units, research, ships, simulation, subsystems, units, weapons)
- All of `backend/app/seed/` (5 files)
- `backend/app/tasks.py`
- All of `backend/tests/test_*.py` except the new ones this plan creates
- `backend/init_data.py`
- `backend/pmc_tycoon.db` (dev DB)
- `backend/server.log`
- `pmc_tycoon.db` at repo root (stale copy)

**Backend (modify):**
- `backend/Dockerfile` — pin Python 3.13, use `requirements.txt` instead of inline `pip install`, change CMD to `uvicorn main:app --host 0.0.0.0 --port 8010` (drop `init_data.py`)

**Frontend (create):**
- `frontend/src/lib/api.ts` — axios client + typed endpoints
- `frontend/src/lib/types.ts` — TS types mirroring backend schemas
- `frontend/src/store/campaignStore.ts` — Zustand store for active campaign state
- `frontend/src/pages/CampaignConsole.tsx` — single-page "console" UI for MVP
- `frontend/src/pages/Landing.tsx` — new-campaign landing
- `frontend/src/components/__placeholder.txt` — keep dir for future
- `frontend/.env.example`
- `frontend/src/vite-env.d.ts` — already exists; verify types for `import.meta.env`

**Frontend (delete):**
- All of `frontend/src/components/battle/` (9 files)
- All of `frontend/src/components/hangar/` (1 file)
- All of `frontend/src/components/pages/` (6 files)
- All of `frontend/src/components/layout/` (2 files)
- `frontend/src/components/ui/LazyImage.tsx`
- `frontend/src/components/widgets/` (if present)
- `frontend/src/services/api.ts` (replaced by `lib/api.ts`)
- `frontend/src/assets/hero.png`
- `frontend/src/App.css` (styles move to Tailwind / index.css)
- `frontend/src/styles/design-system.css` (will rewrite later; delete for now)
- `frontend/src/styles/` (if empty after above)
- `frontend/e2e/*` (stale Playwright specs — delete contents, keep dir)
- `frontend/test-results/` (transient)
- `frontend/frontend.log`

**Frontend (modify):**
- `frontend/package.json` — add `zustand`, `axios`; remove `lucide-react` if unused this plan (keep — used in future)
- `frontend/src/App.tsx` — rewrite to host router with Landing + CampaignConsole
- `frontend/src/main.tsx` — minor (add BrowserRouter)
- `frontend/src/index.css` — strip to Tailwind directives + tiny reset

---

## Task 1: Delete obsolete PMC Tycoon backend code

**Files:**
- Delete: `backend/app/engine/` (entire directory)
- Delete: `backend/app/models/aircraft.py`, `battle.py`, `contract.py`, `contractor.py`, `ground_unit.py`, `owned_aircraft.py`, `owned_ship.py`, `owned_weapon.py`, `research.py`, `ship.py`, `subsystem.py`, `unit.py`, `user.py`, `weapon.py`
- Delete: `backend/app/schemas/` (entire directory)
- Delete: `backend/app/api/aircraft.py`, `battle.py`, `contractors.py`, `contracts.py`, `ground_units.py`, `research.py`, `ships.py`, `simulation.py`, `subsystems.py`, `units.py`, `weapons.py`
- Delete: `backend/app/seed/` (entire directory)
- Delete: `backend/app/tasks.py`
- Delete: `backend/tests/test_*.py` (all existing tests)
- Delete: `backend/init_data.py`
- Delete: `backend/pmc_tycoon.db`, `backend/server.log`
- Delete: `pmc_tycoon.db` at repo root
- Delete: `backend/app/crud/` contents (if any)

- [ ] **Step 1: Preview what will be deleted (safety check)**

Run:
```bash
ls backend/app/engine/ backend/app/seed/ backend/app/schemas/ 2>/dev/null
ls backend/app/models/ backend/app/api/ backend/tests/
ls backend/init_data.py backend/tasks.py backend/*.db backend/server.log pmc_tycoon.db 2>/dev/null
```

Confirm the files you're about to remove match the "delete" list above.

- [ ] **Step 2: Remove backend directories and files**

Run:
```bash
rm -rf backend/app/engine backend/app/seed backend/app/schemas
rm -f backend/app/tasks.py backend/init_data.py backend/server.log backend/pmc_tycoon.db pmc_tycoon.db
rm -f backend/app/models/aircraft.py backend/app/models/battle.py backend/app/models/contract.py \
       backend/app/models/contractor.py backend/app/models/ground_unit.py backend/app/models/owned_aircraft.py \
       backend/app/models/owned_ship.py backend/app/models/owned_weapon.py backend/app/models/research.py \
       backend/app/models/ship.py backend/app/models/subsystem.py backend/app/models/unit.py \
       backend/app/models/user.py backend/app/models/weapon.py
rm -f backend/app/api/aircraft.py backend/app/api/battle.py backend/app/api/contractors.py \
       backend/app/api/contracts.py backend/app/api/ground_units.py backend/app/api/research.py \
       backend/app/api/ships.py backend/app/api/simulation.py backend/app/api/subsystems.py \
       backend/app/api/units.py backend/app/api/weapons.py
rm -f backend/tests/test_*.py
rm -rf backend/app/__pycache__ backend/app/models/__pycache__ backend/app/api/__pycache__ \
       backend/tests/__pycache__
rm -rf backend/app/crud 2>/dev/null || true
```

- [ ] **Step 3: Verify backend is empty-shelled**

Run:
```bash
find backend -name "*.py" -not -path "*/node_modules/*"
```

Expected output (roughly): only `backend/app/db/base.py`, `backend/app/db/session.py`, `backend/app/db/__init__.py`, `backend/app/models/__init__.py`, `backend/app/__init__.py`, `backend/main.py`, `backend/tests/__init__.py`. Anything else should be investigated.

- [ ] **Step 4: Commit the pruning**

```bash
cd /Users/rsumit123/work/defense-game
git add -A backend/ pmc_tycoon.db
git commit -m "chore: remove obsolete PMC Tycoon backend code

Prune all domain code (models, schemas, APIs, engines, seed data, tests)
from the old PMC Tycoon game. Keeps deployment scaffolding
(Dockerfile, db/session, main.py shell) for the Sovereign Shield rebuild."
```

---

## Task 2: Delete obsolete frontend code

**Files:**
- Delete: `frontend/src/components/battle/`, `frontend/src/components/hangar/`, `frontend/src/components/pages/`, `frontend/src/components/layout/`
- Delete: `frontend/src/components/ui/LazyImage.tsx`
- Delete: `frontend/src/components/widgets/` (if present)
- Delete: `frontend/src/services/api.ts`
- Delete: `frontend/src/assets/hero.png`
- Delete: `frontend/src/App.css`
- Delete: `frontend/src/styles/design-system.css`, `frontend/src/styles/`
- Delete: contents of `frontend/e2e/`, `frontend/test-results/`, `frontend/frontend.log`

- [ ] **Step 1: Preview**

Run:
```bash
ls frontend/src/components/ frontend/src/services/ frontend/src/styles/ frontend/src/assets/ 2>/dev/null
ls frontend/e2e/ frontend/test-results/ frontend/frontend.log 2>/dev/null
```

- [ ] **Step 2: Remove frontend files**

Run:
```bash
rm -rf frontend/src/components/battle frontend/src/components/hangar \
       frontend/src/components/pages frontend/src/components/layout \
       frontend/src/components/widgets
rm -f frontend/src/components/ui/LazyImage.tsx
rm -f frontend/src/services/api.ts
rm -rf frontend/src/services 2>/dev/null || true
rm -f frontend/src/assets/hero.png
rm -f frontend/src/App.css
rm -rf frontend/src/styles
rm -rf frontend/e2e/* frontend/test-results
rm -f frontend/frontend.log
```

- [ ] **Step 3: Verify shell remaining**

Run:
```bash
find frontend/src -type f
```

Expected (roughly): `App.tsx`, `main.tsx`, `index.css`, `vite-env.d.ts`, `assets/react.svg`, `assets/vite.svg`. Anything else should be investigated.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/
git commit -m "chore: remove obsolete PMC Tycoon frontend code

Prune all components, pages, and styles from the old PMC Tycoon UI.
Keeps Vite/React/Tailwind scaffolding + App.tsx/main.tsx shell for the
Sovereign Shield rebuild."
```

---

## Task 3: Add new backend dependencies via requirements.txt

**Files:**
- Create: `backend/requirements.txt`
- Modify: `backend/Dockerfile`

- [ ] **Step 1: Write requirements.txt**

Create `backend/requirements.txt`:

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy==2.0.35
pydantic==2.9.2
pydantic-settings==2.5.2
pyyaml==6.0.2
python-dotenv==1.0.1
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 2: Update Dockerfile**

Overwrite `backend/Dockerfile`:

```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8010

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
```

- [ ] **Step 3: Install deps locally**

Run:
```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

Expected: all packages install without errors. If system Python lacks a matching 3.13, use whatever 3.11+ is available (edit Dockerfile later only if needed for local parity).

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/Dockerfile
git commit -m "chore: pin backend deps in requirements.txt

Move from inline Dockerfile pip install to explicit pinned
requirements.txt. Adds pyyaml, pydantic-settings, httpx, pytest,
python-dotenv for Sovereign Shield scaffolding."
```

- [ ] **Step 5: Add .venv to gitignore if not already**

Run:
```bash
grep -q "backend/.venv" .gitignore 2>/dev/null || echo "backend/.venv" >> .gitignore
grep -q "__pycache__" .gitignore 2>/dev/null || echo "__pycache__/" >> .gitignore
grep -q "*.pyc" .gitignore 2>/dev/null || echo "*.pyc" >> .gitignore
git add .gitignore && git commit -m "chore: gitignore backend venv + pycache"
```

---

## Task 4: Config + DB session scaffolding

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Modify: `backend/app/db/base.py` (verify contents)
- Modify: `backend/app/db/session.py` (verify contents)

- [ ] **Step 1: Read existing db files**

Run:
```bash
cat backend/app/db/base.py backend/app/db/session.py
```

Note what's already there. If `Base = declarative_base()` and a `SessionLocal`, `engine` are already wired, keep them.

- [ ] **Step 2: Create config module**

Create `backend/app/core/__init__.py` (empty file).

Create `backend/app/core/config.py`:

```python
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:////app/data/sovereign_shield.db"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-haiku-4.5"
    content_dir: str = str(Path(__file__).resolve().parent.parent.parent / "content")

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://pmc-tycoon.skdev.one",
        "https://pmc-tycoon.vercel.app",
    ]


settings = Settings()
```

- [ ] **Step 3: Update db/session.py to use settings**

Overwrite `backend/app/db/session.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

- [ ] **Step 4: Update db/base.py**

Overwrite `backend/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 5: Create .env.example**

Create `backend/.env.example`:

```
DATABASE_URL=sqlite:///./sovereign_shield.db
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-haiku-4.5
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/core backend/app/db backend/.env.example
git commit -m "feat: pydantic-settings config + SQLAlchemy 2.x base"
```

---

## Task 5: Define Campaign + CampaignEvent models with tests

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/campaign.py`
- Create: `backend/app/models/event.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write model test first (TDD)**

Create `backend/tests/conftest.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Import all models so Base.metadata knows about them
    from app.models import campaign, event  # noqa: F401

    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
```

Create `backend/tests/__init__.py` (empty file).

Create `backend/tests/test_models.py`:

```python
from app.models.campaign import Campaign
from app.models.event import CampaignEvent


def test_create_campaign(db):
    c = Campaign(
        name="Singh-era modernization",
        seed=42,
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

    assert c.id is not None
    assert c.current_year == 2026
    assert c.current_quarter == 2
    assert c.budget_cr == 620000


def test_create_campaign_event(db):
    c = Campaign(
        name="Test",
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

    e = CampaignEvent(
        campaign_id=c.id,
        year=2026,
        quarter=2,
        event_type="campaign_created",
        payload={"note": "test"},
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    assert e.id is not None
    assert e.event_type == "campaign_created"
    assert e.payload["note"] == "test"
```

- [ ] **Step 2: Run tests — expect failure (models don't exist)**

Run:
```bash
cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v
```

Expected: ImportError or ModuleNotFoundError for `app.models.campaign` and `app.models.event`.

- [ ] **Step 3: Implement Campaign model**

Create `backend/app/models/campaign.py`:

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
    objectives_json: Mapped[list] = mapped_column(JSON, default=list)
    budget_cr: Mapped[int] = mapped_column(Integer)
    reputation: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Implement CampaignEvent model**

Create `backend/app/models/event.py`:

```python
from datetime import datetime
from sqlalchemy import String, Integer, JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignEvent(Base):
    __tablename__ = "campaign_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 5: Create models package init**

Create `backend/app/models/__init__.py`:

```python
from app.models.campaign import Campaign
from app.models.event import CampaignEvent

__all__ = ["Campaign", "CampaignEvent"]
```

- [ ] **Step 6: Run tests — expect pass**

Run:
```bash
python -m pytest tests/test_models.py -v
```

Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models backend/tests
git commit -m "feat: Campaign + CampaignEvent models with tests"
```

---

## Task 6: Stub remaining domain models (Squadron, Base, RDProgram, Acquisition, IntelCard, AdversaryState, Vignette)

**Files:**
- Create: `backend/app/models/squadron.py`
- Create: `backend/app/models/campaign_base.py` (Base model — file named to avoid collision with `app.db.base`)
- Create: `backend/app/models/rd_program.py`
- Create: `backend/app/models/acquisition.py`
- Create: `backend/app/models/intel.py`
- Create: `backend/app/models/adversary.py`
- Create: `backend/app/models/vignette.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py` (import all new models)
- Create: `backend/tests/test_domain_models.py`

These are stubs — only fields known today. Subsequent plans will extend them. Schema churn during scaffolding is acceptable because data isn't in production yet.

- [ ] **Step 1: Write tests first**

Create `backend/tests/test_domain_models.py`:

```python
from app.models.campaign import Campaign
from app.models.squadron import Squadron
from app.models.campaign_base import Base as CampaignBase
from app.models.rd_program import RDProgramState
from app.models.acquisition import AcquisitionOrder
from app.models.intel import IntelCard
from app.models.adversary import AdversaryState
from app.models.vignette import Vignette


def _make_campaign(db):
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
    return c


def test_squadron_create(db):
    c = _make_campaign(db)
    base = CampaignBase(
        campaign_id=c.id,
        template_id="ambala",
        shelter_count=24,
        fuel_depot_size=3,
        ad_integration_level=2,
        runway_class="heavy",
    )
    db.add(base)
    db.commit()

    sq = Squadron(
        campaign_id=c.id,
        name="17 Sqn Golden Arrows",
        call_sign="GA",
        platform_id="rafale_f4",
        base_id=base.id,
        strength=18,
        readiness_pct=82,
        xp=0,
    )
    db.add(sq)
    db.commit()
    db.refresh(sq)
    assert sq.id is not None
    assert sq.platform_id == "rafale_f4"


def test_rd_program_create(db):
    c = _make_campaign(db)
    p = RDProgramState(
        campaign_id=c.id,
        program_id="amca_mk1",
        progress_pct=0,
        funding_level="standard",
        status="active",
    )
    db.add(p)
    db.commit()
    assert p.id is not None


def test_acquisition_create(db):
    c = _make_campaign(db)
    ao = AcquisitionOrder(
        campaign_id=c.id,
        platform_id="rafale_f4",
        quantity=114,
        signed_year=2026,
        signed_quarter=1,
        first_delivery_year=2027,
        first_delivery_quarter=4,
        foc_year=2032,
        foc_quarter=1,
        delivered=0,
    )
    db.add(ao)
    db.commit()
    assert ao.id is not None


def test_intel_card_create(db):
    c = _make_campaign(db)
    card = IntelCard(
        campaign_id=c.id,
        appeared_year=2026,
        appeared_quarter=2,
        source_type="IMINT",
        confidence=0.8,
        truth_value=True,
        payload={"headline": "J-20 brigade rotated to Hotan"},
    )
    db.add(card)
    db.commit()
    assert card.id is not None


def test_adversary_state_create(db):
    c = _make_campaign(db)
    st = AdversaryState(
        campaign_id=c.id,
        faction="PLAAF",
        state={"j20_count": 500},
    )
    db.add(st)
    db.commit()
    assert st.id is not None


def test_vignette_create(db):
    c = _make_campaign(db)
    v = Vignette(
        campaign_id=c.id,
        year=2029,
        quarter=3,
        scenario_id="lac_air_incursion_limited",
        event_trace=[{"t": 0, "evt": "detect"}],
        aar_text="...",
        outcome={"india_kia": 1, "adversary_kia": 3},
    )
    db.add(v)
    db.commit()
    assert v.id is not None
```

- [ ] **Step 2: Run to confirm failure**

Run:
```bash
python -m pytest tests/test_domain_models.py -v
```

Expected: ImportError / ModuleNotFoundError for each missing model.

- [ ] **Step 3: Implement Squadron**

Create `backend/app/models/squadron.py`:

```python
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Squadron(Base):
    __tablename__ = "squadrons"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    call_sign: Mapped[str] = mapped_column(String(32))
    platform_id: Mapped[str] = mapped_column(String(64))
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"))
    strength: Mapped[int] = mapped_column(Integer)
    readiness_pct: Mapped[int] = mapped_column(Integer, default=80)
    xp: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 4: Implement Base (campaign base instance)**

Create `backend/app/models/campaign_base.py`:

```python
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base as SqlBase


class Base(SqlBase):
    __tablename__ = "campaign_bases"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    template_id: Mapped[str] = mapped_column(String(64))
    shelter_count: Mapped[int] = mapped_column(Integer, default=0)
    fuel_depot_size: Mapped[int] = mapped_column(Integer, default=1)
    ad_integration_level: Mapped[int] = mapped_column(Integer, default=1)
    runway_class: Mapped[str] = mapped_column(String(32), default="medium")
```

- [ ] **Step 5: Implement RDProgramState**

Create `backend/app/models/rd_program.py`:

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
    milestones_hit: Mapped[list] = mapped_column(JSON, default=list)
```

- [ ] **Step 6: Implement AcquisitionOrder**

Create `backend/app/models/acquisition.py`:

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
```

- [ ] **Step 7: Implement IntelCard**

Create `backend/app/models/intel.py`:

```python
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IntelCard(Base):
    __tablename__ = "intel_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    appeared_year: Mapped[int] = mapped_column(Integer)
    appeared_quarter: Mapped[int] = mapped_column(Integer)
    source_type: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[float] = mapped_column(Float)
    truth_value: Mapped[bool] = mapped_column(Boolean, default=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
```

- [ ] **Step 8: Implement AdversaryState**

Create `backend/app/models/adversary.py`:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdversaryState(Base):
    __tablename__ = "adversary_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    faction: Mapped[str] = mapped_column(String(32))
    state: Mapped[dict] = mapped_column(JSON, default=dict)
```

- [ ] **Step 9: Implement Vignette**

Create `backend/app/models/vignette.py`:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Vignette(Base):
    __tablename__ = "vignettes"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    scenario_id: Mapped[str] = mapped_column(String(64))
    event_trace: Mapped[list] = mapped_column(JSON, default=list)
    aar_text: Mapped[str] = mapped_column(Text, default="")
    outcome: Mapped[dict] = mapped_column(JSON, default=dict)
```

- [ ] **Step 10: Update models __init__**

Overwrite `backend/app/models/__init__.py`:

```python
from app.models.campaign import Campaign
from app.models.campaign_base import Base as CampaignBase
from app.models.squadron import Squadron
from app.models.rd_program import RDProgramState
from app.models.acquisition import AcquisitionOrder
from app.models.intel import IntelCard
from app.models.adversary import AdversaryState
from app.models.vignette import Vignette
from app.models.event import CampaignEvent

__all__ = [
    "Campaign",
    "CampaignBase",
    "Squadron",
    "RDProgramState",
    "AcquisitionOrder",
    "IntelCard",
    "AdversaryState",
    "Vignette",
    "CampaignEvent",
]
```

- [ ] **Step 11: Update conftest.py to import all models**

Overwrite `backend/tests/conftest.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Import all models so Base.metadata knows about them
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
```

- [ ] **Step 12: Run all tests**

Run:
```bash
python -m pytest tests/ -v
```

Expected: 8 passed (2 from test_models.py + 6 from test_domain_models.py).

- [ ] **Step 13: Commit**

```bash
git add backend/app/models backend/tests
git commit -m "feat: stub domain models for Squadron, Base, RD, Acquisition, Intel, Adversary, Vignette"
```

---

## Task 7: YAML content loader with validation

**Files:**
- Create: `backend/app/content/__init__.py`
- Create: `backend/app/content/loader.py`
- Create: `backend/app/content/registry.py`
- Create: `backend/tests/test_content_loader.py`
- Create: `backend/content/platforms.yaml` (MVP subset — full content in Task 8)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_content_loader.py`:

```python
from pathlib import Path
import pytest
import yaml

from app.content.loader import load_platforms, PlatformSpec


def test_load_platforms_returns_dict_by_id(tmp_path: Path):
    yaml_path = tmp_path / "platforms.yaml"
    yaml_path.write_text(yaml.safe_dump({
        "platforms": [
            {
                "id": "rafale_f4",
                "name": "Dassault Rafale F4",
                "origin": "France",
                "role": "multirole",
                "generation": "4.5",
                "combat_radius_km": 1850,
                "payload_kg": 9500,
                "rcs_band": "reduced",
                "radar_range_km": 200,
                "cost_cr": 4500,
                "intro_year": 2020,
            }
        ]
    }))

    result = load_platforms(yaml_path)

    assert "rafale_f4" in result
    assert isinstance(result["rafale_f4"], PlatformSpec)
    assert result["rafale_f4"].name == "Dassault Rafale F4"
    assert result["rafale_f4"].combat_radius_km == 1850


def test_load_platforms_missing_required_field_raises(tmp_path: Path):
    yaml_path = tmp_path / "platforms.yaml"
    yaml_path.write_text(yaml.safe_dump({
        "platforms": [
            {"id": "broken", "name": "Broken"}
        ]
    }))

    with pytest.raises(Exception):
        load_platforms(yaml_path)
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_content_loader.py -v
```

Expected: ImportError for `app.content.loader`.

- [ ] **Step 3: Implement loader**

Create `backend/app/content/__init__.py` (empty file).

Create `backend/app/content/loader.py`:

```python
from pathlib import Path
from typing import Literal
import yaml
from pydantic import BaseModel, Field


class PlatformSpec(BaseModel):
    id: str
    name: str
    origin: str
    role: str
    generation: str
    combat_radius_km: int
    payload_kg: int
    rcs_band: Literal["VLO", "LO", "reduced", "conventional", "large"]
    radar_range_km: int = 0
    cost_cr: int = 0
    intro_year: int = 2000
    image_url: str | None = None


class BaseSpec(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    runway_class: str = "medium"
    faction: str = "IND"


class ObjectiveSpec(BaseModel):
    id: str
    title: str
    description: str
    weight: int = 1
    target_year: int | None = None


class RDProgramSpec(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str] = Field(default_factory=list)


def _load_yaml(path: Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_platforms(path: Path) -> dict[str, PlatformSpec]:
    data = _load_yaml(path)
    return {row["id"]: PlatformSpec(**row) for row in data.get("platforms", [])}


def load_bases(path: Path) -> dict[str, BaseSpec]:
    data = _load_yaml(path)
    return {row["id"]: BaseSpec(**row) for row in data.get("bases", [])}


def load_objectives(path: Path) -> dict[str, ObjectiveSpec]:
    data = _load_yaml(path)
    return {row["id"]: ObjectiveSpec(**row) for row in data.get("objectives", [])}


def load_rd_programs(path: Path) -> dict[str, RDProgramSpec]:
    data = _load_yaml(path)
    return {row["id"]: RDProgramSpec(**row) for row in data.get("programs", [])}
```

- [ ] **Step 4: Implement registry (singleton for content)**

Create `backend/app/content/registry.py`:

```python
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.content.loader import (
    PlatformSpec, BaseSpec, ObjectiveSpec, RDProgramSpec,
    load_platforms, load_bases, load_objectives, load_rd_programs,
)


@lru_cache(maxsize=1)
def platforms() -> dict[str, PlatformSpec]:
    return load_platforms(Path(settings.content_dir) / "platforms.yaml")


@lru_cache(maxsize=1)
def bases() -> dict[str, BaseSpec]:
    return load_bases(Path(settings.content_dir) / "bases.yaml")


@lru_cache(maxsize=1)
def objectives() -> dict[str, ObjectiveSpec]:
    return load_objectives(Path(settings.content_dir) / "objectives.yaml")


@lru_cache(maxsize=1)
def rd_programs() -> dict[str, RDProgramSpec]:
    return load_rd_programs(Path(settings.content_dir) / "rd_programs.yaml")


def reload_all() -> None:
    for fn in (platforms, bases, objectives, rd_programs):
        fn.cache_clear()
```

- [ ] **Step 5: Run tests — expect pass**

Run:
```bash
python -m pytest tests/test_content_loader.py -v
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/content backend/tests/test_content_loader.py
git commit -m "feat: YAML content loader with pydantic validation"
```

---

## Task 8: Author MVP seed content

**Files:**
- Create: `backend/content/platforms.yaml`
- Create: `backend/content/bases.yaml`
- Create: `backend/content/objectives.yaml`
- Create: `backend/content/rd_programs.yaml`
- Create: `backend/tests/test_seed_content.py`

- [ ] **Step 1: Write seed-loads test**

Create `backend/tests/test_seed_content.py`:

```python
from app.content.registry import platforms, bases, objectives, rd_programs, reload_all


def test_seed_platforms_loadable():
    reload_all()
    p = platforms()
    assert "rafale_f4" in p
    assert "tejas_mk1a" in p
    assert "su30_mki" in p
    assert "j20a" in p
    assert "j10c" in p
    # Sanity: 10 platforms minimum
    assert len(p) >= 10


def test_seed_bases_loadable():
    reload_all()
    b = bases()
    assert "ambala" in b
    assert "hasimara" in b
    assert "jodhpur" in b


def test_seed_objectives_loadable():
    reload_all()
    o = objectives()
    assert len(o) >= 3


def test_seed_rd_programs_loadable():
    reload_all()
    r = rd_programs()
    assert "amca_mk1" in r
    assert "astra_mk2" in r
```

- [ ] **Step 2: Run — expect FileNotFoundError**

Run:
```bash
python -m pytest tests/test_seed_content.py -v
```

Expected: FileNotFoundError pointing to `content/platforms.yaml`.

- [ ] **Step 3: Author platforms.yaml**

Create `backend/content/platforms.yaml`:

```yaml
platforms:
  - id: rafale_f4
    name: Dassault Rafale F4
    origin: FR
    role: multirole
    generation: "4.5"
    combat_radius_km: 1850
    payload_kg: 9500
    rcs_band: reduced
    radar_range_km: 200
    cost_cr: 4500
    intro_year: 2020
  - id: rafale_f5
    name: Dassault Rafale F5
    origin: FR
    role: multirole
    generation: "4.75"
    combat_radius_km: 1900
    payload_kg: 9500
    rcs_band: reduced
    radar_range_km: 220
    cost_cr: 5000
    intro_year: 2030
  - id: tejas_mk1a
    name: HAL Tejas Mk1A
    origin: IND
    role: multirole
    generation: "4.5"
    combat_radius_km: 500
    payload_kg: 5300
    rcs_band: reduced
    radar_range_km: 150
    cost_cr: 500
    intro_year: 2024
  - id: tejas_mk2
    name: HAL Tejas Mk2
    origin: IND
    role: multirole
    generation: "4.75"
    combat_radius_km: 1500
    payload_kg: 6500
    rcs_band: reduced
    radar_range_km: 180
    cost_cr: 800
    intro_year: 2033
  - id: su30_mki
    name: Sukhoi Su-30 MKI
    origin: IND
    role: air_superiority
    generation: "4.5"
    combat_radius_km: 1500
    payload_kg: 8000
    rcs_band: conventional
    radar_range_km: 180
    cost_cr: 400
    intro_year: 2002
  - id: mirage2000
    name: Dassault Mirage 2000
    origin: IND
    role: multirole
    generation: "4"
    combat_radius_km: 1550
    payload_kg: 6300
    rcs_band: conventional
    radar_range_km: 110
    cost_cr: 200
    intro_year: 1985
  - id: amca_mk1
    name: HAL AMCA Mk1
    origin: IND
    role: stealth_multirole
    generation: "5"
    combat_radius_km: 1620
    payload_kg: 6500
    rcs_band: VLO
    radar_range_km: 200
    cost_cr: 1500
    intro_year: 2035
  - id: j20a
    name: Chengdu J-20A
    origin: CHN
    role: stealth_superiority
    generation: "5"
    combat_radius_km: 2000
    payload_kg: 6500
    rcs_band: VLO
    radar_range_km: 220
    cost_cr: 0
    intro_year: 2017
  - id: j10c
    name: Chengdu J-10C
    origin: CHN
    role: multirole
    generation: "4.5"
    combat_radius_km: 1240
    payload_kg: 5600
    rcs_band: reduced
    radar_range_km: 170
    cost_cr: 0
    intro_year: 2018
  - id: j35a
    name: Shenyang J-35A
    origin: CHN
    role: stealth_multirole
    generation: "5"
    combat_radius_km: 1250
    payload_kg: 8000
    rcs_band: VLO
    radar_range_km: 200
    cost_cr: 0
    intro_year: 2025
```

- [ ] **Step 4: Author bases.yaml**

Create `backend/content/bases.yaml`:

```yaml
bases:
  - id: ambala
    name: Ambala Air Force Station
    lat: 30.3687
    lon: 76.8100
    runway_class: heavy
    faction: IND
  - id: hasimara
    name: Hasimara Air Force Station
    lat: 26.6833
    lon: 89.3500
    runway_class: heavy
    faction: IND
  - id: jodhpur
    name: Jodhpur Air Force Station
    lat: 26.2506
    lon: 73.0489
    runway_class: heavy
    faction: IND
```

- [ ] **Step 5: Author objectives.yaml**

Create `backend/content/objectives.yaml`:

```yaml
objectives:
  - id: amca_operational_by_2035
    title: Operational AMCA Mk1 squadron by 2035
    description: Field a combat-ready squadron of AMCA Mk1 stealth fighters by end of FY 2034-35.
    weight: 3
    target_year: 2035
  - id: maintain_42_squadrons
    title: Maintain 42+ fighter squadron strength
    description: End the campaign with 42 or more combat-ready IAF fighter squadrons.
    weight: 2
    target_year: 2036
  - id: no_territorial_loss
    title: No loss of sovereign territory in 10 years
    description: Do not cede territorial control to adversary action across the campaign.
    weight: 3
    target_year: 2036
```

- [ ] **Step 6: Author rd_programs.yaml**

Create `backend/content/rd_programs.yaml`:

```yaml
programs:
  - id: amca_mk1
    name: AMCA Mk1
    description: Indigenous 5th-generation stealth multirole fighter.
    base_duration_quarters: 36
    base_cost_cr: 150000
    dependencies: []
  - id: astra_mk2
    name: Astra Mk2
    description: 240km BVR air-to-air missile, entering series production July 2026.
    base_duration_quarters: 4
    base_cost_cr: 8000
    dependencies: []
```

- [ ] **Step 7: Run seed tests**

Run:
```bash
python -m pytest tests/test_seed_content.py -v
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/content backend/tests/test_seed_content.py
git commit -m "feat: MVP seed content — 10 platforms, 3 bases, 3 objectives, 2 R&D programs"
```

---

## Task 9: CRUD + API endpoint for creating a campaign

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/campaign.py`
- Create: `backend/app/crud/__init__.py`
- Create: `backend/app/crud/campaign.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/campaigns.py`
- Create: `backend/tests/test_campaigns_api.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write API test first**

Create `backend/tests/test_campaigns_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
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


def test_create_campaign_returns_201(client):
    response = client.post("/api/campaigns", json={
        "name": "Singh-era modernization",
        "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"],
    })
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Singh-era modernization"
    assert body["current_year"] == 2026
    assert body["current_quarter"] == 2
    assert body["budget_cr"] > 0
    assert "id" in body


def test_get_campaign_returns_same_state(client):
    created = client.post("/api/campaigns", json={
        "name": "Test",
        "difficulty": "realistic",
        "objectives": [],
    }).json()
    got = client.get(f"/api/campaigns/{created['id']}").json()
    assert got["id"] == created["id"]
    assert got["current_year"] == 2026


def test_get_campaign_not_found(client):
    response = client.get("/api/campaigns/99999")
    assert response.status_code == 404
```

- [ ] **Step 2: Implement schemas**

Create `backend/app/schemas/__init__.py` (empty file).

Create `backend/app/schemas/campaign.py`:

```python
from datetime import datetime
from pydantic import BaseModel, Field


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    difficulty: str = "realistic"
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
    difficulty: str
    objectives_json: list
    budget_cr: int
    reputation: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: Implement deps**

Create `backend/app/api/deps.py`:

```python
from typing import Generator
from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/__init__.py` (empty file).

Create `backend/app/crud/campaign.py`:

```python
import random
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.schemas.campaign import CampaignCreate


STARTING_BUDGET_CR = 620000  # ~₹6.2L cr annual defense budget


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
    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, campaign_id: int) -> Campaign | None:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()
```

- [ ] **Step 5: Implement router**

Create `backend/app/api/__init__.py` (empty file).

Create `backend/app/api/campaigns.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import create_campaign, get_campaign
from app.schemas.campaign import CampaignCreate, CampaignRead

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign_endpoint(payload: CampaignCreate, db: Session = Depends(get_db)):
    return create_campaign(db, payload)


@router.get("/{campaign_id}", response_model=CampaignRead)
def get_campaign_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
```

- [ ] **Step 6: Rewrite main.py**

Overwrite `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
import app.models  # noqa: F401  # register all models with Base.metadata
from app.api.campaigns import router as campaigns_router


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sovereign Shield API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(campaigns_router)


@app.get("/")
def root():
    return {"message": "Sovereign Shield API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
```

- [ ] **Step 7: Run tests — expect pass**

Run:
```bash
python -m pytest tests/ -v
```

Expected: all tests pass (models + content loader + seed + campaigns API).

- [ ] **Step 8: Smoke-test with curl**

Run in a separate terminal:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8010
```

Then:
```bash
curl -X POST http://localhost:8010/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","difficulty":"realistic","objectives":["amca_operational_by_2035"]}'
```

Expected: 201 response with a JSON body containing `id`, `current_year: 2026`, `current_quarter: 2`. Stop the dev server after verifying.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas backend/app/crud backend/app/api backend/main.py backend/tests/test_campaigns_api.py
git commit -m "feat: POST /api/campaigns + GET /api/campaigns/{id}

Introduce Pydantic schemas, CRUD layer, and REST router for campaign
lifecycle. New campaign starts at 2026-Q2 with ~₹6.2L cr budget and
records a campaign_created event."
```

---

## Task 10: Advance-turn endpoint (stub — increment quarter only)

**Files:**
- Modify: `backend/app/crud/campaign.py`
- Modify: `backend/app/schemas/campaign.py`
- Modify: `backend/app/api/campaigns.py`
- Modify: `backend/tests/test_campaigns_api.py`

Turn engine logic (procurement math, R&D ticks, adversary evolution, intel generation, vignette rolls) is Plan 2's scope. This task only advances the clock, logs an event, and returns updated state — enough to prove the loop works end-to-end.

- [ ] **Step 1: Add test**

Append to `backend/tests/test_campaigns_api.py`:

```python
def test_advance_turn_increments_quarter(client):
    created = client.post("/api/campaigns", json={
        "name": "T",
        "difficulty": "realistic",
        "objectives": [],
    }).json()

    r = client.post(f"/api/campaigns/{created['id']}/advance")
    assert r.status_code == 200
    body = r.json()
    assert body["current_year"] == 2026
    assert body["current_quarter"] == 3


def test_advance_turn_rolls_year(client):
    created = client.post("/api/campaigns", json={
        "name": "T",
        "difficulty": "realistic",
        "objectives": [],
    }).json()

    # 2026 Q2 -> Q3 -> Q4 -> 2027 Q1
    for _ in range(3):
        r = client.post(f"/api/campaigns/{created['id']}/advance")
        assert r.status_code == 200

    final = client.get(f"/api/campaigns/{created['id']}").json()
    assert final["current_year"] == 2027
    assert final["current_quarter"] == 1


def test_advance_turn_not_found(client):
    r = client.post("/api/campaigns/99999/advance")
    assert r.status_code == 404
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_campaigns_api.py -v
```

Expected: 404 on new endpoint calls (or AttributeError — endpoint doesn't exist).

- [ ] **Step 3: Implement advance in CRUD**

Append to `backend/app/crud/campaign.py`:

```python
def advance_turn(db: Session, campaign: Campaign) -> Campaign:
    if campaign.current_quarter == 4:
        campaign.current_year += 1
        campaign.current_quarter = 1
    else:
        campaign.current_quarter += 1

    event = CampaignEvent(
        campaign_id=campaign.id,
        year=campaign.current_year,
        quarter=campaign.current_quarter,
        event_type="turn_advanced",
        payload={},
    )
    db.add(event)
    db.commit()
    db.refresh(campaign)
    return campaign
```

- [ ] **Step 4: Expose endpoint**

Append to `backend/app/api/campaigns.py`:

```python
from app.crud.campaign import advance_turn


@router.post("/{campaign_id}/advance", response_model=CampaignRead)
def advance_turn_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return advance_turn(db, campaign)
```

- [ ] **Step 5: Run tests — expect pass**

Run:
```bash
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud backend/app/api backend/tests/test_campaigns_api.py
git commit -m "feat: POST /api/campaigns/{id}/advance stub that ticks the clock

Advances quarter, rolls year at Q4->Q1, logs a turn_advanced event.
Procurement math, R&D, intel, and vignette logic live in Plan 2."
```

---

## Task 11: Add frontend dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install deps**

Run:
```bash
cd /Users/rsumit123/work/defense-game/frontend
npm install zustand axios
```

Expected: installs succeed, `package.json` updates with `zustand` and `axios` under dependencies.

- [ ] **Step 2: Verify**

Run:
```bash
cat package.json | grep -E "zustand|axios"
```

Expected: both present.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add zustand + axios to frontend"
```

---

## Task 12: Frontend API client + types

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/.env.example`

- [ ] **Step 1: Write types**

Create `frontend/src/lib/types.ts`:

```typescript
export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";

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

- [ ] **Step 2: Write API client**

Create `frontend/src/lib/api.ts`:

```typescript
import axios from "axios";
import type { Campaign, CampaignCreatePayload } from "./types";

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
};
```

- [ ] **Step 3: Write env example**

Create `frontend/.env.example`:

```
VITE_API_URL=http://localhost:8010
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib frontend/.env.example
git commit -m "feat: frontend axios API client + types for Campaign"
```

---

## Task 13: Zustand store for campaign state

**Files:**
- Create: `frontend/src/store/campaignStore.ts`

- [ ] **Step 1: Implement store**

Create `frontend/src/store/campaignStore.ts`:

```typescript
import { create } from "zustand";
import type { Campaign, CampaignCreatePayload } from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  loading: boolean;
  error: string | null;

  createCampaign: (payload: CampaignCreatePayload) => Promise<void>;
  loadCampaign: (id: number) => Promise<void>;
  advanceTurn: () => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
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
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  reset: () => set({ campaign: null, loading: false, error: null }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store
git commit -m "feat: zustand campaign store"
```

---

## Task 14: Landing + CampaignConsole pages + App shell

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/pages/Landing.tsx`
- Create: `frontend/src/pages/CampaignConsole.tsx`

- [ ] **Step 1: Strip index.css to Tailwind directives**

Overwrite `frontend/src/index.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #0b1220;
  color: #e6edf3;
  min-height: 100vh;
}
```

- [ ] **Step 2: Create Landing page**

Create `frontend/src/pages/Landing.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";

export function Landing() {
  const [name, setName] = useState("Singh-era modernization");
  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const navigate = useNavigate();

  async function handleStart() {
    await createCampaign({
      name,
      difficulty: "realistic",
      objectives: ["amca_operational_by_2035", "maintain_42_squadrons", "no_territorial_loss"],
    });
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sovereign Shield</h1>
          <p className="text-sm opacity-70 mt-1">
            Head of Defense Integration — New Delhi, 2026
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm opacity-80">Campaign name</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || name.trim().length === 0}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg px-4 py-3"
        >
          {loading ? "Starting…" : "Assume Command"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CampaignConsole page**

Create `frontend/src/pages/CampaignConsole.tsx`:

```tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";

export function CampaignConsole() {
  const { id } = useParams<{ id: string }>();
  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const advanceTurn = useCampaignStore((s) => s.advanceTurn);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  if (!campaign) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm opacity-70">
            {campaign.current_year} • Q{campaign.current_quarter} • {campaign.difficulty}
          </p>
        </div>
        <button
          onClick={advanceTurn}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-4 py-2"
        >
          {loading ? "Ending turn…" : "End Turn"}
        </button>
      </header>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4">
        <Stat label="Budget" value={`₹${campaign.budget_cr.toLocaleString()} cr`} />
        <Stat label="Reputation" value={String(campaign.reputation)} />
        <Stat label="Seed" value={String(campaign.seed)} />
        <Stat label="Objectives" value={String(campaign.objectives_json.length)} />
      </section>

      <details className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-xs">
        <summary className="cursor-pointer opacity-80">Raw campaign state</summary>
        <pre className="mt-3 overflow-auto">{JSON.stringify(campaign, null, 2)}</pre>
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4">
      <div className="text-xs uppercase opacity-60">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Wire router in App.tsx**

Overwrite `frontend/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignConsole } from "./pages/CampaignConsole";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignConsole />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Wrap main.tsx with BrowserRouter**

Overwrite `frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 6: Smoke test the frontend**

In one terminal:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8010
```

In another:
```bash
cd frontend && npm run dev
```

Open http://localhost:5173 in the browser. Verify:
- Landing page renders with "Sovereign Shield" heading
- Clicking "Assume Command" creates a campaign (backend logs show 201)
- Page redirects to `/campaign/{id}`
- Campaign console shows name, year/quarter, budget
- Clicking "End Turn" advances the quarter and updates the display

Stop both servers after verifying.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: Landing + CampaignConsole pages with end-to-end campaign lifecycle

Frontend shell proves the full stack works: create campaign, load state,
advance turn. No gameplay UI yet — map, dashboards, vignettes, and LLM
integration are subsequent plans."
```

---

## Task 15: Typecheck + lint cleanup

**Files:**
- No file changes unless typecheck flags issues

- [ ] **Step 1: Run frontend typecheck**

Run:
```bash
cd frontend && npm run build
```

Expected: TypeScript compiles, Vite builds successfully. If errors surface, fix them (usually unused imports or any remnants from deleted old code).

- [ ] **Step 2: Run frontend lint**

Run:
```bash
cd frontend && npm run lint
```

Expected: no errors. Warnings on unused imports are acceptable but prefer fixing them by removing.

- [ ] **Step 3: Run backend tests one final time**

Run:
```bash
cd backend && source .venv/bin/activate && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit any lint/typecheck fixes**

If any files were changed:
```bash
git add -A
git commit -m "chore: fix typecheck + lint findings"
```

Otherwise skip.

---

## Task 16: Update deployment config for renamed backend

**Files:**
- Modify: `deploy.sh`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Fix deploy.sh to mount data volume**

The existing deploy.sh one-liner does NOT mount the host data volume, which would lose the SQLite DB on every redeploy. Overwrite `deploy.sh`:

```bash
#!/bin/bash
# Sovereign Shield — One-command deploy script
# Usage: ./deploy.sh [frontend|backend|both]

set -e

TARGET=${1:-both}
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

deploy_frontend() {
    echo "═══ Deploying Frontend to Vercel ═══"
    cd "$REPO_ROOT/frontend"
    npx vercel --prod --yes
    echo "✓ Frontend deployed"
}

deploy_backend() {
    echo "═══ Deploying Backend to GCP ═══"
    gcloud compute ssh socialflow \
        --project=polar-pillar-450607-b7 \
        --zone=us-east1-d \
        --command="cd /home/rsumit123/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker rm -f defense-game-backend 2>/dev/null; docker run -d --name defense-game-backend -p 8010:8010 -v /home/rsumit123/pmc-tycoon/backend/data:/app/data -e OPENROUTER_API_KEY=\"\$OPENROUTER_API_KEY\" defense-game-backend"
    echo "✓ Backend deployed"
}

case "$TARGET" in
    frontend|fe|f) deploy_frontend ;;
    backend|be|b) deploy_backend ;;
    both|all) deploy_frontend; deploy_backend ;;
    *) echo "Usage: ./deploy.sh [frontend|backend|both]"; exit 1 ;;
esac

echo "═══ Deploy complete ═══"
```

- [ ] **Step 2: Update DEPLOYMENT.md**

In `docs/DEPLOYMENT.md`, locate the "Database" section and update it to reference Sovereign Shield. Update:

- Database filename: `pmc_tycoon.db` → `sovereign_shield.db`
- Init: "`init_data.py` runs automatically on container start" → "`Base.metadata.create_all` creates missing tables on container start; content is loaded from YAML files in `backend/content/` at request time."
- Full reset: "Delete `backend/data/pmc_tycoon.db`" → "Delete `backend/data/sovereign_shield.db`"

Use the Edit tool to make these three changes.

- [ ] **Step 3: Verify nothing references `init_data.py` anymore**

Run:
```bash
grep -r "init_data" docs/ deploy.sh backend/ 2>/dev/null
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add deploy.sh docs/DEPLOYMENT.md
git commit -m "chore: update deploy.sh to mount data volume + pass OPENROUTER_API_KEY

Existing deploy script was missing the -v host-mount for backend data,
which would wipe the SQLite DB on every redeploy. DEPLOYMENT.md updated
to reference sovereign_shield.db and drop init_data.py references."
```

---

## Task 17: Final smoke test + README note

**Files:**
- Create: `README.md` (or update if exists)

- [ ] **Step 1: Check for existing README at repo root**

Run:
```bash
ls README.md 2>/dev/null
```

- [ ] **Step 2: Write / replace README**

Create (or overwrite) `/Users/rsumit123/work/defense-game/README.md`:

```markdown
# Sovereign Shield

A browser-based single-player grand strategy game. You play India's Head of Defense Integration, 2026–2036. Manage procurement, R&D, and force structure across 40 quarterly turns against real-world named adversaries (PLAAF, PAF, PLAN).

## Status

Foundation scaffolding complete (see `docs/superpowers/plans/`). Gameplay systems (turn engine, adversary simulation, vignettes, LLM AAR generation, UI dashboards) live in subsequent plans.

## Stack

- Backend: FastAPI + SQLAlchemy + SQLite
- Frontend: React 19 + Vite + TypeScript + Tailwind + Zustand
- LLM: OpenRouter (env var key)
- Hosting: Vercel (frontend) + GCP VM Docker (backend)

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8010
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

### Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -v
```

## Docs

- `docs/superpowers/specs/` — design specs
- `docs/decisions/` — design decision log (what we picked and why)
- `docs/content/` — seed content and reference data
- `docs/superpowers/plans/` — implementation plans
- `docs/DEPLOYMENT.md` — deploy operational runbook
```

- [ ] **Step 3: Run the full stack once more end-to-end**

Terminal A:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8010
```

Terminal B:
```bash
cd frontend && npm run dev
```

Verify in browser:
1. Landing loads at http://localhost:5173
2. Create a campaign — lands on `/campaign/{id}`
3. End Turn 3 times — quarter advances 2→3→4, then year rolls to 2027 Q1
4. Refresh the page — state persists (it's reloaded from API)

Stop both servers.

- [ ] **Step 4: Commit README**

```bash
git add README.md
git commit -m "docs: add README pointing at specs, plans, and dev workflow"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Spec §1 (game identity): no task (nothing to build — just framing)
- ✅ Spec §2 (core loop): not in scope for Plan 1 — subsequent plan
- ✅ Spec §3 (vignettes): not in scope for Plan 1
- ✅ Spec §4 (adversary intel): not in scope for Plan 1
- ✅ Spec §5 (campaign arc): starting state covered by Task 9 (campaign creation at 2026-Q2); arc logic deferred
- ✅ Spec §6 (tech architecture): Tasks 3, 4, 5, 6, 9, 11-14 establish all modules
- ✅ Spec §7 (UX direction): deferred to later frontend plan — Plan 1 ships a shell only
- ✅ Spec §8 (content pipeline): Tasks 7, 8 establish YAML loader + MVP seed
- ✅ Spec §9 (future improvements): N/A (parked)
- ✅ Spec §10 (open questions): N/A

**Plan 1 explicitly does NOT cover:**
- Turn engine math (procurement, R&D progression, intel generation, adversary tick) → Plan 2
- Adversary simulation → Plan 3
- Vignette scenario generation and resolution → Plan 4
- LLM integration (OpenRouter + AARs + intel briefs + retrospective) → Plan 5
- Map-first UI, swipe-stack intel, long-press dossier, radar charts, etc. → Plan 6
- Platform asset fetcher script + Wikimedia media pipeline → Plan 6
- Campaign end + white paper + shareable card → Plan 7

These are called out here so the next planning cycle references them explicitly.

**Placeholder scan:** No "TBD" / "implement later" / "add validation" in any task step. Every code block is complete.

**Type consistency:** Reviewed. `CampaignEvent.payload` is a dict; `Campaign.objectives_json` is a list; `IntelCard.payload` is a dict. Store's `Campaign` TS type matches backend's `CampaignRead` Pydantic schema field names. API client method names (`createCampaign`, `getCampaign`, `advanceTurn`) consistent between `api.ts` and store.

**Scope:** Focused on foundation only. One plan, one coherent deliverable (end-to-end campaign-lifecycle loop).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-foundation-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
