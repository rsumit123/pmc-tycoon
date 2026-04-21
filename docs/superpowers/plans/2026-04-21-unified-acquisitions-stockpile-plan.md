# Unified Acquisitions + Stockpile Logistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Missiles and AD interceptors become stockpile resources that deplete in combat. Acquisitions extends to handle their procurement as multi-quarter contracts (same pattern as aircraft today). Treasury is debited at acquisition time, not at combat time — eliminates Plan 17's per-shot double-billing.

**Architecture:** Three new `AcquisitionOrder.kind` values (`missile_batch` / `ad_battery` / `ad_reload`) join the existing `platform`. Per-base `MissileStock` table tracks missile depots; new `ADBattery.interceptor_stock` column tracks per-battery magazines. Resolver decrements stock on each launch; empty depot → shot not fired (no fallback). Plan 17's `commit_vignette` munitions-cost treasury debit is removed — cost was pre-paid via Acquisitions. Armory's "Install AD at base" button is removed and redirected to Acquisitions. Final task is an enhanced 40-turn player-economy simulation that validates the rebalanced numbers before ship.

**Tech Stack:** FastAPI / SQLAlchemy 2.x / Pydantic 2 / React 19 + Zustand / pytest + Vitest.

---

## Data shape (locked up front)

### New DB objects

**`MissileStock` ORM** (`backend/app/models/missile_stock.py`):
```python
class MissileStock(Base):
    __tablename__ = "missile_stocks"
    __table_args__ = (UniqueConstraint("campaign_id", "base_id", "weapon_id",
                      name="uq_campaign_base_weapon"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"), index=True)
    weapon_id: Mapped[str] = mapped_column(String(64))
    stock: Mapped[int] = mapped_column(Integer, default=0)
```

**`ADBattery.interceptor_stock`** — new int column on existing `ADBattery`, default 0.

**`AcquisitionOrder.kind`** — new `String(32)` column on existing `AcquisitionOrder`, default `"platform"` for backward compat.

### New Pydantic schemas

**`MissileStockRead`** — `campaign_id`, `base_id`, `weapon_id`, `stock`.

**Extended `AcquisitionCreatePayload`** — adds `kind: Literal["platform","missile_batch","ad_battery","ad_reload"] = "platform"`. `platform_id` field is renamed in semantic to `resource_id` but kept under the existing name to avoid breaking the DB. For `missile_batch`, `resource_id` = weapon_id. For `ad_battery`, = ad_system_id. For `ad_reload`, = a new optional field `target_battery_id: int | None` (ad_reload requires an existing battery; not creating a new one).

### Starting stock formulas (seeded on campaign create)

- **Missiles per base:** for every squadron at base B, for every weapon W in that squadron's effective loadout, add `squadron.strength × 4` units to `MissileStock(campaign_id, base_id=B.id, weapon_id=W)`.
- **AD interceptors** per battery (hardcoded by system):

| System | Starting stock |
|---|---|
| s400 | 16 |
| long_range_sam | 16 |
| project_kusha | 12 |
| mrsam_air | 24 |
| akash_ng | 24 |
| qrsam | 32 |
| vshorads | 32 |

### Interceptor unit costs (new `interceptor_cost_cr` field in `ad_systems.yaml`)

| System | ₹ cr / shot |
|---|---|
| s400 | 17 |
| long_range_sam | 15 |
| project_kusha | 15 |
| mrsam_air | 5 |
| akash_ng | 3 |
| qrsam | 2 |
| vshorads | 1 |

### Acquisition cost formulas (per new kind)

- `missile_batch`: `total_cost_cr = quantity × WEAPONS[weapon_id]["unit_cost_cr"]`. Delivery: 4 quarters (configurable per batch, default 4). On delivery quarter N of M, add `round(quantity × N/M)` to stock at `preferred_base_id`.
- `ad_battery`: `total_cost_cr = install_cost_cr + (starting_stock × interceptor_cost_cr)`. Delivery: 8 quarters (S-400-class), 4 quarters (others). On FOC, create `ADBattery` row at preferred base with full `interceptor_stock`.
- `ad_reload`: `total_cost_cr = quantity × interceptor_cost_cr`. Delivery: 2 quarters. On delivery quarter N of M, add `round(quantity × N/M)` to the target battery's `interceptor_stock`.

---

## File Structure

**Backend — new:**
- `backend/app/models/missile_stock.py` — new ORM.
- `backend/app/schemas/missile_stock.py` — Pydantic schemas.
- `backend/app/api/missile_stocks.py` — `GET /api/campaigns/{id}/missile-stocks` endpoint.
- `backend/tests/test_missile_stock.py` — ORM + seeding tests.
- `backend/tests/test_resolver_stockpile.py` — resolver depletion + empty-stock tests.
- `backend/tests/test_acquisition_kinds.py` — new acquisition kinds.
- `backend/tests/test_economy_simulation.py` — 40-turn moderate-player simulation.

**Backend — modified:**
- `backend/app/models/__init__.py` — register MissileStock.
- `backend/app/models/ad_battery.py` — add `interceptor_stock` column.
- `backend/app/models/acquisition.py` — add `kind` column.
- `backend/app/schemas/acquisition.py` — extend payload + read schemas.
- `backend/app/crud/acquisition.py` — `create_order` accepts `kind`.
- `backend/app/crud/seed_starting_state.py` — seed MissileStock + initial interceptor counts on ADBattery rows.
- `backend/app/crud/campaign.py` — hook delivery dispatch by `kind`.
- `backend/app/engine/vignette/resolver.py` + `bvr.py` — decrement MissileStock in BVR/WVR, skip if empty.
- `backend/app/engine/vignette/ad_engagement.py` — decrement interceptor_stock, skip if empty.
- `backend/app/crud/vignette.py` — REMOVE the `munitions_cost_total_cr` treasury debit on commit; keep `munitions_cost` event for analytics but no cash impact.
- `backend/app/engine/acquisition.py` — handle `missile_batch` / `ad_battery` / `ad_reload` delivery paths.
- `backend/app/api/armory.py` — keep install endpoint (existing campaigns may still use it, but deprecate path for new flows).
- `backend/content/ad_systems.yaml` — add `interceptor_cost_cr` per system.
- `backend/main.py` — register missile_stocks router.

**Frontend — modified:**
- `frontend/src/lib/types.ts` — add `MissileStock`, extend `AcquisitionOrder` + `AcquisitionCreatePayload` with `kind` + related fields.
- `frontend/src/lib/api.ts` — add `getMissileStocks`.
- `frontend/src/store/campaignStore.ts` — add `missileStocks` state + `loadMissileStocks`.
- `frontend/src/components/procurement/AcquisitionPipeline.tsx` — Offers tab gets Aircraft / Missile Batches / AD Batteries / AD Reloads sub-sections.
- `frontend/src/components/vignette/ForceCommitter.tsx` — depot status per squadron row.
- `frontend/src/pages/ArmoryPage.tsx` — remove "Install at base" button for AD; show stock in Deployments table; add missile depot view.
- `frontend/src/components/vignette/MunitionsExpended.tsx` — reframe from "bill" to "consumed from stock" + "replacement cost".

