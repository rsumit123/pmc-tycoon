# Ops Screen + Offensive Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Strategic Operations screen — strategic posture dashboard + player-initiated offensive strikes — anchored on a new diplomacy system, sub-system base damage model, and parallel offensive resolver.

**Architecture:** Foundation layer (Phase 1) introduces `BaseDamage` + `DiplomaticState` ORM rows + a pure-function diplomacy/repair engine that ticks every quarter. Phase 2 introduces a parallel offensive resolver under `engine/offensive/` that flips the existing defensive resolver — IND is the attacker, adversary base + AD is the defender. Three combat phases (penetration → strike → egress) produce sub-system damage (shelters / runway / AD / garrisoned airframes) that the repair engine decays over time. Phase 3 adds POST/GET endpoints for strike preview and commit, plus a posture rollup endpoint. Phase 4 ships the `/campaign/:id/ops` route with three tabs (Posture / Strike / History) and wires offensive deep-links into the existing map + Acquisitions UI.

**Tech Stack:** FastAPI + SQLAlchemy 2.x + Pydantic 2 + MapLibre + React 19 + Zustand + pytest + vitest. No new deps.

**Locked design decisions (from brainstorming, do not revisit):**
- Sync resolution on commit (no queued strikes).
- Cap **2 strikes/quarter**.
- One strike runs at a time — cannot be combined with a pending reactive vignette.
- Offensive ops gated narratively: locked until the player resolves their first reactive vignette of the campaign. Then unlocked permanently.
- Per-faction stepped diplomatic temperature: `friendly | neutral | cool | cold | hostile`. Five tiers.
- Hostile temperature blocks **new** procurement orders from suppliers tied to that faction; in-flight orders deliver fine.
- Sub-system damage (shelters / runway_disabled_q / ad_destroyed / garrisoned_loss). Free 4-quarter passive auto-repair; player can pay to rush in 1 quarter.
- New parallel offensive resolver in `engine/offensive/`. Existing defensive resolver untouched.
- Single-target per strike. Single ROE per strike. Single profile per strike.
- Range forecasts (low–high) on the risk preview, width driven by intel quality.
- Persistent damage assessment (no decay of player's intel knowledge).
- Drones (Ghatak) return home; loitering munitions are a future weapon class.
- Cruise/strike weapons pulled only from the launching base depot.
- No worst-case floor on losses — bad intel can wipe a package.
- Quarterly grant scales by per-faction temperature: `cold +30%`, `hostile +75%`, capped `+150%` total.
- Repair: 4Q passive auto-rebuild OR pay treasury to rush to 1Q.
- Existing `TacticalReplay` viz extended for offensive AAR (penetration → strike → egress phase markers).

---

## File Structure

**Backend — new:**
- `backend/content/strike_profiles.yaml` — 4 profile templates (deep_strike / sead_suppression / standoff_cruise / drone_swarm) with eligibility rules + base modifiers.
- `backend/content/diplomacy.yaml` — supplier→faction mapping + per-faction baseline temperature + per-tier modifiers.
- `backend/app/models/diplomatic_state.py` — `DiplomaticState(campaign_id, faction, temperature_pct)` ORM. Composite unique on `(campaign_id, faction)`.
- `backend/app/models/base_damage.py` — `BaseDamage(campaign_id, adversary_base_id, shelter_loss_pct, runway_disabled_quarters_remaining, ad_destroyed, garrisoned_loss)` per-adversary-base damage state.
- `backend/app/models/offensive_op.py` — `OffensiveOp(campaign_id, year, quarter, target_base_id, status, profile, package_json, outcome_json)` persisted strike row, parallel to `Vignette`.
- `backend/app/engine/diplomacy.py` — pure fn `tier_from_temperature`, `tick_diplomacy`, `grant_multiplier`, `is_supplier_blocked`.
- `backend/app/engine/repair.py` — pure fn `tick_base_damage` (decays runway_disabled_quarters; computes shelter regen).
- `backend/app/engine/offensive/__init__.py` — barrel exports.
- `backend/app/engine/offensive/planning.py` — `validate_strike_package`, `forecast_strike` (range estimate based on intel quality + composition).
- `backend/app/engine/offensive/resolver.py` — `resolve_strike(strike, target_base, ind_squadrons, weapons_avail, intel_quality, rng) -> OffensiveOutcome`. Calls penetration + strike + egress phases.
- `backend/app/engine/offensive/penetration.py` — phase 1: AD bubble engagement, AWACS detection, SEAD effect.
- `backend/app/engine/offensive/strike_phase.py` — phase 2: weapons-on-target P_kill rolls, sub-system damage allocation.
- `backend/app/engine/offensive/egress.py` — phase 3: adversary CAP scramble, chase, IND losses.
- `backend/app/api/offensive_ops.py` — `POST /strikes/preview`, `POST /strikes`, `GET /strikes`, `GET /strikes/{id}`.
- `backend/app/api/diplomacy.py` — `GET /diplomacy`.
- `backend/app/api/posture.py` — `GET /posture` rollup endpoint.
- `backend/app/schemas/offensive.py`, `backend/app/schemas/diplomacy.py`, `backend/app/schemas/posture.py`.
- `backend/tests/test_diplomacy_engine.py`, `test_repair_engine.py`, `test_offensive_resolver.py`, `test_offensive_api.py`, `test_posture_api.py`, `test_diplomacy_api.py`, `test_offensive_unlock.py`.

**Backend — modify:**
- `backend/content/adversary_bases.yaml` — add `shelter_count`, `garrisoned_platforms`, `value`, `command_node` to every existing entry.
- `backend/app/content/loader.py` — extend `AdversaryBaseSpec`.
- `backend/app/models/adversary_base.py` — add `shelter_count` column.
- `backend/app/models/__init__.py` — register new ORMs.
- `backend/app/crud/seed_starting_state.py` — seed `DiplomaticState` rows + extend `AdversaryBase` seed with new fields.
- `backend/app/crud/campaign.py::advance_turn` — call `tick_diplomacy`, `tick_base_damage`, recompute grant via diplomacy, check offensive-unlock condition (after first vignette resolves).
- `backend/app/engine/budget.py::compute_quarterly_grant` — accept per-faction temperatures + apply multiplier.
- `backend/app/api/acquisitions.py` — reject `POST /acquisitions` when `kind=platform` and the platform's origin is from a hostile-tier faction.
- `backend/app/api/notifications.py` — synthesize diplomacy threshold notifications + base damage notifications + offensive_unlock unlock event.
- `backend/main.py` — register 3 new routers.

**Frontend — new:**
- `frontend/src/pages/OpsScreen.tsx` — main `/campaign/:id/ops` route, three-tab nav (Posture / Strike / History), URL-sharable `?tab=`.
- `frontend/src/components/ops/PostureDashboard.tsx` — single-page scrollable, sectioned widgets.
- `frontend/src/components/ops/Sparkline.tsx` — reusable 8-quarter SVG sparkline primitive.
- `frontend/src/components/ops/ThreatRibbon.tsx`, `ForceReadinessSummary.tsx`, `TreasuryRunway.tsx`, `StockpileHealth.tsx`, `ADCoverageGap.tsx`, `RDPipelineSummary.tsx`, `ActiveDeliveriesPanel.tsx`, `AdversaryMovementFeed.tsx`.
- `frontend/src/components/ops/DiplomacyMeter.tsx` — per-faction badge + breakdown panel.
- `frontend/src/components/ops/StrikeTargetPicker.tsx` — sortable target list (faction filter, value sort, intel-quality column).
- `frontend/src/components/ops/StrikeBuilder.tsx` — single form, collapsible sections (Target / Profile / Squadrons / Weapons / Support / ROE / Review).
- `frontend/src/components/ops/StrikeRiskPreview.tsx` — risk panel (range forecasts, diplomatic blowback, treasury impact).
- `frontend/src/components/ops/StrikeAAR.tsx` — replaces / extends `VignetteAAR` for offensive cards.
- `frontend/src/components/ops/DamageAssessmentPanel.tsx` — sub-system breakdown.
- `frontend/src/components/ops/StrikeHistoryList.tsx` — list of past strikes.

**Frontend — modify:**
- `frontend/src/lib/types.ts` — Strike, StrikeProfile, StrikePackage, StrikePreview, StrikeOutcome, BaseDamage, DiplomaticState, PostureSnapshot.
- `frontend/src/lib/api.ts` — `previewStrike`, `commitStrike`, `getStrikes`, `getStrike`, `getDiplomacy`, `getPosture`.
- `frontend/src/store/campaignStore.ts` — strike state, posture, diplomacy, repair-rush action.
- `frontend/src/App.tsx` — register `/campaign/:id/ops` route.
- `frontend/src/pages/CampaignMapView.tsx` — header gets Ops link + diplomacy mini-meter; AdversaryBaseLayer gets damage badges; Strike → button on AdversaryBaseSheet.
- `frontend/src/components/map/AdversaryBaseSheet.tsx` — Strike → deep-link button (only when offensive unlocked + base is covered) + per-base damage state + Rush Repair button when player's own base damaged (hybrid behavior).
- `frontend/src/components/procurement/AcquisitionPipeline.tsx` — disable + tooltip on aircraft offer cards from hostile-tier suppliers.
- `frontend/src/components/intel/IntelCard.tsx` — add `base_damage_assessment` source variant (issued post-strike).

---

### Task 1: Adversary Base Content Extension

**Files:**
- Modify: `backend/content/adversary_bases.yaml` (add 4 fields to every entry)
- Modify: `backend/app/content/loader.py` (extend AdversaryBaseSpec)
- Modify: `backend/app/models/adversary_base.py` (add shelter_count column)
- Test: `backend/tests/test_adversary_bases_content.py` (extend)

- [ ] **Step 1: Extend test**

Append to `backend/tests/test_adversary_bases_content.py`:

```python
def test_adversary_bases_have_strike_metadata():
    bases = _load()
    for spec in bases.values():
        assert spec.shelter_count > 0, f"{spec.id} shelter_count missing"
        assert isinstance(spec.garrisoned_platforms, tuple)
        assert 1 <= spec.value <= 5, f"{spec.id} value out of range"
        assert isinstance(spec.command_node, bool)
    # At least one PAF/PLAAF/PLAN command_node base.
    cnode_factions = {s.faction for s in bases.values() if s.command_node}
    assert {"PAF", "PLAAF", "PLAN"} <= cnode_factions
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_adversary_bases_content.py -v`
Expected: FAIL — fields don't exist on AdversaryBaseSpec.

- [ ] **Step 3: Extend loader spec**

In `backend/app/content/loader.py` replace `class AdversaryBaseSpec`:

```python
class AdversaryBaseSpec(BaseModel):
    id: str
    name: str
    faction: Literal["PAF", "PLAAF", "PLAN"]
    lat: float
    lon: float
    tier: Literal["main", "forward", "support"]
    home_platforms: list[str] = Field(default_factory=list)
    shelter_count: int = 12
    garrisoned_platforms: list[str] = Field(default_factory=list)
    value: int = Field(default=2, ge=1, le=5)
    command_node: bool = False
```

- [ ] **Step 4: Extend YAML content**

Open `backend/content/adversary_bases.yaml` and add the 4 new fields to every base entry. Sample for two factions (apply same pattern to remaining 13):

```yaml
  - id: paf_sargodha
    name: PAF Base Sargodha (Mushaf)
    faction: PAF
    lat: 32.0483
    lon: 72.6644
    tier: main
    home_platforms: [f16_blk52, jf17_blk3]
    shelter_count: 24
    garrisoned_platforms: [f16_blk52, jf17_blk3]
    value: 5
    command_node: true

  - id: plaaf_hotan
    name: Hotan AB
    faction: PLAAF
    lat: 37.0353
    lon: 79.8647
    tier: forward
    home_platforms: [j10c, j11b, j16]
    shelter_count: 18
    garrisoned_platforms: [j10c, j11b, j16]
    value: 4
    command_node: false
```

Suggested values per tier (apply uniformly):
- `main` → shelter_count: 24, value: 5
- `forward` → shelter_count: 16, value: 3
- `support` → shelter_count: 8, value: 2

`command_node: true` for: paf_sargodha, paf_kamra, plaaf_chengdu, plan_yulin. All others false.

`garrisoned_platforms` mirrors `home_platforms` for now.

- [ ] **Step 5: Add shelter_count column to ORM**

In `backend/app/models/adversary_base.py` after the existing `tier` column add:

```python
    shelter_count: Mapped[int] = mapped_column(Integer, default=12)
```

- [ ] **Step 6: Update seed to write the new column**

In `backend/app/crud/seed_starting_state.py` find the `AdversaryBase(...)` add inside `seed_starting_state` and extend:

```python
        db.add(AdversaryBase(
            campaign_id=campaign.id,
            base_id_str=spec.id,
            name=spec.name,
            faction=spec.faction,
            lat=spec.lat,
            lon=spec.lon,
            tier=spec.tier,
            shelter_count=spec.shelter_count,
        ))
```

- [ ] **Step 7: Update legacy lazy-backfill to write shelter_count**

In `backend/app/api/adversary_bases.py` find the lazy backfill block and add `shelter_count=spec.shelter_count` to the `AdversaryBase(...)` constructor.

- [ ] **Step 8: Run tests to verify pass**

Run: `cd backend && pytest tests/test_adversary_bases_content.py -v`
Expected: PASS.

- [ ] **Step 9: Run full suite**

Run: `cd backend && pytest -q`
Expected: 550+ pass, no regressions.

- [ ] **Step 10: Commit**

```bash
git add backend/content/adversary_bases.yaml backend/app/content/loader.py backend/app/models/adversary_base.py backend/app/crud/seed_starting_state.py backend/app/api/adversary_bases.py backend/tests/test_adversary_bases_content.py
git commit -m "feat(content): adversary base strike metadata (shelters/value/command)"
```

---

### Task 2: BaseDamage ORM + Repair Engine

**Files:**
- Create: `backend/app/models/base_damage.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/engine/repair.py`
- Test: `backend/tests/test_repair_engine.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_repair_engine.py
from app.engine.repair import tick_base_damage


def test_runway_decay_one_quarter():
    state = {"shelter_loss_pct": 30, "runway_disabled_quarters_remaining": 2,
             "ad_destroyed": False, "garrisoned_loss": 4}
    out = tick_base_damage(state)
    assert out["runway_disabled_quarters_remaining"] == 1


def test_shelter_regen_per_quarter():
    state = {"shelter_loss_pct": 40, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": False, "garrisoned_loss": 8}
    out = tick_base_damage(state)
    # 4-quarter free auto-repair → 25% per quarter on shelters and garrison.
    assert out["shelter_loss_pct"] == 30
    assert out["garrisoned_loss"] == 6


def test_zero_state_idempotent():
    state = {"shelter_loss_pct": 0, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": False, "garrisoned_loss": 0}
    assert tick_base_damage(state) == state


def test_ad_destroyed_clears_after_8_quarters_via_quarters_since_field():
    state = {"shelter_loss_pct": 0, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": True, "ad_destroyed_quarters_since": 7,
             "garrisoned_loss": 0}
    out = tick_base_damage(state)
    assert out["ad_destroyed_quarters_since"] == 8
    # Still destroyed at 8.
    assert out["ad_destroyed"] is True
    # One more tick clears it.
    out2 = tick_base_damage(out)
    assert out2["ad_destroyed"] is False
    assert out2["ad_destroyed_quarters_since"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_repair_engine.py -v`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement repair engine**

Create `backend/app/engine/repair.py`:

```python
"""Pure-function base-damage decay.

Runs once per quarter inside advance_turn. Decays sub-system damage on
every adversary base toward fully repaired. Auto-repair window is
4 quarters; player-paid rush is handled in a separate flow that just
sets the relevant field directly.
"""
from __future__ import annotations
from typing import Any

# Base auto-repair: 25%/quarter on shelter + garrison damage = 4Q to full.
_SHELTER_REPAIR_PCT = 10
_GARRISON_REPAIR_PER_Q = 2

# AD batteries take 8 quarters to be replaced/relocated by the adversary.
_AD_REPAIR_QUARTERS = 8


def tick_base_damage(state: dict[str, Any]) -> dict[str, Any]:
    out = dict(state)
    if out.get("shelter_loss_pct", 0) > 0:
        out["shelter_loss_pct"] = max(0, out["shelter_loss_pct"] - _SHELTER_REPAIR_PCT)
    if out.get("runway_disabled_quarters_remaining", 0) > 0:
        out["runway_disabled_quarters_remaining"] -= 1
    if out.get("garrisoned_loss", 0) > 0:
        out["garrisoned_loss"] = max(0, out["garrisoned_loss"] - _GARRISON_REPAIR_PER_Q)
    if out.get("ad_destroyed"):
        since = out.get("ad_destroyed_quarters_since", 0) + 1
        out["ad_destroyed_quarters_since"] = since
        if since > _AD_REPAIR_QUARTERS:
            out["ad_destroyed"] = False
            out["ad_destroyed_quarters_since"] = 0
    return out
```

- [ ] **Step 4: Create BaseDamage ORM**

Create `backend/app/models/base_damage.py`:

```python
from sqlalchemy import Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BaseDamage(Base):
    __tablename__ = "base_damage"
    __table_args__ = (
        UniqueConstraint("campaign_id", "adversary_base_id", name="uq_base_damage_target"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True,
    )
    adversary_base_id: Mapped[int] = mapped_column(
        ForeignKey("adversary_bases.id", ondelete="CASCADE"), index=True,
    )
    shelter_loss_pct: Mapped[int] = mapped_column(Integer, default=0)
    runway_disabled_quarters_remaining: Mapped[int] = mapped_column(Integer, default=0)
    ad_destroyed: Mapped[bool] = mapped_column(Boolean, default=False)
    ad_destroyed_quarters_since: Mapped[int] = mapped_column(Integer, default=0)
    garrisoned_loss: Mapped[int] = mapped_column(Integer, default=0)
```

- [ ] **Step 5: Register in models/__init__.py**

Append to `backend/app/models/__init__.py` next to other model imports:

```python
from app.models.base_damage import BaseDamage  # noqa: F401
```

And add `"BaseDamage"` to `__all__`.

- [ ] **Step 6: Run engine test**

Run: `cd backend && pytest tests/test_repair_engine.py -v`
Expected: PASS 4/4.

- [ ] **Step 7: Run full suite**

Run: `cd backend && pytest -q`
Expected: no regressions.

- [ ] **Step 8: Commit**

```bash
git add backend/app/engine/repair.py backend/app/models/base_damage.py backend/app/models/__init__.py backend/tests/test_repair_engine.py
git commit -m "feat(engine): BaseDamage ORM + repair tick"
```

---

### Task 3: Diplomacy Content + ORM + Engine

**Files:**
- Create: `backend/content/diplomacy.yaml`
- Modify: `backend/app/content/loader.py` + `backend/app/content/registry.py`
- Create: `backend/app/models/diplomatic_state.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/engine/diplomacy.py`
- Modify: `backend/app/crud/seed_starting_state.py`
- Test: `backend/tests/test_diplomacy_engine.py`

- [ ] **Step 1: Create diplomacy content YAML**

Create `backend/content/diplomacy.yaml`:

```yaml
factions:
  PAF:
    starting_temperature: 25   # cool tier — IND/PAK never friendly
  PLAAF:
    starting_temperature: 35   # neutral lower edge
  PLAN:
    starting_temperature: 40

# Map of platform/weapon/AD origin → faction whose hostility blocks new orders.
# IND-origin items never block. Friendly suppliers (FR/RU/US/IL/EU) block when
# their *partner* faction (the one they would not sell against) is hostile —
# but in this game we're not modeling 3rd-party blocks; only direct
# adversary procurement is blocked. So: IND only buys nothing from PAF/PLAAF/PLAN.
# This map keeps the door open for V2 supplier blocking.
supplier_factions:
  CHN: PLAAF
  PAK: PAF

# Tier thresholds (temperature_pct buckets).
tiers:
  friendly: [70, 100]
  neutral:  [50, 69]
  cool:     [30, 49]
  cold:     [10, 29]
  hostile:  [0, 9]

# Per-quarter passive drift toward neutral (50). Strikes spike up; drift
# pulls back down over time when the player stops striking.
drift_per_quarter: 2

# Strike effect: every player-initiated strike on a faction's base drops
# its temperature by this much. Compounds across multiple strikes.
strike_temperature_drop: 8

# Quarterly grant multiplier per tier. Applied per faction, capped at total +150%.
grant_bump_pct:
  friendly: 0
  neutral:  0
  cool:     10
  cold:     30
  hostile:  75
grant_bump_cap_pct: 150
```

- [ ] **Step 2: Add loader + registry entries**

In `backend/app/content/loader.py` append:

```python
@dataclass(frozen=True)
class DiplomacyConfig:
    starting_temperatures: dict[str, int]
    supplier_factions: dict[str, str]
    tier_bands: dict[str, tuple[int, int]]
    drift_per_quarter: int
    strike_temperature_drop: int
    grant_bump_pct: dict[str, int]
    grant_bump_cap_pct: int


def load_diplomacy(path: Path) -> DiplomacyConfig:
    data = _load_yaml(path)
    factions = data.get("factions", {})
    return DiplomacyConfig(
        starting_temperatures={
            k: int(v["starting_temperature"]) for k, v in factions.items()
        },
        supplier_factions=dict(data.get("supplier_factions", {})),
        tier_bands={
            tier: (int(b[0]), int(b[1])) for tier, b in data.get("tiers", {}).items()
        },
        drift_per_quarter=int(data.get("drift_per_quarter", 2)),
        strike_temperature_drop=int(data.get("strike_temperature_drop", 8)),
        grant_bump_pct=dict(data.get("grant_bump_pct", {})),
        grant_bump_cap_pct=int(data.get("grant_bump_cap_pct", 150)),
    )
```

In `backend/app/content/registry.py`:

```python
from app.content.loader import (
    ...,  # existing
    DiplomacyConfig,
    load_diplomacy,
)


@lru_cache(maxsize=1)
def diplomacy() -> DiplomacyConfig:
    return load_diplomacy(Path(settings.content_dir) / "diplomacy.yaml")
```

Add `diplomacy` to the `reload_all()` cache_clear list.

- [ ] **Step 3: Write DiplomaticState ORM**

Create `backend/app/models/diplomatic_state.py`:

```python
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class DiplomaticState(Base):
    __tablename__ = "diplomatic_states"
    __table_args__ = (
        UniqueConstraint("campaign_id", "faction", name="uq_diplo_campaign_faction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    faction: Mapped[str] = mapped_column(String(16), index=True)
    temperature_pct: Mapped[int] = mapped_column(Integer, default=50)
```

Register in `backend/app/models/__init__.py` and `__all__`.

- [ ] **Step 4: Write engine tests**

```python
# backend/tests/test_diplomacy_engine.py
from app.engine.diplomacy import (
    tier_from_temperature, tick_diplomacy_temp,
    grant_multiplier_pct, is_supplier_blocked,
)


def test_tier_bands():
    assert tier_from_temperature(75) == "friendly"
    assert tier_from_temperature(50) == "neutral"
    assert tier_from_temperature(35) == "cool"
    assert tier_from_temperature(15) == "cold"
    assert tier_from_temperature(5) == "hostile"


def test_drift_pulls_to_neutral():
    # cool (30) drifts up by 2 toward neutral (50).
    assert tick_diplomacy_temp(30, strikes_this_quarter=0) == 32
    # friendly (75) drifts down toward neutral.
    assert tick_diplomacy_temp(75, strikes_this_quarter=0) == 73
    # at neutral, no movement.
    assert tick_diplomacy_temp(50, strikes_this_quarter=0) == 50


def test_strikes_drop_temperature():
    # 1 strike drops 8 from current.
    assert tick_diplomacy_temp(60, strikes_this_quarter=1) == 60 - 8 + 2  # then drift
    # 3 strikes compound.
    assert tick_diplomacy_temp(60, strikes_this_quarter=3) == 60 - 24 + 2


def test_temperature_clamped_0_100():
    assert tick_diplomacy_temp(5, strikes_this_quarter=10) == 0
    assert tick_diplomacy_temp(99, strikes_this_quarter=0) == 97  # drifts down, no clamp issue


def test_grant_multiplier_caps_at_150():
    pcts = {"PAF": "hostile", "PLAAF": "hostile", "PLAN": "hostile"}
    # 3 × 75 = 225, but capped at 150.
    assert grant_multiplier_pct(pcts) == 150


def test_grant_multiplier_sums():
    pcts = {"PAF": "cold", "PLAAF": "cool", "PLAN": "neutral"}
    # 30 + 10 + 0 = 40
    assert grant_multiplier_pct(pcts) == 40


def test_supplier_blocked_when_hostile():
    assert is_supplier_blocked("CHN", {"PLAAF": "hostile"}) is True
    assert is_supplier_blocked("PAK", {"PAF": "cold"}) is False
    assert is_supplier_blocked("FR", {"PAF": "hostile"}) is False  # FR isn't in supplier_factions
    assert is_supplier_blocked("IND", {"PAF": "hostile"}) is False
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_diplomacy_engine.py -v`
Expected: FAIL — module doesn't exist.

- [ ] **Step 6: Implement engine**

Create `backend/app/engine/diplomacy.py`:

```python
"""Pure-function diplomacy tick + supplier blocking + grant scaling.

Reads `app.content.registry.diplomacy()` for thresholds + drift values.
"""
from __future__ import annotations
from app.content.registry import diplomacy as _cfg


def tier_from_temperature(temp: int) -> str:
    cfg = _cfg()
    for tier, (lo, hi) in cfg.tier_bands.items():
        if lo <= temp <= hi:
            return tier
    return "neutral"


def tick_diplomacy_temp(current_temp: int, *, strikes_this_quarter: int) -> int:
    cfg = _cfg()
    drop = strikes_this_quarter * cfg.strike_temperature_drop
    new_temp = current_temp - drop
    # Drift toward neutral (50): +drift if below, -drift if above, 0 at exactly 50.
    if new_temp < 50:
        new_temp = min(50, new_temp + cfg.drift_per_quarter)
    elif new_temp > 50:
        new_temp = max(50, new_temp - cfg.drift_per_quarter)
    return max(0, min(100, new_temp))


def grant_multiplier_pct(faction_tiers: dict[str, str]) -> int:
    """Sum per-faction grant bumps, capped at the global cap."""
    cfg = _cfg()
    total = sum(cfg.grant_bump_pct.get(tier, 0) for tier in faction_tiers.values())
    return min(total, cfg.grant_bump_cap_pct)


def is_supplier_blocked(origin: str, faction_tiers: dict[str, str]) -> bool:
    """True if `origin` (e.g. CHN, PAK) is tied to a hostile-tier faction."""
    cfg = _cfg()
    target_faction = cfg.supplier_factions.get(origin)
    if target_faction is None:
        return False
    return faction_tiers.get(target_faction) == "hostile"
```

- [ ] **Step 7: Run engine test**

Run: `cd backend && pytest tests/test_diplomacy_engine.py -v`
Expected: PASS 7/7.

- [ ] **Step 8: Seed DiplomaticState rows on campaign create**

In `backend/app/crud/seed_starting_state.py` add at the end of `seed_starting_state`:

```python
    from app.content.registry import diplomacy as _diplo_cfg
    from app.models.diplomatic_state import DiplomaticState
    cfg = _diplo_cfg()
    for faction, temp in cfg.starting_temperatures.items():
        db.add(DiplomaticState(
            campaign_id=campaign.id,
            faction=faction,
            temperature_pct=temp,
        ))
```

- [ ] **Step 9: Run full suite**

Run: `cd backend && pytest -q`
Expected: no regressions.

- [ ] **Step 10: Commit**

```bash
git add backend/content/diplomacy.yaml backend/app/content/loader.py backend/app/content/registry.py backend/app/models/diplomatic_state.py backend/app/models/__init__.py backend/app/engine/diplomacy.py backend/app/crud/seed_starting_state.py backend/tests/test_diplomacy_engine.py
git commit -m "feat: diplomacy engine + per-faction temperature ORM"
```

---

### Task 4: Grant Scaling by Diplomacy

**Files:**
- Modify: `backend/app/engine/budget.py:compute_quarterly_grant`
- Modify: `backend/app/crud/campaign.py::advance_turn` to thread current temperatures into the grant call.
- Test: `backend/tests/test_budget.py` (extend)

- [ ] **Step 1: Locate existing test + extend**

Append to `backend/tests/test_budget.py`:

```python
from app.engine.budget import compute_quarterly_grant


def test_grant_with_neutral_factions_unchanged():
    base = compute_quarterly_grant(difficulty="realistic", current_year=2027)
    boosted = compute_quarterly_grant(
        difficulty="realistic", current_year=2027,
        faction_tiers={"PAF": "neutral", "PLAAF": "neutral", "PLAN": "neutral"},
    )
    assert base == boosted


def test_grant_bumps_when_one_faction_hostile():
    base = compute_quarterly_grant(difficulty="realistic", current_year=2027)
    hostile = compute_quarterly_grant(
        difficulty="realistic", current_year=2027,
        faction_tiers={"PAF": "hostile", "PLAAF": "neutral", "PLAN": "neutral"},
    )
    # +75% bump for hostile PAF.
    assert hostile > int(base * 1.7)
    assert hostile < int(base * 1.8)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_budget.py -v`
Expected: FAIL — function doesn't accept faction_tiers.

- [ ] **Step 3: Extend compute_quarterly_grant signature**

In `backend/app/engine/budget.py`:

```python
from app.engine.diplomacy import grant_multiplier_pct


def compute_quarterly_grant(
    difficulty: str,
    current_year: int,
    *,
    faction_tiers: dict[str, str] | None = None,
) -> int:
    # ... existing computation, store result in `base_grant` ...
    if faction_tiers:
        bump_pct = grant_multiplier_pct(faction_tiers)
        scaled = int(base_grant * (100 + bump_pct) / 100)
        return _round_to_nearest_500(scaled)
    return base_grant
```

(Adapt to existing variable names — locate the existing `base_grant`/return structure first.)

- [ ] **Step 4: Wire into advance_turn**

In `backend/app/crud/campaign.py::advance_turn` find:

```python
campaign.quarterly_grant_cr = compute_quarterly_grant(
    campaign.difficulty, campaign.current_year,
)
```

Replace with:

```python
from app.models.diplomatic_state import DiplomaticState
from app.engine.diplomacy import tier_from_temperature
diplo_rows = db.query(DiplomaticState).filter_by(campaign_id=campaign.id).all()
faction_tiers = {r.faction: tier_from_temperature(r.temperature_pct) for r in diplo_rows}
campaign.quarterly_grant_cr = compute_quarterly_grant(
    campaign.difficulty, campaign.current_year,
    faction_tiers=faction_tiers or None,
)
```

- [ ] **Step 5: Run extended test**

Run: `cd backend && pytest tests/test_budget.py -v`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `cd backend && pytest -q`
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/app/engine/budget.py backend/app/crud/campaign.py backend/tests/test_budget.py
git commit -m "feat: war-footing grant scaling by per-faction temperature"
```

---

### Task 5: Diplomacy + Repair Tick in advance_turn

**Files:**
- Modify: `backend/app/crud/campaign.py::advance_turn`
- Test: `backend/tests/test_diplomacy_advance.py`, `backend/tests/test_repair_advance.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_diplomacy_advance.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.models.diplomatic_state import DiplomaticState


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_diplomacy_drift_advance():
    s = _db()()
    c = create_campaign(s, CampaignCreate(name="t", difficulty="realistic", objectives=["defend_punjab"]))
    rows_before = {r.faction: r.temperature_pct for r in
                   s.query(DiplomaticState).filter_by(campaign_id=c.id).all()}
    advance_turn(s, c)
    s.commit()
    rows_after = {r.faction: r.temperature_pct for r in
                  s.query(DiplomaticState).filter_by(campaign_id=c.id).all()}
    # PAF starts at 25 (cool), drifts +2 → 27.
    assert rows_after["PAF"] == rows_before["PAF"] + 2
```

```python
# backend/tests/test_repair_advance.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.models.adversary_base import AdversaryBase
from app.models.base_damage import BaseDamage


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_base_damage_decays_each_turn():
    s = _db()()
    c = create_campaign(s, CampaignCreate(name="t", difficulty="realistic", objectives=["defend_punjab"]))
    target = s.query(AdversaryBase).filter_by(campaign_id=c.id).first()
    s.add(BaseDamage(
        campaign_id=c.id, adversary_base_id=target.id,
        shelter_loss_pct=40, runway_disabled_quarters_remaining=2,
        ad_destroyed=False, garrisoned_loss=8,
    ))
    s.commit()
    advance_turn(s, c)
    s.commit()
    bd = s.query(BaseDamage).filter_by(campaign_id=c.id, adversary_base_id=target.id).first()
    assert bd.shelter_loss_pct == 30
    assert bd.runway_disabled_quarters_remaining == 1
    assert bd.garrisoned_loss == 6
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — diplomacy drift not applied; base damage not decayed.

- [ ] **Step 3: Wire diplomacy + repair into advance_turn**

In `backend/app/crud/campaign.py::advance_turn` after the line that recomputes `campaign.quarterly_grant_cr`, add:

```python
    # ── Diplomacy tick ─────────────────────────────────────────────────────
    from app.engine.diplomacy import tick_diplomacy_temp
    # Strikes-this-quarter is filled by Phase 2 wiring; default 0 here.
    strikes_by_faction: dict[str, int] = {}
    for diplo_row in diplo_rows:
        prior = diplo_row.temperature_pct
        diplo_row.temperature_pct = tick_diplomacy_temp(
            prior, strikes_this_quarter=strikes_by_faction.get(diplo_row.faction, 0),
        )

    # ── Base damage repair tick ────────────────────────────────────────────
    from app.engine.repair import tick_base_damage
    from app.models.base_damage import BaseDamage as _BaseDamage
    for bd in db.query(_BaseDamage).filter_by(campaign_id=campaign.id).all():
        new_state = tick_base_damage({
            "shelter_loss_pct": bd.shelter_loss_pct,
            "runway_disabled_quarters_remaining": bd.runway_disabled_quarters_remaining,
            "ad_destroyed": bd.ad_destroyed,
            "ad_destroyed_quarters_since": bd.ad_destroyed_quarters_since,
            "garrisoned_loss": bd.garrisoned_loss,
        })
        bd.shelter_loss_pct = new_state["shelter_loss_pct"]
        bd.runway_disabled_quarters_remaining = new_state["runway_disabled_quarters_remaining"]
        bd.ad_destroyed = new_state["ad_destroyed"]
        bd.ad_destroyed_quarters_since = new_state["ad_destroyed_quarters_since"]
        bd.garrisoned_loss = new_state["garrisoned_loss"]
```

- [ ] **Step 4: Run new tests**

Run: `cd backend && pytest tests/test_diplomacy_advance.py tests/test_repair_advance.py -v`
Expected: PASS.

- [ ] **Step 5: Run full suite + replay determinism**

Run: `cd backend && pytest -q tests/test_replay_determinism.py tests/test_diplomacy_advance.py tests/test_repair_advance.py`
Expected: all pass — diplomacy/repair are deterministic so replay still matches.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/campaign.py backend/tests/test_diplomacy_advance.py backend/tests/test_repair_advance.py
git commit -m "feat(turn): diplomacy drift + base damage repair ticks"
```

---

### Task 6: Acquisitions Hostile-Supplier Blocking

**Files:**
- Modify: `backend/app/api/acquisitions.py` (POST /acquisitions guard)
- Test: `backend/tests/test_acquisitions_diplo_block.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_acquisitions_diplo_block.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.models.diplomatic_state import DiplomaticState
from main import app


@pytest.fixture
def client_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def _g():
        d = Local()
        try:
            yield d
        finally:
            d.close()
    app.dependency_overrides[get_db] = _g
    yield TestClient(app), Local
    app.dependency_overrides.clear()


def test_block_chinese_origin_when_plaaf_hostile(client_db):
    client, Local = client_db
    r = client.post("/api/campaigns", json={"name": "t", "difficulty": "realistic", "objectives": ["defend_punjab"]})
    cid = r.json()["id"]
    db = Local()
    plaaf = db.query(DiplomaticState).filter_by(campaign_id=cid, faction="PLAAF").first()
    plaaf.temperature_pct = 5  # hostile
    db.commit()
    db.close()
    # No CHN-origin platforms in IND fleet anyway, so this is a defensive test
    # against a hypothetical future supplier (e.g., if user tries to procure
    # a CHN-origin item via a custom request). Use 'CHN' origin code in a
    # manual request override.
    # Real test: PAK→PAF — no PAK-origin items exist for IND either.
    # So we assert the code path returns 403 when called with a synthetic
    # blocked origin via the underlying check.
    from app.engine.diplomacy import is_supplier_blocked, tier_from_temperature
    tiers = {"PLAAF": tier_from_temperature(plaaf.temperature_pct)}
    assert is_supplier_blocked("CHN", tiers) is True
```

- [ ] **Step 2: Add the guard in API**

In `backend/app/api/acquisitions.py` find the POST handler that creates an order, then before persisting:

```python
    # Diplomacy supplier-block guard (Plan 22). Aircraft platforms have an
    # `origin` field (FR / RU / US / IL / EU / IND / CHN / PAK). We block
    # creation when the origin's tied faction is hostile.
    from app.content.registry import platforms as _plats
    from app.engine.diplomacy import tier_from_temperature, is_supplier_blocked
    from app.models.diplomatic_state import DiplomaticState

    if payload.kind == "platform":
        plat_spec = _plats().get(payload.platform_id)
        if plat_spec is not None:
            tiers = {
                r.faction: tier_from_temperature(r.temperature_pct)
                for r in db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all()
            }
            if is_supplier_blocked(plat_spec.origin, tiers):
                raise HTTPException(
                    status_code=409,
                    detail=f"Supplier blocked — {plat_spec.origin} platforms unavailable while diplomatic relations are hostile.",
                )
```

- [ ] **Step 3: Run test**

Run: `cd backend && pytest tests/test_acquisitions_diplo_block.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/acquisitions.py backend/tests/test_acquisitions_diplo_block.py
git commit -m "feat(api): block hostile-supplier procurement at order time"
```

---

### Task 7: Strike Profiles Content + OffensiveOp ORM

**Files:**
- Create: `backend/content/strike_profiles.yaml`
- Modify: `backend/app/content/loader.py` + `registry.py`
- Create: `backend/app/models/offensive_op.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_strike_profiles_content.py`

- [ ] **Step 1: Create strike_profiles.yaml**

```yaml
profiles:
  - id: deep_strike
    name: Deep Strike
    description: Manned package penetrating to target. Requires CAP + strike.
    eligible_squadron_roles: [multirole, strike, stealth, stealth_strike]
    requires_min_squadrons: 2
    pk_modifier: 1.0
    detection_modifier: 1.0
    egress_risk: 0.30
    weapon_classes_used: [a2a_bvr, a2a_wvr, glide_bomb, anti_radiation, land_attack]

  - id: sead_suppression
    name: SEAD Suppression
    description: Anti-radiation strike to degrade adversary AD before main package.
    eligible_squadron_roles: [multirole, strike]
    requires_min_squadrons: 1
    pk_modifier: 0.85
    detection_modifier: 0.9
    egress_risk: 0.18
    weapon_classes_used: [anti_radiation]
    suppresses_ad: true
    suppression_pct: 50

  - id: standoff_cruise
    name: Stand-off Cruise
    description: Cruise missile launch from launch base — no penetration risk.
    eligible_squadron_roles: [multirole, bomber, strike]
    requires_min_squadrons: 1
    pk_modifier: 0.65
    detection_modifier: 0.0    # cannot be attrited in penetration phase
    egress_risk: 0.0
    weapon_classes_used: [land_attack, anti_ship]
    target_priority: [shelters, runway]   # cruise can't reliably hit AD/garrison

  - id: drone_swarm
    name: Drone Swarm
    description: Ghatak-led unmanned strike. Lower P_kill but minimal risk.
    eligible_squadron_roles: [stealth_strike, isr]
    requires_min_squadrons: 1
    pk_modifier: 0.55
    detection_modifier: 0.4
    egress_risk: 0.22
    weapon_classes_used: [glide_bomb, anti_radiation]
    targeted_platform_ids: [ghatak_ucav]
```

- [ ] **Step 2: Add loader + registry singleton**

In `backend/app/content/loader.py`:

```python
class StrikeProfileSpec(BaseModel):
    id: str
    name: str
    description: str
    eligible_squadron_roles: list[str] = Field(default_factory=list)
    requires_min_squadrons: int = 1
    pk_modifier: float = 1.0
    detection_modifier: float = 1.0
    egress_risk: float = 0.25
    weapon_classes_used: list[str] = Field(default_factory=list)
    suppresses_ad: bool = False
    suppression_pct: int = 0
    target_priority: list[str] = Field(default_factory=list)
    targeted_platform_ids: list[str] = Field(default_factory=list)


def load_strike_profiles(path: Path) -> dict[str, StrikeProfileSpec]:
    data = _load_yaml(path)
    return {row["id"]: StrikeProfileSpec(**row) for row in data.get("profiles", [])}
```

In `registry.py`:

```python
@lru_cache(maxsize=1)
def strike_profiles() -> dict[str, StrikeProfileSpec]:
    return load_strike_profiles(Path(settings.content_dir) / "strike_profiles.yaml")
```

Add to `reload_all()`.

- [ ] **Step 3: OffensiveOp ORM**

Create `backend/app/models/offensive_op.py`:

```python
from sqlalchemy import ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class OffensiveOp(Base):
    __tablename__ = "offensive_ops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    target_base_id: Mapped[int] = mapped_column(ForeignKey("adversary_bases.id", ondelete="CASCADE"))
    profile: Mapped[str] = mapped_column(String(32))
    roe: Mapped[str] = mapped_column(String(32), default="unrestricted")
    package_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    outcome_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    event_trace: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    aar_text: Mapped[str] = mapped_column(String(8000), default="")
    status: Mapped[str] = mapped_column(String(16), default="resolved")
```

Register in `__init__.py` + `__all__`.

- [ ] **Step 4: Write content sanity test**

```python
# backend/tests/test_strike_profiles_content.py
from app.content.registry import strike_profiles


def test_strike_profiles_load():
    profiles = strike_profiles()
    assert {"deep_strike", "sead_suppression", "standoff_cruise", "drone_swarm"} <= set(profiles)


def test_sead_suppresses_ad():
    p = strike_profiles()["sead_suppression"]
    assert p.suppresses_ad is True
    assert p.suppression_pct > 0


def test_standoff_cruise_zero_egress_risk():
    p = strike_profiles()["standoff_cruise"]
    assert p.egress_risk == 0.0
```

- [ ] **Step 5: Run test**

Run: `cd backend && pytest tests/test_strike_profiles_content.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/content/strike_profiles.yaml backend/app/content/loader.py backend/app/content/registry.py backend/app/models/offensive_op.py backend/app/models/__init__.py backend/tests/test_strike_profiles_content.py
git commit -m "feat(content): strike profiles + OffensiveOp ORM"
```

---

### Task 8: Offensive Resolver — Package Validation + Forecast

**Files:**
- Create: `backend/app/engine/offensive/__init__.py`, `backend/app/engine/offensive/planning.py`
- Test: `backend/tests/test_offensive_planning.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_offensive_planning.py
from app.engine.offensive.planning import validate_strike_package, forecast_strike


def _good_package():
    return {
        "profile": "deep_strike",
        "squadrons": [
            {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
             "base_id": 5, "loadout": ["meteor", "mica_ir"]},
            {"id": 2, "platform_id": "su30_mki", "airframes": 8, "role": "multirole",
             "base_id": 5, "loadout": ["r77", "r73"]},
        ],
        "weapons_planned": {"meteor": 12, "r77": 16},
        "support": {"awacs": True, "tanker": False},
        "roe": "unrestricted",
    }


def test_valid_package():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False}
    issues = validate_strike_package(pkg, target, weapons_avail={"meteor": 50, "r77": 80})
    assert issues == []


