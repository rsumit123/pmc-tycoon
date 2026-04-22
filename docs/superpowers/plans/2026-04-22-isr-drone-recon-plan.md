# ISR Drone Recon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let friendly ISR drone squadrons passively surveil adversary airbases, surfacing per-base force observations as intel cards + map markers with fog-of-war tiered by drone platform class.

**Architecture:** Seed ~15 named adversary airbases (PAF/PLAAF/PLAN) as campaign-scoped content. Each quarter during `advance_turn`, a new pure-function `drone_recon` synth pass checks which adversary bases fall inside each friendly drone squadron's operational orbit (per-platform radius: Tapas 300 km, Heron 1000 km, MQ-9B 1800 km, Ghatak 500 km). Covered bases emit `IntelCard` rows with `source=drone_recon` and tiered fidelity (low/medium/high) that fuzzes observed-force counts. Frontend adds a red `AdversaryBaseLayer` on the map (only renders covered bases), a `DroneOrbitLayer` overlay, an `AdversaryBaseSheet` bottom sheet, and an `ISR` source badge in the Intel Inbox. Existing notifications endpoint picks up the new cards automatically via the IntelCard stream.

**Tech Stack:** FastAPI + SQLAlchemy 2.x + Pydantic 2 + MapLibre + React 19 + Zustand + pytest + vitest.

---

## File Structure

**Backend — new:**
- `backend/content/adversary_bases.yaml` — catalog of named adversary bases (faction anchor + forward + support bases).
- `backend/app/models/adversary_base.py` — `AdversaryBase` ORM (campaign-scoped).
- `backend/app/schemas/adversary_base.py` — Pydantic schemas including `AdversaryBaseRead` + `AdversaryBaseSighting`.
- `backend/app/engine/drone_recon.py` — pure synth fn `generate_drone_sightings(...)`.
- `backend/app/api/adversary_bases.py` — `GET /api/campaigns/{id}/adversary-bases` with `covered_only` filter.
- `backend/tests/test_adversary_bases_content.py`
- `backend/tests/test_adversary_base_seed.py`
- `backend/tests/test_drone_recon_engine.py`
- `backend/tests/test_adversary_bases_api.py`

**Backend — modify:**
- `backend/app/content/loader.py` — add `AdversaryBaseSpec` dataclass + `load_adversary_bases()` loader.
- `backend/app/content/registry.py` — add `adversary_bases()` singleton + include in `reload_all()`.
- `backend/app/models/__init__.py` — import new model.
- `backend/app/engine/vignette/awacs_coverage.py` — replace single `ISR_ORBIT_RADIUS_KM` constant with per-platform `ISR_ORBIT_RADIUS_KM_BY_PLATFORM` dict + `ISR_FIDELITY_TIER` dict; update `isr_drone_covering` to look up per-platform radius.
- `backend/app/crud/campaign.py` — seed `AdversaryBase` rows at campaign creation.
- `backend/app/engine/turn.py` — invoke `drone_recon.generate_drone_sightings()` after intel subsystem, persist IntelCards.
- `backend/main.py` — register adversary_bases router.

**Frontend — new:**
- `frontend/src/components/map/AdversaryBaseLayer.tsx` — red SVG markers for covered adversary bases.
- `frontend/src/components/map/DroneOrbitLayer.tsx` — dashed cyan orbit rings for friendly drones.
- `frontend/src/components/map/AdversaryBaseSheet.tsx` — bottom-sheet showing latest sighting.

**Frontend — modify:**
- `frontend/src/lib/types.ts` — `AdversaryBase`, `AdversaryBaseSighting` types.
- `frontend/src/lib/api.ts` — `getAdversaryBases(campaignId)`.
- `frontend/src/store/campaignStore.ts` — `adversaryBases` state + `loadAdversaryBases`; refresh in `advanceTurn`.
- `frontend/src/store/mapStore.ts` — new layer toggle flags.
- `frontend/src/components/map/LayerTogglePanel.tsx` — two new toggles.
- `frontend/src/pages/CampaignMapView.tsx` — mount the two new layers + sheet, deep-link handler for `?focus_adversary_base=<id>`.
- `frontend/src/components/intel/IntelCard.tsx` — ISR source badge variant.

---

### Task 1: Seed Adversary Base Content

**Files:**
- Create: `backend/content/adversary_bases.yaml`
- Modify: `backend/app/content/loader.py` (add dataclass + loader fn)
- Modify: `backend/app/content/registry.py` (add singleton)
- Test: `backend/tests/test_adversary_bases_content.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_adversary_bases_content.py
from app.content.registry import adversary_bases as _load


def test_adversary_base_catalog_has_paf_plaaf_plan():
    bases = _load()
    factions = {b.faction for b in bases.values()}
    assert {"PAF", "PLAAF", "PLAN"} == factions


def test_every_base_has_coords_and_tier():
    for b in _load().values():
        assert -90 <= b.lat <= 90
        assert -180 <= b.lon <= 180
        assert b.tier in {"main", "forward", "support"}
        assert b.name
        assert b.home_platforms  # non-empty list
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_adversary_bases_content.py -v`
Expected: FAIL — `adversary_bases` does not exist on `app.content.registry`.

- [ ] **Step 3: Create YAML catalog**

Create `backend/content/adversary_bases.yaml`:

```yaml
bases:
  # PAF (Pakistan Air Force)
  - id: paf_sargodha
    name: PAF Base Sargodha (Mushaf)
    faction: PAF
    lat: 32.0483
    lon: 72.6644
    tier: main
    home_platforms: [f16_blk52, jf17_blk3, mirage5]
  - id: paf_peshawar
    name: PAF Base Peshawar
    faction: PAF
    lat: 33.9939
    lon: 71.5147
    tier: forward
    home_platforms: [jf17_blk3, f16_blk52]
  - id: paf_kamra
    name: PAF Base Minhas (Kamra)
    faction: PAF
    lat: 33.8689
    lon: 72.4006
    tier: main
    home_platforms: [jf17_blk3, j10ce]
  - id: paf_karachi
    name: PAF Base Masroor (Karachi)
    faction: PAF
    lat: 24.8939
    lon: 66.9383
    tier: main
    home_platforms: [jf17_blk3, mirage5]
  - id: paf_shahbaz
    name: PAF Base Shahbaz (Jacobabad)
    faction: PAF
    lat: 28.2814
    lon: 68.4497
    tier: forward
    home_platforms: [f16_blk52]
  - id: paf_rafiqui
    name: PAF Base Rafiqui (Shorkot)
    faction: PAF
    lat: 30.7575
    lon: 72.2828
    tier: forward
    home_platforms: [jf17_blk3, mirage5]

  # PLAAF (People's Liberation Army Air Force)
  - id: plaaf_hotan
    name: Hotan AB
    faction: PLAAF
    lat: 37.0353
    lon: 79.8647
    tier: forward
    home_platforms: [j10c, j11b, j16]
  - id: plaaf_kashgar
    name: Kashi AB (Kashgar)
    faction: PLAAF
    lat: 39.5431
    lon: 76.0200
    tier: forward
    home_platforms: [j10c, j16]
  - id: plaaf_lhasa_gonggar
    name: Lhasa Gonggar AB
    faction: PLAAF
    lat: 29.2978
    lon: 90.9120
    tier: main
    home_platforms: [j10c, j20a, j16]
  - id: plaaf_shigatse
    name: Shigatse Peace Airport
    faction: PLAAF
    lat: 29.3519
    lon: 89.3111
    tier: forward
    home_platforms: [j10c, j11b]
  - id: plaaf_chengdu
    name: Chengdu / Wenjiang (rear)
    faction: PLAAF
    lat: 30.5728
    lon: 103.9506
    tier: support
    home_platforms: [j20a, j20s, j36]

  # PLAN (People's Liberation Army Navy)
  - id: plan_yulin
    name: Yulin Naval Base (Hainan)
    faction: PLAN
    lat: 18.2072
    lon: 109.6992
    tier: main
    home_platforms: [h6n, type055_destroyer, type093b_ssn]
  - id: plan_ledong
    name: Ledong Naval Airfield (Hainan)
    faction: PLAN
    lat: 18.5583
    lon: 108.9425
    tier: forward
    home_platforms: [j35a, h6n]
  - id: plan_woody_island
    name: Woody Island (Yongxing)
    faction: PLAN
    lat: 16.8333
    lon: 112.3333
    tier: forward
    home_platforms: [j11b, j35a]
  - id: plan_zhanjiang
    name: Zhanjiang Naval Base
    faction: PLAN
    lat: 21.2583
    lon: 110.4100
    tier: support
    home_platforms: [type055_destroyer, type093b_ssn]
```