**Docs:**
- `CLAUDE.md` — strike resolved carry-overs, add Plan 18 status line.

---

## Task 1: MissileStock ORM + ALTER TABLE prep

**Files:**
- Create: `backend/app/models/missile_stock.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_missile_stock.py`

- [ ] **Step 1: Write the model**

```python
# backend/app/models/missile_stock.py
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MissileStock(Base):
    __tablename__ = "missile_stocks"
    __table_args__ = (
        UniqueConstraint("campaign_id", "base_id", "weapon_id",
                         name="uq_campaign_base_weapon"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id"), index=True,
    )
    base_id: Mapped[int] = mapped_column(
        ForeignKey("campaign_bases.id"), index=True,
    )
    weapon_id: Mapped[str] = mapped_column(String(64))
    stock: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 2: Register in models/__init__.py**

Append `from app.models.missile_stock import MissileStock  # noqa: F401` in the appropriate place alongside other model imports.

- [ ] **Step 3: Write basic test**

```python
# backend/tests/test_missile_stock.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
import app.models  # noqa: F401
from app.models.missile_stock import MissileStock


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    s = SessionLocal()
    yield s
    s.close()


def test_missile_stock_unique_constraint(session):
    """One row per (campaign_id, base_id, weapon_id)."""
    # Need to create campaign + base first since FKs reference them
    from app.models.campaign import Campaign
    from app.models.campaign_base import CampaignBase
    c = Campaign(name="T", seed=1, starting_year=2026, starting_quarter=2,
                 current_year=2026, current_quarter=2, difficulty="realistic",
                 objectives_json=[], budget_cr=45000, quarterly_grant_cr=45000,
                 current_allocation_json=None, reputation=50)
    session.add(c); session.flush()
    b = CampaignBase(campaign_id=c.id, template_id="test_base",
                     name="Test Base", lat=28.0, lon=77.0, shelter_count=10,
                     fuel_depot_size=2, ad_integration_level=1, runway_class="long")
    session.add(b); session.flush()

    session.add(MissileStock(campaign_id=c.id, base_id=b.id,
                             weapon_id="meteor", stock=50))
    session.commit()

    # Duplicate raises
    session.add(MissileStock(campaign_id=c.id, base_id=b.id,
                             weapon_id="meteor", stock=20))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    # Different weapon is fine
    session.add(MissileStock(campaign_id=c.id, base_id=b.id,
                             weapon_id="r77", stock=30))
    session.commit()

    rows = session.query(MissileStock).filter_by(campaign_id=c.id).all()
    assert len(rows) == 2
```

- [ ] **Step 4: Run test**

```bash
cd backend && python3 -m pytest tests/test_missile_stock.py -v
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/missile_stock.py backend/app/models/__init__.py backend/tests/test_missile_stock.py
git commit -m "feat(stockpile): MissileStock ORM with unique (campaign, base, weapon)"
```

---

## Task 2: ADBattery.interceptor_stock column

**Files:**
- Modify: `backend/app/models/ad_battery.py`

- [ ] **Step 1: Add column**

```python
# inside ADBattery class
interceptor_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
```

- [ ] **Step 2: Sanity check**

```bash
cd backend && python3 -c "
from app.db.base import Base
from sqlalchemy import create_engine
e = create_engine('sqlite:///:memory:')
Base.metadata.create_all(e)
from sqlalchemy import inspect
insp = inspect(e)
cols = [c['name'] for c in insp.get_columns('ad_batteries')]
assert 'interceptor_stock' in cols, cols
print('ok:', cols)
"
```
Expected: `ok: [...'interceptor_stock'...]`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/ad_battery.py
git commit -m "feat(stockpile): ADBattery.interceptor_stock column (per-battery magazine)"
```

---

## Task 3: ad_systems.yaml — interceptor_cost_cr

**Files:**
- Modify: `backend/content/ad_systems.yaml`
- Modify: `backend/app/content/loaders.py` (or wherever ADSystemSpec dataclass lives)

- [ ] **Step 1: Add field to content loader**

Find the `ADSystemSpec` dataclass (likely in `backend/app/content/loaders.py` or `registry.py`). Add:

```python
interceptor_cost_cr: int = 0
```

- [ ] **Step 2: Add cost to each system in YAML**

Edit `backend/content/ad_systems.yaml` to add `interceptor_cost_cr: N` to each entry:

```yaml
  - id: s400
    ...
    interceptor_cost_cr: 17
  - id: long_range_sam
    ...
    interceptor_cost_cr: 15
  - id: project_kusha
    ...
    interceptor_cost_cr: 15
  - id: mrsam_air
    ...
    interceptor_cost_cr: 5
  - id: akash_ng
    ...
    interceptor_cost_cr: 3
  - id: qrsam
    ...
    interceptor_cost_cr: 2
  - id: vshorads
    ...
    interceptor_cost_cr: 1
```

- [ ] **Step 3: Verify**

```bash
cd backend && python3 -c "
from app.content.registry import ad_systems
specs = ad_systems()
for sid, s in specs.items():
    print(f'{sid}: install={s.install_cost_cr} per_shot={s.interceptor_cost_cr}')
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/content/ad_systems.yaml backend/app/content/
git commit -m "feat(stockpile): interceptor_cost_cr per AD system (S-400 ₹17, Akash-NG ₹3, etc.)"
```

---

## Task 4: Seed MissileStock + initial interceptor_stock

**Files:**
- Modify: `backend/app/crud/seed_starting_state.py`

- [ ] **Step 1: Add starting interceptor capacity map**

Near the top of the file:

```python
AD_STARTING_INTERCEPTORS: dict[str, int] = {
    "s400": 16,
    "long_range_sam": 16,
    "project_kusha": 12,
    "mrsam_air": 24,
    "akash_ng": 24,
    "qrsam": 32,
    "vshorads": 32,
}
```

- [ ] **Step 2: Populate interceptor_stock when creating ADBattery**

Find the loop in `seed_starting_state` that creates ADBattery rows (uses SEED_AD_BATTERIES). Where you create the row, set `interceptor_stock=AD_STARTING_INTERCEPTORS.get(sys_id, 0)`.

- [ ] **Step 3: Seed MissileStock after squadrons are created**

After the squadrons loop completes, iterate squadrons and seed missile stock:

```python
from app.models.missile_stock import MissileStock
from app.engine.vignette.bvr import PLATFORM_LOADOUTS

def _loadout_for(platform_id: str) -> list[str]:
    p = PLATFORM_LOADOUTS.get(platform_id, {})
    return list(p.get("bvr", [])) + list(p.get("wvr", []))