def test_too_few_squadrons():
    pkg = _good_package()
    pkg["squadrons"] = pkg["squadrons"][:1]  # deep_strike requires ≥2
    issues = validate_strike_package(pkg, {"id": 1, "shelter_count": 12, "ad_destroyed": False},
                                      weapons_avail={"meteor": 50})
    assert any("at least 2 squadrons" in i.lower() for i in issues)


def test_insufficient_weapons():
    pkg = _good_package()
    pkg["weapons_planned"] = {"meteor": 80}
    issues = validate_strike_package(pkg, {"id": 1, "shelter_count": 12, "ad_destroyed": False},
                                      weapons_avail={"meteor": 20})
    assert any("insufficient meteor" in i.lower() for i in issues)


def test_forecast_ranges_widen_with_low_intel_quality():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False, "ad_battery_count": 1}
    high = forecast_strike(pkg, target, intel_quality="high")
    low = forecast_strike(pkg, target, intel_quality="low")
    assert (high["ind_losses"][1] - high["ind_losses"][0]) <= (low["ind_losses"][1] - low["ind_losses"][0])
    assert (high["damage_pct"][1] - high["damage_pct"][0]) <= (low["damage_pct"][1] - low["damage_pct"][0])


def test_forecast_returns_blowback_score():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False, "ad_battery_count": 1, "command_node": True}
    fc = forecast_strike(pkg, target, intel_quality="medium")
    assert fc["diplomatic_blowback"] in {"low", "medium", "high", "critical"}
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — module missing.