- [ ] **Step 4: Add dataclass + loader to loader.py**

In `backend/app/content/loader.py`, add near existing dataclasses:

```python
from dataclasses import dataclass
import yaml
from pathlib import Path


@dataclass(frozen=True)
class AdversaryBaseSpec:
    id: str
    name: str
    faction: str
    lat: float
    lon: float
    tier: str
    home_platforms: tuple[str, ...]


def load_adversary_bases(path: Path | None = None) -> dict[str, AdversaryBaseSpec]:
    p = path or (Path(__file__).resolve().parents[2] / "content" / "adversary_bases.yaml")
    data = yaml.safe_load(p.read_text())
    out: dict[str, AdversaryBaseSpec] = {}
    for row in data["bases"]:
        spec = AdversaryBaseSpec(
            id=row["id"],
            name=row["name"],
            faction=row["faction"],
            lat=float(row["lat"]),
            lon=float(row["lon"]),
            tier=row["tier"],
            home_platforms=tuple(row["home_platforms"]),
        )
        out[spec.id] = spec
    return out
```

- [ ] **Step 5: Add registry singleton**

In `backend/app/content/registry.py`:

```python
from functools import lru_cache
from app.content.loader import load_adversary_bases, AdversaryBaseSpec


@lru_cache(maxsize=1)
def adversary_bases() -> dict[str, AdversaryBaseSpec]:
    return load_adversary_bases()
```

And extend `reload_all()` to call `adversary_bases.cache_clear()`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_adversary_bases_content.py -v`
Expected: PASS 2/2.

- [ ] **Step 7: Commit**

```bash
git add backend/content/adversary_bases.yaml backend/app/content/loader.py backend/app/content/registry.py backend/tests/test_adversary_bases_content.py
git commit -m "feat(content): adversary base catalog for ISR drone recon"
```

---

### Task 2: AdversaryBase ORM + Per-Campaign Seed

**Files:**
- Create: `backend/app/models/adversary_base.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/crud/campaign.py` (seed on campaign create)
- Test: `backend/tests/test_adversary_base_seed.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_adversary_base_seed.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.crud.campaign import create_campaign
from app.models.adversary_base import AdversaryBase