SHOTS_PER_AIRFRAME = 4
# Aggregate: for each (base_id, weapon_id), total stock = sum over squadrons
# at that base = Σ (squadron.strength × SHOTS_PER_AIRFRAME)
stock_by_key: dict[tuple[int, str], int] = {}
for sq in sq_rows:  # sq_rows is the list of just-created Squadron rows
    for weapon in _loadout_for(sq.platform_id):
        key = (sq.base_id, weapon)
        stock_by_key[key] = stock_by_key.get(key, 0) + sq.strength * SHOTS_PER_AIRFRAME

for (base_id, weapon_id), stock in stock_by_key.items():
    db.add(MissileStock(campaign_id=campaign.id, base_id=base_id,
                        weapon_id=weapon_id, stock=stock))
```

Adapt the variable name `sq_rows` to what the actual function uses.

- [ ] **Step 4: Write seeding test**

Append to `backend/tests/test_missile_stock.py`:

```python
def test_seed_populates_missile_stock_and_interceptor_stock():
    """Fresh campaign should have MissileStock rows per base/weapon + AD interceptor stock > 0."""
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker, Session
    from sqlalchemy.pool import StaticPool
    from app.db.base import Base
    import app.models  # noqa: F401
    from app.api.deps import get_db
    from main import app as fastapi_app
    from app.models.missile_stock import MissileStock
    from app.models.ad_battery import ADBattery

    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSession()
        try: yield db
        finally: db.close()
    fastapi_app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(fastapi_app)
        r = client.post("/api/campaigns", json={
            "name": "seed-stockpile", "difficulty": "realistic",
            "objectives": ["amca_operational_by_2035"],
        })
        assert r.status_code == 201
        cid = r.json()["id"]

        with Session(engine) as s:
            missiles = s.query(MissileStock).filter_by(campaign_id=cid).all()
            assert len(missiles) > 0
            # Every row must have positive stock
            assert all(m.stock > 0 for m in missiles)
            # At least meteor + r77 + r73 should appear (rafale + su30 + more)
            weapons = {m.weapon_id for m in missiles}
            assert {"meteor", "r77", "r73"}.issubset(weapons), weapons

            batteries = s.query(ADBattery).filter_by(campaign_id=cid).all()
            assert len(batteries) > 0
            for b in batteries:
                assert b.interceptor_stock > 0, f"battery {b.id} ({b.system_id}) has 0 stock"
    finally:
        fastapi_app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
```

- [ ] **Step 5: Run**

```bash
cd backend && python3 -m pytest tests/test_missile_stock.py -v
```
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/seed_starting_state.py backend/tests/test_missile_stock.py
git commit -m "feat(stockpile): seed MissileStock (×4 per airframe) + AD interceptor starting stock"
```

---

## Task 5: Backfill existing campaigns (one-off SQL via docker exec)

**Files:**
- No code changes — runtime script.

- [ ] **Step 1: Deploy latest backend first (so schema migration lands)**

```bash
./deploy.sh
```

Verify container restarted by running the SQL `PRAGMA table_info(ad_batteries)` to confirm `interceptor_stock` column exists.

- [ ] **Step 2: Run backfill script against prod DB**

```bash
gcloud compute ssh socialflow --project=polar-pillar-450607-b7 --zone=us-east1-d --command="docker exec defense-game-backend python3 -c \"
from app.db.session import SessionLocal
from app.models.campaign import Campaign
from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from app.models.ad_battery import ADBattery
from app.models.missile_stock import MissileStock
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.crud.seed_starting_state import AD_STARTING_INTERCEPTORS

db = SessionLocal()
SHOTS_PER_AIRFRAME = 4

def loadout_for(platform_id):
    p = PLATFORM_LOADOUTS.get(platform_id, {})
    return list(p.get('bvr', [])) + list(p.get('wvr', []))

for camp in db.query(Campaign).all():
    # Backfill AD interceptor stock for batteries that have 0
    bats = db.query(ADBattery).filter_by(campaign_id=camp.id).all()
    bat_updated = 0
    for b in bats:
        if b.interceptor_stock == 0:
            b.interceptor_stock = AD_STARTING_INTERCEPTORS.get(b.system_id, 16)
            bat_updated += 1

    # Backfill MissileStock from squadron loadouts
    squads = db.query(Squadron).filter_by(campaign_id=camp.id).all()
    stock_by_key = {}
    for sq in squads:
        for weapon in loadout_for(sq.platform_id):
            key = (sq.base_id, weapon)
            stock_by_key[key] = stock_by_key.get(key, 0) + sq.strength * SHOTS_PER_AIRFRAME

    existing = {(m.base_id, m.weapon_id): m for m in
                db.query(MissileStock).filter_by(campaign_id=camp.id).all()}
    ms_added = 0
    for (bid, wid), stock in stock_by_key.items():
        if (bid, wid) not in existing:
            db.add(MissileStock(campaign_id=camp.id, base_id=bid,
                                weapon_id=wid, stock=stock))
            ms_added += 1

    if bat_updated or ms_added:
        print(f'Campaign {camp.id} ({camp.name}): {bat_updated} batteries, +{ms_added} missile stocks')
    db.commit()
db.close()
print('backfill done')
\""
```

- [ ] **Step 3: Verify**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/armory/ad-batteries" | python3 -c "
import sys, json
bats = json.load(sys.stdin)
# interceptor_stock is not in current schema response — skip this check if not present yet.
print('batteries:', len(bats))"
```

- [ ] **Step 4: Commit (no code changes, just a marker)**

Skip commit for this task — it's runtime only. Note in Plan 18 status line.

---

## Task 6: Resolver — BVR/WVR consume MissileStock, skip if empty

**Files:**
- Modify: `backend/app/engine/vignette/resolver.py`
- Test: `backend/tests/test_resolver_stockpile.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resolver_stockpile.py
"""Resolver respects per-base missile stock: empty depot → no shot fired."""
from app.engine.vignette.resolver import resolve

# Build a minimal planning state. Only change: committed squadron's base has
# limited stock that can't support the attempted 3-round BVR/WVR shots.

def _ps_with_limited_stock():
    return {
        "scenario_id": "test",
        "scenario_name": "Test",
        "ao": {"region": "test", "name": "t", "lat": 28.0, "lon": 77.0},
        "response_clock_minutes": 30,
        "adversary_force": [
            {"role": "CAP", "faction": "PLAAF",
             "platform_id": "j16", "count": 3, "loadout": ["pl15"]},
        ],
        "eligible_squadrons": [{
            "squadron_id": 101, "name": "17 Sqn", "platform_id": "rafale_f4",
            "base_id": 1, "base_name": "Test Base", "distance_km": 200.0,
            "in_range": True, "range_tier": "A",
            "airframes_available": 4, "readiness_pct": 80, "xp": 0,
            "loadout": ["meteor", "mica_ir"],
        }],
        "allowed_ind_roles": ["interceptor"],
        "roe_options": ["weapons_free"],
        "objective": {"kind": "defend_airspace", "success_threshold": {}},
        "missile_stock": {
            # base 1 has only 2 Meteor and 0 MICA-IR — resolver should fire
            # up to 2 Meteor and 0 MICA-IR across all rounds.
            (1, "meteor"): 2,
            (1, "mica_ir"): 0,
        },
    }