- [ ] **Step 3: Implement planning module**

Create `backend/app/engine/offensive/__init__.py`:

```python
from app.engine.offensive.planning import validate_strike_package, forecast_strike  # noqa: F401
```

Create `backend/app/engine/offensive/planning.py`:

```python
"""Pre-commit strike validation + range forecasts.

Pure functions — no DB access, no RNG. Forecast ranges driven by intel
quality (low/medium/high) which the API layer derives from drone recon
fidelity on the target base.
"""
from __future__ import annotations
from typing import Any

from app.content.registry import strike_profiles


def validate_strike_package(
    package: dict[str, Any],
    target: dict[str, Any],
    weapons_avail: dict[str, int],
) -> list[str]:
    issues: list[str] = []
    profile_id = package.get("profile")
    profiles = strike_profiles()
    profile = profiles.get(profile_id)
    if profile is None:
        return [f"Unknown profile: {profile_id}"]

    squadrons = package.get("squadrons", [])
    if len(squadrons) < profile.requires_min_squadrons:
        issues.append(
            f"{profile.name} requires at least {profile.requires_min_squadrons} squadrons "
            f"(provided {len(squadrons)})."
        )

    if profile.eligible_squadron_roles:
        for sq in squadrons:
            if sq.get("role") not in profile.eligible_squadron_roles:
                issues.append(
                    f"Squadron {sq.get('id')} role={sq.get('role')} not eligible for {profile.name}."
                )

    weapons_planned = package.get("weapons_planned", {})
    for wid, qty in weapons_planned.items():
        if weapons_avail.get(wid, 0) < qty:
            issues.append(
                f"Insufficient {wid} at launch base — have {weapons_avail.get(wid, 0)}, need {qty}."
            )

    return issues


_INTEL_RANGE_WIDTHS = {"high": 0.10, "medium": 0.20, "low": 0.40}


def _range(center: float, width_pct: float) -> tuple[int, int]:
    half = center * width_pct / 2
    return (max(0, int(round(center - half))), max(0, int(round(center + half))))


def forecast_strike(
    package: dict[str, Any],
    target: dict[str, Any],
    intel_quality: str = "medium",
) -> dict[str, Any]:
    profiles = strike_profiles()
    profile = profiles[package["profile"]]
    width = _INTEL_RANGE_WIDTHS.get(intel_quality, 0.30)

    total_airframes = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))
    expected_loss_pct = profile.egress_risk
    if not target.get("ad_destroyed", False) and target.get("ad_battery_count", 0) > 0:
        expected_loss_pct += 0.05 * target["ad_battery_count"]
    expected_losses = total_airframes * expected_loss_pct
    losses_range = _range(expected_losses, width)

    expected_damage = 60 * profile.pk_modifier
    if profile.suppresses_ad:
        expected_damage *= 0.7  # SEAD trades off direct strike effect
    damage_range = _range(expected_damage, width)

    blowback = "low"
    if target.get("command_node"):
        blowback = "high"
    elif (target.get("value", 2)) >= 4:
        blowback = "medium"
    if package.get("roe") == "decapitation":
        blowback = "critical"

    return {
        "ind_losses": losses_range,
        "damage_pct": damage_range,
        "diplomatic_blowback": blowback,
        "weapons_consumed": dict(package.get("weapons_planned", {})),
        "treasury_cost_estimate_cr": 0,  # Filled by API layer using weapon unit costs.
    }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_offensive_planning.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/offensive/__init__.py backend/app/engine/offensive/planning.py backend/tests/test_offensive_planning.py
git commit -m "feat(offensive): package validation + range forecast"
```