def _memory_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_adversary_bases_seeded_on_create():
    SessionLocal = _memory_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    rows = db.query(AdversaryBase).filter_by(campaign_id=campaign.id).all()
    assert len(rows) >= 10
    assert {r.faction for r in rows} == {"PAF", "PLAAF", "PLAN"}
    yulin = next(r for r in rows if r.base_id_str == "plan_yulin")
    assert abs(yulin.lat - 18.2072) < 0.01
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_adversary_base_seed.py -v`
Expected: FAIL — module `app.models.adversary_base` does not exist.

- [ ] **Step 3: Write ORM model**

Create `backend/app/models/adversary_base.py`:

```python
from sqlalchemy import ForeignKey, Integer, String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AdversaryBase(Base):
    __tablename__ = "adversary_bases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    base_id_str: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(128))
    faction: Mapped[str] = mapped_column(String(16), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    tier: Mapped[str] = mapped_column(String(16))
```

- [ ] **Step 4: Register in models __init__**

Add to `backend/app/models/__init__.py`:

```python
from app.models.adversary_base import AdversaryBase  # noqa
```

- [ ] **Step 5: Seed on campaign create**

In `backend/app/crud/campaign.py`, inside `create_campaign` after existing seed calls, add:

```python
from app.content.registry import adversary_bases as _adv_bases_catalog
from app.models.adversary_base import AdversaryBase

for spec in _adv_bases_catalog().values():
    db.add(AdversaryBase(
        campaign_id=campaign.id,
        base_id_str=spec.id,
        name=spec.name,
        faction=spec.faction,
        lat=spec.lat,
        lon=spec.lon,
        tier=spec.tier,
    ))
db.flush()
```

(Place after existing `db.add(campaign)` + `db.flush()` and before the final `db.commit()`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_adversary_base_seed.py -v`
Expected: PASS.

- [ ] **Step 7: Run full backend suite (no regressions)**

Run: `cd backend && pytest -q`
Expected: all previously-passing tests still pass + 1 new.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/adversary_base.py backend/app/models/__init__.py backend/app/crud/campaign.py backend/tests/test_adversary_base_seed.py
git commit -m "feat: AdversaryBase ORM seeded on campaign create"
```

---

### Task 3: Per-Platform ISR Orbit Radius + Fidelity Tier

**Files:**
- Modify: `backend/app/engine/vignette/awacs_coverage.py:21-90`
- Test: `backend/tests/test_awacs_coverage.py` (extend existing if present — else create)

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_awacs_coverage.py` (create file if absent):

```python
from app.engine.vignette.awacs_coverage import (
    isr_drone_covering,
    ISR_ORBIT_RADIUS_KM_BY_PLATFORM,
    ISR_FIDELITY_TIER,
)


def test_tapas_has_shorter_radius_than_mq9b():
    assert ISR_ORBIT_RADIUS_KM_BY_PLATFORM["tapas_uav"] < ISR_ORBIT_RADIUS_KM_BY_PLATFORM["mq9b_seaguardian"]


def test_fidelity_tiers_defined():
    assert ISR_FIDELITY_TIER["tapas_uav"] == "low"
    assert ISR_FIDELITY_TIER["heron_tp"] == "medium"
    assert ISR_FIDELITY_TIER["mq9b_seaguardian"] == "high"


def test_per_platform_radius_applied_in_coverage():
    # Pathankot at ~32.23N 75.63E; an AO 500 km away should be covered by MQ-9B but not Tapas.
    bases = {1: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}
    ao = {"lat": 34.5, "lon": 80.0}  # ~450 km NE
    squadrons = [
        {"id": 10, "platform_id": "tapas_uav", "base_id": 1, "strength": 8, "readiness_pct": 80},
        {"id": 11, "platform_id": "mq9b_seaguardian", "base_id": 1, "strength": 4, "readiness_pct": 80},
    ]
    covering = isr_drone_covering(ao, squadrons, bases)
    pids = {c["platform_id"] for c in covering}
    assert "mq9b_seaguardian" in pids
    assert "tapas_uav" not in pids  # out of its 300 km radius
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_awacs_coverage.py -v`
Expected: FAIL — symbols missing or radii don't discriminate.

- [ ] **Step 3: Replace single constant + update fn**

In `backend/app/engine/vignette/awacs_coverage.py` replace the ISR block:

```python
ISR_DRONE_PLATFORM_IDS: set[str] = {"tapas_uav", "ghatak_ucav", "mq9b_seaguardian", "heron_tp"}

# Per-platform operational orbit radius. Realistic values reflect endurance +
# datalink class: Tapas (line-of-sight MALE) < Ghatak (stealth strike, secondary
# ISR) < Heron TP (SATCOM MALE) < MQ-9B (SATCOM HALE, wide-area SAR).
ISR_ORBIT_RADIUS_KM_BY_PLATFORM: dict[str, int] = {
    "tapas_uav":         300,
    "ghatak_ucav":       500,
    "heron_tp":         1000,
    "mq9b_seaguardian": 1800,
}

# Reconnaissance fidelity tier drives fog-of-war fuzziness of adversary-base
# observations. 'low' = count ranges; 'medium' = count + platform types;
# 'high' = count + types + readiness signal.
ISR_FIDELITY_TIER: dict[str, str] = {
    "tapas_uav":        "low",
    "ghatak_ucav":      "low",
    "heron_tp":         "medium",
    "mq9b_seaguardian": "high",
}

# Back-compat: legacy consumers (e.g. vignette planning intel buff) still call
# isr_drone_covering without a platform-specific radius — they receive the
# longest-reach drone's radius as the default to preserve existing behavior.
ISR_ORBIT_RADIUS_KM = max(ISR_ORBIT_RADIUS_KM_BY_PLATFORM.values())
```

Update `isr_drone_covering` to look up per-platform radius:

```python
def isr_drone_covering(
    ao: dict,
    squadrons: list[dict],
    bases_registry: dict[int, dict],
    orbit_radius_km: int | None = None,
) -> list[dict]:
    out: list[dict] = []
    for sq in squadrons:
        pid = sq.get("platform_id")
        if pid not in ISR_DRONE_PLATFORM_IDS:
            continue
        if sq.get("readiness_pct", 0) <= 0 or sq.get("strength", 0) <= 0:
            continue
        base = bases_registry.get(sq["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        radius = orbit_radius_km if orbit_radius_km is not None else ISR_ORBIT_RADIUS_KM_BY_PLATFORM.get(pid, 700)
        if dist > radius:
            continue
        out.append({
            "squadron_id": sq["id"],
            "base_id": sq["base_id"],
            "base_name": base.get("name", ""),
            "distance_km": round(dist, 1),
            "strength": sq["strength"],
            "readiness_pct": sq["readiness_pct"],
            "platform_id": pid,
        })
    return out
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_awacs_coverage.py tests/test_vignette_engine.py -v`
Expected: new tests PASS; no regressions in vignette-engine intel buff.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/vignette/awacs_coverage.py backend/tests/test_awacs_coverage.py
git commit -m "feat(engine): per-platform ISR orbit radius + fidelity tier"
```

---

### Task 4: Drone Recon Engine — Base Coverage Resolver

**Files:**
- Create: `backend/app/engine/drone_recon.py`
- Test: `backend/tests/test_drone_recon_engine.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_drone_recon_engine.py
from app.engine.drone_recon import bases_covered_by_drones


def test_uncovered_base_returns_no_coverage():
    adv_bases = [
        {"id": 1, "base_id_str": "paf_sargodha", "lat": 32.05, "lon": 72.66, "faction": "PAF",
         "tier": "main", "home_platforms": ("f16_blk52", "jf17_blk3")},
    ]
    drones = [
        {"id": 10, "platform_id": "tapas_uav", "base_id": 7, "strength": 8, "readiness_pct": 80},
    ]
    friendly_bases = {7: {"lat": 12.95, "lon": 77.66}}  # Bangalore — ~1800 km from Sargodha
    result = bases_covered_by_drones(adv_bases, drones, friendly_bases)
    assert result == []


def test_covered_base_returns_sorted_highest_tier_first():
    adv_bases = [
        {"id": 1, "base_id_str": "paf_sargodha", "lat": 32.05, "lon": 72.66, "faction": "PAF",
         "tier": "main", "home_platforms": ("f16_blk52",)},
    ]
    drones = [
        {"id": 10, "platform_id": "tapas_uav", "base_id": 5, "strength": 8, "readiness_pct": 80},
        {"id": 11, "platform_id": "mq9b_seaguardian", "base_id": 5, "strength": 4, "readiness_pct": 80},
    ]
    friendly_bases = {5: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}  # ~280 km from Sargodha
    result = bases_covered_by_drones(adv_bases, drones, friendly_bases)
    assert len(result) == 1
    cov = result[0]
    assert cov["adversary_base_id"] == 1
    assert cov["effective_tier"] == "high"  # MQ-9B wins over Tapas
    assert len(cov["covering_drones"]) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_drone_recon_engine.py -v`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement coverage resolver**

Create `backend/app/engine/drone_recon.py`:

```python
"""Pure-function ISR drone recon pass.

Given friendly drone squadrons + adversary bases, compute which adversary
bases fall inside each drone's orbit radius, aggregate by effective fidelity
tier, and synthesize IntelCard-shaped observation payloads.

Side effects live outside this module — the caller (turn engine) persists
results.
"""
from __future__ import annotations

import math
from typing import Any

from app.engine.vignette.awacs_coverage import (
    ISR_DRONE_PLATFORM_IDS,
    ISR_ORBIT_RADIUS_KM_BY_PLATFORM,
    ISR_FIDELITY_TIER,
)

TIER_RANK = {"low": 1, "medium": 2, "high": 3}
EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def _upgrade_tier_on_overlap(tiers: list[str]) -> str:
    """Two drones of the same tier → one tier higher (capped at high).

    A single tier-1 drone stays low. Two or more low drones → medium.
    A single medium → medium. Two mediums → high. Any high → high.
    """
    best = max(tiers, key=lambda t: TIER_RANK[t])
    same_tier_count = sum(1 for t in tiers if t == best)
    if best == "high":
        return "high"
    if best == "medium" and same_tier_count >= 2:
        return "high"
    if best == "low" and same_tier_count >= 2:
        return "medium"
    return best


def bases_covered_by_drones(
    adversary_bases: list[dict[str, Any]],
    drone_squadrons: list[dict[str, Any]],
    friendly_bases_registry: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    active_drones = [
        sq for sq in drone_squadrons
        if sq.get("platform_id") in ISR_DRONE_PLATFORM_IDS
        and sq.get("strength", 0) > 0
        and sq.get("readiness_pct", 0) > 0
    ]

    for adv in adversary_bases:
        covering: list[dict[str, Any]] = []
        for sq in active_drones:
            fb = friendly_bases_registry.get(sq["base_id"])
            if fb is None:
                continue
            radius = ISR_ORBIT_RADIUS_KM_BY_PLATFORM.get(sq["platform_id"], 700)
            dist = _haversine_km(fb["lat"], fb["lon"], adv["lat"], adv["lon"])
            if dist > radius:
                continue
            covering.append({
                "squadron_id": sq["id"],
                "platform_id": sq["platform_id"],
                "from_base_id": sq["base_id"],
                "distance_km": round(dist, 1),
                "tier": ISR_FIDELITY_TIER[sq["platform_id"]],
            })
        if not covering:
            continue
        effective_tier = _upgrade_tier_on_overlap([c["tier"] for c in covering])
        out.append({
            "adversary_base_id": adv["id"],
            "base_id_str": adv["base_id_str"],
            "faction": adv["faction"],
            "tier": adv["tier"],
            "home_platforms": list(adv["home_platforms"]),
            "effective_tier": effective_tier,
            "covering_drones": covering,
        })
    return out
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_drone_recon_engine.py -v`
Expected: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/drone_recon.py backend/tests/test_drone_recon_engine.py
git commit -m "feat(engine): drone recon base-coverage resolver"
```

---

### Task 5: Drone Recon Engine — Sighting Synthesis with Fog

**Files:**
- Modify: `backend/app/engine/drone_recon.py` (add `synth_observed_force` + `generate_drone_sightings`)
- Test: `backend/tests/test_drone_recon_engine.py` (extend)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_drone_recon_engine.py`:

```python
import random
from app.engine.drone_recon import synth_observed_force, generate_drone_sightings


def test_low_tier_emits_count_range_only():
    adv_force = {"f16_blk52": 22, "jf17_blk3": 18}
    result = synth_observed_force(adv_force, home_platforms=["f16_blk52", "jf17_blk3"],
                                   tier="low", rng=random.Random(1))
    assert "count_range" in result
    assert "platforms" not in result  # low tier hides types
    lo, hi = result["count_range"]
    assert lo <= 40 <= hi


def test_medium_tier_emits_count_and_types():
    adv_force = {"f16_blk52": 22, "jf17_blk3": 18}
    result = synth_observed_force(adv_force, home_platforms=["f16_blk52", "jf17_blk3"],
                                   tier="medium", rng=random.Random(1))
    assert "platforms" in result
    assert set(result["platforms"]) == {"f16_blk52", "jf17_blk3"}
    assert "readiness" not in result


def test_high_tier_emits_full_detail():
    adv_force = {"f16_blk52": 22, "jf17_blk3": 18}
    result = synth_observed_force(adv_force, home_platforms=["f16_blk52", "jf17_blk3"],
                                   tier="high", rng=random.Random(1))
    assert "platforms_detailed" in result
    assert result["platforms_detailed"]["f16_blk52"] == 22
    assert "readiness" in result
    assert result["readiness"] in {"low", "medium", "high"}


def test_generate_drone_sightings_returns_one_card_per_covered_base():
    adv_bases = [
        {"id": 1, "base_id_str": "paf_sargodha", "lat": 32.05, "lon": 72.66, "faction": "PAF",
         "tier": "main", "home_platforms": ("f16_blk52", "jf17_blk3")},
        {"id": 2, "base_id_str": "plaaf_hotan", "lat": 37.04, "lon": 79.86, "faction": "PLAAF",
         "tier": "forward", "home_platforms": ("j10c", "j11b")},
    ]
    drones = [
        {"id": 10, "platform_id": "heron_tp", "base_id": 5, "strength": 6, "readiness_pct": 80},
    ]
    friendly_bases = {5: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}
    adversary_force_by_faction = {
        "PAF": {"f16_blk52": 22, "jf17_blk3": 80},
        "PLAAF": {"j10c": 120, "j11b": 40},
    }
    cards = generate_drone_sightings(
        adv_bases, drones, friendly_bases, adversary_force_by_faction,
        year=2027, quarter=2, rng=random.Random(1),
    )
    # Sargodha is ~280 km (covered), Hotan is ~900 km (covered by Heron 1000 km).
    assert len(cards) == 2
    srg = next(c for c in cards if c["subject_id"] == "paf_sargodha")
    assert srg["source"] == "drone_recon"
    assert srg["year"] == 2027
    assert srg["quarter"] == 2
    assert srg["observed_force"]["tier"] == "medium"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_drone_recon_engine.py -v`
Expected: FAIL — new symbols don't exist yet.

- [ ] **Step 3: Extend drone_recon.py with synth + entry point**

Append to `backend/app/engine/drone_recon.py`:

```python
import random


def _count_range(true_count: int, jitter_pct: float, rng: random.Random) -> tuple[int, int]:
    lo_jitter = rng.uniform(-jitter_pct, 0)
    hi_jitter = rng.uniform(0, jitter_pct)
    lo = max(0, int(true_count * (1 + lo_jitter)))
    hi = max(lo, int(true_count * (1 + hi_jitter)))
    return lo, hi


def _partition_force_to_base(
    faction_force: dict[str, int],
    home_platforms: list[str],
) -> dict[str, int]:
    """Assign proportional slice of each home platform to this base.

    Simple heuristic: divide platform's faction-wide count by number of bases
    listing it as home. We approximate by assigning 1/N where N is small — the
    caller doesn't need per-base truth, just plausible numbers. For MVP we
    assign each home platform a flat share of 1/3 of faction total, clamped.
    """
    per_base: dict[str, int] = {}
    for pid in home_platforms:
        total = faction_force.get(pid, 0)
        # Rough: assume ~3 bases share this platform across the faction.
        per_base[pid] = max(0, total // 3)
    return per_base


def synth_observed_force(
    base_true_force: dict[str, int],
    home_platforms: list[str],
    tier: str,
    rng: random.Random,
) -> dict[str, Any]:
    total_true = sum(base_true_force.values())
    if tier == "low":
        lo, hi = _count_range(total_true, jitter_pct=0.35, rng=rng)
        return {"tier": "low", "count_range": [lo, hi]}
    if tier == "medium":
        lo, hi = _count_range(total_true, jitter_pct=0.15, rng=rng)
        return {
            "tier": "medium",
            "count_range": [lo, hi],
            "platforms": list(home_platforms),
        }
    # high
    readiness = rng.choice(["low", "medium", "medium", "high"])  # weighted medium
    return {
        "tier": "high",
        "total": total_true,
        "platforms_detailed": dict(base_true_force),
        "readiness": readiness,
    }


def generate_drone_sightings(
    adversary_bases: list[dict[str, Any]],
    drone_squadrons: list[dict[str, Any]],
    friendly_bases_registry: dict[int, dict[str, Any]],
    adversary_force_by_faction: dict[str, dict[str, int]],
    year: int,
    quarter: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    covered = bases_covered_by_drones(adversary_bases, drone_squadrons, friendly_bases_registry)
    cards: list[dict[str, Any]] = []
    for cov in covered:
        faction_force = adversary_force_by_faction.get(cov["faction"], {})
        base_true = _partition_force_to_base(faction_force, cov["home_platforms"])
        observed = synth_observed_force(
            base_true_force=base_true,
            home_platforms=cov["home_platforms"],
            tier=cov["effective_tier"],
            rng=rng,
        )
        drone_summary = [f"{d['platform_id']}@base{d['from_base_id']}" for d in cov["covering_drones"]]
        cards.append({
            "source": "drone_recon",
            "subject_id": cov["base_id_str"],
            "year": year,
            "quarter": quarter,
            "faction": cov["faction"],
            "observed_force": observed,
            "covering_drones": drone_summary,
            "truth_value": True,  # drone recon is always truthful, just fuzzy
            "confidence": {"low": 0.4, "medium": 0.7, "high": 0.9}[cov["effective_tier"]],
            "headline": f"{cov['faction']} base recon — {cov['effective_tier']} fidelity",
        })
    return cards
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend && pytest tests/test_drone_recon_engine.py -v`
Expected: PASS 5/5.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/drone_recon.py backend/tests/test_drone_recon_engine.py
git commit -m "feat(engine): drone recon sighting synth with tiered fog"
```

---

### Task 6: IntelCard Persistence — Extend Source Enum + Writer

**Files:**
- Modify: `backend/app/models/intel_card.py` (if source is enum-validated at model layer — check first; if it's plain string column, no schema change needed).
- Modify: `backend/app/crud/intel.py` (add `write_drone_recon_card` helper; reuse existing card write path if uniform).
- Test: `backend/tests/test_drone_recon_intel_writer.py`

- [ ] **Step 1: Inspect current IntelCard schema**

Run: `grep -n "source" backend/app/models/intel_card.py backend/app/schemas/intel.py`

If `source` is a plain `str` column, skip schema edit. If it's a SQL Enum, extend it to include `drone_recon`.

- [ ] **Step 2: Write failing test**

```python
# backend/tests/test_drone_recon_intel_writer.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.crud.campaign import create_campaign
from app.crud.intel import write_drone_recon_cards
from app.models.intel_card import IntelCard


def _memory_db():
    engine = create_engine("sqlite://",
                            connect_args={"check_same_thread": False},
                            poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_write_drone_recon_cards_persists_with_source_drone_recon():
    SessionLocal = _memory_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    cards_in = [{
        "source": "drone_recon",
        "subject_id": "paf_sargodha",
        "year": 2027,
        "quarter": 2,
        "faction": "PAF",
        "observed_force": {"tier": "medium", "count_range": [20, 26], "platforms": ["f16_blk52"]},
        "covering_drones": ["heron_tp@base5"],
        "truth_value": True,
        "confidence": 0.7,
        "headline": "PAF base recon — medium fidelity",
    }]
    write_drone_recon_cards(db, campaign_id=campaign.id, cards=cards_in)
    rows = db.query(IntelCard).filter_by(campaign_id=campaign.id, source="drone_recon").all()
    assert len(rows) == 1
    assert rows[0].subject_id == "paf_sargodha"
    assert rows[0].confidence == 0.7
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_drone_recon_intel_writer.py -v`
Expected: FAIL — `write_drone_recon_cards` does not exist.

- [ ] **Step 4: Implement writer**

Open `backend/app/crud/intel.py` and add:

```python
from app.models.intel_card import IntelCard


def write_drone_recon_cards(db, *, campaign_id: int, cards: list[dict]) -> None:
    for c in cards:
        db.add(IntelCard(
            campaign_id=campaign_id,
            source=c["source"],
            subject_id=c["subject_id"],
            year=c["year"],
            quarter=c["quarter"],
            faction=c.get("faction"),
            truth_value=c.get("truth_value", True),
            confidence=c["confidence"],
            headline=c["headline"],
            body_json=c.get("observed_force", {}),
            extra_json={"covering_drones": c.get("covering_drones", [])},
        ))
    db.flush()
```

(If `IntelCard` schema uses different column names, adjust `extra_json` / `body_json` to match. Use `grep -n "class IntelCard" backend/app/models/intel_card.py` first to confirm; the exact column names are what matter here, the semantic shape is preserved.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_drone_recon_intel_writer.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/intel.py backend/tests/test_drone_recon_intel_writer.py
git commit -m "feat(intel): persist drone_recon IntelCards"
```

---

### Task 7: Wire Drone Recon Into advance_turn

**Files:**
- Modify: `backend/app/engine/turn.py` (orchestrator — add drone_recon step after intel)
- Test: `backend/tests/test_drone_recon_turn_integration.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_drone_recon_turn_integration.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.crud.campaign import create_campaign
from app.api.turn import advance_turn_handler_fn  # whatever the existing entrypoint is
from app.models.intel_card import IntelCard
from app.models.squadron import Squadron


def _memory_db():
    engine = create_engine("sqlite://",
                            connect_args={"check_same_thread": False},
                            poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_advance_turn_emits_drone_recon_cards_when_drone_present():
    SessionLocal = _memory_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    # Place an MQ-9B at Pathankot (base_id varies; find by name).
    from app.models.campaign_base import CampaignBase
    pathankot = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign.id
    ).first()
    # Inject one drone squadron.
    db.add(Squadron(
        campaign_id=campaign.id,
        base_id=pathankot.id,
        platform_id="mq9b_seaguardian",
        call_sign="Guardian-1",
        strength=4,
        readiness_pct=80,
    ))
    db.commit()
    # Advance one turn.
    advance_turn_handler_fn(db, campaign.id)
    cards = db.query(IntelCard).filter_by(campaign_id=campaign.id, source="drone_recon").all()
    assert len(cards) >= 1, "Expected at least one drone_recon card when MQ-9B is present"
```

(Adjust import of `advance_turn_handler_fn` to match the actual entry — e.g. `app.engine.turn.advance` or `app.api.turn` fn.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_drone_recon_turn_integration.py -v`
Expected: FAIL — no drone_recon cards persisted.

- [ ] **Step 3: Wire into advance_turn**

In `backend/app/engine/turn.py` (orchestrator), after the intel subsystem step and before commit, add:

```python
# ISR drone recon — passive per-quarter surveillance of adversary bases.
# Runs after intel subsystem so the new cards land in the same turn's
# IntelCard pool.
from app.engine.drone_recon import generate_drone_sightings
from app.crud.intel import write_drone_recon_cards
from app.engine.rng import subsystem_rng

adv_bases_rows = db.query(AdversaryBase).filter_by(campaign_id=campaign.id).all()
adv_bases = [
    {"id": r.id, "base_id_str": r.base_id_str, "faction": r.faction,
     "lat": r.lat, "lon": r.lon, "tier": r.tier,
     "home_platforms": tuple(content_registry.adversary_bases()[r.base_id_str].home_platforms)}
    for r in adv_bases_rows
]
drone_squadrons = [
    {"id": sq.id, "platform_id": sq.platform_id, "base_id": sq.base_id,
     "strength": sq.strength, "readiness_pct": sq.readiness_pct}
    for sq in squadrons
    if sq.platform_id in {"tapas_uav", "ghatak_ucav", "heron_tp", "mq9b_seaguardian"}
]
friendly_bases_registry = {
    b.id: {"lat": b.lat, "lon": b.lon, "name": b.name}
    for b in friendly_bases
}
adv_force_by_faction = {
    s.faction: dict(s.force_composition_json or {})
    for s in adversary_states
}
drone_rng = subsystem_rng(campaign.seed, "drone_recon",
                          campaign.current_year, campaign.current_quarter)
sightings = generate_drone_sightings(
    adv_bases, drone_squadrons, friendly_bases_registry,
    adv_force_by_faction,
    year=campaign.current_year, quarter=campaign.current_quarter,
    rng=drone_rng,
)
write_drone_recon_cards(db, campaign_id=campaign.id, cards=sightings)
```

Add `from app.models.adversary_base import AdversaryBase` to the file's import block.

(If the orchestrator already has `squadrons`, `friendly_bases`, `adversary_states` in local scope from previous subsystems, reuse those variables — the placeholder names above are illustrative.)

- [ ] **Step 4: Run replay-determinism test (ensure drone_rng seeding doesn't break repeatability)**

Run: `cd backend && pytest tests/test_replay_determinism.py -v`
Expected: PASS. The `subsystem_rng("drone_recon", ...)` call is isolated per turn, so two independent runs with the same seed produce identical card sets.

- [ ] **Step 5: Run new integration test**

Run: `cd backend && pytest tests/test_drone_recon_turn_integration.py -v`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `cd backend && pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/engine/turn.py backend/tests/test_drone_recon_turn_integration.py
git commit -m "feat(turn): wire drone_recon into advance_turn"
```

---

### Task 8: GET /adversary-bases Endpoint

**Files:**
- Create: `backend/app/api/adversary_bases.py`
- Create: `backend/app/schemas/adversary_base.py`
- Modify: `backend/main.py` (register router)
- Test: `backend/tests/test_adversary_bases_api.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_adversary_bases_api.py
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.api.deps import get_db
from main import app
from app.crud.campaign import create_campaign
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase


def _client_and_db():
    engine = create_engine("sqlite://",
                            connect_args={"check_same_thread": False},
                            poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), TestingSessionLocal


def test_adversary_bases_covered_only_filters_uncovered():
    client, SessionLocal = _client_and_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    db.commit()

    # Without any drone squadron, covered_only=true returns [].
    r = client.get(f"/api/campaigns/{campaign.id}/adversary-bases?covered_only=true")
    assert r.status_code == 200
    assert r.json()["bases"] == []

    # With covered_only=false, all seeded adversary bases are returned.
    r2 = client.get(f"/api/campaigns/{campaign.id}/adversary-bases?covered_only=false")
    body = r2.json()["bases"]
    assert len(body) >= 10
    assert {b["faction"] for b in body} == {"PAF", "PLAAF", "PLAN"}


def test_adversary_bases_with_drone_returns_covered_with_latest_sighting():
    client, SessionLocal = _client_and_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    pathankot = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign.id, CampaignBase.name.ilike("%Pathankot%")
    ).first()
    db.add(Squadron(
        campaign_id=campaign.id, base_id=pathankot.id,
        platform_id="mq9b_seaguardian", call_sign="G1", strength=4, readiness_pct=80,
    ))
    db.commit()
    # Advance 1 turn to generate cards.
    r = client.post(f"/api/campaigns/{campaign.id}/advance")
    assert r.status_code == 200

    r2 = client.get(f"/api/campaigns/{campaign.id}/adversary-bases?covered_only=true")
    body = r2.json()["bases"]
    assert len(body) >= 1
    srg = next((b for b in body if b["base_id_str"] == "paf_sargodha"), None)
    assert srg is not None
    assert srg["latest_sighting"] is not None
    assert srg["latest_sighting"]["tier"] == "high"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_adversary_bases_api.py -v`
Expected: FAIL — endpoint not registered.

- [ ] **Step 3: Create schemas**

Create `backend/app/schemas/adversary_base.py`:

```python
from pydantic import BaseModel


class SightingRead(BaseModel):
    tier: str  # "low" | "medium" | "high"
    year: int
    quarter: int
    count_range: tuple[int, int] | None = None
    platforms: list[str] | None = None
    platforms_detailed: dict[str, int] | None = None
    readiness: str | None = None
    covering_drones: list[str] = []


class AdversaryBaseRead(BaseModel):
    id: int
    base_id_str: str
    name: str
    faction: str
    lat: float
    lon: float
    tier: str
    is_covered: bool
    latest_sighting: SightingRead | None = None


class AdversaryBaseListResponse(BaseModel):
    bases: list[AdversaryBaseRead]
```

- [ ] **Step 4: Create router**

Create `backend/app/api/adversary_bases.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.adversary_base import AdversaryBase
from app.models.intel_card import IntelCard
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase
from app.engine.drone_recon import bases_covered_by_drones
from app.schemas.adversary_base import (
    AdversaryBaseRead, AdversaryBaseListResponse, SightingRead,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}/adversary-bases", tags=["adversary-bases"])

_DRONE_PIDS = {"tapas_uav", "ghatak_ucav", "heron_tp", "mq9b_seaguardian"}


@router.get("", response_model=AdversaryBaseListResponse)
def list_adversary_bases(
    campaign_id: int,
    covered_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    adv_rows = db.query(AdversaryBase).filter_by(campaign_id=campaign_id).all()
    drones = [
        {"id": s.id, "platform_id": s.platform_id, "base_id": s.base_id,
         "strength": s.strength, "readiness_pct": s.readiness_pct}
        for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()
        if s.platform_id in _DRONE_PIDS
    ]
    friendly_bases = {
        b.id: {"lat": b.lat, "lon": b.lon, "name": b.name}
        for b in db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()
    }
    adv_dicts = [
        {"id": r.id, "base_id_str": r.base_id_str, "lat": r.lat, "lon": r.lon,
         "faction": r.faction, "tier": r.tier, "home_platforms": ()}
        for r in adv_rows
    ]
    coverage = {c["adversary_base_id"]: c for c in bases_covered_by_drones(adv_dicts, drones, friendly_bases)}

    # Latest drone_recon sighting per base_id_str.
    latest_by_subject: dict[str, IntelCard] = {}
    for card in (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign_id, source="drone_recon")
        .order_by(IntelCard.year.desc(), IntelCard.quarter.desc(), IntelCard.id.desc())
        .all()
    ):
        latest_by_subject.setdefault(card.subject_id, card)

    out: list[AdversaryBaseRead] = []
    for r in adv_rows:
        is_covered = r.id in coverage
        if covered_only and not is_covered:
            continue
        card = latest_by_subject.get(r.base_id_str)
        sighting = None
        if card is not None:
            body = card.body_json or {}
            extra = card.extra_json or {}
            sighting = SightingRead(
                tier=body.get("tier", "low"),
                year=card.year,
                quarter=card.quarter,
                count_range=tuple(body["count_range"]) if body.get("count_range") else None,
                platforms=body.get("platforms"),
                platforms_detailed=body.get("platforms_detailed"),
                readiness=body.get("readiness"),
                covering_drones=extra.get("covering_drones", []),
            )
        out.append(AdversaryBaseRead(
            id=r.id, base_id_str=r.base_id_str, name=r.name, faction=r.faction,
            lat=r.lat, lon=r.lon, tier=r.tier,
            is_covered=is_covered, latest_sighting=sighting,
        ))
    return AdversaryBaseListResponse(bases=out)
```

- [ ] **Step 5: Register router**

In `backend/main.py`:

```python
from app.api import adversary_bases as adversary_bases_api
app.include_router(adversary_bases_api.router)
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && pytest tests/test_adversary_bases_api.py -v`
Expected: PASS 2/2.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/adversary_bases.py backend/app/schemas/adversary_base.py backend/main.py backend/tests/test_adversary_bases_api.py
git commit -m "feat(api): GET /adversary-bases with covered_only filter"
```

---

### Task 9: Frontend Types + Store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/store/campaignStore.ts`
- Test: `frontend/src/store/__tests__/adversaryBases.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/store/__tests__/adversaryBases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCampaignStore } from "../campaignStore";
import { http } from "../../lib/api";

describe("adversaryBases store", () => {
  beforeEach(() => {
    useCampaignStore.setState({ adversaryBases: [] });
  });

  it("loads adversary bases from API", async () => {
    const mock = vi.spyOn(http, "get").mockResolvedValueOnce({
      data: { bases: [
        { id: 1, base_id_str: "paf_sargodha", name: "PAF Sargodha", faction: "PAF",
          lat: 32.05, lon: 72.66, tier: "main", is_covered: true,
          latest_sighting: { tier: "medium", year: 2027, quarter: 2,
                              count_range: [20, 26], platforms: ["f16_blk52"],
                              covering_drones: ["heron_tp@base5"] }
        },
      ] },
    });
    await useCampaignStore.getState().loadAdversaryBases(7);
    const state = useCampaignStore.getState();
    expect(state.adversaryBases).toHaveLength(1);
    expect(state.adversaryBases[0].base_id_str).toBe("paf_sargodha");
    expect(mock).toHaveBeenCalledWith("/api/campaigns/7/adversary-bases", expect.anything());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/store/__tests__/adversaryBases.test.ts`
Expected: FAIL — `loadAdversaryBases` doesn't exist.

- [ ] **Step 3: Add types**

In `frontend/src/lib/types.ts`:

```typescript
export interface AdversaryBaseSighting {
  tier: "low" | "medium" | "high";
  year: number;
  quarter: number;
  count_range?: [number, number];
  platforms?: string[];
  platforms_detailed?: Record<string, number>;
  readiness?: "low" | "medium" | "high";
  covering_drones: string[];
}

export interface AdversaryBase {
  id: number;
  base_id_str: string;
  name: string;
  faction: "PAF" | "PLAAF" | "PLAN";
  lat: number;
  lon: number;
  tier: "main" | "forward" | "support";
  is_covered: boolean;
  latest_sighting: AdversaryBaseSighting | null;
}
```

- [ ] **Step 4: Add API method**

In `frontend/src/lib/api.ts`:

```typescript
import type { AdversaryBase } from "./types";

export async function getAdversaryBases(
  campaignId: number,
  coveredOnly: boolean = true,
): Promise<AdversaryBase[]> {
  const r = await http.get(`/api/campaigns/${campaignId}/adversary-bases`, {
    params: { covered_only: coveredOnly },
  });
  return r.data.bases as AdversaryBase[];
}
```

Also export from the `api` object if the codebase uses that pattern.

- [ ] **Step 5: Add store state + action**

In `frontend/src/store/campaignStore.ts`:

```typescript
import { getAdversaryBases } from "../lib/api";
import type { AdversaryBase } from "../lib/types";

// In state interface:
// adversaryBases: AdversaryBase[];
// loadAdversaryBases: (campaignId: number) => Promise<void>;

// In store impl:
adversaryBases: [],
loadAdversaryBases: async (campaignId) => {
  try {
    const bases = await getAdversaryBases(campaignId, false);  // load all, let UI filter
    set({ adversaryBases: bases });
  } catch (e) {
    console.error("loadAdversaryBases failed", e);
  }
},
```

Call `loadAdversaryBases(campaign.id)` inside `advanceTurn` action after the turn advances (parallel to existing `loadNotifications`, `loadPendingVignettes` calls) and on initial campaign load.

- [ ] **Step 6: Run test to verify pass**

Run: `cd frontend && npx vitest run src/store/__tests__/adversaryBases.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts frontend/src/store/__tests__/adversaryBases.test.ts
git commit -m "feat(fe): adversaryBases store + api wiring"
```

---

### Task 10: Map Layers — AdversaryBaseLayer + DroneOrbitLayer

**Files:**
- Create: `frontend/src/components/map/AdversaryBaseLayer.tsx`
- Create: `frontend/src/components/map/DroneOrbitLayer.tsx`
- Create: `frontend/src/components/map/AdversaryBaseSheet.tsx`
- Modify: `frontend/src/store/mapStore.ts` (two new layer flags)
- Modify: `frontend/src/components/map/LayerTogglePanel.tsx`
- Modify: `frontend/src/pages/CampaignMapView.tsx` (mount + deep-link)
- Test: `frontend/src/components/map/__tests__/AdversaryBaseLayer.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// frontend/src/components/map/__tests__/AdversaryBaseLayer.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AdversaryBaseLayer } from "../AdversaryBaseLayer";
import type { AdversaryBase } from "../../../lib/types";

const mockBases: AdversaryBase[] = [
  { id: 1, base_id_str: "paf_sargodha", name: "PAF Sargodha", faction: "PAF",
    lat: 32.05, lon: 72.66, tier: "main", is_covered: true,
    latest_sighting: { tier: "medium", year: 2027, quarter: 2, count_range: [20, 26],
      platforms: ["f16_blk52"], covering_drones: ["heron_tp@base5"] } },
  { id: 2, base_id_str: "plaaf_hotan", name: "Hotan AB", faction: "PLAAF",
    lat: 37.04, lon: 79.86, tier: "forward", is_covered: false, latest_sighting: null },
];

describe("AdversaryBaseLayer", () => {
  it("renders only covered bases when filterCovered=true", () => {
    render(<AdversaryBaseLayer bases={mockBases} onSelect={() => {}} project={() => ({ x: 0, y: 0 })} filterCovered />);
    expect(screen.getByLabelText(/PAF Sargodha/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Hotan AB/)).not.toBeInTheDocument();
  });

  it("calls onSelect with the clicked base", () => {
    const onSelect = vi.fn();
    render(<AdversaryBaseLayer bases={mockBases} onSelect={onSelect} project={() => ({ x: 0, y: 0 })} filterCovered />);
    fireEvent.click(screen.getByLabelText(/PAF Sargodha/));
    expect(onSelect).toHaveBeenCalledWith(mockBases[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/map/__tests__/AdversaryBaseLayer.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement AdversaryBaseLayer**

Create `frontend/src/components/map/AdversaryBaseLayer.tsx`:

```tsx
import type { AdversaryBase } from "../../lib/types";

export interface AdversaryBaseLayerProps {
  bases: AdversaryBase[];
  onSelect: (base: AdversaryBase) => void;
  project: (lat: number, lon: number) => { x: number; y: number };
  filterCovered?: boolean;
}

const FACTION_COLOR: Record<string, string> = {
  PAF: "#dc2626",    // red-600
  PLAAF: "#ea580c",  // orange-600
  PLAN: "#d97706",   // amber-600
};

export function AdversaryBaseLayer({ bases, onSelect, project, filterCovered = true }: AdversaryBaseLayerProps) {
  const visible = filterCovered ? bases.filter((b) => b.is_covered) : bases;
  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
      {visible.map((b) => {
        const { x, y } = project(b.lat, b.lon);
        const color = FACTION_COLOR[b.faction] ?? "#dc2626";
        return (
          <g key={b.id} transform={`translate(${x},${y})`} className="pointer-events-auto">
            <circle r={6} fill={color} fillOpacity={0.8} stroke="#1e293b" strokeWidth={1} />
            <circle r={10} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1} />
            <button
              aria-label={b.name}
              onClick={() => onSelect(b)}
              style={{ width: 20, height: 20, transform: "translate(-10px, -10px)" }}
              className="absolute bg-transparent border-none cursor-pointer"
            />
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd frontend && npx vitest run src/components/map/__tests__/AdversaryBaseLayer.test.tsx`
Expected: PASS 2/2.

- [ ] **Step 5: Implement DroneOrbitLayer**

Create `frontend/src/components/map/DroneOrbitLayer.tsx`:

```tsx
import type { BaseMarker, HangarSquadron } from "../../lib/types";

const ORBIT_RADIUS_KM: Record<string, number> = {
  tapas_uav: 300,
  ghatak_ucav: 500,
  heron_tp: 1000,
  mq9b_seaguardian: 1800,
};

export interface DroneOrbitLayerProps {
  squadrons: HangarSquadron[];
  bases: BaseMarker[];
  project: (lat: number, lon: number) => { x: number; y: number };
  kmToPixels: (lat: number, km: number) => number;
}

export function DroneOrbitLayer({ squadrons, bases, project, kmToPixels }: DroneOrbitLayerProps) {
  const byBase = new Map(bases.map((b) => [b.id, b] as const));
  const dronePids = Object.keys(ORBIT_RADIUS_KM);
  const drones = squadrons.filter(
    (s) => dronePids.includes(s.platform_id) && s.strength > 0 && s.readiness_pct > 0,
  );

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
      {drones.map((sq) => {
        const b = byBase.get(sq.base_id);
        if (!b) return null;
        const { x, y } = project(b.lat, b.lon);
        const radiusPx = kmToPixels(b.lat, ORBIT_RADIUS_KM[sq.platform_id]);
        return (
          <circle
            key={sq.id}
            cx={x} cy={y} r={radiusPx}
            fill="#06b6d4" fillOpacity={0.06}
            stroke="#22d3ee" strokeOpacity={0.5} strokeWidth={1}
            strokeDasharray="4 4"
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 6: Implement AdversaryBaseSheet**

Create `frontend/src/components/map/AdversaryBaseSheet.tsx`:

```tsx
import type { AdversaryBase } from "../../lib/types";

export interface AdversaryBaseSheetProps {
  base: AdversaryBase | null;
  onClose: () => void;
}

export function AdversaryBaseSheet({ base, onClose }: AdversaryBaseSheetProps) {
  if (!base) return null;
  const s = base.latest_sighting;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{base.name}</h3>
          <p className="text-xs opacity-70">{base.faction} · {base.tier} base</p>
        </div>
        <button onClick={onClose} aria-label="close" className="w-8 h-8 rounded-full bg-slate-800">×</button>
      </div>

      {s === null ? (
        <p className="mt-3 text-xs opacity-60">
          Not currently covered by any ISR drone orbit. Base a drone within range to get sightings.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase opacity-60">Fidelity</span>
            <span className={[
              "px-1.5 py-0.5 rounded border text-[10px]",
              s.tier === "high" ? "border-emerald-700 text-emerald-300 bg-emerald-900/30" :
              s.tier === "medium" ? "border-sky-700 text-sky-300 bg-sky-900/30" :
              "border-slate-700 text-slate-300 bg-slate-800/50",
            ].join(" ")}>{s.tier}</span>
            <span className="opacity-60">· as of {s.year}-Q{s.quarter}</span>
          </div>

          {s.tier === "low" && s.count_range && (
            <p>Estimated airframes: <strong>{s.count_range[0]}–{s.count_range[1]}</strong></p>
          )}
          {s.tier === "medium" && (
            <>
              {s.count_range && <p>Estimated airframes: <strong>{s.count_range[0]}–{s.count_range[1]}</strong></p>}
              {s.platforms && <p>Platforms observed: {s.platforms.join(", ")}</p>}
            </>
          )}
          {s.tier === "high" && s.platforms_detailed && (
            <>
              <p>Force composition:</p>
              <ul className="ml-4 list-disc">
                {Object.entries(s.platforms_detailed).map(([pid, n]) => (
                  <li key={pid}>{n}× {pid}</li>
                ))}
              </ul>
              {s.readiness && <p>Readiness signal: <strong>{s.readiness}</strong></p>}
            </>
          )}

          {s.covering_drones.length > 0 && (
            <p className="opacity-60 text-[11px] mt-3">Source drones: {s.covering_drones.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add mapStore flags**

In `frontend/src/store/mapStore.ts`, extend `activeLayers` default with:

```typescript
adversary_bases: true,
drone_orbits: true,
```

- [ ] **Step 8: Add LayerTogglePanel entries**

In `frontend/src/components/map/LayerTogglePanel.tsx`, add two rows for `adversary_bases` and `drone_orbits` alongside existing toggles.

- [ ] **Step 9: Mount in CampaignMapView**

In `frontend/src/pages/CampaignMapView.tsx`:

1. `const adversaryBases = useCampaignStore((s) => s.adversaryBases);`
2. Local state: `const [selectedAdv, setSelectedAdv] = useState<AdversaryBase | null>(null);`
3. After `SubcontinentMap` children, conditionally render `<AdversaryBaseLayer ... />` and `<DroneOrbitLayer ... />` when their `activeLayers` flags are true.
4. Bottom-mount `<AdversaryBaseSheet base={selectedAdv} onClose={() => setSelectedAdv(null)} />`.
5. Read `searchParams.get("focus_adversary_base")` on mount, find in store, setSelectedAdv.

- [ ] **Step 10: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: all green, +3 new tests.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/map/AdversaryBaseLayer.tsx frontend/src/components/map/DroneOrbitLayer.tsx frontend/src/components/map/AdversaryBaseSheet.tsx frontend/src/components/map/LayerTogglePanel.tsx frontend/src/store/mapStore.ts frontend/src/pages/CampaignMapView.tsx frontend/src/components/map/__tests__/AdversaryBaseLayer.test.tsx
git commit -m "feat(fe): adversary base layer + drone orbit layer + sheet"
```

---

### Task 11: Intel Inbox ISR Badge + Notification Deep-Link

**Files:**
- Modify: `frontend/src/components/intel/IntelCard.tsx` (add `drone_recon` source variant)
- Modify: `backend/app/api/notifications.py` (recognize `drone_recon` cards, deep-link to map)
- Test: `frontend/src/components/intel/__tests__/IntelCard.test.tsx` (extend)
- Test: `backend/tests/test_notifications_api.py` (extend)

- [ ] **Step 1: Write failing frontend test**

Append to an existing `IntelCard.test.tsx` (or create):

```tsx
it("renders drone_recon with ISR source badge", () => {
  render(<IntelCard card={{
    id: 99, source: "drone_recon", subject_id: "paf_sargodha",
    year: 2027, quarter: 2, confidence: 0.7,
    headline: "PAF base recon — medium fidelity", body_json: {},
  }} onDismiss={() => {}} />);
  expect(screen.getByText(/ISR/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/intel/__tests__/IntelCard.test.tsx`
Expected: FAIL — `ISR` badge missing.

- [ ] **Step 3: Add ISR variant in IntelCard.tsx**

In the source-badge switch, add:

```tsx
case "drone_recon":
  return { label: "ISR", bg: "bg-cyan-900/40", fg: "text-cyan-300", border: "border-cyan-700" };
```

- [ ] **Step 4: Run FE test**

Run: `cd frontend && npx vitest run src/components/intel/__tests__/IntelCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Extend notifications synthesizer for drone_recon**

In `backend/app/api/notifications.py`, inside the loop that walks recent IntelCards, add a case for `source == "drone_recon"`:

```python
elif card.source == "drone_recon":
    notifications.append(Notification(
        id=f"drone_recon:{card.id}",
        kind="drone_recon",
        severity="info",
        title=card.headline,
        body=f"{card.faction} base — new ISR sighting",
        action_url=f"/campaign/{campaign_id}/map?focus_adversary_base={card.subject_id}",
        created_at=f"{card.year}-Q{card.quarter}",
    ))
```

(The `Notification` schema already supports these fields from Plan 20.)

- [ ] **Step 6: Write backend test**

Append to `backend/tests/test_notifications_api.py`:

```python
def test_drone_recon_card_surfaces_as_notification():
    client, SessionLocal = _client_and_db()
    db = SessionLocal()
    campaign = create_campaign(db, name="T", objective_ids=["defend_punjab"], difficulty="realistic")
    pathankot = db.query(CampaignBase).filter_by(campaign_id=campaign.id).first()
    db.add(Squadron(campaign_id=campaign.id, base_id=pathankot.id,
                     platform_id="mq9b_seaguardian", call_sign="G1",
                     strength=4, readiness_pct=80))
    db.commit()
    client.post(f"/api/campaigns/{campaign.id}/advance")
    r = client.get(f"/api/campaigns/{campaign.id}/notifications")
    kinds = [n["kind"] for n in r.json()["notifications"]]
    assert "drone_recon" in kinds
```

- [ ] **Step 7: Run backend test**

Run: `cd backend && pytest tests/test_notifications_api.py::test_drone_recon_card_surfaces_as_notification -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/intel/IntelCard.tsx backend/app/api/notifications.py backend/tests/test_notifications_api.py frontend/src/components/intel/__tests__/IntelCard.test.tsx
git commit -m "feat: ISR source badge + drone_recon notifications deep-link"
```

---

### Task 12: Full-suite Verification + Docs Update

**Files:**
- Modify: `CLAUDE.md` (current-status block)
- Modify: `docs/superpowers/plans/ROADMAP.md` if present

- [ ] **Step 1: Run full backend suite**

Run: `cd backend && pytest -q`
Expected: all pass (535 baseline + ~10 new).

- [ ] **Step 2: Run full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: all pass (192 baseline + ~5 new).

- [ ] **Step 3: Update CLAUDE.md**

Add a new "Current Status" line for Plan 21 (ISR Drone Recon) summarizing what shipped. Bump "Last updated" to today.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-04-22-isr-drone-recon-plan.md
git commit -m "docs: Plan 21 done — ISR drone recon + adversary base fog"
```

- [ ] **Step 5: Push + deploy**

```bash
git push && ./deploy.sh
```

- [ ] **Step 6: Prod smoke**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/adversary-bases?covered_only=false" | head -c 500
```

Expected: JSON with 15 adversary bases across PAF/PLAAF/PLAN.

---

## Self-Review Notes

- **Spec coverage:** (A) map markers + sheet = Task 10; (A) notifications = Task 11; (C) orbit rings = Task 10; per-platform radius = Task 3; fog tiers = Task 5; intel-inbox badge = Task 11.
- **Type consistency:** `AdversaryBase.is_covered` + `latest_sighting` match across Task 8 (schema), Task 9 (FE types), Task 10 (component), Task 11 (notifications payload).
- **Determinism:** Task 7 uses `subsystem_rng(seed, "drone_recon", year, quarter)` — isolated stream, replay-safe.
- **Risks:** Task 6 assumes `IntelCard` has `body_json` + `extra_json` JSON columns. If the actual ORM uses different column names, adjust the writer's kwargs to match. Check first via `grep -n "class IntelCard" backend/app/models/intel_card.py`.