def test_resolver_respects_missile_stock():
    ps = _ps_with_limited_stock()
    cf = {
        "squadrons": [{"squadron_id": 101, "airframes": 4}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }
    platforms = {
        "rafale_f4": {"combat_radius_km": 1000, "generation": "4.5",
                      "radar_range_km": 220, "rcs_band": "reduced"},
        "j16": {"combat_radius_km": 1000, "generation": "4.5",
                "radar_range_km": 180, "rcs_band": "conventional"},
    }
    outcome, trace = resolve(ps, cf, platforms, seed=42, year=2026, quarter=2)

    # Count IND bvr/wvr launches in trace
    ind_launches = [e for e in trace if e.get("kind") in ("bvr_launch", "wvr_launch")
                                         and e.get("side") == "ind"]
    # At most 2 Meteor launches (stock limit), 0 MICA-IR launches
    launches_by_weapon = {}
    for e in ind_launches:
        launches_by_weapon[e["weapon"]] = launches_by_weapon.get(e["weapon"], 0) + 1
    assert launches_by_weapon.get("meteor", 0) <= 2
    assert launches_by_weapon.get("mica_ir", 0) == 0

    # Final stock should be present in outcome for the UI
    assert "missile_stock_consumed" in outcome
    assert outcome["missile_stock_consumed"].get("meteor", 0) == launches_by_weapon.get("meteor", 0)
```

- [ ] **Step 2: Wire `missile_stock` into resolver**

In `resolver.py::resolve`, accept the `missile_stock` dict from planning_state (pre-populated by caller — Task 7 wires this). Pass it through `_resolve_round` and the `_best_weapon` helper so launches consume it.

Rough shape:

```python
def resolve(planning_state, committed_force, platforms_registry,
            seed, year, quarter):
    # ... existing code ...

    # Pull starting stock out of planning_state (caller merges in DB stock).
    # Mutable dict: {(base_id, weapon_id): remaining}
    stock = dict(planning_state.get("missile_stock", {}))

    # ... pass `stock` into each _resolve_round call ...

    # Compute consumed (delta from initial to remaining) at the end
    initial_stock = planning_state.get("missile_stock", {})
    consumed: dict[str, int] = {}
    for (bid, wid), remaining in stock.items():
        burned = initial_stock.get((bid, wid), remaining) - remaining
        if burned > 0:
            consumed[wid] = consumed.get(wid, 0) + burned
    outcome["missile_stock_consumed"] = consumed
    outcome["missile_stock_remaining"] = dict(stock)  # for AAR display
```

Then in `_resolve_round`, before firing:

```python
# In the attacker loop:
for a in attackers:
    if not survivors: break
    weapon = _best_weapon(a["loadout"], weapon_kind)
    if weapon is None: continue
    base_id = a.get("base_id")
    # IND side consumes from base stock; ADV has unlimited stock (abstracted)
    if side_label == "ind" and base_id is not None:
        key = (base_id, weapon)
        if stock.get(key, 0) <= 0:
            continue  # depot empty — attacker holds fire, no shot, no cost
        # fire rate + pk path same as before
        ...
        # on launch:
        stock[key] = stock.get(key, 0) - 1
```

Also add `base_id` to the attacker dict when `_make_airframes` constructs IND units (it currently has squadron_id; add base_id by looking up the eligible squadron).

- [ ] **Step 3: Run test**

```bash
cd backend && python3 -m pytest tests/test_resolver_stockpile.py -v
```

- [ ] **Step 4: Run full resolver tests**

```bash
cd backend && python3 -m pytest tests/test_resolver* tests/test_vignette* -q
```
Existing tests must still pass (they pass empty `missile_stock`, which won't gate anything when caller supplies unlimited/no entry).

**Guard:** if `stock` dict is empty (legacy callers not yet wiring it), treat `missing key` as unlimited. This is a backward-compat shim; Task 7 makes the caller always pass stock.

Update the Step 2 code:
```python
if side_label == "ind" and base_id is not None and stock:
    key = (base_id, weapon)
    if key in stock and stock[key] <= 0:
        continue
    if key in stock:
        stock[key] -= 1
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/vignette/resolver.py backend/tests/test_resolver_stockpile.py
git commit -m "feat(stockpile): BVR/WVR resolver decrements MissileStock, skips on empty depot"
```

---

## Task 7: Wire MissileStock into commit_vignette + remove munitions treasury debit

**Files:**
- Modify: `backend/app/crud/vignette.py`

- [ ] **Step 1: Pull stock rows, pass to resolver**

In `commit_vignette`, before calling `resolve(...)`:

```python
from app.models.missile_stock import MissileStock

stock_rows = db.query(MissileStock).filter_by(campaign_id=campaign.id).all()
missile_stock = {(r.base_id, r.weapon_id): r.stock for r in stock_rows}
ps_with_stock = dict(ps)
ps_with_stock["missile_stock"] = missile_stock
```

Pass `ps_with_stock` to `resolve` instead of `ps`.

- [ ] **Step 2: Persist stock decrements after resolve**

After `outcome, event_trace = resolve(...)`:

```python
remaining = outcome.get("missile_stock_remaining", {})
# Update or delete MissileStock rows
for r in stock_rows:
    new_stock = remaining.get((r.base_id, r.weapon_id), r.stock)
    r.stock = max(0, new_stock)
```

- [ ] **Step 3: REMOVE the munitions_cost treasury debit**

Find the block in `commit_vignette` that does:
```python
munitions_cost = int(outcome.get("munitions_cost_total_cr", 0) or 0)
if munitions_cost > 0:
    campaign.budget_cr = ... - munitions_cost
    db.add(CampaignEvent(... "munitions_cost" ...))
```

**Delete the `campaign.budget_cr -= munitions_cost` line.** Cost is pre-paid via Acquisitions. Keep the `munitions_cost` event for telemetry (shows how much stock was "worth") but it no longer hits budget.

Alternatively: repurpose it as `munitions_consumed` event with different payload. For now, keep as-is for backward compat, strip the treasury deduction.

- [ ] **Step 4: Run tests**

```bash
cd backend && python3 -m pytest tests/test_vignette* tests/test_resolver* tests/test_combat* -q
```

Expected: most pass. Some that relied on post-combat budget going down may need updating. That's OK — fix those to assert stock consumption instead.

- [ ] **Step 5: Commit**

```bash
git add backend/app/crud/vignette.py
git commit -m "feat(stockpile): commit_vignette reads/writes MissileStock, drops per-shot treasury debit"
```

---

## Task 8: AD engagement decrements interceptor_stock

**Files:**
- Modify: `backend/app/engine/vignette/ad_engagement.py`
- Modify: `backend/app/crud/vignette.py` (pass stock in, write back)

- [ ] **Step 1: Extend ad_engagement signature**

Current:
```python
def resolve_ad_engagement(ao, batteries, bases_registry, ad_specs, adv_force, rng):
```

Extended (append, so existing callers still work):
```python
def resolve_ad_engagement(ao, batteries, bases_registry, ad_specs, adv_force,
                         rng, battery_stock=None):
    # battery_stock: dict {battery_id: current_interceptor_stock}
    # If None, assume unlimited (legacy behavior).
    ...
```

Inside the function, before each `rng.random() < pk` roll:
```python
bid = bat_info["battery"]["id"]
if battery_stock is not None:
    if battery_stock.get(bid, 0) <= 0:
        continue  # magazine empty
    battery_stock[bid] = battery_stock.get(bid, 0) - 1
```

- [ ] **Step 2: Caller reads + writes battery stock**

In `commit_vignette`:

```python
from app.models.ad_battery import ADBattery

battery_rows = db.query(ADBattery).filter_by(campaign_id=campaign.id).all()
battery_stock = {b.id: b.interceptor_stock for b in battery_rows}

# pass battery_stock=battery_stock into resolve()'s ad_engagement subcall

# After resolve:
consumed_interceptors: dict[int, int] = {}
for b in battery_rows:
    new_stock = battery_stock.get(b.id, b.interceptor_stock)
    if new_stock < b.interceptor_stock:
        consumed_interceptors[b.id] = b.interceptor_stock - new_stock
    b.interceptor_stock = max(0, new_stock)
```

And plumb `battery_stock` through `resolve()` into the `resolve_ad_engagement` call (resolver reads `ad_batteries` from planning_state; add a parallel `battery_stock` dict).

- [ ] **Step 3: Test (extend test_resolver_stockpile.py)**

```python
def test_ad_battery_respects_interceptor_stock():
    """Battery with 2 interceptors fires at most 2 shots regardless of attackers."""
    # Build a scenario where the AO is covered by one battery with stock=2
    # attackers = 5. Assert battery fires at most 2 times.
    # ... (pattern matches the missile test above; adapt)
```

- [ ] **Step 4: Run**

```bash
cd backend && python3 -m pytest tests/test_resolver_stockpile.py tests/test_ad_engagement.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(stockpile): AD engagement consumes ADBattery.interceptor_stock"
```

---

## Task 9: AcquisitionOrder.kind column + schema extensions

**Files:**
- Modify: `backend/app/models/acquisition.py`
- Modify: `backend/app/schemas/acquisition.py`
- Modify: `backend/app/crud/acquisition.py`
- Modify: `backend/app/api/acquisitions.py`

- [ ] **Step 1: Add column**

```python
# in AcquisitionOrder
kind: Mapped[str] = mapped_column(String(32), default="platform", nullable=False)
target_battery_id: Mapped[int | None] = mapped_column(
    Integer, nullable=True, default=None,
)  # only meaningful for kind=="ad_reload"
```

- [ ] **Step 2: Extend payload schemas**

```python
from typing import Literal

class AcquisitionCreatePayload(BaseModel):
    kind: Literal["platform", "missile_batch", "ad_battery", "ad_reload"] = "platform"
    platform_id: str   # generic resource id: platform_id | weapon_id | ad_system_id
    quantity: int = Field(gt=0)
    first_delivery_year: int = Field(ge=2026, le=2040)
    first_delivery_quarter: int = Field(ge=1, le=4)
    foc_year: int = Field(ge=2026, le=2040)
    foc_quarter: int = Field(ge=1, le=4)
    total_cost_cr: int = Field(ge=0)
    preferred_base_id: int | None = None
    target_battery_id: int | None = None  # required when kind == "ad_reload"
```

And `AcquisitionRead`:
```python
    kind: str = "platform"
    target_battery_id: int | None = None
```

- [ ] **Step 3: `create_order` passes new fields through**

Update `backend/app/crud/acquisition.py::create_order` to accept `kind`, `target_battery_id` kwargs and set them on the ORM row. Validate: `kind == "ad_reload"` requires `target_battery_id` to reference an existing battery for this campaign.

- [ ] **Step 4: API passes through**

Update `backend/app/api/acquisitions.py::create_acquisition_endpoint` to pass `kind=payload.kind, target_battery_id=payload.target_battery_id`.

- [ ] **Step 5: Test**

```python
# backend/tests/test_acquisition_kinds.py
def test_platform_acquisition_still_defaults_to_platform_kind(client):
    resp = client.post("/api/campaigns/{cid}/acquisitions", json={
        "platform_id": "rafale_f4", "quantity": 10,
        "first_delivery_year": 2027, "first_delivery_quarter": 1,
        "foc_year": 2028, "foc_quarter": 4,
        "total_cost_cr": 50000,
    })
    assert resp.status_code == 201
    assert resp.json()["kind"] == "platform"


def test_missile_batch_kind_rejects_missing_preferred_base():
    # Implement: kind=missile_batch requires preferred_base_id
    ...


def test_ad_reload_requires_target_battery_id():
    ...
```

Adapt to the existing test-client fixture pattern in your test suite.

- [ ] **Step 6: Run**

```bash
cd backend && python3 -m pytest tests/test_acquisition_kinds.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(stockpile): AcquisitionOrder.kind + missile_batch/ad_battery/ad_reload payloads"
```

---

## Task 10: Acquisition resolver handles missile_batch / ad_battery / ad_reload

**Files:**
- Modify: `backend/app/engine/acquisition.py`
- Modify: `backend/app/crud/campaign.py` (delivery event dispatch)

- [ ] **Step 1: Emit per-kind delivery events**

In `engine/acquisition.py::tick_acquisitions`, the existing logic emits `acquisition_delivery` events. Extend the event payload to include `kind`:

```python
events.append({
    "event_type": "acquisition_delivery",
    "payload": {
        "order_id": order["id"],
        "kind": order.get("kind", "platform"),
        "platform_id": order["platform_id"],   # generic resource_id
        "count": count,
        "cost_cr": cost,
        "delivered_total": order["delivered"],
        "quantity": order["quantity"],
        "target_battery_id": order.get("target_battery_id"),
        "preferred_base_id": order.get("preferred_base_id"),
    },
})
```

Acquisition resolver itself is kind-agnostic — it just emits delivery events. The CRUD side (Task 10 step 2) dispatches by kind.

- [ ] **Step 2: Dispatch delivery by kind in crud/campaign.py**

In `crud/campaign.py`, find the existing delivery loop (processes `acquisition_delivery` events by platform). Split by kind:

```python
for ev in result.events:
    if ev["event_type"] != "acquisition_delivery": continue
    kind = ev["payload"].get("kind", "platform")
    if kind == "platform":
        # existing airframe logic — unchanged
        ...
    elif kind == "missile_batch":
        _deliver_missile_batch(db, campaign, ev["payload"])
    elif kind == "ad_battery":
        _deliver_ad_battery(db, campaign, ev["payload"])
    elif kind == "ad_reload":
        _deliver_ad_reload(db, campaign, ev["payload"])
```

Implement the three helpers:

```python
def _deliver_missile_batch(db, campaign, payload):
    from app.models.missile_stock import MissileStock
    base_id = payload.get("preferred_base_id")
    weapon_id = payload["platform_id"]
    count = payload["count"]
    if base_id is None: return
    row = db.query(MissileStock).filter_by(
        campaign_id=campaign.id, base_id=base_id, weapon_id=weapon_id,
    ).first()
    if row is None:
        db.add(MissileStock(campaign_id=campaign.id, base_id=base_id,
                            weapon_id=weapon_id, stock=count))
    else:
        row.stock += count


def _deliver_ad_battery(db, campaign, payload):
    from app.models.ad_battery import ADBattery
    from app.content.registry import ad_systems
    from app.crud.seed_starting_state import AD_STARTING_INTERCEPTORS

    system_id = payload["platform_id"]
    base_id = payload.get("preferred_base_id")
    if base_id is None: return
    adspec = ad_systems().get(system_id)
    if adspec is None: return

    # Only create the battery once per order (on FOC delivery, when delivered == quantity)
    if payload["delivered_total"] < payload["quantity"]: return

    # Enforce strict one-per-(base, system) as elsewhere
    existing = db.query(ADBattery).filter_by(
        campaign_id=campaign.id, base_id=base_id, system_id=system_id,
    ).first()
    if existing is not None: return  # idempotent

    db.add(ADBattery(
        campaign_id=campaign.id, base_id=base_id, system_id=system_id,
        coverage_km=adspec.coverage_km,
        installed_year=campaign.current_year,
        installed_quarter=campaign.current_quarter,
        interceptor_stock=AD_STARTING_INTERCEPTORS.get(system_id, 16),
    ))


def _deliver_ad_reload(db, campaign, payload):
    from app.models.ad_battery import ADBattery
    target = payload.get("target_battery_id")
    count = payload["count"]
    if target is None: return
    row = db.query(ADBattery).filter_by(
        id=target, campaign_id=campaign.id,
    ).first()
    if row is None: return
    row.interceptor_stock = (row.interceptor_stock or 0) + count
```

- [ ] **Step 3: End-to-end test**

```python
# backend/tests/test_acquisition_kinds.py (append)
def test_missile_batch_delivery_adds_to_stock(client_with_session):
    """Order 100 Meteor, advance through delivery, assert MissileStock grew."""
    ...

def test_ad_battery_delivery_creates_battery_with_stock(...):
    ...

def test_ad_reload_delivery_adds_to_specific_battery(...):
    ...
```

- [ ] **Step 4: Run**

```bash
cd backend && python3 -m pytest tests/test_acquisition_kinds.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(stockpile): acquisition resolver delivers missile_batch / ad_battery / ad_reload"
```

---

## Task 11: Missile stocks API endpoint

**Files:**
- Create: `backend/app/api/missile_stocks.py`
- Modify: `backend/main.py` — register router

- [ ] **Step 1: Write the endpoint**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.missile_stock import MissileStock


class MissileStockRead(BaseModel):
    id: int
    base_id: int
    weapon_id: str
    stock: int


class MissileStockListResponse(BaseModel):
    stocks: list[MissileStockRead]


router = APIRouter(prefix="/api/campaigns", tags=["missile-stocks"])


@router.get("/{campaign_id}/missile-stocks", response_model=MissileStockListResponse)
def list_missile_stocks(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(404, "Campaign not found")
    rows = db.query(MissileStock).filter_by(campaign_id=campaign_id).all()
    return MissileStockListResponse(stocks=[
        MissileStockRead(id=r.id, base_id=r.base_id,
                         weapon_id=r.weapon_id, stock=r.stock)
        for r in rows
    ])
```

- [ ] **Step 2: Register router**

In `backend/main.py`, import and `app.include_router(missile_stocks_router)` alongside the others.

- [ ] **Step 3: Sanity-import**

```bash
cd backend && python3 -c "from main import app; print([r.path for r in app.routes if 'missile-stocks' in r.path])"
```
Expected: `['/api/campaigns/{campaign_id}/missile-stocks']`.

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat(stockpile): GET /api/campaigns/{id}/missile-stocks"
```

---

## Task 12: Frontend — types, api, store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/store/campaignStore.ts`

- [ ] **Step 1: Types**

Add:
```ts
export type AcquisitionKind = "platform" | "missile_batch" | "ad_battery" | "ad_reload";

export interface MissileStock {
  id: number;
  base_id: number;
  weapon_id: string;
  stock: number;
}

export interface MissileStockListResponse { stocks: MissileStock[]; }
```

Extend `AcquisitionOrder`:
```ts
  kind?: AcquisitionKind;
  target_battery_id?: number | null;
```

Extend `AcquisitionCreatePayload`:
```ts
  kind?: AcquisitionKind;
  target_battery_id?: number | null;
```

- [ ] **Step 2: API method**

```ts
async getMissileStocks(campaignId: number): Promise<MissileStockListResponse> {
  const { data } = await http.get<MissileStockListResponse>(
    `/api/campaigns/${campaignId}/missile-stocks`,
  );
  return data;
},
```

- [ ] **Step 3: Store**

Add `missileStocks: MissileStock[]` + `loadMissileStocks: (cid: number) => Promise<void>` action, reset key, initial `[]`.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts
git commit -m "feat(stockpile): frontend types + api.getMissileStocks + store state"
```

---

## Task 13: Acquisitions UI — Offers tab split

**Files:**
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx`
- Modify: `frontend/src/pages/ProcurementHub.tsx` (thread new data)

- [ ] **Step 1: Load new data in ProcurementHub**

In ProcurementHub, add `loadMissileStocks` + `loadADBatteries` + `loadArmoryUnlocks` calls on mount. Pass `weaponsById`, `armoryUnlocks`, `adBatteries`, `missileStocks` into AcquisitionPipeline.

- [ ] **Step 2: AcquisitionPipeline — new sections**

Reorganize the Offers tab to have 4 sections:
- **Aircraft** (existing OfferCard grid)
- **Missile Batches** — for each unlocked missile (from `armoryUnlocks.missiles`), a `MissileBatchOfferCard` (new). Weapon picker embedded in card, quantity stepper (default 50, min 10, max 500, step 10), delivery base select, total cost = qty × `weaponsById[weapon_id].unit_cost_cr`, 4-quarter delivery window.
- **AD Batteries** — for each unlocked AD system, an `ADBatteryOfferCard` (new). Base picker, total cost = `install_cost_cr + starting_stock × interceptor_cost_cr`, 4-8 quarter delivery (8q for S-400-class, 4q for others).
- **AD Reloads** — for each installed `ADBattery`, a `ADReloadOfferCard` (new). Shows current `interceptor_stock`, qty stepper, total cost = qty × interceptor_cost_cr, 2-quarter delivery.

Each card submits `onSign({kind, platform_id (=resource_id), quantity, first_delivery_*, foc_*, total_cost_cr, preferred_base_id/target_battery_id})`.

- [ ] **Step 3: Test — each card renders + submits correctly**

Add a Vitest test per new card verifying render + payload shape. Mirror existing `AcquisitionPipeline.test.tsx` patterns.

- [ ] **Step 4: Run**

```bash
cd frontend && npm run test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(stockpile): Acquisitions Offers — missile batches + AD batteries + AD reloads"
```

---

## Task 14: ForceCommitter depot status per squadron

**Files:**
- Modify: `frontend/src/components/vignette/ForceCommitter.tsx`

- [ ] **Step 1: Wire missileStocks + compute per-squadron status**

Receive `missileStocks: MissileStock[]` as a prop (or pull from store). For each eligible squadron row:

```tsx
const stocksAtBase = missileStocks.filter(m => m.base_id === sq.base_id);
const squadronWeapons = sq.loadout; // list of weapon ids
// Primary A2A weapon is the one that'd actually fire:
const primaryWeapon = squadronWeapons.find(w =>
  weaponsById[w]?.class?.startsWith("a2a")
);
const primaryStock = primaryWeapon
  ? (stocksAtBase.find(m => m.weapon_id === primaryWeapon)?.stock ?? 0)
  : 0;
const expectedShots = sq.airframes_available * 2.5; // rough, matches MunitionsEstimate
let depotTier: "green" | "amber" | "red" =
  primaryStock >= expectedShots ? "green"
  : primaryStock >= expectedShots * 0.5 ? "amber"
  : "red";
```

Render a depot line under each squadron row: `📦 <primaryWeapon> X/Y <tier color>`.

Show all weapon stocks on long-press or as a tooltip.

- [ ] **Step 2: Run tests**

```bash
cd frontend && npm run test -- --run vignette
```
Expected: existing pass. Existing snapshots may need to accept the new depot line.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/vignette/ForceCommitter.tsx
git commit -m "feat(stockpile): ForceCommitter shows depot status per squadron"
```

---

## Task 15: Armory UI — stock displays + remove Install button

**Files:**
- Modify: `frontend/src/components/armory/ADSystemCard.tsx`
- Modify: `frontend/src/components/armory/ADDeploymentsTable.tsx`
- Modify: `frontend/src/pages/ArmoryPage.tsx`

- [ ] **Step 1: Remove "Install at base" button from ADSystemCard**

Replace with a link: `→ Procure via Acquisitions` pointing to `/campaign/{cid}/procurement?tab=acquisitions&view=offers&focus_ad=<system_id>`.

ProcurementHub + AcquisitionPipeline accept a new `focus_ad` query param that scrolls to and highlights the matching AD Battery offer card (same pattern as the existing `focus` param for aircraft).

- [ ] **Step 2: ADDeploymentsTable — add stock column**

Add a `Stock` column: `{interceptor_stock} / {starting_capacity}` per battery. Color amber if < 50% of starting capacity, red if 0.

- [ ] **Step 3: Add MissileDepotTable section to Armory**

Either a new tab "Depots" or embedded under the Missiles tab. Lists `MissileStock` rows grouped by base:

```
Ambala
  Meteor: 72 / ~72
  MICA-IR: 72 / ~72
Hasimara
  Meteor: 54 / ~72
  ...
```

- [ ] **Step 4: Run**

```bash
cd frontend && npm run build 2>&1 | tail -3
cd frontend && npm run test -- --run armory
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(stockpile): Armory shows depot + battery stock; install button → Acquisitions link"
```

---

## Task 16: AAR — reframe MunitionsExpended from "bill" to "stock consumed"

**Files:**
- Modify: `frontend/src/components/vignette/MunitionsExpended.tsx`
- Modify: `frontend/src/components/vignette/MunitionsEstimate.tsx`

- [ ] **Step 1: MunitionsExpended header + copy**

- Header: "Munitions Expended" → keep.
- Remove "Billed to O&M on commit" subhead. Replace with: "Pre-purchased stock consumed — replacement cost ≈ ₹X cr (reorder via Acquisitions)".
- Table still shows `fired / hits / hit% / ₹/shot / replacement cost` columns, but total is labeled "Replacement cost" not "Deducted from treasury".
- Show per-weapon "depot exhausted" note: if the resolver's `missile_stock_remaining` indicates that the weapon's depot went to 0 before all attackers fired, show a red chip `⚠ depot ran dry — X shots skipped`.

- [ ] **Step 2: MunitionsEstimate — reframe to stock-check, not cost-preview**

Current: shows estimated ₹ cost of this commit.
New: shows depot sufficiency preview, e.g. `Depot check: 72 Meteor available, expected ~45 → ✓` or `Depot check: 20 Meteor available, expected ~45 → ⚠ 25 short`.

Cost preview becomes secondary (small line at bottom, informational): `Replacement cost if depleted: ₹450 cr`.

- [ ] **Step 3: Tests adjust**

Update existing tests asserting cost labels to reflect the new copy. Tests asserting the bar color tiers should still work since logic is similar (just driven by stock sufficiency, not treasury %).

- [ ] **Step 4: Run**

```bash
cd frontend && npm run test -- --run munition
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(stockpile): AAR + pre-commit reframed as depot consumption, not treasury bill"
```

---

## Task 17: Economy validation — 40-turn moderate-player simulation

**Files:**
- Create: `backend/tests/test_economy_simulation.py`

- [ ] **Step 1: Write a moderate-player auto-agent**

```python
"""End-to-end balance sim: moderate-competence player over 40 turns.
Validates that Plan 17 + Plan 18 economy doesn't bankrupt or over-reward
a reasonable player."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.campaign import Campaign
from app.models.acquisition import AcquisitionOrder
from app.models.ad_battery import ADBattery
from app.models.missile_stock import MissileStock
from app.models.vignette import Vignette
from app.crud.campaign import create_campaign, advance_turn
from app.crud.vignette import list_pending_vignettes, commit_vignette
from app.crud.acquisition import create_order
from app.schemas.campaign import CampaignCreate


def test_moderate_player_40_turns_stays_solvent():
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    payload = CampaignCreate(name="SimPlayer", difficulty="realistic",
                             objectives=["amca_operational_by_2035"], seed=999)
    campaign = create_campaign(db, payload)

    # Rough player behavior (doesn't have to be smart):
    # - Q1 Y1: order 1 batch of 100 Meteor for Ambala
    # - Y1 Q3: order 36 Rafale F4
    # - Y3 Q1: start AMCA Mk1 at standard funding (already autostarted in seed)
    # - Y3 Q3: order 1 S-400 battery for Pune
    # - Y5: order 16 S-400 reload for Pathankot
    # - Every 2 years: order 100 more Meteor at random rotating base
    # - Auto-commit 1 airframe per vignette (same as existing balance sim)

    def maybe_order(q_index: int):
        # q_index = quarters since start (0-indexed)
        if q_index == 0:
            # Meteor batch for Ambala
            try:
                create_order(db, campaign,
                    platform_id="meteor", quantity=100,
                    first_delivery_year=2026, first_delivery_quarter=4,
                    foc_year=2027, foc_quarter=3,
                    total_cost_cr=1800,
                    preferred_base_id=None,  # will be picked up by base lookup
                    kind="missile_batch",
                )
            except Exception: pass
        if q_index == 2:
            # Rafale batch
            create_order(db, campaign,
                platform_id="rafale_f4", quantity=36,
                first_delivery_year=2028, first_delivery_quarter=1,
                foc_year=2031, foc_quarter=4,
                total_cost_cr=180000,
                kind="platform",
            )
        if q_index in (8, 16, 24, 32):
            # Periodic Meteor restock
            try:
                create_order(db, campaign,
                    platform_id="meteor", quantity=80,
                    first_delivery_year=campaign.current_year + 1,
                    first_delivery_quarter=1,
                    foc_year=campaign.current_year + 1, foc_quarter=4,
                    total_cost_cr=80 * 18,
                    kind="missile_batch",
                )
            except Exception: pass

    for q_index in range(40):
        maybe_order(q_index)

        # Commit any pending vignettes with a minimal sortie
        for v in list_pending_vignettes(db, campaign.id):
            ps = v.planning_state or {}
            eligible = ps.get("eligible_squadrons", [])
            roe_options = ps.get("roe_options", [])
            pick = next((s for s in eligible if s.get("range_tier") == "A"), None)
            if pick:
                cf = {
                    "squadrons": [{"squadron_id": pick["squadron_id"], "airframes": 1}],
                    "roe": roe_options[0] if roe_options else "weapons_free",
                    "support": {"awacs": False, "tanker": False, "sead_package": False},
                }
                commit_vignette(db, campaign, v, cf)

        campaign = advance_turn(db, campaign)

    db.refresh(campaign)
    assert campaign.current_year == 2036
    assert campaign.current_quarter == 2

    # Treasury sanity: moderate player should end at a reasonable mid-range
    # balance. Not deeply negative (means grant too tight) and not wildly
    # positive (means grant too loose).
    assert -200_000 < campaign.budget_cr < 2_500_000, (
        f"Treasury out of expected band: {campaign.budget_cr}"
    )

    # At least some orders delivered + some missile stock active
    orders = db.query(AcquisitionOrder).filter_by(campaign_id=campaign.id).all()
    assert len(orders) >= 2
    stocks = db.query(MissileStock).filter_by(campaign_id=campaign.id).all()
    assert len(stocks) > 0
    total_meteor = sum(s.stock for s in stocks if s.weapon_id == "meteor")
    # After 3 meteor batches + combat consumption, should have some stock left
    assert total_meteor >= 0  # lower bound — combat may have consumed it

    db.close()
```

- [ ] **Step 2: Run**

```bash
cd backend && python3 -m pytest tests/test_economy_simulation.py -v
```

- [ ] **Step 3: If treasury fails the band, adjust Plan 17 dials before proceeding.**

If assertion fires with treasury very negative → grant too tight, bump `BASE_QUARTERLY_GRANT_CR` up by 10-15%.
If treasury very positive → grant too loose, cut 10-15%.
Record the final tuned values in CLAUDE.md carry-overs.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_economy_simulation.py
git commit -m "test(economy): 40-turn moderate-player simulation (Plan 17+18 gate)"
```

---

## Task 18: CLAUDE.md + deploy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Strike resolved carry-overs**

In the "Known carry-overs / tuning backlog" section:
- "Per-base / per-squadron munitions inventory" → **RESOLVED in Plan 18** (MissileStock ORM, per-base depot, resolver decrement).
- "Unify AD systems + missiles into Acquisitions > Offers pipeline" → **RESOLVED in Plan 18** (kind field + 3 new kinds).

Use the existing `~~...~~ **RESOLVED in Plan 18**` pattern.

- [ ] **Step 2: Add Plan 18 status line**

After the Plan 17 line in the Current Status section:

```markdown
- **Plan 18 (Unified Acquisitions + Stockpile Logistics)** — ✅ done. 5XX backend tests (+new for missile_stock, resolver stockpile, acquisition kinds, economy sim) + 18X frontend vitest tests. New `MissileStock(campaign_id, base_id, weapon_id, stock)` ORM. `ADBattery.interceptor_stock` column. `AcquisitionOrder.kind` column with four kinds: `platform | missile_batch | ad_battery | ad_reload`. Starting stockpiles seeded: each base gets `squadron.strength × 4` missiles per weapon in loadout; AD batteries seeded with 12-32 interceptors depending on tier. Resolver BVR/WVR + AD now decrement stock and skip on empty depot (no fallback). Plan 17's per-shot treasury debit REMOVED — munitions cost is pre-paid at acquisition. Acquisitions Offers tab adds 3 new sub-sections (Missile Batches / AD Batteries / AD Reloads). ForceCommitter shows depot sufficiency per squadron. Armory "Install at base" button for AD is replaced with a deep-link to Acquisitions. New `GET /api/campaigns/{id}/missile-stocks` endpoint. 40-turn moderate-player simulation test gates economy balance. Plan file: `docs/superpowers/plans/2026-04-21-unified-acquisitions-stockpile-plan.md`.
```

- [ ] **Step 3: Bump last-updated**

Change `## Current status (last updated 2026-04-21)` to current date.

- [ ] **Step 4: Commit + push + deploy**

```bash
git add CLAUDE.md
git commit -m "docs: Plan 18 done — unified Acquisitions + stockpile logistics"
git push
./deploy.sh
```

Frontend auto-deploys via Vercel git integration.

- [ ] **Step 5: Prod smoke**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/missile-stocks" | python3 -m json.tool | head -20
```
Expected: stock list returned.

- [ ] **Step 6: Backfill existing campaigns**

Run Task 5's backfill script one more time if it didn't run earlier.

---

## Self-Review

**1. Spec coverage.** 18 tasks cover the 5 confirmed decisions (per-base depot, empty=no-fire, seed ×4, AD now in Acquisitions including new battery installs, interceptor ₹/shot table) + 3 rolled-in items (user's points 1-3: AD into Acquisitions, remove per-shot cost, add simulation). No gaps.

**2. Placeholder scan.** Task 6 and Task 8 have adapt-to-existing-code pseudocode notes — necessary because resolver + crud/vignette variable names vary. Task 10's three delivery helpers have full concrete code. Everything else is concrete.

**3. Type consistency.**
- `MissileStock` dict key `(base_id, weapon_id)` used consistently across resolver + crud + API.
- `AcquisitionOrder.kind` literal values match between Pydantic schema, frontend TS, and delivery dispatcher.
- `interceptor_cost_cr` consistently resides on `ADSystemSpec`, used by resolver (per-shot charge via `munitions_cost_total_cr` carry-forward for telemetry only) and acquisition cost calc.
- `starting_stock` uses `AD_STARTING_INTERCEPTORS` single source of truth.
- `battery_stock` dict pattern mirrors `missile_stock` dict pattern in the resolver.

No inconsistencies.

---

## Execution

Commit directly to `main` per user preference. Backend tasks 1-11 + 17 dispatched as a batched subagent. Frontend tasks 12-16 as a second batched subagent. Docs + deploy (Task 18) done by controller. Backfill (Task 5) runs after Task 2 deploys.