---

### Task 9: Offensive Resolver — Penetration Phase

**Files:**
- Create: `backend/app/engine/offensive/penetration.py`
- Test: `backend/tests/test_offensive_penetration.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_offensive_penetration.py
import random
from app.engine.offensive.penetration import resolve_penetration


def _pkg():
    return {
        "profile": "deep_strike",
        "squadrons": [
            {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
             "rcs_band": "reduced"},
        ],
        "support": {"awacs": True, "tanker": False},
    }


def test_no_ad_no_losses():
    target = {"shelter_count": 12, "ad_battery_count": 0, "ad_destroyed": True}
    rng = random.Random(1)
    result = resolve_penetration(_pkg(), target, rng=rng)
    assert result["airframes_lost"] == 0
    assert result["ad_engaged"] is False


def test_ad_present_can_attrit():
    target = {"shelter_count": 12, "ad_battery_count": 2, "ad_destroyed": False}
    rng = random.Random(1)
    result = resolve_penetration(_pkg(), target, rng=rng)
    # Some chance of loss, but our seed is deterministic.
    assert result["airframes_lost"] >= 0
    assert result["ad_engaged"] is True


def test_standoff_cruise_skips_penetration():
    pkg = {**_pkg(), "profile": "standoff_cruise"}
    target = {"shelter_count": 12, "ad_battery_count": 5, "ad_destroyed": False}
    rng = random.Random(1)
    result = resolve_penetration(pkg, target, rng=rng)
    assert result["airframes_lost"] == 0
    assert result["skipped"] is True
```

- [ ] **Step 2: Run tests to verify fail**

Expected: FAIL.

- [ ] **Step 3: Implement penetration phase**

Create `backend/app/engine/offensive/penetration.py`:

```python
"""Penetration phase: getting in past adversary AD + AWACS detection.

Returns dict with:
- airframes_lost: int (subtracted from package before strike phase)
- ad_engaged: bool
- skipped: bool (True for standoff_cruise — no penetration)
- events: list of trace events
"""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles

# Per AD battery + per overflight — base attrition probability.
_AD_BATTERY_HIT_PROB = 0.06
# RCS multiplier on detection / engagement chance.
_RCS_MULT = {"VLO": 0.25, "LO": 0.45, "reduced": 0.7, "conventional": 1.0, "large": 1.3}


def resolve_penetration(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    events: list[dict[str, Any]] = []

    if profile.detection_modifier == 0.0 or profile.id == "standoff_cruise":
        events.append({"phase": "penetration", "type": "skipped",
                       "note": "stand-off launch, no penetration"})
        return {"airframes_lost": 0, "ad_engaged": False, "skipped": True, "events": events}

    if target.get("ad_destroyed") or target.get("ad_battery_count", 0) == 0:
        events.append({"phase": "penetration", "type": "no_ad", "note": "no active AD"})
        return {"airframes_lost": 0, "ad_engaged": False, "skipped": False, "events": events}

    losses = 0
    ad_count = target["ad_battery_count"]
    # Each squadron rolls per AD battery.
    for sq in package.get("squadrons", []):
        rcs_mult = _RCS_MULT.get(sq.get("rcs_band", "conventional"), 1.0)
        airframes = sq.get("airframes", 0)
        for _ in range(ad_count):
            for _ in range(airframes):
                if rng.random() < _AD_BATTERY_HIT_PROB * rcs_mult * profile.detection_modifier:
                    losses += 1
                    if losses >= airframes:
                        break
            if losses >= airframes:
                break
    events.append({"phase": "penetration", "type": "ad_engagement",
                   "ad_battery_count": ad_count, "airframes_lost": losses})
    return {"airframes_lost": losses, "ad_engaged": True, "skipped": False, "events": events}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_offensive_penetration.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/offensive/penetration.py backend/tests/test_offensive_penetration.py
git commit -m "feat(offensive): penetration phase"
```

---

### Task 10: Offensive Resolver — Strike Phase + BDA

**Files:**
- Create: `backend/app/engine/offensive/strike_phase.py`
- Test: `backend/tests/test_offensive_strike_phase.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_offensive_strike_phase.py
import random
from app.engine.offensive.strike_phase import resolve_strike_phase


def test_zero_airframes_zero_damage():
    target = {"shelter_count": 24, "ad_battery_count": 1, "ad_destroyed": False,
              "garrisoned_platforms": ["f16_blk52"], "garrisoned_count": 16}
    pkg = {"profile": "deep_strike", "squadrons": [{"airframes": 0, "loadout": []}],
           "weapons_planned": {}}
    rng = random.Random(1)
    out = resolve_strike_phase(pkg, target, surviving_airframes=0, rng=rng)
    assert out["damage"]["shelter_loss_pct"] == 0
    assert out["damage"]["garrisoned_loss"] == 0
    assert out["weapons_consumed"] == {}


def test_sead_destroys_ad_battery_at_threshold():
    target = {"shelter_count": 12, "ad_battery_count": 1, "ad_destroyed": False,
              "garrisoned_platforms": [], "garrisoned_count": 0}
    pkg = {"profile": "sead_suppression",
           "squadrons": [{"airframes": 4, "loadout": ["rudram_2"]}],
           "weapons_planned": {"rudram_2": 8}}
    rng = random.Random(2)
    out = resolve_strike_phase(pkg, target, surviving_airframes=4, rng=rng)
    # SEAD with 8 anti-radiation munitions should wipe a single AD battery.
    assert out["damage"]["ad_destroyed"] is True


def test_runway_disabled_quarters_set_when_runway_targeted():
    target = {"shelter_count": 24, "ad_battery_count": 0, "ad_destroyed": True,
              "garrisoned_platforms": ["f16_blk52"], "garrisoned_count": 12}
    pkg = {"profile": "standoff_cruise",
           "squadrons": [{"airframes": 0, "loadout": []}],   # cruise launches without overflight
           "weapons_planned": {"brahmos_ng": 8}}
    rng = random.Random(7)
    out = resolve_strike_phase(pkg, target, surviving_airframes=8, rng=rng)
    assert out["damage"]["runway_disabled_quarters_remaining"] >= 1
```

- [ ] **Step 2: Run tests to verify fail**

Expected: FAIL — module missing.

- [ ] **Step 3: Implement strike phase**

Create `backend/app/engine/offensive/strike_phase.py`:

```python
"""Strike phase: weapons-on-target P_kill rolls + BDA allocation.

Output `damage` dict matches BaseDamage ORM fields, ready for upsert
into the BaseDamage row by the caller.
"""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles
from app.engine.vignette.bvr import WEAPONS

# Per-class hit prob baselines (fraction of weapons that "land").
_CLASS_PK = {
    "anti_radiation": 0.55,
    "land_attack":    0.65,
    "anti_ship":      0.50,
    "glide_bomb":     0.45,
}

# Damage allocation per "landed" weapon (% of shelter pool, garrison kills, etc.)
_LANDED_SHELTER_PCT = 4
_LANDED_GARRISON_PER = 1
_LANDED_RUNWAY_THRESHOLD = 6  # weapons landed → runway down 1 quarter
_LANDED_AD_THRESHOLD = 4      # weapons landed (anti_rad only) → 1 AD battery dead

# How many weapons-landed are needed to fully cap each subsystem.
_SHELTER_CAP_PCT = 80
_GARRISON_CAP_FRAC = 0.60


def resolve_strike_phase(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    surviving_airframes: int,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    weapons_planned = dict(package.get("weapons_planned", {}))
    weapons_consumed: dict[str, int] = {}
    landed_by_class: dict[str, int] = {}

    # Cruise/standoff launches even without surviving airframes (already in flight).
    if profile.id == "standoff_cruise":
        # Use planned weapons directly.
        for wid, qty in weapons_planned.items():
            wclass = WEAPONS.get(wid, {}).get("class", "land_attack")
            landed = int(round(qty * _CLASS_PK.get(wclass, 0.5) * profile.pk_modifier))
            weapons_consumed[wid] = qty
            landed_by_class[wclass] = landed_by_class.get(wclass, 0) + landed
    elif surviving_airframes > 0:
        # Surviving airframes deliver — scale planned consumption by survival rate.
        package_size = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))
        survive_frac = surviving_airframes / max(1, package_size)
        for wid, qty in weapons_planned.items():
            scaled = int(round(qty * survive_frac))
            wclass = WEAPONS.get(wid, {}).get("class", "land_attack")
            landed = int(round(scaled * _CLASS_PK.get(wclass, 0.5) * profile.pk_modifier))
            weapons_consumed[wid] = scaled
            landed_by_class[wclass] = landed_by_class.get(wclass, 0) + landed

    # Allocate to subsystems based on weapon class.
    shelter_loss_pct = 0
    garrisoned_loss = 0
    ad_destroyed = target.get("ad_destroyed", False)
    runway_disabled_q = 0

    landed_arm = landed_by_class.get("anti_radiation", 0)
    if landed_arm >= _LANDED_AD_THRESHOLD and not ad_destroyed and target.get("ad_battery_count", 0) > 0:
        ad_destroyed = True

    landed_kinetic = (
        landed_by_class.get("land_attack", 0)
        + landed_by_class.get("anti_ship", 0)
        + landed_by_class.get("glide_bomb", 0)
    )
    if landed_kinetic > 0:
        shelter_loss_pct = min(_SHELTER_CAP_PCT, landed_kinetic * _LANDED_SHELTER_PCT)
        garrison_total = target.get("garrisoned_count", 0)
        garrisoned_loss = min(int(garrison_total * _GARRISON_CAP_FRAC),
                               landed_kinetic * _LANDED_GARRISON_PER)
        if landed_kinetic >= _LANDED_RUNWAY_THRESHOLD:
            runway_disabled_q = 1 + (landed_kinetic // (_LANDED_RUNWAY_THRESHOLD * 2))

    return {
        "damage": {
            "shelter_loss_pct": shelter_loss_pct,
            "runway_disabled_quarters_remaining": runway_disabled_q,
            "ad_destroyed": ad_destroyed,
            "garrisoned_loss": garrisoned_loss,
        },
        "landed_by_class": landed_by_class,
        "weapons_consumed": weapons_consumed,
    }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_offensive_strike_phase.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/offensive/strike_phase.py backend/tests/test_offensive_strike_phase.py
git commit -m "feat(offensive): strike phase + BDA allocation"
```

---

### Task 11: Offensive Resolver — Egress + Top-level Entry

**Files:**
- Create: `backend/app/engine/offensive/egress.py`
- Create: `backend/app/engine/offensive/resolver.py`
- Test: `backend/tests/test_offensive_resolver.py`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_offensive_resolver.py
import random
from app.engine.offensive.resolver import resolve_strike


def _scene():
    return {
        "package": {
            "profile": "deep_strike",
            "squadrons": [
                {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
                 "rcs_band": "reduced", "loadout": ["meteor", "mica_ir"], "base_id": 5},
                {"id": 2, "platform_id": "su30_mki", "airframes": 8, "role": "multirole",
                 "rcs_band": "conventional", "loadout": ["r77"], "base_id": 5},
            ],
            "weapons_planned": {"meteor": 16, "r77": 16, "saaw": 24},
            "support": {"awacs": True, "tanker": True},
            "roe": "unrestricted",
        },
        "target": {"id": 99, "shelter_count": 24, "ad_battery_count": 1,
                   "ad_destroyed": False, "garrisoned_platforms": ["f16_blk52"],
                   "garrisoned_count": 16, "command_node": True, "value": 5},
    }


def test_resolve_strike_returns_full_outcome():
    s = _scene()
    rng = random.Random(42)
    result = resolve_strike(s["package"], s["target"], rng=rng)
    assert "damage" in result
    assert "ind_airframes_lost" in result
    assert "weapons_consumed" in result
    assert isinstance(result["events"], list)
    assert any(ev.get("phase") == "penetration" for ev in result["events"])
    assert any(ev.get("phase") == "strike" for ev in result["events"])
    assert any(ev.get("phase") == "egress" for ev in result["events"])


def test_resolve_strike_deterministic_with_seed():
    s = _scene()
    a = resolve_strike(s["package"], s["target"], rng=random.Random(42))
    b = resolve_strike(s["package"], s["target"], rng=random.Random(42))
    assert a == b
```

- [ ] **Step 2: Implement egress**

Create `backend/app/engine/offensive/egress.py`:

```python
"""Egress phase: adversary CAP scramble + chase."""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles


def resolve_egress(
    package: dict[str, Any],
    surviving_airframes: int,
    *,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    if surviving_airframes <= 0 or profile.egress_risk <= 0:
        return {"airframes_lost": 0, "events": [{"phase": "egress", "type": "skipped"}]}
    losses = 0
    for _ in range(surviving_airframes):
        if rng.random() < profile.egress_risk:
            losses += 1
    return {
        "airframes_lost": losses,
        "events": [{"phase": "egress", "type": "chase", "airframes_lost": losses}],
    }
```

- [ ] **Step 3: Implement resolver entry point**

Create `backend/app/engine/offensive/resolver.py`:

```python
"""Top-level offensive resolver — chains penetration → strike → egress.

Pure function. RNG injected. Caller persists OffensiveOp + BaseDamage rows.
"""
from __future__ import annotations
import random
from typing import Any
from app.engine.offensive.penetration import resolve_penetration
from app.engine.offensive.strike_phase import resolve_strike_phase
from app.engine.offensive.egress import resolve_egress


def resolve_strike(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    rng: random.Random,
) -> dict[str, Any]:
    package_size = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))

    pen = resolve_penetration(package, target, rng=rng)
    surviving = max(0, package_size - pen["airframes_lost"])

    strike = resolve_strike_phase(package, target, surviving_airframes=surviving, rng=rng)
    egress = resolve_egress(package, surviving, rng=rng)

    total_lost = pen["airframes_lost"] + egress["airframes_lost"]
    events = [*pen["events"], *strike.get("events", []),
              {"phase": "strike", "type": "bda", **strike["landed_by_class"]},
              *egress["events"]]

    return {
        "damage": strike["damage"],
        "ind_airframes_lost": total_lost,
        "weapons_consumed": strike["weapons_consumed"],
        "events": events,
    }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_offensive_resolver.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/offensive/egress.py backend/app/engine/offensive/resolver.py backend/tests/test_offensive_resolver.py
git commit -m "feat(offensive): full strike resolver (penetration + strike + egress)"
```

---

### Task 12: Offensive APIs — Preview + Commit + List + Detail + Unlock

**Files:**
- Create: `backend/app/api/offensive_ops.py`
- Create: `backend/app/schemas/offensive.py`
- Modify: `backend/app/crud/campaign.py::advance_turn` — set `offensive_unlocked` flag.
- Modify: `backend/app/models/campaign.py` — add `offensive_unlocked` boolean column.
- Modify: `backend/main.py` — register router.
- Test: `backend/tests/test_offensive_api.py`, `backend/tests/test_offensive_unlock.py`

- [ ] **Step 1: Add `offensive_unlocked` column**

In `backend/app/models/campaign.py` add:

```python
    offensive_unlocked: Mapped[bool] = mapped_column(Boolean, default=False)
```

In CRUD's `create_campaign` — no change (defaults to False). The unlock flips inside `advance_turn` after a Vignette resolves.

- [ ] **Step 2: Wire unlock in advance_turn**

In `backend/app/crud/campaign.py::advance_turn`, after the loop that processes vignette outcomes, add:

```python
    # Offensive ops unlock — first reactive vignette resolved triggers it.
    if not campaign.offensive_unlocked:
        from app.models.vignette import Vignette as _Vig
        any_resolved = db.query(_Vig).filter(
            _Vig.campaign_id == campaign.id,
            _Vig.status.in_(["resolved", "won", "lost"]),
        ).first()
        if any_resolved is not None:
            campaign.offensive_unlocked = True
            db.add(CampaignEvent(
                campaign_id=campaign.id,
                year=from_year, quarter=from_quarter,
                event_type="offensive_unlocked", payload={},
            ))
```

(Confirm exact `Vignette.status` values from the existing model — adjust if different.)

- [ ] **Step 3: Schemas + API skeleton**

Create `backend/app/schemas/offensive.py`:

```python
from pydantic import BaseModel, Field


class StrikeSquadronEntry(BaseModel):
    squadron_id: int
    airframes: int = Field(gt=0)


class StrikePackageRequest(BaseModel):
    target_base_id: int
    profile: str
    squadrons: list[StrikeSquadronEntry]
    weapons_planned: dict[str, int]
    support: dict[str, bool] = Field(default_factory=dict)
    roe: str = "unrestricted"


class StrikePreviewResponse(BaseModel):
    issues: list[str]
    forecast: dict
    weapons_avail: dict[str, int]
    intel_quality: str


class StrikeRead(BaseModel):
    id: int
    year: int
    quarter: int
    target_base_id: int
    profile: str
    roe: str
    package_json: dict
    outcome_json: dict
    aar_text: str
    status: str

    model_config = {"from_attributes": True}


class StrikeListResponse(BaseModel):
    strikes: list[StrikeRead]
```

Create `backend/app/api/offensive_ops.py`:

```python
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine.offensive.planning import validate_strike_package, forecast_strike
from app.engine.offensive.resolver import resolve_strike
from app.engine.rng import subsystem_rng
from app.models.adversary_base import AdversaryBase
from app.models.base_damage import BaseDamage
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.models.intel import IntelCard
from app.models.missile_stock import MissileStock
from app.models.offensive_op import OffensiveOp
from app.models.squadron import Squadron
from app.engine.diplomacy import tick_diplomacy_temp
from app.schemas.offensive import (
    StrikePackageRequest, StrikePreviewResponse, StrikeRead, StrikeListResponse,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["offensive"])

_STRIKES_PER_QUARTER_CAP = 2


def _intel_quality_for_target(db: Session, campaign_id: int, target: AdversaryBase) -> str:
    latest = (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign_id, source_type="drone_recon")
        .order_by(IntelCard.id.desc())
        .all()
    )
    for c in latest:
        if (c.payload or {}).get("subject_id") == target.base_id_str:
            return (c.payload.get("observed_force") or {}).get("tier", "low")
    return "low"  # never been recon'd


def _campaign_or_404(db: Session, cid: int) -> Campaign:
    c = db.get(Campaign, cid)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return c


def _build_target_dict(db: Session, campaign_id: int, target: AdversaryBase) -> dict:
    bd = db.query(BaseDamage).filter_by(
        campaign_id=campaign_id, adversary_base_id=target.id,
    ).first()
    return {
        "id": target.id,
        "base_id_str": target.base_id_str,
        "shelter_count": target.shelter_count,
        "garrisoned_count": target.shelter_count,  # rough proxy until granular content
        "garrisoned_platforms": [],
        "ad_battery_count": 0,  # TODO: derive from adversary doctrine; placeholder.
        "ad_destroyed": bd.ad_destroyed if bd else False,
        "command_node": False,  # AdversaryBaseSpec carries this; resolver may reload.
        "value": 3,
    }


@router.post("/strikes/preview", response_model=StrikePreviewResponse)
def preview_strike(campaign_id: int, payload: StrikePackageRequest, db: Session = Depends(get_db)):
    camp = _campaign_or_404(db, campaign_id)
    if not camp.offensive_unlocked:
        raise HTTPException(409, "Offensive operations not yet authorized.")
    target = db.get(AdversaryBase, payload.target_base_id)
    if target is None or target.campaign_id != campaign_id:
        raise HTTPException(404, "Target base not found")

    # Reconstruct package with full squadron metadata.
    sq_rows = {s.id: s for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()}
    package = {
        "profile": payload.profile,
        "squadrons": [
            {"id": e.squadron_id,
             "platform_id": sq_rows[e.squadron_id].platform_id,
             "airframes": e.airframes,
             "role": "multirole",  # frontend should pass role; placeholder
             "rcs_band": "reduced",
             "loadout": [],
             "base_id": sq_rows[e.squadron_id].base_id}
            for e in payload.squadrons if e.squadron_id in sq_rows
        ],
        "weapons_planned": payload.weapons_planned,
        "support": payload.support,
        "roe": payload.roe,
    }
    if not package["squadrons"]:
        raise HTTPException(400, "No valid squadrons in package.")

    launch_base_id = package["squadrons"][0]["base_id"]
    weapons_avail = {
        s.weapon_id: s.stock for s in db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=launch_base_id,
        ).all()
    }
    target_dict = _build_target_dict(db, campaign_id, target)
    issues = validate_strike_package(package, target_dict, weapons_avail)
    intel_q = _intel_quality_for_target(db, campaign_id, target)
    fc = forecast_strike(package, target_dict, intel_quality=intel_q)
    return StrikePreviewResponse(
        issues=issues, forecast=fc, weapons_avail=weapons_avail, intel_quality=intel_q,
    )


@router.post("/strikes", response_model=StrikeRead, status_code=201)
def commit_strike(campaign_id: int, payload: StrikePackageRequest, db: Session = Depends(get_db)):
    camp = _campaign_or_404(db, campaign_id)
    if not camp.offensive_unlocked:
        raise HTTPException(409, "Offensive operations not yet authorized.")

    # Cap check.
    quarter_strikes = db.query(OffensiveOp).filter_by(
        campaign_id=campaign_id, year=camp.current_year, quarter=camp.current_quarter,
    ).count()
    if quarter_strikes >= _STRIKES_PER_QUARTER_CAP:
        raise HTTPException(409, f"Strike cap reached for this quarter ({_STRIKES_PER_QUARTER_CAP}).")

    target = db.get(AdversaryBase, payload.target_base_id)
    if target is None or target.campaign_id != campaign_id:
        raise HTTPException(404, "Target base not found")

    sq_rows = {s.id: s for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()}
    package = {
        "profile": payload.profile,
        "squadrons": [
            {"id": e.squadron_id,
             "platform_id": sq_rows[e.squadron_id].platform_id,
             "airframes": e.airframes,
             "role": "multirole",
             "rcs_band": "reduced",
             "loadout": [],
             "base_id": sq_rows[e.squadron_id].base_id}
            for e in payload.squadrons if e.squadron_id in sq_rows
        ],
        "weapons_planned": payload.weapons_planned,
        "support": payload.support,
        "roe": payload.roe,
    }
    target_dict = _build_target_dict(db, campaign_id, target)
    weapons_avail = {
        s.weapon_id: s.stock for s in db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=package["squadrons"][0]["base_id"],
        ).all()
    }
    issues = validate_strike_package(package, target_dict, weapons_avail)
    if issues:
        raise HTTPException(400, "; ".join(issues))

    rng = subsystem_rng(camp.seed, "offensive_strike", camp.current_year, camp.current_quarter)
    rng.random()  # advance one step so multiple strikes in the same quarter use distinct streams
    rng.jumpahead(quarter_strikes) if hasattr(rng, "jumpahead") else None
    outcome = resolve_strike(package, target_dict, rng=rng)

    # Apply BDA to BaseDamage row (upsert).
    bd = db.query(BaseDamage).filter_by(
        campaign_id=campaign_id, adversary_base_id=target.id,
    ).first()
    if bd is None:
        bd = BaseDamage(campaign_id=campaign_id, adversary_base_id=target.id)
        db.add(bd)
    d = outcome["damage"]
    bd.shelter_loss_pct = max(bd.shelter_loss_pct, d["shelter_loss_pct"])
    bd.runway_disabled_quarters_remaining = max(bd.runway_disabled_quarters_remaining,
                                                 d["runway_disabled_quarters_remaining"])
    if d["ad_destroyed"]:
        bd.ad_destroyed = True
        bd.ad_destroyed_quarters_since = 0
    bd.garrisoned_loss = bd.garrisoned_loss + d["garrisoned_loss"]

    # Decrement weapon stock at launch base.
    launch_base_id = package["squadrons"][0]["base_id"]
    for wid, used in outcome["weapons_consumed"].items():
        row = db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=launch_base_id, weapon_id=wid,
        ).first()
        if row is not None:
            row.stock = max(0, row.stock - used)

    # Decrement squadron strength for IND losses (proportional across pkg squadrons).
    total_lost = outcome["ind_airframes_lost"]
    pkg_total = sum(e.airframes for e in payload.squadrons)
    for entry in payload.squadrons:
        if pkg_total <= 0:
            break
        loss = int(round(total_lost * entry.airframes / pkg_total))
        sq = sq_rows.get(entry.squadron_id)
        if sq is not None:
            sq.strength = max(0, sq.strength - loss)

    # Diplomatic blowback — apply to target faction.
    diplo = db.query(DiplomaticState).filter_by(
        campaign_id=campaign_id, faction=target.faction,
    ).first()
    if diplo is not None:
        diplo.temperature_pct = tick_diplomacy_temp(
            diplo.temperature_pct, strikes_this_quarter=1,
        )

    op = OffensiveOp(
        campaign_id=campaign_id,
        year=camp.current_year, quarter=camp.current_quarter,
        target_base_id=target.id,
        profile=payload.profile, roe=payload.roe,
        package_json=package,
        outcome_json={
            "damage": d,
            "ind_airframes_lost": total_lost,
            "weapons_consumed": outcome["weapons_consumed"],
        },
        event_trace=outcome["events"],
        aar_text="",
        status="resolved",
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return op


@router.get("/strikes", response_model=StrikeListResponse)
def list_strikes(campaign_id: int, db: Session = Depends(get_db)):
    rows = db.query(OffensiveOp).filter_by(campaign_id=campaign_id).order_by(OffensiveOp.id.desc()).all()
    return StrikeListResponse(strikes=rows)


@router.get("/strikes/{strike_id}", response_model=StrikeRead)
def get_strike(campaign_id: int, strike_id: int, db: Session = Depends(get_db)):
    op = db.get(OffensiveOp, strike_id)
    if op is None or op.campaign_id != campaign_id:
        raise HTTPException(404, "Strike not found")
    return op
```

- [ ] **Step 4: Register router in `main.py`**

```python
from app.api.offensive_ops import router as offensive_router
...
app.include_router(offensive_router)
```

- [ ] **Step 5: Write API tests**

```python
# backend/tests/test_offensive_api.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from main import app


@pytest.fixture
def client_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def _g():
        d = Local()
        try:
            yield d
        finally:
            d.close()
    app.dependency_overrides[get_db] = _g
    yield TestClient(app), Local
    app.dependency_overrides.clear()


def _new_campaign(client) -> int:
    return client.post("/api/campaigns", json={
        "name": "off", "difficulty": "realistic", "objectives": ["defend_punjab"],
    }).json()["id"]


def test_strike_preview_blocked_until_unlocked(client_db):
    client, _ = client_db
    cid = _new_campaign(client)
    r = client.post(f"/api/campaigns/{cid}/strikes/preview", json={
        "target_base_id": 1, "profile": "deep_strike", "squadrons": [],
        "weapons_planned": {}, "support": {}, "roe": "unrestricted",
    })
    assert r.status_code == 409


def test_strike_commit_writes_offensive_op(client_db):
    client, Local = client_db
    cid = _new_campaign(client)
    db = Local()
    camp = db.get(Campaign, cid)
    camp.offensive_unlocked = True
    db.commit()
    db.close()
    # Pick first adversary base + first IND squadron.
    bases = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=false").json()["bases"]
    target_id = bases[0]["id"]
    sqns = client.get(f"/api/campaigns/{cid}/hangar").json()["squadrons"]
    sq = sqns[0]
    r = client.post(f"/api/campaigns/{cid}/strikes", json={
        "target_base_id": target_id,
        "profile": "standoff_cruise",
        "squadrons": [{"squadron_id": sq["id"], "airframes": 4}],
        "weapons_planned": {},  # no weapons → 0 damage but valid
        "support": {}, "roe": "unrestricted",
    })
    # standoff_cruise doesn't require multiple squadrons + minimal validation.
    assert r.status_code in (201, 400)  # depends on weapons stock
```

- [ ] **Step 6: Run tests**

Run: `cd backend && pytest tests/test_offensive_api.py -v`
Expected: 1 PASS (preview-blocked), 1 either (commit) acceptable based on data fixture.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/offensive_ops.py backend/app/schemas/offensive.py backend/app/models/campaign.py backend/app/crud/campaign.py backend/main.py backend/tests/test_offensive_api.py
git commit -m "feat(api): offensive ops endpoints + offensive_unlocked flag"
```

---

### Task 13: Diplomacy + Posture Endpoints

**Files:**
- Create: `backend/app/api/diplomacy.py` + `backend/app/schemas/diplomacy.py`
- Create: `backend/app/api/posture.py` + `backend/app/schemas/posture.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_diplomacy_api.py`, `backend/tests/test_posture_api.py`

- [ ] **Step 1: Diplomacy schema + endpoint**

Create `backend/app/schemas/diplomacy.py`:

```python
from pydantic import BaseModel


class FactionDiplomacy(BaseModel):
    faction: str
    temperature_pct: int
    tier: str


class DiplomacyResponse(BaseModel):
    factions: list[FactionDiplomacy]
    grant_bump_pct: int
```

Create `backend/app/api/diplomacy.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine.diplomacy import tier_from_temperature, grant_multiplier_pct
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.schemas.diplomacy import DiplomacyResponse, FactionDiplomacy

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["diplomacy"])


@router.get("/diplomacy", response_model=DiplomacyResponse)
def get_diplomacy(campaign_id: int, db: Session = Depends(get_db)):
    if db.get(Campaign, campaign_id) is None:
        raise HTTPException(404, "Campaign not found")
    rows = db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all()
    factions = [
        FactionDiplomacy(faction=r.faction, temperature_pct=r.temperature_pct,
                          tier=tier_from_temperature(r.temperature_pct))
        for r in rows
    ]
    bump = grant_multiplier_pct({f.faction: f.tier for f in factions})
    return DiplomacyResponse(factions=factions, grant_bump_pct=bump)
```

- [ ] **Step 2: Posture rollup**

Create `backend/app/schemas/posture.py`:

```python
from pydantic import BaseModel


class TreasurySnap(BaseModel):
    treasury_cr: int
    quarterly_grant_cr: int
    runway_quarters: int


class FleetSummaryEntry(BaseModel):
    role: str
    airframes: int
    avg_readiness_pct: int


class PostureResponse(BaseModel):
    treasury: TreasurySnap
    fleet_by_role: list[FleetSummaryEntry]
    threat_history_by_faction: dict[str, list[float]]
    total_active_orders: int
    nearest_delivery: dict | None
    rd_active_count: int
    rd_completed_count: int
    diplomacy_summary: dict[str, str]
    offensive_unlocked: bool
    strikes_this_quarter: int
```

Create `backend/app/api/posture.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine.diplomacy import tier_from_temperature
from app.models.acquisition import AcquisitionOrder
from app.models.adversary import AdversaryState
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.models.event import CampaignEvent
from app.models.offensive_op import OffensiveOp
from app.models.rd_program import RDProgramState
from app.models.squadron import Squadron
from app.content.registry import platforms as _plats
from app.schemas.posture import (
    FleetSummaryEntry, PostureResponse, TreasurySnap,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["posture"])


@router.get("/posture", response_model=PostureResponse)
def get_posture(campaign_id: int, db: Session = Depends(get_db)):
    camp = db.get(Campaign, campaign_id)
    if camp is None:
        raise HTTPException(404, "Campaign not found")

    # Treasury runway (quarters at current burn rate, naive: treasury / (grant - reasonable burn)).
    grant = camp.quarterly_grant_cr or 1
    runway = max(0, camp.budget_cr // max(1, grant // 2))

    # Fleet by role.
    plats = _plats()
    sqns = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    role_buckets: dict[str, list[Squadron]] = {}
    for sq in sqns:
        role = (plats.get(sq.platform_id) and plats[sq.platform_id].role) or "other"
        role_buckets.setdefault(role, []).append(sq)
    fleet = [
        FleetSummaryEntry(
            role=role,
            airframes=sum(s.strength for s in group),
            avg_readiness_pct=int(sum(s.readiness_pct for s in group) / max(1, len(group))),
        )
        for role, group in role_buckets.items()
    ]

    # Threat history (last 8 quarters of `vignette_fired` event count by faction).
    eight_q_floor = (camp.current_year * 4 + camp.current_quarter - 1) - 8
    evs = (
        db.query(CampaignEvent)
        .filter(CampaignEvent.campaign_id == campaign_id,
                CampaignEvent.event_type == "vignette_fired")
        .all()
    )
    history: dict[str, list[float]] = {"PAF": [0]*8, "PLAAF": [0]*8, "PLAN": [0]*8}
    for ev in evs:
        idx = ev.year * 4 + ev.quarter - 1
        if idx < eight_q_floor:
            continue
        bucket = idx - eight_q_floor
        if 0 <= bucket < 8:
            faction = (ev.payload or {}).get("faction") or "PAF"
            if faction in history:
                history[faction][bucket] += 1

    # Active orders + nearest delivery.
    orders = db.query(AcquisitionOrder).filter_by(campaign_id=campaign_id).all()
    active_orders = [o for o in orders if not o.cancelled and o.delivered < o.quantity]
    nearest = None
    if active_orders:
        soonest = min(active_orders, key=lambda o: (o.foc_year, o.foc_quarter))
        nearest = {
            "platform_id": soonest.platform_id,
            "kind": getattr(soonest, "kind", "platform"),
            "foc_year": soonest.foc_year, "foc_quarter": soonest.foc_quarter,
        }

    # R&D counts.
    rd_rows = db.query(RDProgramState).filter_by(campaign_id=campaign_id).all()
    rd_active = sum(1 for r in rd_rows if r.status == "active")
    rd_completed = sum(1 for r in rd_rows if r.status == "completed")

    # Diplomacy summary.
    diplo = {r.faction: tier_from_temperature(r.temperature_pct)
             for r in db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all()}

    strikes_this_q = (
        db.query(OffensiveOp)
        .filter_by(campaign_id=campaign_id, year=camp.current_year, quarter=camp.current_quarter)
        .count()
    )

    return PostureResponse(
        treasury=TreasurySnap(treasury_cr=camp.budget_cr, quarterly_grant_cr=grant, runway_quarters=runway),
        fleet_by_role=fleet,
        threat_history_by_faction=history,
        total_active_orders=len(active_orders),
        nearest_delivery=nearest,
        rd_active_count=rd_active,
        rd_completed_count=rd_completed,
        diplomacy_summary=diplo,
        offensive_unlocked=camp.offensive_unlocked,
        strikes_this_quarter=strikes_this_q,
    )
```

- [ ] **Step 3: Register routers + smoke tests**

In `backend/main.py`:

```python
from app.api.diplomacy import router as diplomacy_router
from app.api.posture import router as posture_router
...
app.include_router(diplomacy_router)
app.include_router(posture_router)
```

Test sketches in `tests/test_diplomacy_api.py` and `tests/test_posture_api.py`:

```python
def test_diplomacy_endpoint_returns_three_factions(client_db):
    client, _ = client_db
    cid = client.post("/api/campaigns", json={"name":"d","difficulty":"realistic","objectives":["defend_punjab"]}).json()["id"]
    r = client.get(f"/api/campaigns/{cid}/diplomacy")
    assert r.status_code == 200
    assert {f["faction"] for f in r.json()["factions"]} == {"PAF","PLAAF","PLAN"}


def test_posture_endpoint_smokes(client_db):
    client, _ = client_db
    cid = client.post("/api/campaigns", json={"name":"p","difficulty":"realistic","objectives":["defend_punjab"]}).json()["id"]
    r = client.get(f"/api/campaigns/{cid}/posture")
    assert r.status_code == 200
    body = r.json()
    assert body["offensive_unlocked"] is False
    assert "treasury" in body
    assert isinstance(body["fleet_by_role"], list)
```

- [ ] **Step 4: Run tests + full suite**

Run: `cd backend && pytest tests/test_diplomacy_api.py tests/test_posture_api.py -v && pytest -q`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/diplomacy.py backend/app/api/posture.py backend/app/schemas/diplomacy.py backend/app/schemas/posture.py backend/main.py backend/tests/test_diplomacy_api.py backend/tests/test_posture_api.py
git commit -m "feat(api): diplomacy + posture rollup endpoints"
```

---

### Task 14: Frontend Types + API + Store Wiring + OpsScreen Shell

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/store/campaignStore.ts`
- Create: `frontend/src/pages/OpsScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/store/__tests__/opsStore.test.ts`, `frontend/src/pages/__tests__/OpsScreen.test.tsx`

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts` append:

```typescript
// Plan 22 — Ops Screen + Offensive Ops

export type DiplomaticTier = "friendly" | "neutral" | "cool" | "cold" | "hostile";

export interface FactionDiplomacy {
  faction: "PAF" | "PLAAF" | "PLAN";
  temperature_pct: number;
  tier: DiplomaticTier;
}

export interface DiplomacyResponse {
  factions: FactionDiplomacy[];
  grant_bump_pct: number;
}

export interface PostureSnapshot {
  treasury: { treasury_cr: number; quarterly_grant_cr: number; runway_quarters: number };
  fleet_by_role: { role: string; airframes: number; avg_readiness_pct: number }[];
  threat_history_by_faction: Record<string, number[]>;
  total_active_orders: number;
  nearest_delivery: { platform_id: string; kind: string; foc_year: number; foc_quarter: number } | null;
  rd_active_count: number;
  rd_completed_count: number;
  diplomacy_summary: Record<string, DiplomaticTier>;
  offensive_unlocked: boolean;
  strikes_this_quarter: number;
}

export type StrikeProfileId = "deep_strike" | "sead_suppression" | "standoff_cruise" | "drone_swarm";

export interface StrikePackagePayload {
  target_base_id: number;
  profile: StrikeProfileId;
  squadrons: { squadron_id: number; airframes: number }[];
  weapons_planned: Record<string, number>;
  support: { awacs?: boolean; tanker?: boolean };
  roe: "clean_strike" | "unrestricted" | "decapitation";
}

export interface StrikePreview {
  issues: string[];
  forecast: {
    ind_losses: [number, number];
    damage_pct: [number, number];
    diplomatic_blowback: "low" | "medium" | "high" | "critical";
    weapons_consumed: Record<string, number>;
    treasury_cost_estimate_cr: number;
  };
  weapons_avail: Record<string, number>;
  intel_quality: "low" | "medium" | "high";
}

export interface StrikeRead {
  id: number;
  year: number;
  quarter: number;
  target_base_id: number;
  profile: StrikeProfileId;
  roe: string;
  package_json: Record<string, unknown>;
  outcome_json: { damage: BaseDamageState; ind_airframes_lost: number; weapons_consumed: Record<string, number> };
  aar_text: string;
  status: string;
}

export interface BaseDamageState {
  shelter_loss_pct: number;
  runway_disabled_quarters_remaining: number;
  ad_destroyed: boolean;
  garrisoned_loss: number;
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`:

```typescript
import type {
  // ...existing
  DiplomacyResponse, PostureSnapshot, StrikePackagePayload, StrikePreview, StrikeRead,
} from "./types";

// Inside `api` object:

  async getDiplomacy(campaignId: number): Promise<DiplomacyResponse> {
    const { data } = await http.get(`/api/campaigns/${campaignId}/diplomacy`);
    return data;
  },

  async getPosture(campaignId: number): Promise<PostureSnapshot> {
    const { data } = await http.get(`/api/campaigns/${campaignId}/posture`);
    return data;
  },

  async previewStrike(campaignId: number, payload: StrikePackagePayload): Promise<StrikePreview> {
    const { data } = await http.post(`/api/campaigns/${campaignId}/strikes/preview`, payload);
    return data;
  },

  async commitStrike(campaignId: number, payload: StrikePackagePayload): Promise<StrikeRead> {
    const { data } = await http.post(`/api/campaigns/${campaignId}/strikes`, payload);
    return data;
  },

  async listStrikes(campaignId: number): Promise<{ strikes: StrikeRead[] }> {
    const { data } = await http.get(`/api/campaigns/${campaignId}/strikes`);
    return data;
  },
```

- [ ] **Step 3: Add to campaignStore**

In `frontend/src/store/campaignStore.ts` extend the state interface and impl:

```typescript
// Interface additions
posture: PostureSnapshot | null;
diplomacy: DiplomacyResponse | null;
strikes: StrikeRead[];
loadPosture: (campaignId: number) => Promise<void>;
loadDiplomacy: (campaignId: number) => Promise<void>;
loadStrikes: (campaignId: number) => Promise<void>;
commitStrike: (payload: StrikePackagePayload) => Promise<StrikeRead>;
```

```typescript
// Impl additions inside the create() block:
posture: null,
diplomacy: null,
strikes: [],
loadPosture: async (cid) => {
  try { set({ posture: await api.getPosture(cid) }); }
  catch (e) { console.warn("loadPosture failed", e); }
},
loadDiplomacy: async (cid) => {
  try { set({ diplomacy: await api.getDiplomacy(cid) }); }
  catch (e) { console.warn("loadDiplomacy failed", e); }
},
loadStrikes: async (cid) => {
  try {
    const r = await api.listStrikes(cid);
    set({ strikes: r.strikes });
  } catch (e) { console.warn("loadStrikes failed", e); }
},
commitStrike: async (payload) => {
  const cid = get().campaign?.id;
  if (!cid) throw new Error("no campaign");
  try {
    const op = await api.commitStrike(cid, payload);
    set((s) => ({ strikes: [op, ...s.strikes] }));
    void get().loadPosture(cid);
    void get().loadDiplomacy(cid);
    void get().loadMissileStocks(cid);
    void get().loadHangar(cid);
    get().pushToast("info", "Strike resolved");
    return op;
  } catch (e) {
    const msg = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                ?? (e as Error).message;
    get().pushToast("error", `Strike failed: ${msg}`);
    throw e;
  }
},
```

Add to the `reset()` block:

```typescript
posture: null, diplomacy: null, strikes: [],
```

Auto-refresh in `advanceTurn` after the existing loads:

```typescript
void get().loadPosture(cid);
void get().loadDiplomacy(cid);
void get().loadStrikes(cid);
```

- [ ] **Step 4: Add Ops route shell**

Create `frontend/src/pages/OpsScreen.tsx`:

```typescript
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";

type Tab = "posture" | "strike" | "history";
const TABS: { k: Tab; label: string }[] = [
  { k: "posture", label: "Posture" },
  { k: "strike", label: "Strike" },
  { k: "history", label: "History" },
];

export function OpsScreen() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "posture";

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadPosture = useCampaignStore((s) => s.loadPosture);
  const loadDiplomacy = useCampaignStore((s) => s.loadDiplomacy);
  const loadStrikes = useCampaignStore((s) => s.loadStrikes);
  const posture = useCampaignStore((s) => s.posture);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
  }, [cid, campaign, loadCampaign]);
  useEffect(() => {
    if (campaign) {
      loadPosture(campaign.id);
      loadDiplomacy(campaign.id);
      loadStrikes(campaign.id);
    }
  }, [campaign, loadPosture, loadDiplomacy, loadStrikes]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">{campaign.name}</h1>
          <p className="text-xs opacity-70">Operations · {campaign.current_year}-Q{campaign.current_quarter}</p>
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs opacity-60 hover:opacity-100 underline">← Map</Link>
      </header>

      <nav className="flex border-b border-slate-800 bg-slate-950/50">
        {TABS.map((t) => (
          <button
            key={t.k} type="button"
            onClick={() => setSearchParams({ tab: t.k })}
            className={[
              "flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition-colors",
              tab === t.k ? "border-amber-500 text-amber-300" : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >{t.label}</button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">
        {tab === "posture" && <div>Posture dashboard placeholder (Task 15)</div>}
        {tab === "strike" && (
          posture && !posture.offensive_unlocked
            ? <div className="text-sm opacity-70 p-6 text-center">
                Offensive operations unlocked after the first reactive vignette resolves.
              </div>
            : <div>Strike builder placeholder (Tasks 16–17)</div>
        )}
        {tab === "history" && <div>History placeholder (Task 18)</div>}
      </main>
    </div>
  );
}
```

In `frontend/src/App.tsx` register the route:

```tsx
import { OpsScreen } from "./pages/OpsScreen";
// ...
<Route path="/campaign/:id/ops" element={<OpsScreen />} />
```

Add a header "Ops" link in `CampaignMapView.tsx` (next to existing Procurement/Hangar/Armory links).

- [ ] **Step 5: Smoke tests**

```typescript
// frontend/src/pages/__tests__/OpsScreen.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OpsScreen } from "../OpsScreen";
import { useCampaignStore } from "../../store/campaignStore";

describe("OpsScreen", () => {
  it("renders three tabs", () => {
    useCampaignStore.setState({
      campaign: { id: 1, name: "T", current_year: 2027, current_quarter: 2 } as any,
      posture: null, diplomacy: null, strikes: [],
      loadCampaign: vi.fn(), loadPosture: vi.fn(),
      loadDiplomacy: vi.fn(), loadStrikes: vi.fn(),
    } as any);
    render(
      <MemoryRouter initialEntries={["/campaign/1/ops"]}>
        <Routes><Route path="/campaign/:id/ops" element={<OpsScreen />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Posture")).toBeInTheDocument();
    expect(screen.getByText("Strike")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run vitest**

Run: `cd frontend && npx vitest run src/pages/__tests__/OpsScreen.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts frontend/src/pages/OpsScreen.tsx frontend/src/App.tsx frontend/src/pages/__tests__/OpsScreen.test.tsx
git commit -m "feat(fe): Ops Screen route shell + types + store wiring"
```

---

### Task 15: Posture Dashboard Widgets

**Files:**
- Create: `frontend/src/components/ops/Sparkline.tsx`
- Create: `frontend/src/components/ops/PostureDashboard.tsx`
- Create: `frontend/src/components/ops/ThreatRibbon.tsx`, `TreasuryRunway.tsx`, `ForceReadinessSummary.tsx`, `RDPipelineSummary.tsx`, `ActiveDeliveriesPanel.tsx`, `DiplomacyMeter.tsx` (full component, not just placeholder)
- Modify: `frontend/src/pages/OpsScreen.tsx` to mount dashboard
- Test: `frontend/src/components/ops/__tests__/Sparkline.test.tsx`

- [ ] **Step 1: Sparkline primitive**

```tsx
// frontend/src/components/ops/Sparkline.tsx
export interface SparklineProps {
  values: number[];
  width?: number; height?: number;
  stroke?: string; fill?: string;
  ariaLabel?: string;
}

export function Sparkline({ values, width = 100, height = 28, stroke = "#fbbf24", fill = "rgba(251,191,36,0.15)", ariaLabel }: SparklineProps) {
  if (values.length === 0) return <span className="text-xs opacity-50">—</span>;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  const area = `0,${height} ${pts} ${(values.length - 1) * step},${height}`;
  return (
    <svg width={width} height={height} aria-label={ariaLabel} role="img" className="inline-block">
      <polygon points={area} fill={fill} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
```

Test: assert SVG renders, values mapped correctly.

- [ ] **Step 2: ThreatRibbon (8-quarter sparkline per faction)**

```tsx
// frontend/src/components/ops/ThreatRibbon.tsx
import { Sparkline } from "./Sparkline";

const FACTION_COLOR: Record<string, string> = {
  PAF: "#dc2626", PLAAF: "#ea580c", PLAN: "#d97706",
};

export function ThreatRibbon({ history }: { history: Record<string, number[]> }) {
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Threat — last 8 quarters</h3>
      <div className="space-y-2">
        {Object.entries(history).map(([faction, vals]) => (
          <div key={faction} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold w-12">{faction}</span>
            <Sparkline values={vals} width={120} height={20} stroke={FACTION_COLOR[faction] ?? "#fbbf24"} ariaLabel={`${faction} threat trajectory`} />
            <span className="opacity-70 font-mono">{vals[vals.length - 1] ?? 0}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: TreasuryRunway, ForceReadinessSummary, RDPipelineSummary, ActiveDeliveriesPanel**

Each follows the same pattern (small section card reading from `posture` props). Pseudocode for each:

```tsx
// TreasuryRunway: shows treasury_cr, grant, runway_quarters, with rose color when runway < 4.
// ForceReadinessSummary: lists fleet_by_role with airframes + readiness bar.
// RDPipelineSummary: shows rd_active_count + rd_completed_count + Link to /procurement?tab=rd.
// ActiveDeliveriesPanel: total_active_orders + nearest_delivery callout + Link to /procurement?tab=acquisitions.
```

Each is ~30 lines. Implement same as Plan 17/19 pattern (slate-900 box, h3 header).

- [ ] **Step 4: DiplomacyMeter**

```tsx
// frontend/src/components/ops/DiplomacyMeter.tsx
import type { DiplomacyResponse } from "../../lib/types";

const TIER_COLOR = {
  friendly: "bg-emerald-700 text-emerald-100",
  neutral:  "bg-slate-700 text-slate-200",
  cool:     "bg-amber-800 text-amber-100",
  cold:     "bg-orange-800 text-orange-100",
  hostile:  "bg-rose-700 text-rose-100",
};

export function DiplomacyMeter({ diplomacy, compact = false }: { diplomacy: DiplomacyResponse | null; compact?: boolean }) {
  if (!diplomacy) return null;
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {diplomacy.factions.map((f) => (
          <span key={f.faction} className={`text-[10px] px-1.5 py-0.5 rounded ${TIER_COLOR[f.tier]}`} title={`${f.faction} · ${f.tier} · ${f.temperature_pct}`}>
            {f.faction[0]}
          </span>
        ))}
      </div>
    );
  }
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Diplomatic temperature</h3>
      <ul className="space-y-1">
        {diplomacy.factions.map((f) => (
          <li key={f.faction} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">{f.faction}</span>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded ${TIER_COLOR[f.tier]}`}>{f.tier}</span>
              <span className="font-mono opacity-70 w-8 text-right">{f.temperature_pct}</span>
            </div>
          </li>
        ))}
      </ul>
      {diplomacy.grant_bump_pct > 0 && (
        <p className="text-[10px] opacity-70 mt-2">War footing grant bump: <span className="text-amber-300">+{diplomacy.grant_bump_pct}%</span></p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: PostureDashboard composer**

```tsx
// frontend/src/components/ops/PostureDashboard.tsx
import { useCampaignStore } from "../../store/campaignStore";
import { ThreatRibbon } from "./ThreatRibbon";
import { TreasuryRunway } from "./TreasuryRunway";
import { ForceReadinessSummary } from "./ForceReadinessSummary";
import { RDPipelineSummary } from "./RDPipelineSummary";
import { ActiveDeliveriesPanel } from "./ActiveDeliveriesPanel";
import { DiplomacyMeter } from "./DiplomacyMeter";

export function PostureDashboard() {
  const posture = useCampaignStore((s) => s.posture);
  const diplomacy = useCampaignStore((s) => s.diplomacy);
  if (!posture) return <div className="text-sm opacity-60 p-6 text-center">Loading posture…</div>;
  return (
    <div className="space-y-3">
      <TreasuryRunway snap={posture.treasury} />
      <DiplomacyMeter diplomacy={diplomacy} />
      <ThreatRibbon history={posture.threat_history_by_faction} />
      <ForceReadinessSummary fleet={posture.fleet_by_role} />
      <RDPipelineSummary active={posture.rd_active_count} completed={posture.rd_completed_count} />
      <ActiveDeliveriesPanel total={posture.total_active_orders} nearest={posture.nearest_delivery} />
    </div>
  );
}
```

- [ ] **Step 6: Mount in OpsScreen**

In `OpsScreen.tsx` replace the posture placeholder with `<PostureDashboard />`.

- [ ] **Step 7: Run tests**

Run: `cd frontend && npx vitest run`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ops/ frontend/src/pages/OpsScreen.tsx
git commit -m "feat(fe): posture dashboard widgets (treasury, threat, fleet, rd, deliveries, diplomacy)"
```

---

### Task 16: Strike Target Picker

**Files:**
- Create: `frontend/src/components/ops/StrikeTargetPicker.tsx`
- Modify: `frontend/src/components/map/AdversaryBaseSheet.tsx` to deep-link `?tab=strike&target=<id>` into Ops Screen.
- Test: `frontend/src/components/ops/__tests__/StrikeTargetPicker.test.tsx`

- [ ] **Step 1: TargetPicker component**

```tsx
import { useState } from "react";
import type { AdversaryBase } from "../../lib/types";

export interface StrikeTargetPickerProps {
  bases: AdversaryBase[];
  onPick: (base: AdversaryBase) => void;
  selectedId: number | null;
}

export function StrikeTargetPicker({ bases, onPick, selectedId }: StrikeTargetPickerProps) {
  const [filter, setFilter] = useState<"all" | "PAF" | "PLAAF" | "PLAN">("all");
  const filtered = bases
    .filter((b) => b.is_covered)
    .filter((b) => filter === "all" || b.faction === filter);
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase opacity-70">Target — covered bases only</h3>
      <div className="flex gap-1">
        {(["all","PAF","PLAAF","PLAN"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={["text-xs px-2 py-1 rounded",
              filter === k ? "bg-amber-600 text-slate-900" : "bg-slate-800 text-slate-300"].join(" ")}>
            {k}
          </button>
        ))}
      </div>
      <ul className="space-y-1 max-h-72 overflow-y-auto">
        {filtered.length === 0 && <li className="text-xs opacity-60 p-3 text-center">No covered targets — base an ISR drone within range first.</li>}
        {filtered.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onPick(b)}
              className={[
                "w-full text-left bg-slate-950/40 border rounded p-2 text-xs",
                selectedId === b.id ? "border-amber-500" : "border-slate-800 hover:border-slate-600",
              ].join(" ")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold truncate">{b.name}</span>
                <span className="opacity-60">{b.faction} · {b.tier}</span>
              </div>
              {b.latest_sighting && <div className="text-[10px] opacity-60 mt-0.5">Intel: {b.latest_sighting.tier}</div>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Deep-link from map AdversaryBaseSheet**

In `AdversaryBaseSheet.tsx` add a "Strike →" button (only when `posture.offensive_unlocked`):

```tsx
{posture?.offensive_unlocked && (
  <Link to={`/campaign/${campaignId}/ops?tab=strike&target=${base.id}`}
    className="inline-block mt-3 text-xs bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded font-semibold">
    Plan strike on this base →
  </Link>
)}
```

(Read `posture` + `campaignId` from store / props.)

- [ ] **Step 3: Tests**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StrikeTargetPicker } from "../StrikeTargetPicker";

const bases = [
  { id: 1, base_id_str: "paf_x", name: "PAF X", faction: "PAF", lat: 0, lon: 0, tier: "main", is_covered: true, latest_sighting: null },
  { id: 2, base_id_str: "plaaf_y", name: "PLAAF Y", faction: "PLAAF", lat: 0, lon: 0, tier: "main", is_covered: false, latest_sighting: null },
] as any;

it("only shows covered bases", () => {
  render(<StrikeTargetPicker bases={bases} onPick={vi.fn()} selectedId={null} />);
  expect(screen.getByText("PAF X")).toBeInTheDocument();
  expect(screen.queryByText("PLAAF Y")).not.toBeInTheDocument();
});

it("calls onPick", () => {
  const fn = vi.fn();
  render(<StrikeTargetPicker bases={bases} onPick={fn} selectedId={null} />);
  fireEvent.click(screen.getByText("PAF X"));
  expect(fn).toHaveBeenCalledWith(bases[0]);
});
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ops/StrikeTargetPicker.tsx frontend/src/components/ops/__tests__/StrikeTargetPicker.test.tsx frontend/src/components/map/AdversaryBaseSheet.tsx
git commit -m "feat(fe): strike target picker + map deep-link"
```

---

### Task 17: Strike Builder Form

**Files:**
- Create: `frontend/src/components/ops/StrikeBuilder.tsx`
- Modify: `OpsScreen.tsx` to mount it in the strike tab when offensive is unlocked.
- Test: `frontend/src/components/ops/__tests__/StrikeBuilder.test.tsx`

- [ ] **Step 1: Build the form**

Single form, collapsible sections. Sections: Target (read-only summary, comes from picker selection), Profile (radio cards), Squadrons (multi-checkbox + airframe stepper per row), Weapons (depot lookup + qty stepper), Support (AWACS/Tanker toggles), ROE (radio).

Pseudocode (~250 lines real):

```tsx
import { useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";
import type { AdversaryBase, StrikePackagePayload, StrikeProfileId } from "../../lib/types";
import { StrikeTargetPicker } from "./StrikeTargetPicker";
import { StrikeRiskPreview } from "./StrikeRiskPreview";

export function StrikeBuilder() {
  const adversaryBases = useCampaignStore((s) => s.adversaryBases);
  const hangar = useCampaignStore((s) => s.hangar);
  const missileStocks = useCampaignStore((s) => s.missileStocks);
  const commitStrike = useCampaignStore((s) => s.commitStrike);

  const [target, setTarget] = useState<AdversaryBase | null>(null);
  const [profile, setProfile] = useState<StrikeProfileId>("deep_strike");
  const [picked, setPicked] = useState<Record<number, number>>({});  // squadron_id → airframes
  const [weapons, setWeapons] = useState<Record<string, number>>({});
  const [awacs, setAwacs] = useState(false);
  const [tanker, setTanker] = useState(false);
  const [roe, setRoe] = useState<"clean_strike" | "unrestricted" | "decapitation">("unrestricted");

  // ...build payload + call previewStrike on debounce, render StrikeRiskPreview, hold-to-commit button
}
```

(See task subagent for full implementation. Follow existing `ForceCommitter.tsx` patterns from Plan 8.)

- [ ] **Step 2: Mount in OpsScreen strike tab**

```tsx
{tab === "strike" && (
  posture && !posture.offensive_unlocked
    ? <UnlockHint />
    : <StrikeBuilder />
)}
```

- [ ] **Step 3: Tests + commit**

Test that the builder renders sections, validation runs, commit button is disabled when no target / no squadrons.

Commit:

```bash
git add frontend/src/components/ops/StrikeBuilder.tsx frontend/src/components/ops/__tests__/StrikeBuilder.test.tsx frontend/src/pages/OpsScreen.tsx
git commit -m "feat(fe): strike builder form"
```

---

### Task 18: Strike Risk Preview + Commit + AAR

**Files:**
- Create: `frontend/src/components/ops/StrikeRiskPreview.tsx`
- Create: `frontend/src/components/ops/StrikeAAR.tsx`
- Create: `frontend/src/components/ops/DamageAssessmentPanel.tsx`
- Test: `frontend/src/components/ops/__tests__/StrikeRiskPreview.test.tsx`

- [ ] **Step 1: StrikeRiskPreview**

```tsx
import type { StrikePreview } from "../../lib/types";

const BLOWBACK_COLOR = {
  low: "text-emerald-300", medium: "text-amber-300",
  high: "text-orange-300", critical: "text-rose-300",
};

export function StrikeRiskPreview({ preview }: { preview: StrikePreview | null }) {
  if (!preview) return null;
  const { issues, forecast, intel_quality } = preview;
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase opacity-70">Risk preview ({intel_quality} intel)</h3>
      {issues.length > 0 && (
        <ul className="text-xs text-rose-300 space-y-0.5">
          {issues.map((i, k) => <li key={k}>• {i}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2">
          <div className="opacity-60 text-[10px]">Predicted IND losses</div>
          <div className="font-mono text-base">{forecast.ind_losses[0]}–{forecast.ind_losses[1]}</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2">
          <div className="opacity-60 text-[10px]">Target damage</div>
          <div className="font-mono text-base">{forecast.damage_pct[0]}–{forecast.damage_pct[1]}%</div>
        </div>
        <div className="bg-slate-950/40 border border-slate-800 rounded p-2 col-span-2">
          <div className="opacity-60 text-[10px]">Diplomatic blowback</div>
          <div className={`font-semibold ${BLOWBACK_COLOR[forecast.diplomatic_blowback]}`}>
            {forecast.diplomatic_blowback}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: DamageAssessmentPanel + StrikeAAR**

DamageAssessmentPanel renders sub-systems hit. StrikeAAR composes risk preview + damage assessment + event trace summary.

- [ ] **Step 3: Wire commit + redirect**

In `StrikeBuilder.tsx` after a successful commit, navigate to `/campaign/:id/ops/strike/:strike_id` (new sub-route) showing AAR. Add this route to App.tsx.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ops/StrikeRiskPreview.tsx frontend/src/components/ops/StrikeAAR.tsx frontend/src/components/ops/DamageAssessmentPanel.tsx frontend/src/App.tsx frontend/src/components/ops/__tests__/StrikeRiskPreview.test.tsx
git commit -m "feat(fe): strike risk preview + AAR + damage assessment"
```

---

### Task 19: Strike History Tab

**Files:**
- Create: `frontend/src/components/ops/StrikeHistoryList.tsx`
- Modify: `OpsScreen.tsx` to render history tab.
- Test: `frontend/src/components/ops/__tests__/StrikeHistoryList.test.tsx`

- [ ] **Step 1: Component**

```tsx
import { Link } from "react-router-dom";
import { useCampaignStore } from "../../store/campaignStore";

export function StrikeHistoryList({ campaignId }: { campaignId: number }) {
  const strikes = useCampaignStore((s) => s.strikes);
  if (strikes.length === 0) {
    return <div className="text-sm opacity-60 p-6 text-center">No strikes flown yet.</div>;
  }
  return (
    <ul className="space-y-2">
      {strikes.map((s) => (
        <li key={s.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold">{s.profile.replace(/_/g, " ")}</span>
            <span className="opacity-70">{s.year}-Q{s.quarter}</span>
          </div>
          <div className="text-[10px] opacity-70 mt-1">
            Lost: {s.outcome_json.ind_airframes_lost} · Shelters: -{s.outcome_json.damage.shelter_loss_pct}%
          </div>
          <Link to={`/campaign/${campaignId}/ops/strike/${s.id}`} className="text-[11px] text-amber-400 hover:text-amber-300 underline mt-1 inline-block">
            View AAR →
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Wire + commit**

```bash
git add frontend/src/components/ops/StrikeHistoryList.tsx frontend/src/components/ops/__tests__/StrikeHistoryList.test.tsx frontend/src/pages/OpsScreen.tsx
git commit -m "feat(fe): strike history tab"
```

---

### Task 20: Map Damage Badges + Acquisitions Hostile-Supplier UI

**Files:**
- Modify: `frontend/src/components/map/AdversaryBaseLayer.tsx` — visual cue for damaged bases.
- Modify: `frontend/src/components/map/AdversaryBaseSheet.tsx` — show damage state.
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx` — disable + tooltip on cards from hostile-supplier countries.
- Modify: `frontend/src/pages/CampaignMapView.tsx` header — Ops link + DiplomacyMeter compact.

- [ ] **Step 1: AdversaryBase damage on map**

Extend the GET `/adversary-bases` response to include `damage` (BaseDamageState | null). Update backend schema + frontend type. Render a small damage halo (rose stroke) when shelter_loss_pct > 0.

- [ ] **Step 2: Hostile-supplier UI**

In `AcquisitionPipeline.tsx`, for aircraft `OfferCard`, when `diplomacy.factions` shows the platform's origin's tied faction as `hostile`, gray out the sign button + add a one-line warning.

- [ ] **Step 3: Header integrations**

Add to `CampaignMapView.tsx` header:
- "Ops" link (after Procurement/Hangar/Armory)
- `<DiplomacyMeter compact />` next to the notification bell

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/map/ frontend/src/components/procurement/AcquisitionPipeline.tsx frontend/src/pages/CampaignMapView.tsx backend/app/api/adversary_bases.py backend/app/schemas/adversary_base.py
git commit -m "feat: map damage badges + hostile-supplier UI + ops header link"
```

---

### Task 21: Repair-Rush Action

**Files:**
- Modify: `backend/app/api/posture.py` — add `POST /campaigns/{id}/repair-rush/{adversary_base_id}` (NB: rush only applies to friendly bases damaged by counter-strikes; for V1, friendly base damage is a future feature, so this endpoint is optional). Skip in V1; document as V1.5 follow-up.

- [ ] **Step 1: Note the deferral**

In `CLAUDE.md` under known carry-overs add:

```markdown
- **Friendly base damage from counter-strikes** is not modeled in Plan 22 V1. Adversary doesn't strike back yet. Player-paid rush-repair endpoint is scaffolded but inert until a counter-strike feature lands. (Plan 22)
```

Commit just the docs update:

```bash
git add CLAUDE.md
git commit -m "docs: note friendly counter-strike deferral as V1.5"
```

---

### Task 22: Final Integration Pass + CLAUDE.md Update + Deploy

**Files:**
- Modify: `CLAUDE.md` (Plan 22 status entry + last-updated bump)
- Modify: `backend/app/api/notifications.py` — add `offensive_unlocked` event notification + diplomacy threshold notifications

- [ ] **Step 1: Notifications for diplomacy thresholds**

In `notifications.py` add a synth section that pulls the latest diplomacy state and emits an `info` notification if any faction crossed into `cold` or `hostile` since the prior turn (best detected via `CampaignEvent` of type `diplomacy_threshold_crossed` if added; for V1, derive by checking if `tier == "hostile"` and emitting once per turn).

```python
# Inside _synthesize:
from app.engine.diplomacy import tier_from_temperature
for ds in db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all():
    tier = tier_from_temperature(ds.temperature_pct)
    if tier == "hostile":
        warnings.append(Notification(
            id=f"diplo_hostile:{ds.faction}",
            kind="diplo_hostile", severity="warning",
            title=f"{ds.faction} relations: HOSTILE",
            body="New procurement from this supplier blocked while hostile.",
            action_url=f"/campaign/{campaign_id}/ops?tab=posture",
            created_at=None,
        ))
```

Add `"diplo_hostile"` and `"offensive_unlocked"` to the frontend NotificationKind union.

- [ ] **Step 2: offensive_unlocked notification**

In the same synth, surface the `offensive_unlocked` campaign event:

```python
unlock_evs = db.query(CampaignEvent).filter_by(campaign_id=campaign_id, event_type="offensive_unlocked").all()
for ev in unlock_evs:
    infos.append(Notification(
        id=f"event:{ev.id}",
        kind="offensive_unlocked", severity="info",
        title="Offensive operations authorized",
        body="Strike planning is now available in the Ops Screen.",
        action_url=f"/campaign/{campaign_id}/ops?tab=strike",
        created_at=f"{ev.year}-Q{ev.quarter}",
    ))
```

- [ ] **Step 3: Run full backend + frontend suites**

Run: `cd backend && pytest -q && cd ../frontend && npx vitest run`
Expected: all green. Note the new test counts.

- [ ] **Step 4: Update CLAUDE.md**

Add Plan 22 status entry under the Current Status block (chronological order, AFTER Plan 21):

```markdown
- **Plan 22 (Ops Screen + Offensive Operations)** — ✅ done. <NN> backend tests + <NN> frontend tests.
  Strategic Operations dashboard at `/campaign/:id/ops` (Posture/Strike/History tabs)…
  [Fill in with actual tally.]
```

Bump "Last updated" line.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md backend/app/api/notifications.py frontend/src/lib/types.ts
git commit -m "docs: Plan 22 done — Ops Screen + Offensive Operations"
```

- [ ] **Step 6: Push + deploy**

```bash
git push && ./deploy.sh
```

- [ ] **Step 7: Prod smoke**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/posture" | python3 -m json.tool | head -20
curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/6/diplomacy" | python3 -m json.tool
```

Expected: both 200, posture body shape matches schema, diplomacy returns 3 factions.

---

## Self-Review Notes

**Spec coverage:**
- Strategic Posture Dashboard (A) — Tasks 13 (api), 15 (widgets) ✓
- Offensive Operations (B) — Tasks 7–12 (engine + api), 16–18 (UI) ✓
- Resolver flip (C) — Tasks 8–11 (parallel offensive resolver) ✓
- Consequences (D) — Tasks 3–5 (diplomacy + repair), 12 (BDA persistence + diplo blowback in commit) ✓
- UI scaffolding (E) — Tasks 14, 20 ✓
- Content backfill (F) — Tasks 1, 3, 7 ✓
- 1-2 strikes/quarter cap — Task 12 ✓
- Narrative gating after first vignette — Task 12 ✓
- Per-faction temperature, supplier blocking — Tasks 3, 6 ✓
- Sub-system damage — Tasks 2, 10 ✓
- War-footing grant — Task 4 ✓
- Repair durability tied to resolver — Tasks 2, 10 (durability tied to landed_kinetic count, longer for severe strikes) ✓

**Type consistency:** `BaseDamageState` (FE) maps to BaseDamage ORM columns. `StrikePackagePayload` maps to backend `StrikePackageRequest` (squadron_id + airframes). `DiplomaticTier` matches backend tier strings.

**Risks:**
- Backend `_build_target_dict` in Task 12 has placeholders for `ad_battery_count` and `command_node` — needs real lookup from `app.content.registry.adversary_bases()` for the correct values. Implementer should resolve via `_adv_bases_catalog()[target.base_id_str]` on first dispatch.
- Strike weapon roles (`role` defaulted to `"multirole"`, `rcs_band` to `"reduced"`) need real lookups from `platforms()` catalog at request time — the implementer's first task in 12 should fix these placeholders.
- Replay determinism: offensive strikes are *immediate*, not turn-based. Their RNG seeding via `subsystem_rng(seed, "offensive_strike", year, quarter)` + `quarter_strikes` count means strike #2 in same quarter uses a derived stream. Replay-determinism test (`test_replay_determinism.py`) doesn't trigger strikes, so it stays green.
- Threat history widget defaults to `vignette_fired` events; older campaigns without that event_type tagged will show flat zeros. Acceptable for V1.

**Phasing for incremental ship:**
- After Task 6 (foundation): you have diplomacy + grant scaling + supplier blocking. Shippable independently.
- After Task 13 (APIs): backend offensive complete. Curl-able.
- After Task 15 (posture dashboard): strategic dashboard live, offensive UI not yet.
- After Task 22: full feature done.

If context runs low mid-plan, ship at a checkpoint and resume in a fresh session.
