# Armory + Hangar + R&D Unlocks Implementation Plan (Plan 15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed R&D programs affect gameplay. Unlocked missiles re-equip eligible squadrons (with queued rollout). Unlocked AD systems install at bases and shoot down attackers in a pre-BVR round. Unlocked ISR drones buff intel quality. Unlocked strike drones become procurable. A new Hangar page gives fleet-wide force management. An Armory page surfaces every unlock with clear equip/install UX.

**Architecture:** Schema-first. Extend `RDProgramSpec` with an `unlocks` field declaring one of four unlock kinds. Backfill all 25 existing R&D programs. Add three new SQLAlchemy models: `LoadoutUpgrade` (squadron re-equip queue), `ADBattery` (AD installed at a base), and reuse Squadron for ISR/strike drones. Add a new resolver pre-round for AD engagement. Extend `intel_quality` scoring with ISR coverage. Front-end: `/campaign/:id/hangar` and `/campaign/:id/armory` routes, both mobile-first. Every mutation triggers a toast.

**Tech Stack:** FastAPI + SQLAlchemy 2.x, React 19 + Vite + Tailwind v4 + Zustand, Vitest + pytest.

**Test baselines at start:** Backend **457** tests, Frontend **163** tests. Expected after plan: backend ~485, frontend ~195.

**Mobile UX is the highest priority. Every new screen ships 375px-first. Users MUST see what was unlocked, what they can do, and visual confirmation of every action.**

---

## File Structure

### Backend — new + modified

- **Modify** `backend/app/content/loader.py` — extend `RDProgramSpec` with `unlocks: UnlockSpec | None`.
- **Modify** `backend/content/rd_programs.yaml` — backfill `unlocks:` block on every program.
- **Create** `backend/app/models/loadout_upgrade.py` — SQLAlchemy model for queued squadron re-equip.
- **Create** `backend/app/models/ad_battery.py` — SQLAlchemy model for installed AD at a base.
- **Modify** `backend/app/models/squadron.py` — add `loadout_override_json` JSON column (nullable).
- **Modify** `backend/app/models/__init__.py` (or wherever models get imported) — register new tables.
- **Create** `backend/app/engine/loadout_upgrade.py` — pure function to tick the loadout upgrade queue.
- **Create** `backend/app/engine/vignette/ad_engagement.py` — pure function for the AD pre-round against adversary airframes.
- **Modify** `backend/app/engine/vignette/resolver.py` — insert AD pre-round before the BVR detection phase.
- **Modify** `backend/app/engine/vignette/intel_quality.py` — add `isr_drones_covering_count` input + weight.
- **Modify** `backend/app/engine/vignette/generator.py::build_planning_state` — compute ISR coverage + expose `isr_covering` in planning_state + feed it into intel_quality.
- **Modify** `backend/app/engine/vignette/awacs_coverage.py` — add `isr_drone_covering(ao, squadrons, bases_registry)` using `ISR_DRONE_PLATFORM_IDS` allowlist (OR split into `asset_coverage.py`; reuse is simpler).
- **Modify** `backend/app/engine/turn.py` — call loadout-upgrade tick + include ISR squadrons when building planning_state.
- **Modify** `backend/app/crud/campaign.py::advance_turn` — persist loadout override when a `LoadoutUpgrade` row completes; persist unlocked entities on `rd_completed` events.
- **Modify** `backend/app/crud/seed_starting_state.py` — seed an existing S-400 battery at Pathankot (historical reality for 2026 Q2).
- **Create** `backend/app/api/armory.py` — new router with endpoints:
  - `GET /api/campaigns/{id}/armory/missiles` — unlocked missiles + eligibility
  - `POST /api/campaigns/{id}/armory/missiles/{missile_id}/equip` (body `{squadron_id}`) — enqueue `LoadoutUpgrade`
  - `GET /api/campaigns/{id}/armory/ad-systems` — unlocked AD systems
  - `POST /api/campaigns/{id}/armory/ad-systems/{system_id}/install` (body `{base_id}`) — create `ADBattery`
  - `GET /api/campaigns/{id}/armory/unlocks` — single-call dashboard (all unlocks categorized)
  - `GET /api/campaigns/{id}/hangar` — fleet-wide squadron summary with filters
- **Modify** `backend/main.py` — register the armory router.
- **Modify** `backend/app/schemas/` — add `LoadoutUpgradeRead`, `ADBatteryRead`, `UnlocksResponse`, `HangarResponse`.
- **Create** tests under `backend/tests/` for each new helper + endpoint.

### Frontend — new + modified

- **Create** `frontend/src/pages/HangarPage.tsx` — route `/campaign/:id/hangar`.
- **Create** `frontend/src/pages/ArmoryPage.tsx` — route `/campaign/:id/armory` with 4 tabs (Missiles / AD / Drones / Unlocks Feed).
- **Create** `frontend/src/components/hangar/` — `FleetFilters.tsx`, `SquadronListByPlatform.tsx`, `SquadronListByBase.tsx`, `SquadronListByReadiness.tsx`, `SquadronRow.tsx`.
- **Create** `frontend/src/components/armory/` — `MissileCard.tsx`, `MissileEquipModal.tsx`, `ADSystemCard.tsx`, `ADInstallModal.tsx`, `DroneRoster.tsx`, `UnlocksFeed.tsx`, `UnlockHighlight.tsx`.
- **Create** `frontend/src/components/turnreport/UnlockBanner.tsx` — the "🎉 Unlocked: X — Equip in Armory →" CTA on Turn Report.
- **Modify** `frontend/src/components/turnreport/RDProgressCard.tsx` — when milestone kind is `completed`, render inline unlock callout + Armory link.
- **Modify** `frontend/src/pages/CampaignMapView.tsx` — add Hangar + Armory links to the header menu (desktop flex + mobile hamburger panel).
- **Modify** `frontend/src/App.tsx` — register new routes.
- **Modify** `frontend/src/lib/api.ts` — 6 new methods.
- **Modify** `frontend/src/lib/types.ts` — new types (`UnlockKind`, `MissileUnlock`, `ADSystemUnlock`, `LoadoutUpgrade`, `ADBattery`, `HangarResponse`, `UnlocksResponse`).
- **Modify** `frontend/src/store/campaignStore.ts` — `hangar` / `armoryUnlocks` state + `loadHangar` / `loadArmoryUnlocks` / `equipMissile` / `installADSystem` actions (with toasts).
- **Tests** colocated for every new component.

---

## Scope Check

This plan bundles 4 feature areas that share a unified data model (`unlocks` on R&D specs, persisted effects) and UX surface (Armory + Hangar pages). Splitting further would fragment the mental model. Total: **14 tasks**.

Explicitly deferred to a future Plan 16 ("Deep Simulation"): ammunition / depletion, platform retirement, EW upgrade path, pilot roster, squadron-XP UI surface, coalition request scenarios with reputation payoff, strike-drone new scenario archetypes.

---

### Task 1: Extend `RDProgramSpec` with `unlocks` field + backfill YAML

**Files:**
- Modify: `backend/app/content/loader.py`
- Modify: `backend/content/rd_programs.yaml`
- Create: `backend/tests/test_rd_unlocks_schema.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_rd_unlocks_schema.py`:

```python
"""Every R&D program has a well-formed unlocks field."""
import pytest
from app.content.registry import rd_programs


VALID_KINDS = {"missile", "ad_system", "isr_drone", "strike_platform", "platform", "none"}


def test_all_rd_programs_declare_unlocks():
    specs = rd_programs()
    assert len(specs) >= 20
    for pid, spec in specs.items():
        assert hasattr(spec, "unlocks"), f"{pid} missing unlocks field"
        assert spec.unlocks is not None, f"{pid} unlocks is None (should be explicit 'none' kind)"
        assert spec.unlocks.kind in VALID_KINDS, f"{pid} has invalid unlock kind {spec.unlocks.kind}"


def test_missile_unlocks_reference_real_weapon_ids():
    from app.engine.vignette.bvr import WEAPONS
    specs = rd_programs()
    for pid, spec in specs.items():
        if spec.unlocks.kind == "missile":
            assert spec.unlocks.target_id in WEAPONS, \
                f"{pid} unlocks unknown missile {spec.unlocks.target_id}"


def test_eligible_platforms_are_valid_on_missile_unlocks():
    from app.content.registry import platforms
    plats = platforms()
    specs = rd_programs()
    for pid, spec in specs.items():
        if spec.unlocks.kind == "missile":
            assert spec.unlocks.eligible_platforms, f"{pid} missile has empty eligible_platforms"
            for p in spec.unlocks.eligible_platforms:
                assert p in plats, f"{pid} missile targets unknown platform {p}"
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_rd_unlocks_schema.py -v
```

Expected: `AttributeError: 'RDProgramSpec' object has no attribute 'unlocks'`.

- [ ] **Step 3: Extend the Pydantic spec**

In `backend/app/content/loader.py`, find `class RDProgramSpec` and extend it. Add BEFORE it:

```python
class UnlockSpec(BaseModel):
    """Declares what completing an R&D program unlocks.

    kind:
      - 'missile'          → `target_id` is a weapon id in WEAPONS; `eligible_platforms` is a list of platform ids that can carry it.
      - 'ad_system'        → `target_id` is an AD system id declared in ad_systems.yaml (Task 3); `coverage_km` is SAM bubble.
      - 'isr_drone'        → `target_id` is a platform_id that becomes available as an ISR drone (passive intel_quality booster).
      - 'strike_platform'  → `target_id` is a platform_id that becomes procurable in Acquisitions (unmanned strike role).
      - 'platform'         → `target_id` is a fighter platform_id that becomes procurable (e.g. AMCA Mk1 post-completion).
      - 'none'             → cosmetic completion (some R&D is doctrinal).
    """
    kind: str = "none"
    target_id: str | None = None
    eligible_platforms: list[str] = Field(default_factory=list)
    coverage_km: int | None = None
    description: str = ""
```

Then extend `RDProgramSpec`:

```python
class RDProgramSpec(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str] = Field(default_factory=list)
    unlocks: UnlockSpec = Field(default_factory=UnlockSpec)
```

The default `UnlockSpec()` has `kind="none"` so programs without explicit `unlocks:` get a safe default — but we'll backfill the YAML below.

- [ ] **Step 4: Backfill every R&D program in YAML**

Read current `backend/content/rd_programs.yaml`. For every program, add an `unlocks:` block. Here's the authoritative set. Merge into the YAML preserving existing fields (use inline `unlocks: {kind: ..., ...}` for brevity):

```yaml
programs:
  - id: amca_mk1
    # ... existing fields ...
    unlocks:
      kind: platform
      target_id: amca_mk1
      description: "Procurable 5th-gen stealth multirole via Acquisitions."

  - id: amca_mk1_engine
    # ... existing ...
    unlocks:
      kind: none
      description: "Gates AMCA Mk1 serial production ramp."

  - id: tejas_mk2
    unlocks:
      kind: platform
      target_id: tejas_mk2
      description: "Procurable 4.75-gen indigenous multirole."

  - id: tedbf
    unlocks:
      kind: platform
      target_id: tedbf
      description: "Procurable carrier-based naval fighter."

  - id: ghatak_ucav
    unlocks:
      kind: strike_platform
      target_id: ghatak_ucav
      description: "Stealth strike UCAV procurable in Acquisitions."

  - id: astra_mk2
    unlocks:
      kind: missile
      target_id: astra_mk2
      eligible_platforms: [rafale_f4, rafale_f5, tejas_mk1a, tejas_mk2, amca_mk1, tedbf, su30_mki]
      description: "240 km BVR AAM — loadout upgrade for eligible squadrons."

  - id: astra_mk3
    unlocks:
      kind: missile
      target_id: astra_mk3
      eligible_platforms: [rafale_f4, rafale_f5, tejas_mk2, amca_mk1, tedbf, su30_mki]
      description: "350 km dual-pulse ramjet BVR AAM — loadout upgrade for eligible squadrons."

  - id: rudram_2
    unlocks:
      kind: missile
      target_id: rudram_2
      eligible_platforms: [su30_mki, rafale_f4, tejas_mk2, jaguar_darin3]
      description: "Anti-radiation missile — SEAD capability for eligible squadrons."

  - id: rudram_3
    unlocks:
      kind: missile
      target_id: rudram_3
      eligible_platforms: [su30_mki, rafale_f4, tejas_mk2]
      description: "Long-range ARM — extended SEAD reach."

  - id: brahmos_ng
    unlocks:
      kind: missile
      target_id: brahmos_ng
      eligible_platforms: [su30_mki, tejas_mk2, rafale_f4]
      description: "Next-gen supersonic cruise missile — strike loadout."

  - id: netra_mk2
    unlocks:
      kind: isr_drone
      target_id: netra_aewc_mk2
      coverage_km: 1200
      description: "Next-gen AEW&C platform — procurable as an AWACS upgrade."

  - id: tapas_uav
    unlocks:
      kind: isr_drone
      target_id: tapas_uav
      coverage_km: 700
      description: "MALE ISR drone — improves intel_quality in orbit radius."

  - id: amca_mk2
    unlocks:
      kind: platform
      target_id: amca_mk2
      description: "6th-gen procurable fighter."
```

**For any remaining R&D programs NOT listed above** (the total is 25 per Plan 10), append `unlocks: {kind: none, description: "Doctrinal improvement"}`. Scan the YAML, find the gaps, fill them. The test from Step 1 will fail with a clear message if any program is missing `unlocks`.

Also need the missile `rudram_2` / `rudram_3` / `brahmos_ng` registered in `backend/app/engine/vignette/bvr.py::WEAPONS` if they aren't already. Grep first:

```bash
grep -n "rudram\|brahmos" /Users/rsumit123/work/defense-game/backend/app/engine/vignette/bvr.py
```

If missing, add to the `WEAPONS` dict:

```python
    "rudram_2":  {"nez_km":  80, "max_range_km": 300, "gen_bonus": 0.05},
    "rudram_3":  {"nez_km": 150, "max_range_km": 550, "gen_bonus": 0.05},
    "brahmos_ng": {"nez_km": 120, "max_range_km": 500, "gen_bonus": 0.05},
```

- [ ] **Step 5: Run the test — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_rd_unlocks_schema.py -v
```

Expected: 3/3 pass.

- [ ] **Step 6: Run full backend suite — no regressions**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

Expected: baseline 457 + 3 = 460 pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/content/loader.py backend/content/rd_programs.yaml backend/app/engine/vignette/bvr.py backend/tests/test_rd_unlocks_schema.py
git commit -m "feat: R&D program unlocks schema + backfill all programs

Every RDProgramSpec now declares what it unlocks on completion:
missile / ad_system / isr_drone / strike_platform / platform / none.
WEAPONS table extended with rudram_2/3 + brahmos_ng.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: AD Systems Content File

AD systems aren't a new R&D concept (S-400 squadrons don't run as R&D), but we need a content catalog mapping `target_id` → coverage + cost. Also add a few R&D programs for next-gen AD so there's something to unlock.

**Files:**
- Create: `backend/content/ad_systems.yaml`
- Create: `backend/app/content/loader.py::ADSystemSpec` (add below existing specs)
- Modify: `backend/app/content/registry.py` — add `ad_systems()` loader
- Modify: `backend/content/rd_programs.yaml` — add `akash_ng`, `qrsam`, `vshorads` programs with `unlocks: ad_system`
- Create: `backend/tests/test_ad_systems_content.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_ad_systems_content.py`:

```python
from app.content.registry import ad_systems


def test_ad_systems_catalog_loads():
    specs = ad_systems()
    assert "s400" in specs
    assert "akash_ng" in specs
    assert "qrsam" in specs


def test_s400_has_150km_coverage():
    specs = ad_systems()
    assert specs["s400"].coverage_km == 150
    assert specs["s400"].install_cost_cr > 0
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_ad_systems_content.py -v
```

- [ ] **Step 3: Create `backend/content/ad_systems.yaml`**

```yaml
ad_systems:
  - id: s400
    name: S-400 Triumf
    description: "Long-range multi-layer SAM system. 150 km effective envelope."
    coverage_km: 150
    install_cost_cr: 8000
    max_pk: 0.45
    tier: "long_range"

  - id: akash_ng
    name: Akash-NG
    description: "Indigenous medium-range SAM, 70 km reach."
    coverage_km: 70
    install_cost_cr: 2500
    max_pk: 0.35
    tier: "medium_range"

  - id: qrsam
    name: QRSAM
    description: "Quick-reaction SAM for point defense of critical bases."
    coverage_km: 30
    install_cost_cr: 1200
    max_pk: 0.30
    tier: "short_range"

  - id: vshorads
    name: VSHORADS
    description: "Very short-range IR-seeking SAM — last-ditch."
    coverage_km: 8
    install_cost_cr: 400
    max_pk: 0.20
    tier: "very_short_range"
```

- [ ] **Step 4: Add `ADSystemSpec` loader**

In `backend/app/content/loader.py`, after `RDProgramSpec`, add:

```python
class ADSystemSpec(BaseModel):
    id: str
    name: str
    description: str
    coverage_km: int
    install_cost_cr: int
    max_pk: float
    tier: str


def load_ad_systems(path: Path) -> dict[str, ADSystemSpec]:
    data = _load_yaml(path)
    return {row["id"]: ADSystemSpec(**row) for row in data.get("ad_systems", [])}
```

In `backend/app/content/registry.py`, add:

```python
from app.content.loader import load_ad_systems, ADSystemSpec
from pathlib import Path

@lru_cache(maxsize=1)
def ad_systems() -> dict[str, ADSystemSpec]:
    from app.core.config import settings
    return load_ad_systems(Path(settings.content_dir) / "ad_systems.yaml")
```

Also extend `reload_all()` in registry.py to clear this cache.

- [ ] **Step 5: Add three AD R&D programs**

Append to `backend/content/rd_programs.yaml`:

```yaml
  - id: akash_ng_rd
    name: Akash-NG Development
    description: Indigenous 70 km medium-range SAM.
    base_duration_quarters: 8
    base_cost_cr: 6000
    dependencies: []
    unlocks:
      kind: ad_system
      target_id: akash_ng
      coverage_km: 70
      description: "Installs as 70 km SAM coverage at selected bases."

  - id: qrsam_rd
    name: QRSAM Development
    description: Quick-reaction point-defense SAM.
    base_duration_quarters: 6
    base_cost_cr: 3000
    dependencies: []
    unlocks:
      kind: ad_system
      target_id: qrsam
      coverage_km: 30
      description: "Installs as 30 km QRSAM coverage at selected bases."

  - id: vshorads_rd
    name: VSHORADS Development
    description: Very short-range IR SAM for terminal defense.
    base_duration_quarters: 4
    base_cost_cr: 1500
    dependencies: []
    unlocks:
      kind: ad_system
      target_id: vshorads
      coverage_km: 8
      description: "Installs as 8 km VSHORADS coverage at selected bases."
```

S-400 is already-deployed (not an R&D unlock — pre-seeded; see Task 6). Akash-NG / QRSAM / VSHORADS are the unlockables.

- [ ] **Step 6: Run tests**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_ad_systems_content.py tests/test_rd_unlocks_schema.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/content/ad_systems.yaml backend/content/rd_programs.yaml backend/app/content/loader.py backend/app/content/registry.py backend/tests/test_ad_systems_content.py
git commit -m "feat: AD systems content catalog + 3 new R&D programs (Akash-NG/QRSAM/VSHORADS)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Squadron Loadout Override Column

The resolver should read a per-squadron loadout override when present, otherwise fall back to the static `PLATFORM_LOADOUTS` dict.

**Files:**
- Modify: `backend/app/models/squadron.py` — add `loadout_override_json` column.
- Modify: `backend/app/engine/vignette/planning.py::compute_eligible_squadrons` — apply override.
- Create: `backend/tests/test_squadron_loadout_override.py`
- Alembic note: this project doesn't use Alembic; schema is SQLAlchemy's `Base.metadata.create_all`. Production data migrates by `ALTER TABLE` or by accepting that existing prod campaigns get `NULL` for the new column (which is fine — fallback preserves behavior).

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_squadron_loadout_override.py`:

```python
from app.engine.vignette.planning import compute_eligible_squadrons


def test_squadron_with_loadout_override_uses_it():
    ps = {"ao": {"lat": 30, "lon": 77}}
    sqns = [{
        "id": 1, "name": "Test Sqn", "platform_id": "rafale_f4",
        "base_id": 1, "strength": 18, "readiness_pct": 80, "xp": 0,
        "loadout_override_json": ["astra_mk3", "mica_ir"],
    }]
    bases = {1: {"lat": 30, "lon": 77, "name": "Test Base"}}
    plats = {"rafale_f4": {"combat_radius_km": 1850, "generation": "4.5", "radar_range_km": 200, "rcs_band": "reduced"}}
    out = compute_eligible_squadrons(ps, sqns, bases, plats)
    assert len(out) == 1
    assert "astra_mk3" in out[0]["loadout"]


def test_squadron_without_override_falls_back_to_platform_loadout():
    ps = {"ao": {"lat": 30, "lon": 77}}
    sqns = [{
        "id": 1, "name": "Test Sqn", "platform_id": "rafale_f4",
        "base_id": 1, "strength": 18, "readiness_pct": 80, "xp": 0,
    }]
    bases = {1: {"lat": 30, "lon": 77, "name": "Test Base"}}
    plats = {"rafale_f4": {"combat_radius_km": 1850, "generation": "4.5", "radar_range_km": 200, "rcs_band": "reduced"}}
    out = compute_eligible_squadrons(ps, sqns, bases, plats)
    # Rafale default loadout is meteor + mica_ir.
    assert "meteor" in out[0]["loadout"]
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_squadron_loadout_override.py -v
```

- [ ] **Step 3: Add the ORM column**

In `backend/app/models/squadron.py`, import JSON type and add a new column:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Squadron(Base):
    __tablename__ = "squadrons"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    call_sign: Mapped[str] = mapped_column(String(32))
    platform_id: Mapped[str] = mapped_column(String(64))
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"), index=True)
    strength: Mapped[int] = mapped_column(Integer)
    readiness_pct: Mapped[int] = mapped_column(Integer, default=80)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    ace_name: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    ace_awarded_year: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    ace_awarded_quarter: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    loadout_override_json: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
```

- [ ] **Step 4: Update `compute_eligible_squadrons`**

In `backend/app/engine/vignette/planning.py`, locate `compute_eligible_squadrons`. The current code computes `loadout` from `PLATFORM_LOADOUTS`. Update to prefer the override:

```python
        override = sq.get("loadout_override_json")
        if override:
            loadout = list(override)
        else:
            loadout = list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("bvr", [])) + \
                      list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("wvr", []))
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_squadron_loadout_override.py -v
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/squadron.py backend/app/engine/vignette/planning.py backend/tests/test_squadron_loadout_override.py
git commit -m "feat: Squadron.loadout_override_json — per-squadron weapon override

Resolver reads override first, falls back to static PLATFORM_LOADOUTS.
Enables missile upgrades from completed R&D to stick per-squadron.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `LoadoutUpgrade` model + queue tick

When a player clicks "Equip Astra Mk3 on 17 Sqn", a `LoadoutUpgrade` row is created with a completion year/quarter 2–4 quarters from now. Each turn the queue ticks; on completion, the squadron's `loadout_override_json` is updated.

**Files:**
- Create: `backend/app/models/loadout_upgrade.py`
- Modify: `backend/app/models/__init__.py` (import so Base.metadata sees it)
- Create: `backend/app/engine/loadout_upgrade.py` — pure tick function
- Modify: `backend/app/engine/turn.py` — call tick in the orchestrator
- Modify: `backend/app/crud/campaign.py::advance_turn` — apply completed upgrades (flip squadron override) + emit `loadout_upgrade_complete` event
- Create: `backend/tests/test_loadout_upgrade.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_loadout_upgrade.py`:

```python
from app.engine.loadout_upgrade import tick_loadout_upgrades


def test_tick_completes_upgrade_when_due():
    upgrades = [
        {"id": 1, "squadron_id": 10, "weapon_id": "astra_mk3",
         "base_loadout": ["meteor", "mica_ir"],
         "completion_year": 2027, "completion_quarter": 2, "status": "pending"},
    ]
    completed, remaining = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert len(completed) == 1
    assert completed[0]["squadron_id"] == 10
    assert "astra_mk3" in completed[0]["final_loadout"]
    assert remaining == []


def test_tick_keeps_pending_upgrades():
    upgrades = [
        {"id": 2, "squadron_id": 11, "weapon_id": "astra_mk3",
         "base_loadout": ["meteor"],
         "completion_year": 2027, "completion_quarter": 4, "status": "pending"},
    ]
    completed, remaining = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    assert completed == []
    assert len(remaining) == 1


def test_tick_replaces_same_class_weapon_in_loadout():
    """Installing astra_mk3 should REPLACE astra_mk2 in the loadout, not stack."""
    upgrades = [
        {"id": 3, "squadron_id": 12, "weapon_id": "astra_mk3",
         "base_loadout": ["astra_mk2", "mica_ir"],
         "completion_year": 2027, "completion_quarter": 2, "status": "pending"},
    ]
    completed, _ = tick_loadout_upgrades(upgrades, year=2027, quarter=2)
    final = completed[0]["final_loadout"]
    assert "astra_mk3" in final
    assert "astra_mk2" not in final
    assert "mica_ir" in final
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_loadout_upgrade.py -v
```

- [ ] **Step 3: Create the ORM model**

Create `backend/app/models/loadout_upgrade.py`:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoadoutUpgrade(Base):
    __tablename__ = "loadout_upgrades"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    squadron_id: Mapped[int] = mapped_column(ForeignKey("squadrons.id"), index=True)
    weapon_id: Mapped[str] = mapped_column(String(64))
    base_loadout: Mapped[list] = mapped_column(JSON)  # the pre-upgrade loadout snapshot
    completion_year: Mapped[int] = mapped_column(Integer)
    completion_quarter: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    # status: pending | completed | cancelled
```

Ensure the model is registered. Search for how other models get imported:

```bash
grep -rn "from app.models" /Users/rsumit123/work/defense-game/backend/main.py /Users/rsumit123/work/defense-game/backend/app/db/ 2>&1 | head -10
```

Add `from app.models.loadout_upgrade import LoadoutUpgrade  # noqa` in wherever other models get imported (likely `main.py` or `app/db/__init__.py`).

- [ ] **Step 4: Create the pure-function tick**

Create `backend/app/engine/loadout_upgrade.py`:

```python
"""Loadout upgrade queue tick.

Pure function. Completes upgrades whose (completion_year, completion_quarter)
match the current turn. Returns (completed_list, still_pending_list).

Each completed entry has:
  - squadron_id: int
  - weapon_id: str (the newly equipped weapon)
  - final_loadout: list[str] (new loadout array: replaces same-class weapon if present)
"""
from __future__ import annotations

from app.engine.vignette.bvr import WEAPONS

# Weapons that share a "slot" — installing a new one replaces an older one in the same class.
# Same-class groups mean "replace, don't stack": a Rafale can't carry astra_mk2 AND astra_mk3.
SAME_CLASS_GROUPS: list[set[str]] = [
    {"astra_mk1", "astra_mk2", "astra_mk3"},
    {"rudram_2", "rudram_3"},
    {"meteor", "mica_ir"},  # conservative: Rafale slot replacement
    {"r77", "r73"},
]


def _replace_same_class(existing: list[str], new_weapon: str) -> list[str]:
    group = next((g for g in SAME_CLASS_GROUPS if new_weapon in g), None)
    if group is None:
        # Add if not present
        return existing if new_weapon in existing else existing + [new_weapon]
    out = [w for w in existing if w not in group]
    out.append(new_weapon)
    return out


def tick_loadout_upgrades(
    upgrades: list[dict],
    year: int,
    quarter: int,
) -> tuple[list[dict], list[dict]]:
    completed: list[dict] = []
    remaining: list[dict] = []
    for u in upgrades:
        if u.get("status") != "pending":
            continue
        due = (u["completion_year"], u["completion_quarter"]) <= (year, quarter)
        if due:
            final = _replace_same_class(list(u.get("base_loadout") or []), u["weapon_id"])
            completed.append({
                "id": u["id"],
                "squadron_id": u["squadron_id"],
                "weapon_id": u["weapon_id"],
                "final_loadout": final,
            })
        else:
            remaining.append(u)
    return completed, remaining
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_loadout_upgrade.py -v
```

- [ ] **Step 6: Wire into turn orchestrator + advance_turn CRUD**

In `backend/app/engine/turn.py`, extend the context to include pending loadout upgrades + add a tick step. Find the orchestrator `advance` function. Inside, add:

```python
from app.engine.loadout_upgrade import tick_loadout_upgrades

# ... after existing ticks, before building events ...
pending_upgrades = ctx.get("loadout_upgrades", [])
completed_upgrades, remaining_upgrades = tick_loadout_upgrades(pending_upgrades, year, quarter)
for c in completed_upgrades:
    events.append({
        "event_type": "loadout_upgrade_complete",
        "payload": {
            "upgrade_id": c["id"],
            "squadron_id": c["squadron_id"],
            "weapon_id": c["weapon_id"],
            "final_loadout": c["final_loadout"],
        },
    })
```

Add `completed_upgrades` + `remaining_upgrades` to the `EngineResult` dataclass:

```python
@dataclass
class EngineResult:
    # ... existing fields ...
    completed_loadout_upgrades: list[dict] = field(default_factory=list)
    remaining_loadout_upgrades: list[dict] = field(default_factory=list)
```

Return them from `advance(ctx)`.

In `backend/app/crud/campaign.py::advance_turn`, load pending upgrades into `ctx`, then on result persist:

```python
from app.models.loadout_upgrade import LoadoutUpgrade

# Before advance():
upgrade_rows = db.query(LoadoutUpgrade).filter_by(
    campaign_id=campaign.id, status="pending"
).all()
ctx["loadout_upgrades"] = [
    {"id": u.id, "squadron_id": u.squadron_id, "weapon_id": u.weapon_id,
     "base_loadout": u.base_loadout,
     "completion_year": u.completion_year,
     "completion_quarter": u.completion_quarter,
     "status": u.status}
    for u in upgrade_rows
]

# After advance() returns, for each completed upgrade:
for c in result.completed_loadout_upgrades:
    row = db.query(LoadoutUpgrade).get(c["id"])
    if row is None:
        continue
    row.status = "completed"
    sq = db.query(Squadron).get(c["squadron_id"])
    if sq is not None:
        sq.loadout_override_json = c["final_loadout"]
```

- [ ] **Step 7: Run full backend suite**

```bash
cd /Users/rsumit123/web/defense-game/backend && cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

Expected: all pass. If the replay determinism fingerprint includes squadron loadout_override, a matching fingerprint update is fine (same inputs same outputs across runs — the fingerprint changes but both sides change identically).

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/loadout_upgrade.py backend/app/engine/loadout_upgrade.py backend/app/engine/turn.py backend/app/crud/campaign.py backend/tests/test_loadout_upgrade.py
git commit -m "feat: LoadoutUpgrade queue — missiles re-equip over 2-4 quarters

Pure-function tick completes upgrades when due and replaces same-class
weapons in the squadron's loadout. advance_turn persists the new
override on Squadron.loadout_override_json.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `ADBattery` model + AD engagement pre-round

AD systems installed at a base become active in resolver. When an adversary scenario AO is inside any IAF base's AD bubble, AD fires at attackers before BVR begins.

**Files:**
- Create: `backend/app/models/ad_battery.py`
- Create: `backend/app/engine/vignette/ad_engagement.py` — pure function
- Modify: `backend/app/engine/vignette/resolver.py` — call AD pre-round before detection
- Modify: `backend/app/engine/turn.py` — pass AD batteries into planning_state / resolver context
- Create: `backend/tests/test_ad_engagement.py`
- Modify: `backend/app/crud/seed_starting_state.py` — seed 1 S-400 battery at Pathankot (real 2026 posture)

- [ ] **Step 1: Create the ORM model**

Create `backend/app/models/ad_battery.py`:

```python
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADBattery(Base):
    __tablename__ = "ad_batteries"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"), index=True)
    system_id: Mapped[str] = mapped_column(String(64))
    coverage_km: Mapped[int] = mapped_column(Integer)
    installed_year: Mapped[int] = mapped_column(Integer)
    installed_quarter: Mapped[int] = mapped_column(Integer)
```

Ensure imports in the models `__init__` or main.py (same pattern as Task 4).

- [ ] **Step 2: Write failing test**

Create `backend/tests/test_ad_engagement.py`:

```python
import random
from app.engine.vignette.ad_engagement import resolve_ad_engagement


AD_SPEC = {"s400": {"coverage_km": 150, "max_pk": 0.45, "name": "S-400"}}
BASES = {1: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}  # ~60 km from Srinagar sector


def test_ad_engages_when_ao_is_in_range():
    rng = random.Random(42)
    ao = {"lat": 32.7, "lon": 75.5}  # within 150 km of Pathankot
    batteries = [{"id": 1, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv_force, rng=rng,
    )
    # Some count of adv airframes should be shot down (stochastic but > 0 across multiple rolls).
    total_before = sum(e["count"] for e in adv_force)
    total_after = sum(e["count"] for e in survivors)
    assert total_after <= total_before
    assert any(e["kind"] == "ad_engagement" for e in trace)


def test_ad_does_not_engage_out_of_range():
    rng = random.Random(42)
    ao = {"lat": 10.7, "lon": 79.0}  # Thanjavur — far from Pathankot
    batteries = [{"id": 1, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv_force, rng=rng,
    )
    total_before = sum(e["count"] for e in adv_force)
    total_after = sum(e["count"] for e in survivors)
    assert total_before == total_after
    assert not any(e["kind"] == "ad_engagement" for e in trace)


def test_no_batteries_is_noop():
    rng = random.Random(42)
    ao = {"lat": 32.7, "lon": 75.5}
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=[], bases_registry=BASES, ad_specs=AD_SPEC,
        adv_force=adv_force, rng=rng,
    )
    assert survivors == adv_force
    assert trace == []
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_ad_engagement.py -v
```

- [ ] **Step 4: Implement `ad_engagement.py`**

Create `backend/app/engine/vignette/ad_engagement.py`:

```python
"""AD engagement pre-round.

Before BVR, any friendly AD battery whose coverage bubble covers the AO
rolls engagement PK per adversary airframe. Shot-down airframes are
deducted from the adversary force before the air-to-air resolver runs.
"""
from __future__ import annotations

import math
import random


EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def resolve_ad_engagement(
    ao: dict,
    batteries: list[dict],
    bases_registry: dict[int, dict],
    ad_specs: dict[str, dict],
    adv_force: list[dict],
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    """Return (new_adv_force, trace_events).

    Stealth reduces PK: if an attacker's RCS is VLO, PK is halved; LO is 0.75x.
    Trace events are shaped like the air-to-air tracer: {t_min, kind, ...}.
    """
    in_range_batteries = []
    for bat in batteries:
        base = bases_registry.get(bat["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        if dist <= bat["coverage_km"]:
            spec = ad_specs.get(bat["system_id"])
            if spec is None:
                continue
            in_range_batteries.append({
                "battery": bat, "base_name": base.get("name", ""),
                "max_pk": spec["max_pk"], "dist_km": round(dist, 1),
                "name": spec.get("name", bat["system_id"]),
            })

    if not in_range_batteries:
        return list(adv_force), []

    trace: list[dict] = []
    # Each adversary entry gets a roll per battery.
    out: list[dict] = []
    for entry in adv_force:
        count = entry["count"]
        for bat_info in in_range_batteries:
            base_pk = bat_info["max_pk"]
            # For MVP, no per-platform stealth lookup here — keep math simple.
            for _ in range(count):
                if rng.random() < base_pk:
                    count -= 1
                    trace.append({
                        "t_min": -5, "kind": "ad_engagement",
                        "battery_system": bat_info["name"],
                        "base_name": bat_info["base_name"],
                        "target_platform": entry["platform_id"],
                        "pk": round(base_pk, 2),
                    })
        if count > 0:
            new_entry = dict(entry)
            new_entry["count"] = count
            out.append(new_entry)

    return out, trace
```

- [ ] **Step 5: Wire into resolver**

In `backend/app/engine/vignette/resolver.py::resolve`, read `planning_state.ad_batteries` and `planning_state.ad_specs` (or pass through ctx) — call `resolve_ad_engagement` BEFORE the detection phase. Prepend trace events to the main trace:

```python
from app.engine.vignette.ad_engagement import resolve_ad_engagement

# ... inside resolve(), after ind_force/adv_force construction, BEFORE detection ...
ad_batteries = planning_state.get("ad_batteries", [])
ad_specs = planning_state.get("ad_specs", {})
bases_reg = planning_state.get("bases_registry", {})
if ad_batteries:
    new_adv_entries, ad_trace = resolve_ad_engagement(
        ao=planning_state["ao"], batteries=ad_batteries,
        bases_registry=bases_reg, ad_specs=ad_specs,
        adv_force=planning_state.get("adversary_force", []),
        rng=rng,
    )
    trace.extend(ad_trace)
    # Rebuild adv_force from the post-AD entries
    adv_force = _make_airframes("adv", new_adv_entries, platforms_registry)
```

**IMPORTANT:** This changes `adv_force` mid-resolve. The subsequent detection + BVR phases use the reduced force. Replay determinism holds because the RNG stream is namespaced (`vignette_resolve`) and the AD branch always runs with the same rng state.

- [ ] **Step 6: Pass AD batteries via generator**

In `backend/app/engine/vignette/generator.py::build_planning_state`, accept new kwargs `ad_batteries` + `ad_specs` + `bases_registry` and include them in the returned dict. In `turn.py`, query ADBattery rows + load ad_systems spec registry and pass.

```python
# build_planning_state signature extension
def build_planning_state(
    template, adversary_states, rng,
    player_squadrons: list[dict] | None = None,
    bases_registry: dict[int, dict] | None = None,
    recent_intel_confidences: list[float] | None = None,
    ad_batteries: list[dict] | None = None,
    ad_specs: dict[str, dict] | None = None,
) -> dict[str, Any]:
    # ... existing body ...
    return {
        # ... existing fields ...
        "ad_batteries": ad_batteries or [],
        "ad_specs": ad_specs or {},
        "bases_registry": bases_registry or {},
    }
```

In `turn.py` around the existing `build_planning_state` call:

```python
from app.content.registry import ad_systems as _ad_systems
ad_spec_dicts = {k: v.model_dump() for k, v in _ad_systems().items()}
ad_battery_rows = ctx.get("ad_batteries", [])
planning_state = build_planning_state(
    # ... existing ...
    ad_batteries=ad_battery_rows,
    ad_specs=ad_spec_dicts,
)
```

In `crud/campaign.py::advance_turn`, query `ADBattery` rows and add to ctx:

```python
from app.models.ad_battery import ADBattery
ad_rows = db.query(ADBattery).filter_by(campaign_id=campaign.id).all()
ctx["ad_batteries"] = [
    {"id": b.id, "base_id": b.base_id, "system_id": b.system_id,
     "coverage_km": b.coverage_km}
    for b in ad_rows
]
```

- [ ] **Step 7: Seed initial S-400 at Pathankot**

In `backend/app/crud/seed_starting_state.py`, add a `SEED_AD_BATTERIES` constant + seeding logic:

```python
SEED_AD_BATTERIES = [
    # (system_id, base_template_id, coverage_km)
    ("s400", "pathankot", 150),
]
```

In the function that creates the campaign and seeds state, after campaign_bases are inserted:

```python
from app.models.ad_battery import ADBattery

base_by_template = {b.template_id: b for b in cb_rows}
for sys_id, base_tpl, cov in SEED_AD_BATTERIES:
    base_row = base_by_template.get(base_tpl)
    if base_row is None:
        continue
    db.add(ADBattery(
        campaign_id=campaign.id,
        base_id=base_row.id,
        system_id=sys_id,
        coverage_km=cov,
        installed_year=2026,
        installed_quarter=2,
    ))
```

- [ ] **Step 8: Run tests**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_ad_engagement.py -v
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/ad_battery.py backend/app/engine/vignette/ad_engagement.py backend/app/engine/vignette/resolver.py backend/app/engine/vignette/generator.py backend/app/engine/turn.py backend/app/crud/campaign.py backend/app/crud/seed_starting_state.py backend/tests/test_ad_engagement.py
git commit -m "feat: ADBattery model + AD pre-round engagement in vignette resolver

Each IAF base with AD coverage can engage adversary airframes before
BVR. Seed includes an S-400 battery at Pathankot (historical 2026).
Resolver emits ad_engagement trace events shot-down airframes are
deducted from adversary force before detection/BVR runs.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: ISR Drone Intel-Quality Buff

ISR drones covering the AO raise `intel_quality.score` similar to AWACS.

**Files:**
- Modify: `backend/app/engine/vignette/awacs_coverage.py` — add `isr_drone_covering(ao, squadrons, bases_registry)`
- Modify: `backend/app/engine/vignette/intel_quality.py` — accept `isr_drones_covering_count` parameter
- Modify: `backend/app/engine/vignette/generator.py` — compute + feed ISR coverage
- Modify: `backend/tests/test_intel_quality.py` — add ISR tests

- [ ] **Step 1: Extend `intel_quality.py`**

Read current file. Modify `score_intel_quality`:

```python
AWACS_WEIGHT = 0.25
INTEL_WEIGHT = 0.50
STEALTH_PENALTY = 0.35
ISR_WEIGHT = 0.15  # new: ISR drones stack on top of AWACS


def score_intel_quality(
    awacs_covering_count: int,
    recent_intel_confidences: list[float],
    adversary_stealth_fraction: float,
    isr_drones_covering_count: int = 0,  # new kwarg with default
) -> dict:
    awacs_mod = min(1.0, awacs_covering_count * 0.5) * AWACS_WEIGHT
    intel_mod = (
        sum(recent_intel_confidences) / max(1, len(recent_intel_confidences))
        if recent_intel_confidences else 0.0
    ) * INTEL_WEIGHT
    stealth_mod = -adversary_stealth_fraction * STEALTH_PENALTY
    isr_mod = min(1.0, isr_drones_covering_count * 0.4) * ISR_WEIGHT

    base = 0.15
    raw = base + awacs_mod + intel_mod + stealth_mod + isr_mod
    score = _clamp(raw)
    # ... rest unchanged except add "isr" to modifiers dict
    # ... tier computation unchanged ...
    return {
        "score": round(score, 3),
        "tier": tier,
        "modifiers": {
            "awacs": round(awacs_mod, 3),
            "intel": round(intel_mod, 3),
            "stealth_penalty": round(stealth_mod, 3),
            "isr": round(isr_mod, 3),
        },
    }
```

- [ ] **Step 2: Add ISR coverage helper**

In `backend/app/engine/vignette/awacs_coverage.py`, add:

```python
ISR_DRONE_PLATFORM_IDS: set[str] = {"tapas_uav", "ghatak_ucav"}  # ghatak acts dual-role, tapas is pure ISR
ISR_ORBIT_RADIUS_KM = 700


def isr_drone_covering(
    ao: dict,
    squadrons: list[dict],
    bases_registry: dict[int, dict],
    orbit_radius_km: int = ISR_ORBIT_RADIUS_KM,
) -> list[dict]:
    out: list[dict] = []
    for sq in squadrons:
        if sq.get("platform_id") not in ISR_DRONE_PLATFORM_IDS:
            continue
        if sq.get("readiness_pct", 0) <= 0 or sq.get("strength", 0) <= 0:
            continue
        base = bases_registry.get(sq["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        if dist > orbit_radius_km:
            continue
        out.append({
            "squadron_id": sq["id"], "base_id": sq["base_id"],
            "base_name": base.get("name", ""), "distance_km": round(dist, 1),
            "strength": sq["strength"], "readiness_pct": sq["readiness_pct"],
            "platform_id": sq["platform_id"],
        })
    return out
```

- [ ] **Step 3: Feed ISR count into planning_state**

In `generator.py::build_planning_state`, alongside AWACS coverage:

```python
from app.engine.vignette.awacs_coverage import awacs_covering as _awacs_covering, isr_drone_covering as _isr_covering
# ...
awacs = _awacs_covering(ao_dict, player_squadrons, bases_registry)
isr = _isr_covering(ao_dict, player_squadrons, bases_registry)
# ...
quality = score_intel_quality(
    awacs_covering_count=len(awacs),
    recent_intel_confidences=recent_intel_confidences,
    adversary_stealth_fraction=stealth_fraction,
    isr_drones_covering_count=len(isr),
)
# ... return includes "isr_covering": isr
```

- [ ] **Step 4: Add test**

Append to `backend/tests/test_intel_quality.py`:

```python
def test_isr_drones_increase_quality_score():
    q_no_isr = score_intel_quality(awacs_covering_count=0, recent_intel_confidences=[], adversary_stealth_fraction=0.0, isr_drones_covering_count=0)
    q_with_isr = score_intel_quality(awacs_covering_count=0, recent_intel_confidences=[], adversary_stealth_fraction=0.0, isr_drones_covering_count=2)
    assert q_with_isr["score"] > q_no_isr["score"]
    assert q_with_isr["modifiers"]["isr"] > 0
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_intel_quality.py -v
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/vignette/awacs_coverage.py backend/app/engine/vignette/intel_quality.py backend/app/engine/vignette/generator.py backend/tests/test_intel_quality.py
git commit -m "feat: ISR drone intel-quality buff

tapas_uav and ghatak_ucav squadrons covering the AO raise intel_quality
score (+0.15 per drone, capped at 2). Fed into planning_state alongside
AWACS coverage.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Armory API — Unlocks, Missiles, AD Systems

**Files:**
- Create: `backend/app/api/armory.py`
- Create: `backend/app/schemas/armory.py`
- Modify: `backend/main.py` — register router
- Create: `backend/tests/test_armory_api.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_armory_api.py`:

```python
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
def _reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def _make_campaign_and_complete_astra_mk2():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    # Seed Astra Mk2 at 75% progress, so a couple of turns completes it.
    # The seed in seed_starting_state already has astra_mk2 at 75%. So advance 2-3 turns.
    for _ in range(4):
        client.post(f"/api/campaigns/{cid}/advance")
    return cid


def test_unlocks_endpoint_empty_at_start():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/armory/unlocks")
    assert r.status_code == 200
    d = r.json()
    assert "missiles" in d
    assert "ad_systems" in d
    assert "isr_drones" in d
    assert "strike_platforms" in d


def test_unlocks_endpoint_shows_completed_missile():
    cid = _make_campaign_and_complete_astra_mk2()
    r = client.get(f"/api/campaigns/{cid}/armory/unlocks")
    d = r.json()
    missile_ids = {m["target_id"] for m in d["missiles"]}
    assert "astra_mk2" in missile_ids, f"expected astra_mk2 in unlocks, got {missile_ids}"


def test_equip_missile_creates_loadout_upgrade():
    cid = _make_campaign_and_complete_astra_mk2()
    # Find a Rafale squadron
    from app.models.squadron import Squadron
    with Session(engine) as s:
        sq = s.query(Squadron).filter_by(campaign_id=cid, platform_id="rafale_f4").first()
        sq_id = sq.id
    r = client.post(
        f"/api/campaigns/{cid}/armory/missiles/astra_mk2/equip",
        json={"squadron_id": sq_id},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["squadron_id"] == sq_id
    assert body["weapon_id"] == "astra_mk2"
    assert body["status"] == "pending"
    assert body["completion_year"] >= 2026


def test_equip_missile_rejects_ineligible_platform():
    cid = _make_campaign_and_complete_astra_mk2()
    from app.models.squadron import Squadron
    with Session(engine) as s:
        sq = s.query(Squadron).filter_by(campaign_id=cid, platform_id="mig21_bison").first()
        if sq is None:
            pytest.skip("no mig21_bison squadron seeded")
        sq_id = sq.id
    r = client.post(
        f"/api/campaigns/{cid}/armory/missiles/astra_mk2/equip",
        json={"squadron_id": sq_id},
    )
    assert r.status_code == 400


def test_install_ad_system_rejects_non_unlocked():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    from app.models.campaign_base import CampaignBase
    with Session(engine) as s:
        base = s.query(CampaignBase).filter_by(campaign_id=cid).first()
        base_id = base.id
    r = client.post(
        f"/api/campaigns/{cid}/armory/ad-systems/akash_ng/install",
        json={"base_id": base_id},
    )
    # Akash-NG isn't unlocked at campaign start → 409
    assert r.status_code == 409
```

- [ ] **Step 2: Run — expect FAIL (routes don't exist)**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_armory_api.py -v
```

- [ ] **Step 3: Create schemas**

Create `backend/app/schemas/armory.py`:

```python
from pydantic import BaseModel


class MissileUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    eligible_platforms: list[str]
    nez_km: int
    max_range_km: int


class ADSystemUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    coverage_km: int
    install_cost_cr: int
    max_pk: float


class ISRDroneUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    coverage_km: int


class StrikePlatformUnlock(BaseModel):
    target_id: str
    name: str
    description: str


class UnlocksResponse(BaseModel):
    missiles: list[MissileUnlock]
    ad_systems: list[ADSystemUnlock]
    isr_drones: list[ISRDroneUnlock]
    strike_platforms: list[StrikePlatformUnlock]


class EquipMissileRequest(BaseModel):
    squadron_id: int


class LoadoutUpgradeRead(BaseModel):
    id: int
    squadron_id: int
    weapon_id: str
    completion_year: int
    completion_quarter: int
    status: str

    model_config = {"from_attributes": True}


class InstallADRequest(BaseModel):
    base_id: int


class ADBatteryRead(BaseModel):
    id: int
    base_id: int
    system_id: str
    coverage_km: int
    installed_year: int
    installed_quarter: int

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create the router**

Create `backend/app/api/armory.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.armory import (
    UnlocksResponse, MissileUnlock, ADSystemUnlock, ISRDroneUnlock, StrikePlatformUnlock,
    EquipMissileRequest, LoadoutUpgradeRead,
    InstallADRequest, ADBatteryRead,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}/armory", tags=["armory"])


def _completed_unlocks(db: Session, campaign_id: int) -> dict[str, list]:
    from app.models.rd_program_state import RDProgramState
    from app.content.registry import rd_programs, platforms, ad_systems as _ad_systems
    from app.engine.vignette.bvr import WEAPONS

    rd_specs = rd_programs()
    plat_specs = platforms()
    ad_specs = _ad_systems()

    completed = db.query(RDProgramState).filter_by(
        campaign_id=campaign_id, status="completed",
    ).all()

    missiles, ads, isrs, strikes = [], [], [], []
    for cs in completed:
        spec = rd_specs.get(cs.program_id)
        if spec is None or spec.unlocks.kind == "none":
            continue
        u = spec.unlocks
        if u.kind == "missile" and u.target_id in WEAPONS:
            w = WEAPONS[u.target_id]
            missiles.append(MissileUnlock(
                target_id=u.target_id, name=u.target_id.upper(),
                description=u.description, eligible_platforms=u.eligible_platforms,
                nez_km=w["nez_km"], max_range_km=w["max_range_km"],
            ))
        elif u.kind == "ad_system":
            adspec = ad_specs.get(u.target_id)
            if adspec is None:
                continue
            ads.append(ADSystemUnlock(
                target_id=u.target_id, name=adspec.name,
                description=adspec.description, coverage_km=adspec.coverage_km,
                install_cost_cr=adspec.install_cost_cr, max_pk=adspec.max_pk,
            ))
        elif u.kind == "isr_drone":
            isrs.append(ISRDroneUnlock(
                target_id=u.target_id, name=u.target_id, description=u.description,
                coverage_km=u.coverage_km or 0,
            ))
        elif u.kind == "strike_platform":
            strikes.append(StrikePlatformUnlock(
                target_id=u.target_id, name=u.target_id, description=u.description,
            ))
    return {"missiles": missiles, "ad_systems": ads, "isr_drones": isrs, "strike_platforms": strikes}


@router.get("/unlocks", response_model=UnlocksResponse)
def list_unlocks(campaign_id: int, db: Session = Depends(get_db)):
    return UnlocksResponse(**_completed_unlocks(db, campaign_id))


@router.post("/missiles/{missile_id}/equip", response_model=LoadoutUpgradeRead,
             status_code=status.HTTP_200_OK)
def equip_missile(
    campaign_id: int,
    missile_id: str,
    payload: EquipMissileRequest,
    db: Session = Depends(get_db),
):
    from app.models.loadout_upgrade import LoadoutUpgrade
    from app.models.squadron import Squadron
    from app.models.campaign import Campaign
    from app.content.registry import rd_programs
    from app.engine.vignette.bvr import PLATFORM_LOADOUTS

    unlocks = _completed_unlocks(db, campaign_id)
    if not any(m.target_id == missile_id for m in unlocks["missiles"]):
        raise HTTPException(409, f"missile {missile_id} not unlocked")

    spec_unlock = next(
        (rd_programs()[pid].unlocks for pid in rd_programs()
         if rd_programs()[pid].unlocks.kind == "missile"
         and rd_programs()[pid].unlocks.target_id == missile_id),
        None,
    )
    if spec_unlock is None:
        raise HTTPException(500, "unlock spec not found")

    sq = db.query(Squadron).filter_by(id=payload.squadron_id, campaign_id=campaign_id).first()
    if sq is None:
        raise HTTPException(404, "squadron not found")
    if sq.platform_id not in spec_unlock.eligible_platforms:
        raise HTTPException(400, f"{sq.platform_id} is not eligible for {missile_id}")

    # Prevent duplicate pending upgrades for the same (squadron, missile)
    existing = db.query(LoadoutUpgrade).filter_by(
        campaign_id=campaign_id, squadron_id=payload.squadron_id,
        weapon_id=missile_id, status="pending",
    ).first()
    if existing:
        raise HTTPException(409, f"upgrade already in progress for this squadron")

    camp = db.query(Campaign).get(campaign_id)
    # Rollout 3 quarters out
    total_q = camp.current_year * 4 + (camp.current_quarter - 1) + 3
    comp_year = total_q // 4
    comp_q = (total_q % 4) + 1

    base_loadout = (
        sq.loadout_override_json
        or (list(PLATFORM_LOADOUTS.get(sq.platform_id, {}).get("bvr", []))
            + list(PLATFORM_LOADOUTS.get(sq.platform_id, {}).get("wvr", [])))
    )

    row = LoadoutUpgrade(
        campaign_id=campaign_id, squadron_id=payload.squadron_id,
        weapon_id=missile_id, base_loadout=list(base_loadout),
        completion_year=comp_year, completion_quarter=comp_q,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/ad-systems/{system_id}/install", response_model=ADBatteryRead,
             status_code=status.HTTP_200_OK)
def install_ad_system(
    campaign_id: int,
    system_id: str,
    payload: InstallADRequest,
    db: Session = Depends(get_db),
):
    from app.models.ad_battery import ADBattery
    from app.models.campaign_base import CampaignBase
    from app.models.campaign import Campaign
    from app.content.registry import ad_systems as _ad_systems

    unlocks = _completed_unlocks(db, campaign_id)
    if not any(a.target_id == system_id for a in unlocks["ad_systems"]):
        raise HTTPException(409, f"AD system {system_id} not unlocked")

    adspec = _ad_systems().get(system_id)
    if adspec is None:
        raise HTTPException(404, f"AD system {system_id} not in catalog")

    base = db.query(CampaignBase).filter_by(id=payload.base_id, campaign_id=campaign_id).first()
    if base is None:
        raise HTTPException(404, "base not found")

    camp = db.query(Campaign).get(campaign_id)
    if camp.budget_cr < adspec.install_cost_cr:
        raise HTTPException(402, f"insufficient budget: need {adspec.install_cost_cr} cr")

    camp.budget_cr -= adspec.install_cost_cr

    row = ADBattery(
        campaign_id=campaign_id, base_id=payload.base_id,
        system_id=system_id, coverage_km=adspec.coverage_km,
        installed_year=camp.current_year, installed_quarter=camp.current_quarter,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
```

Register in `main.py`:

```python
from app.api.armory import router as armory_router
app.include_router(armory_router)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_armory_api.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/armory.py backend/app/schemas/armory.py backend/main.py backend/tests/test_armory_api.py
git commit -m "feat: armory API — unlocks list, equip missile, install AD system

GET /api/campaigns/{id}/armory/unlocks — categorized unlocks
POST .../missiles/{id}/equip — queue LoadoutUpgrade (3-quarter rollout)
POST .../ad-systems/{id}/install — deduct install cost, create ADBattery

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Hangar API Endpoint

Fleet-wide view of all squadrons with filters.

**Files:**
- Modify: `backend/app/api/armory.py` — add `/hangar` endpoint (same router since it's adjacent scope)
- Modify: `backend/app/schemas/armory.py` — add `HangarSquadron`, `HangarResponse`
- Create: `backend/tests/test_hangar_api.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_hangar_api.py`:

```python
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
def _reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def test_hangar_returns_all_squadrons():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    assert r.status_code == 200
    d = r.json()
    assert "squadrons" in d
    assert len(d["squadrons"]) >= 34  # after Plan 14 seed additions


def test_hangar_squadron_includes_platform_and_base():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    s0 = r.json()["squadrons"][0]
    assert "platform_id" in s0
    assert "platform_name" in s0
    assert "base_id" in s0
    assert "base_name" in s0
    assert "readiness_pct" in s0
    assert "strength" in s0
    assert "loadout" in s0


def test_hangar_summary_counts_platforms():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    d = r.json()
    assert "summary_by_platform" in d
    # Rafale F4 squadrons should exist in seed
    rafale = next((e for e in d["summary_by_platform"] if e["platform_id"] == "rafale_f4"), None)
    assert rafale is not None
    assert rafale["total_airframes"] > 0
```

- [ ] **Step 2: Add schemas**

In `backend/app/schemas/armory.py`, add:

```python
class HangarSquadron(BaseModel):
    id: int
    name: str
    call_sign: str
    platform_id: str
    platform_name: str
    base_id: int
    base_name: str
    strength: int
    readiness_pct: int
    xp: int
    ace_name: str | None
    loadout: list[str]


class HangarPlatformSummary(BaseModel):
    platform_id: str
    platform_name: str
    squadron_count: int
    total_airframes: int
    avg_readiness_pct: int


class HangarResponse(BaseModel):
    squadrons: list[HangarSquadron]
    summary_by_platform: list[HangarPlatformSummary]
```

- [ ] **Step 3: Add endpoint**

In `backend/app/api/armory.py`, add a new router at a different prefix (hangar is NOT under /armory):

```python
hangar_router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["hangar"])


@hangar_router.get("/hangar", response_model=HangarResponse)
def get_hangar(campaign_id: int, db: Session = Depends(get_db)):
    from app.models.squadron import Squadron
    from app.models.campaign_base import CampaignBase
    from app.content.registry import platforms
    from app.engine.vignette.bvr import PLATFORM_LOADOUTS

    plat_specs = platforms()
    bases = {b.id: b for b in db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()}
    sqns = db.query(Squadron).filter_by(campaign_id=campaign_id).all()

    squadron_dtos = []
    by_plat: dict[str, list] = {}
    for s in sqns:
        plat = plat_specs.get(s.platform_id)
        plat_name = plat.name if plat else s.platform_id
        base = bases.get(s.base_id)
        base_name = base.name if base else "unknown"
        loadout = s.loadout_override_json or (
            list(PLATFORM_LOADOUTS.get(s.platform_id, {}).get("bvr", []))
            + list(PLATFORM_LOADOUTS.get(s.platform_id, {}).get("wvr", []))
        )
        squadron_dtos.append(HangarSquadron(
            id=s.id, name=s.name, call_sign=s.call_sign,
            platform_id=s.platform_id, platform_name=plat_name,
            base_id=s.base_id, base_name=base_name,
            strength=s.strength, readiness_pct=s.readiness_pct,
            xp=s.xp, ace_name=s.ace_name, loadout=list(loadout),
        ))
        by_plat.setdefault(s.platform_id, []).append(s)

    summary = []
    for pid, group in by_plat.items():
        plat = plat_specs.get(pid)
        summary.append(HangarPlatformSummary(
            platform_id=pid,
            platform_name=plat.name if plat else pid,
            squadron_count=len(group),
            total_airframes=sum(g.strength for g in group),
            avg_readiness_pct=int(sum(g.readiness_pct for g in group) / len(group)),
        ))
    summary.sort(key=lambda x: -x.total_airframes)

    return HangarResponse(squadrons=squadron_dtos, summary_by_platform=summary)
```

Register in `main.py`:

```python
from app.api.armory import hangar_router
app.include_router(hangar_router)
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_hangar_api.py -v
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/armory.py backend/app/schemas/armory.py backend/main.py backend/tests/test_hangar_api.py
git commit -m "feat: GET /api/campaigns/{id}/hangar — fleet-wide squadron view

Returns all squadrons with platform + base + loadout joined, plus
per-platform summary (squadron count, total airframes, avg readiness).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Frontend Types + API Methods

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/__tests__/api.test.ts`

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts`, add:

```typescript
export interface MissileUnlock {
  target_id: string;
  name: string;
  description: string;
  eligible_platforms: string[];
  nez_km: number;
  max_range_km: number;
}

export interface ADSystemUnlock {
  target_id: string;
  name: string;
  description: string;
  coverage_km: number;
  install_cost_cr: number;
  max_pk: number;
}

export interface ISRDroneUnlock {
  target_id: string;
  name: string;
  description: string;
  coverage_km: number;
}

export interface StrikePlatformUnlock {
  target_id: string;
  name: string;
  description: string;
}

export interface UnlocksResponse {
  missiles: MissileUnlock[];
  ad_systems: ADSystemUnlock[];
  isr_drones: ISRDroneUnlock[];
  strike_platforms: StrikePlatformUnlock[];
}

export interface LoadoutUpgrade {
  id: number;
  squadron_id: number;
  weapon_id: string;
  completion_year: number;
  completion_quarter: number;
  status: "pending" | "completed" | "cancelled";
}

export interface ADBattery {
  id: number;
  base_id: number;
  system_id: string;
  coverage_km: number;
  installed_year: number;
  installed_quarter: number;
}

export interface HangarSquadron {
  id: number;
  name: string;
  call_sign: string;
  platform_id: string;
  platform_name: string;
  base_id: number;
  base_name: string;
  strength: number;
  readiness_pct: number;
  xp: number;
  ace_name: string | null;
  loadout: string[];
}

export interface HangarPlatformSummary {
  platform_id: string;
  platform_name: string;
  squadron_count: number;
  total_airframes: number;
  avg_readiness_pct: number;
}

export interface HangarResponse {
  squadrons: HangarSquadron[];
  summary_by_platform: HangarPlatformSummary[];
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`, add to imports and to the `api` object:

```typescript
  async getArmoryUnlocks(campaignId: number): Promise<UnlocksResponse> {
    const { data } = await http.get<UnlocksResponse>(
      `/api/campaigns/${campaignId}/armory/unlocks`
    );
    return data;
  },

  async equipMissile(
    campaignId: number,
    missileId: string,
    squadronId: number,
  ): Promise<LoadoutUpgrade> {
    const { data } = await http.post<LoadoutUpgrade>(
      `/api/campaigns/${campaignId}/armory/missiles/${missileId}/equip`,
      { squadron_id: squadronId },
    );
    return data;
  },

  async installADSystem(
    campaignId: number,
    systemId: string,
    baseId: number,
  ): Promise<ADBattery> {
    const { data } = await http.post<ADBattery>(
      `/api/campaigns/${campaignId}/armory/ad-systems/${systemId}/install`,
      { base_id: baseId },
    );
    return data;
  },

  async getHangar(campaignId: number): Promise<HangarResponse> {
    const { data } = await http.get<HangarResponse>(
      `/api/campaigns/${campaignId}/hangar`
    );
    return data;
  },
```

- [ ] **Step 3: Add api tests**

Append to `frontend/src/lib/__tests__/api.test.ts`:

```typescript
  it("getArmoryUnlocks returns unlocks", async () => {
    const body: UnlocksResponse = { missiles: [], ad_systems: [], isr_drones: [], strike_platforms: [] };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getArmoryUnlocks(1);
    expect(out.missiles).toEqual([]);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns/1/armory/unlocks");
  });

  it("equipMissile posts the payload", async () => {
    const body = { id: 1, squadron_id: 10, weapon_id: "astra_mk3", completion_year: 2027, completion_quarter: 2, status: "pending" };
    vi.spyOn(http, "post").mockResolvedValueOnce({ data: body } as any);
    const out = await api.equipMissile(1, "astra_mk3", 10);
    expect(out.weapon_id).toBe("astra_mk3");
    expect(http.post).toHaveBeenCalledWith(
      "/api/campaigns/1/armory/missiles/astra_mk3/equip",
      { squadron_id: 10 },
    );
  });

  it("installADSystem posts the payload", async () => {
    const body = { id: 1, base_id: 5, system_id: "akash_ng", coverage_km: 70, installed_year: 2027, installed_quarter: 1 };
    vi.spyOn(http, "post").mockResolvedValueOnce({ data: body } as any);
    const out = await api.installADSystem(1, "akash_ng", 5);
    expect(out.system_id).toBe("akash_ng");
  });

  it("getHangar returns the fleet", async () => {
    const body: HangarResponse = { squadrons: [], summary_by_platform: [] };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getHangar(1);
    expect(out.squadrons).toEqual([]);
  });
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run src/lib/__tests__/api.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/__tests__/api.test.ts
git commit -m "feat(frontend): types + api methods for armory + hangar endpoints

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Hangar Page — Fleet-Wide Squadron Manager

**Mobile UX priority:** single-column layout, filter chips always visible at top, tabbed view switcher (Summary / List), readiness bars prominent.

**Files:**
- Create: `frontend/src/pages/HangarPage.tsx`
- Create: `frontend/src/components/hangar/FleetFilters.tsx`
- Create: `frontend/src/components/hangar/PlatformSummaryCard.tsx`
- Create: `frontend/src/components/hangar/SquadronRow.tsx`
- Create: `frontend/src/pages/__tests__/HangarPage.test.tsx`
- Modify: `frontend/src/store/campaignStore.ts` — `hangar` state + `loadHangar` action
- Modify: `frontend/src/App.tsx` — register route
- Modify: `frontend/src/pages/CampaignMapView.tsx` — add Hangar link to header

- [ ] **Step 1: Store action**

In `campaignStore.ts`, add state:

```typescript
hangar: HangarResponse | null;
```

Initialize `null`. Add action:

```typescript
loadHangar: async (campaignId: number) => {
  try {
    const r = await api.getHangar(campaignId);
    set({ hangar: r });
  } catch (e) {
    get().pushToast("error", "Failed to load hangar");
  }
},
```

Import `HangarResponse` in types import block.

- [ ] **Step 2: FleetFilters component**

Create `frontend/src/components/hangar/FleetFilters.tsx`:

```tsx
export type HangarSortMode = "readiness_asc" | "readiness_desc" | "name" | "xp_desc";

export interface FleetFiltersProps {
  roleFilter: string;
  onRoleChange: (v: string) => void;
  sortMode: HangarSortMode;
  onSortChange: (m: HangarSortMode) => void;
}

const ROLE_OPTIONS = ["All", "Fighters", "AWACS", "Tanker", "Drones"];
const SORT_LABELS: Record<HangarSortMode, string> = {
  readiness_asc: "Readiness ↑",
  readiness_desc: "Readiness ↓",
  name: "Name A-Z",
  xp_desc: "XP ↓",
};

export function FleetFilters({ roleFilter, onRoleChange, sortMode, onSortChange }: FleetFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRoleChange(r)}
            className={[
              "text-[11px] rounded-full px-2.5 py-1 border",
              r === roleFilter
                ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                : "bg-slate-800 border-slate-700 text-slate-300",
            ].join(" ")}
          >{r}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-60">Sort</span>
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as HangarSortMode)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
        >
          {(Object.keys(SORT_LABELS) as HangarSortMode[]).map((m) => (
            <option key={m} value={m}>{SORT_LABELS[m]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: SquadronRow component**

Create `frontend/src/components/hangar/SquadronRow.tsx`:

```tsx
import type { HangarSquadron } from "../../lib/types";

function readinessColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SquadronRow({ sq }: { sq: HangarSquadron }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{sq.name}</div>
          <div className="text-[10px] opacity-60 truncate">
            {sq.platform_name} • {sq.base_name} • {sq.strength} airframes
          </div>
        </div>
        {sq.ace_name && (
          <span className="text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded">
            ⭐ {sq.ace_name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${readinessColor(sq.readiness_pct)}`}
            style={{ width: `${Math.min(100, sq.readiness_pct)}%` }}
          />
        </div>
        <span className="text-[10px] opacity-80 w-8 text-right">{sq.readiness_pct}%</span>
      </div>
      <div className="mt-1.5 text-[10px] opacity-70">
        Loadout: {sq.loadout.join(" · ") || "—"}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: PlatformSummaryCard**

Create `frontend/src/components/hangar/PlatformSummaryCard.tsx`:

```tsx
import type { HangarPlatformSummary } from "../../lib/types";

export function PlatformSummaryCard({ s }: { s: HangarPlatformSummary }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="text-sm font-semibold">{s.platform_name}</div>
      <div className="text-[10px] opacity-60 mt-0.5">
        {s.squadron_count} sqn{s.squadron_count === 1 ? "" : "s"} · {s.total_airframes} airframes
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${Math.min(100, s.avg_readiness_pct)}%` }}
          />
        </div>
        <span className="text-[10px] opacity-80 w-8 text-right">{s.avg_readiness_pct}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: HangarPage**

Create `frontend/src/pages/HangarPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { FleetFilters, type HangarSortMode } from "../components/hangar/FleetFilters";
import { PlatformSummaryCard } from "../components/hangar/PlatformSummaryCard";
import { SquadronRow } from "../components/hangar/SquadronRow";
import type { HangarSquadron } from "../lib/types";

const ROLE_MAP: Record<string, (sq: HangarSquadron) => boolean> = {
  All:      () => true,
  AWACS:    (sq) => sq.platform_id === "netra_aewc",
  Tanker:   (sq) => sq.platform_id === "il78_tanker",
  Drones:   (sq) => ["tapas_uav", "ghatak_ucav"].includes(sq.platform_id),
  Fighters: (sq) => !["netra_aewc", "il78_tanker", "tapas_uav", "ghatak_ucav"].includes(sq.platform_id),
};

export function HangarPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const hangar = useCampaignStore((s) => s.hangar);
  const loadHangar = useCampaignStore((s) => s.loadHangar);

  const [tab, setTab] = useState<"summary" | "list">("summary");
  const [role, setRole] = useState<string>("All");
  const [sort, setSort] = useState<HangarSortMode>("readiness_asc");

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    loadHangar(cid);
  }, [cid, campaign, loadCampaign, loadHangar]);

  const filteredSorted = useMemo(() => {
    if (!hangar) return [] as HangarSquadron[];
    const filter = ROLE_MAP[role] ?? (() => true);
    const filtered = hangar.squadrons.filter(filter);
    return [...filtered].sort((a, b) => {
      if (sort === "readiness_asc") return a.readiness_pct - b.readiness_pct;
      if (sort === "readiness_desc") return b.readiness_pct - a.readiness_pct;
      if (sort === "xp_desc") return b.xp - a.xp;
      return a.name.localeCompare(b.name);
    });
  }, [hangar, role, sort]);

  if (!hangar) return <div className="p-6 text-sm">Loading hangar…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Hangar</h1>
          <p className="text-xs opacity-70">
            {hangar.squadrons.length} sqns · {hangar.squadrons.reduce((a, b) => a + b.strength, 0)} airframes
          </p>
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setTab("summary")}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "summary" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
          >By Platform</button>
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "list" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
          >All Squadrons</button>
        </div>

        {tab === "summary" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {hangar.summary_by_platform.map((s) => (
              <PlatformSummaryCard key={s.platform_id} s={s} />
            ))}
          </div>
        ) : (
          <>
            <FleetFilters
              roleFilter={role}
              onRoleChange={setRole}
              sortMode={sort}
              onSortChange={setSort}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredSorted.map((sq) => (
                <SquadronRow key={sq.id} sq={sq} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Add route + header link**

In `frontend/src/App.tsx`:

```tsx
import { HangarPage } from "./pages/HangarPage";
// ...
<Route path="/campaign/:id/hangar" element={<HangarPage />} />
```

In `CampaignMapView.tsx`, add to the header nav links (after Intel / Proc in the always-visible cluster on desktop, inside the mobile hamburger on mobile):

```tsx
<Link
  to={`/campaign/${campaign.id}/hangar`}
  className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded px-2 py-1"
>Hangar</Link>
```

(If you add it to the always-visible row it may push End Turn off on very narrow screens — consider putting it inside the desktop-only `.hidden sm:flex` block if so. Mobile hamburger panel gets it regardless.)

- [ ] **Step 7: Basic test**

Create `frontend/src/pages/__tests__/HangarPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HangarPage } from "../HangarPage";
import { useCampaignStore } from "../../store/campaignStore";

vi.mock("../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const defaultStore = {
  campaign: { id: 1, name: "Test", current_year: 2026, current_quarter: 4 } as any,
  loadCampaign: vi.fn(),
  hangar: {
    squadrons: [
      { id: 1, name: "17 Sqn", call_sign: "GOLD", platform_id: "rafale_f4", platform_name: "Dassault Rafale F4", base_id: 1, base_name: "Ambala", strength: 18, readiness_pct: 82, xp: 5, ace_name: null, loadout: ["meteor", "mica_ir"] },
    ],
    summary_by_platform: [
      { platform_id: "rafale_f4", platform_name: "Dassault Rafale F4", squadron_count: 1, total_airframes: 18, avg_readiness_pct: 82 },
    ],
  },
  loadHangar: vi.fn(),
};

function setup(overrides = {}) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store)
  );
  return render(
    <MemoryRouter initialEntries={["/campaign/1/hangar"]}>
      <Routes>
        <Route path="/campaign/:id/hangar" element={<HangarPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("HangarPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders Hangar title", () => {
    setup();
    expect(screen.getByText(/Hangar/)).toBeTruthy();
  });

  it("shows summary tab by default", () => {
    setup();
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
  });

  it("renders squadron count + airframes header", () => {
    setup();
    expect(screen.getByText(/1 sqns · 18 airframes/)).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/HangarPage.tsx frontend/src/components/hangar/ frontend/src/store/campaignStore.ts frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx frontend/src/pages/__tests__/HangarPage.test.tsx
git commit -m "feat: Hangar page — fleet-wide squadron manager with filters

Mobile-first. Tabs: By Platform (summary cards) / All Squadrons
(filterable, sortable list). Readiness bars color-coded. Ace squadrons
badge. Accessible from campaign map header.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Armory Page — Unlocks, Missiles, AD, Drones

Four-tab page that surfaces every unlock with clear action affordances.

**Files:**
- Create: `frontend/src/pages/ArmoryPage.tsx`
- Create: `frontend/src/components/armory/UnlocksFeed.tsx`
- Create: `frontend/src/components/armory/MissileCard.tsx`
- Create: `frontend/src/components/armory/MissileEquipModal.tsx`
- Create: `frontend/src/components/armory/ADSystemCard.tsx`
- Create: `frontend/src/components/armory/ADInstallModal.tsx`
- Create: `frontend/src/components/armory/DroneRoster.tsx`
- Modify: `frontend/src/store/campaignStore.ts` — `armoryUnlocks` state + `loadArmoryUnlocks` / `equipMissile` / `installADSystem` actions
- Modify: `frontend/src/App.tsx` — register route
- Modify: `frontend/src/pages/CampaignMapView.tsx` — add Armory link

- [ ] **Step 1: Store state + actions**

In `campaignStore.ts`, add:

```typescript
armoryUnlocks: UnlocksResponse | null;
```

Initialize `null`. Add actions:

```typescript
loadArmoryUnlocks: async (campaignId: number) => {
  try {
    const r = await api.getArmoryUnlocks(campaignId);
    set({ armoryUnlocks: r });
  } catch {
    get().pushToast("error", "Failed to load armory");
  }
},
equipMissile: async (missileId: string, squadronId: number) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  try {
    const r = await api.equipMissile(cid, missileId, squadronId);
    get().pushToast(
      "success",
      `${missileId} rollout queued — ready ${r.completion_year} Q${r.completion_quarter}`,
    );
  } catch (e: any) {
    const msg = e?.response?.data?.detail ?? "Equip failed";
    get().pushToast("error", msg);
  }
},
installADSystem: async (systemId: string, baseId: number) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  try {
    await api.installADSystem(cid, systemId, baseId);
    get().pushToast("success", `${systemId} installed`);
    await get().loadCampaign(cid);
  } catch (e: any) {
    const msg = e?.response?.data?.detail ?? "Install failed";
    get().pushToast("error", msg);
  }
},
```

Import `UnlocksResponse` in types import block.

- [ ] **Step 2: MissileCard**

Create `frontend/src/components/armory/MissileCard.tsx`:

```tsx
import type { MissileUnlock } from "../../lib/types";

export function MissileCard({ m, onEquip }: { m: MissileUnlock; onEquip: () => void }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold">{m.name.replace(/_/g, " ")}</div>
        <span className="text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded">UNLOCKED</span>
      </div>
      <p className="text-xs opacity-80">{m.description}</p>
      <div className="mt-1.5 text-[11px] font-mono opacity-70">
        NEZ {m.nez_km}km · Max {m.max_range_km}km
      </div>
      <div className="mt-1.5 text-[10px] opacity-60">
        Eligible: {m.eligible_platforms.join(", ")}
      </div>
      <button
        type="button"
        onClick={onEquip}
        className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >Equip on squadron</button>
    </div>
  );
}
```

- [ ] **Step 3: MissileEquipModal**

Create `frontend/src/components/armory/MissileEquipModal.tsx`:

```tsx
import { useMemo } from "react";
import type { MissileUnlock, HangarSquadron } from "../../lib/types";

export interface MissileEquipModalProps {
  missile: MissileUnlock;
  squadrons: HangarSquadron[];
  onClose: () => void;
  onPick: (squadronId: number) => void;
}

export function MissileEquipModal({ missile, squadrons, onClose, onPick }: MissileEquipModalProps) {
  const eligible = useMemo(
    () => squadrons.filter((s) => missile.eligible_platforms.includes(s.platform_id)),
    [squadrons, missile],
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Equip {missile.name.replace(/_/g, " ")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {eligible.length === 0 ? (
            <p className="text-xs opacity-70">No eligible squadrons — this missile is compatible with platforms you don't currently operate.</p>
          ) : eligible.map((sq) => (
            <button
              key={sq.id}
              onClick={() => { onPick(sq.id); onClose(); }}
              className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-3"
            >
              <div className="text-sm font-semibold">{sq.name}</div>
              <div className="text-[10px] opacity-60">
                {sq.platform_name} · {sq.base_name} · {sq.strength} airframes
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Current: {sq.loadout.join(" · ") || "—"}
              </div>
            </button>
          ))}
          <p className="text-[10px] opacity-60 italic pt-2">
            Rollout takes 3 quarters. During rollout the squadron keeps its current loadout.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ADSystemCard + ADInstallModal**

Create `frontend/src/components/armory/ADSystemCard.tsx`:

```tsx
import type { ADSystemUnlock } from "../../lib/types";

export function ADSystemCard({ a, onInstall }: { a: ADSystemUnlock; onInstall: () => void }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold">{a.name}</div>
        <span className="text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded">UNLOCKED</span>
      </div>
      <p className="text-xs opacity-80">{a.description}</p>
      <div className="mt-1.5 text-[11px] font-mono opacity-70">
        Coverage {a.coverage_km}km · Max PK {(a.max_pk * 100).toFixed(0)}%
      </div>
      <div className="mt-1.5 text-[11px] opacity-80">
        Install cost: ₹{a.install_cost_cr.toLocaleString("en-US")} cr
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="mt-2 w-full bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold text-xs rounded py-1.5"
      >Install at base</button>
    </div>
  );
}
```

Create `frontend/src/components/armory/ADInstallModal.tsx`:

```tsx
import type { ADSystemUnlock, BaseMarker } from "../../lib/types";

export interface ADInstallModalProps {
  system: ADSystemUnlock;
  bases: BaseMarker[];
  onClose: () => void;
  onPick: (baseId: number) => void;
  budgetAvailable: number;
}

export function ADInstallModal({ system, bases, onClose, onPick, budgetAvailable }: ADInstallModalProps) {
  const canAfford = budgetAvailable >= system.install_cost_cr;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-baseline justify-between">
          <h2 className="text-base font-bold">Install {system.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {!canAfford && (
            <div className="bg-rose-950/40 border border-rose-800 rounded p-2 text-xs text-rose-300">
              ⚠ Insufficient budget. Need ₹{system.install_cost_cr.toLocaleString("en-US")} cr, have ₹{budgetAvailable.toLocaleString("en-US")} cr.
            </div>
          )}
          <p className="text-[11px] opacity-70">
            Choose a base to install the battery. Coverage radius: {system.coverage_km}km.
          </p>
          {bases.map((b) => (
            <button
              key={b.id}
              onClick={() => { onPick(b.id); onClose(); }}
              disabled={!canAfford}
              className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-3 disabled:opacity-50"
            >
              <div className="text-sm font-semibold">{b.name}</div>
              <div className="text-[10px] opacity-60">
                {b.lat.toFixed(2)}°N, {b.lon.toFixed(2)}°E
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: UnlocksFeed + DroneRoster**

Create `frontend/src/components/armory/UnlocksFeed.tsx`:

```tsx
import type { UnlocksResponse } from "../../lib/types";

export function UnlocksFeed({ unlocks }: { unlocks: UnlocksResponse }) {
  const total = unlocks.missiles.length + unlocks.ad_systems.length
             + unlocks.isr_drones.length + unlocks.strike_platforms.length;

  if (total === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No unlocks yet.</p>
        <p className="text-xs opacity-50 mt-2">
          Complete R&D programs to unlock missiles, AD systems, and drones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs opacity-70">{total} unlock{total === 1 ? "" : "s"} available — explore the tabs above.</div>
      {unlocks.missiles.map((m) => (
        <div key={m.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Missile</div>
          <div className="text-sm font-semibold">{m.name.replace(/_/g, " ")}</div>
          <div className="text-[10px] opacity-70">{m.description}</div>
        </div>
      ))}
      {unlocks.ad_systems.map((a) => (
        <div key={a.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">AD System</div>
          <div className="text-sm font-semibold">{a.name}</div>
          <div className="text-[10px] opacity-70">{a.description}</div>
        </div>
      ))}
      {unlocks.isr_drones.map((d) => (
        <div key={d.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">ISR Drone</div>
          <div className="text-sm font-semibold">{d.name}</div>
          <div className="text-[10px] opacity-70">{d.description}</div>
        </div>
      ))}
      {unlocks.strike_platforms.map((p) => (
        <div key={p.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Strike Platform</div>
          <div className="text-sm font-semibold">{p.name}</div>
          <div className="text-[10px] opacity-70">{p.description}</div>
        </div>
      ))}
    </div>
  );
}
```

Create `frontend/src/components/armory/DroneRoster.tsx`:

```tsx
import type { ISRDroneUnlock, StrikePlatformUnlock, HangarSquadron } from "../../lib/types";

export interface DroneRosterProps {
  isrDrones: ISRDroneUnlock[];
  strikeDrones: StrikePlatformUnlock[];
  squadrons: HangarSquadron[];
}

export function DroneRoster({ isrDrones, strikeDrones, squadrons }: DroneRosterProps) {
  const operatingDrones = squadrons.filter(
    (s) => ["tapas_uav", "ghatak_ucav"].includes(s.platform_id),
  );

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Unlocked ISR Drones</h3>
        {isrDrones.length === 0 ? (
          <p className="text-xs opacity-60">No ISR drones unlocked. Complete Tapas UAV or Netra Mk2 R&D.</p>
        ) : isrDrones.map((d) => (
          <div key={d.target_id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold">{d.name}</div>
            <div className="text-[10px] opacity-70">{d.description}</div>
            <div className="text-[11px] opacity-80 mt-1">Orbit radius: {d.coverage_km}km</div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Unlocked Strike Drones</h3>
        {strikeDrones.length === 0 ? (
          <p className="text-xs opacity-60">No strike drones unlocked. Complete Ghatak UCAV R&D.</p>
        ) : strikeDrones.map((d) => (
          <div key={d.target_id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold">{d.name}</div>
            <div className="text-[10px] opacity-70">{d.description}</div>
            <div className="text-[11px] opacity-60 mt-1">Procure via Acquisitions — unmanned strike role.</div>
          </div>
        ))}
      </section>

      {operatingDrones.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Operating Drone Squadrons</h3>
          {operatingDrones.map((sq) => (
            <div key={sq.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
              <div className="text-sm font-semibold">{sq.name}</div>
              <div className="text-[10px] opacity-60">
                {sq.platform_name} · {sq.base_name} · {sq.strength} drones
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 6: ArmoryPage**

Create `frontend/src/pages/ArmoryPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { UnlocksFeed } from "../components/armory/UnlocksFeed";
import { MissileCard } from "../components/armory/MissileCard";
import { MissileEquipModal } from "../components/armory/MissileEquipModal";
import { ADSystemCard } from "../components/armory/ADSystemCard";
import { ADInstallModal } from "../components/armory/ADInstallModal";
import { DroneRoster } from "../components/armory/DroneRoster";
import type { MissileUnlock, ADSystemUnlock } from "../lib/types";

type Tab = "unlocks" | "missiles" | "ad" | "drones";

export function ArmoryPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const unlocks = useCampaignStore((s) => s.armoryUnlocks);
  const loadUnlocks = useCampaignStore((s) => s.loadArmoryUnlocks);
  const hangar = useCampaignStore((s) => s.hangar);
  const loadHangar = useCampaignStore((s) => s.loadHangar);
  const bases = useCampaignStore((s) => s.bases);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const equipMissile = useCampaignStore((s) => s.equipMissile);
  const installADSystem = useCampaignStore((s) => s.installADSystem);

  const [tab, setTab] = useState<Tab>("unlocks");
  const [missileModal, setMissileModal] = useState<MissileUnlock | null>(null);
  const [adModal, setADModal] = useState<ADSystemUnlock | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== cid) loadCampaign(cid);
    loadUnlocks(cid);
    loadHangar(cid);
    loadBases(cid);
  }, [cid, campaign, loadCampaign, loadUnlocks, loadHangar, loadBases]);

  if (!unlocks || !hangar) return <div className="p-6 text-sm">Loading armory…</div>;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "unlocks", label: "Unlocks", count: unlocks.missiles.length + unlocks.ad_systems.length + unlocks.isr_drones.length + unlocks.strike_platforms.length },
    { id: "missiles", label: "Missiles", count: unlocks.missiles.length },
    { id: "ad", label: "AD", count: unlocks.ad_systems.length },
    { id: "drones", label: "Drones", count: unlocks.isr_drones.length + unlocks.strike_platforms.length },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">Armory</h1>
          <p className="text-xs opacity-70">Unlocks from completed R&D</p>
        </div>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">Map</Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "flex-1 min-w-0 px-2.5 py-1.5 text-xs font-semibold rounded whitespace-nowrap",
                tab === t.id ? "bg-amber-600 text-slate-900" : "text-slate-300",
              ].join(" ")}
            >
              {t.label} ({t.count ?? 0})
            </button>
          ))}
        </div>

        {tab === "unlocks" && <UnlocksFeed unlocks={unlocks} />}

        {tab === "missiles" && (
          unlocks.missiles.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No missiles unlocked yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unlocks.missiles.map((m) => (
                <MissileCard key={m.target_id} m={m} onEquip={() => setMissileModal(m)} />
              ))}
            </div>
          )
        )}

        {tab === "ad" && (
          unlocks.ad_systems.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No AD systems unlocked yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unlocks.ad_systems.map((a) => (
                <ADSystemCard key={a.target_id} a={a} onInstall={() => setADModal(a)} />
              ))}
            </div>
          )
        )}

        {tab === "drones" && (
          <DroneRoster
            isrDrones={unlocks.isr_drones}
            strikeDrones={unlocks.strike_platforms}
            squadrons={hangar.squadrons}
          />
        )}

        {missileModal && (
          <MissileEquipModal
            missile={missileModal}
            squadrons={hangar.squadrons}
            onClose={() => setMissileModal(null)}
            onPick={(sqid) => {
              void equipMissile(missileModal.target_id, sqid);
              loadUnlocks(cid);
            }}
          />
        )}

        {adModal && (
          <ADInstallModal
            system={adModal}
            bases={bases}
            onClose={() => setADModal(null)}
            budgetAvailable={campaign?.budget_cr ?? 0}
            onPick={(baseId) => {
              void installADSystem(adModal.target_id, baseId);
            }}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Register route + header link**

In `App.tsx`:

```tsx
import { ArmoryPage } from "./pages/ArmoryPage";
// ...
<Route path="/campaign/:id/armory" element={<ArmoryPage />} />
```

In `CampaignMapView.tsx`, add the Armory link next to Hangar:

```tsx
<Link to={`/campaign/${campaign.id}/armory`} className="bg-slate-800 hover:bg-slate-700 text-xs rounded px-2 py-1">Armory</Link>
```

- [ ] **Step 8: Run typecheck + tests**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/ArmoryPage.tsx frontend/src/components/armory/ frontend/src/store/campaignStore.ts frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx
git commit -m "feat: Armory page — 4 tabs (Unlocks/Missiles/AD/Drones)

Missile equip modal filters to eligible squadrons + surfaces current
loadout. AD install modal picks base, shows budget check inline. All
mutations push toasts with clear success/error messages.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Turn Report Unlock Banner

When a program completes during a turn, the Turn Report should surface it loudly with a direct link to the Armory.

**Files:**
- Create: `frontend/src/components/turnreport/UnlockBanner.tsx`
- Modify: `frontend/src/pages/TurnReport.tsx`
- Modify: `frontend/src/components/turnreport/RDProgressCard.tsx` — if milestone is `completed`, highlight + add link

- [ ] **Step 1: UnlockBanner component**

Create `frontend/src/components/turnreport/UnlockBanner.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { RDMilestoneSummary } from "../../lib/types";

export interface UnlockBannerProps {
  campaignId: number;
  completions: RDMilestoneSummary[];
}

export function UnlockBanner({ campaignId, completions }: UnlockBannerProps) {
  const completed = completions.filter((m) => m.kind === "completed");
  if (completed.length === 0) return null;

  return (
    <section className="border-2 border-amber-500 rounded-lg p-4 bg-gradient-to-br from-amber-900/40 to-slate-900">
      <h2 className="text-sm font-bold text-amber-200 mb-2">
        🎉 {completed.length} R&D {completed.length === 1 ? "Program" : "Programs"} Complete
      </h2>
      <ul className="space-y-1 text-xs">
        {completed.map((m, i) => (
          <li key={i} className="text-amber-100">• {m.program_id}</li>
        ))}
      </ul>
      <Link
        to={`/campaign/${campaignId}/armory`}
        className="mt-3 inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs rounded px-4 py-2"
      >
        Open Armory →
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Mount in TurnReport**

In `frontend/src/pages/TurnReport.tsx`, import and render above the other sections:

```tsx
import { UnlockBanner } from "../components/turnreport/UnlockBanner";
// ...
{/* Inside <main>, above the other <section> blocks */}
<UnlockBanner campaignId={campaignId} completions={report.rd_milestones} />
```

- [ ] **Step 3: Highlight completed in RDProgressCard**

In `frontend/src/components/turnreport/RDProgressCard.tsx`, make the completed state visually distinct and actionable:

```tsx
import type { RDMilestoneSummary } from "../../lib/types";
import { Link } from "react-router-dom";

export function RDProgressCard({ milestone, campaignId }: { milestone: RDMilestoneSummary; campaignId?: number }) {
  const { kind } = milestone;
  const icon = kind === "breakthrough" ? "🟢" : kind === "setback" ? "🔴" : kind === "completed" ? "✅" : kind === "underfunded" ? "⚠" : "🟡";
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const isCompletion = kind === "completed";

  return (
    <div className={[
      "border rounded-lg p-3",
      isCompletion ? "bg-emerald-950/30 border-emerald-700" : "bg-slate-900 border-slate-800",
    ].join(" ")}>
      <div className="text-xs opacity-80">{icon} {label} — <span className="font-semibold">{milestone.program_id}</span></div>
      {milestone.progress_pct != null && (
        <div className="text-xs opacity-60 mt-1">{milestone.progress_pct}% complete</div>
      )}
      {isCompletion && campaignId && (
        <Link
          to={`/campaign/${campaignId}/armory`}
          className="text-xs text-amber-400 hover:text-amber-300 underline mt-1 inline-block"
        >Equip in Armory →</Link>
      )}
    </div>
  );
}
```

Update the caller in `TurnReport.tsx` to pass `campaignId`:

```tsx
<RDProgressCard key={i} milestone={m} campaignId={campaignId} />
```

- [ ] **Step 4: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

Existing RDProgressCard tests may pass because the new prop is optional. If a test asserted on exact markup, adjust.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/turnreport/UnlockBanner.tsx frontend/src/components/turnreport/RDProgressCard.tsx frontend/src/pages/TurnReport.tsx
git commit -m "feat: Turn Report surfaces R&D completions with direct Armory link

Big gradient unlock banner above sections when any program completed
this turn. Completed RDProgressCard rows become emerald + have an
'Equip in Armory →' link.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Update ROADMAP + CLAUDE + mobile review

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update ROADMAP**

In `docs/superpowers/plans/ROADMAP.md`, change the last-updated line and append to the Current Status Summary:

```
**Last updated:** 2026-04-19 (Plan 15 in progress)
```

Table row:
```
| 15 | Armory + Hangar + R&D Unlocks | 🟡 in progress | [2026-04-19-armory-hangar-unlocks-plan.md](2026-04-19-armory-hangar-unlocks-plan.md) |
```

Append a Plan 15 section before the V1.5+ backlog:
```markdown
## Plan 15 — Armory + Hangar + R&D Unlocks

**Goal:** Make completed R&D programs affect gameplay. Unlocked missiles re-equip eligible squadrons via a 3-quarter rollout queue. Unlocked AD systems install at bases and shoot down attackers in a pre-BVR round. Unlocked ISR drones buff intel_quality in a coverage radius. New Hangar page gives fleet-wide force management. New Armory page surfaces every unlock.

**Deliverable:** R&D completion now unlocks ACTIONS (equip, install, deploy) rather than being cosmetic. Players can see fleet at a glance in the Hangar page, and every completion is surfaced with a clear affordance in Turn Report and Armory.

**Depends on:** Plans 1–14.

**Key modules:**
- Backend: `RDProgramSpec.unlocks`, `LoadoutUpgrade` + `ADBattery` models, `ad_engagement` resolver pre-round, `isr_drone_covering` intel buff, `armory.py` router.
- Frontend: `/campaign/:id/hangar`, `/campaign/:id/armory`, `UnlockBanner` on Turn Report.

**Detailed plan file:** [2026-04-19-armory-hangar-unlocks-plan.md](2026-04-19-armory-hangar-unlocks-plan.md)
```

- [ ] **Step 2: Update CLAUDE.md**

Append to the current-status block:
```
- **Plan 15 (Armory + Hangar + R&D Unlocks)** — 🟡 in progress. Backend: `RDProgramSpec.unlocks` declares what each program unlocks (missile/ad_system/isr_drone/strike_platform/platform/none); 25 programs backfilled. `LoadoutUpgrade` ORM queue (3-quarter rollout) + `tick_loadout_upgrades` engine; `Squadron.loadout_override_json` column. `ADBattery` ORM + `ad_engagement.py` pre-round resolver (fires before detection, deducts shot-down airframes). S-400 seeded at Pathankot. ISR drone intel buff (+0.15 per drone, capped at 2). New `armory.py` router: GET /unlocks, POST /missiles/{id}/equip, POST /ad-systems/{id}/install + GET /hangar. Frontend: `/campaign/:id/hangar` (fleet-wide, Platform Summary + All Squadrons tabs, readiness color-coded, role filter chips, 4 sort modes), `/campaign/:id/armory` (4 tabs: Unlocks / Missiles / AD / Drones with modals for equip + install), Turn Report `UnlockBanner` + RDProgressCard "Equip in Armory →" link on completions. Every mutation toasts. Plan file: `docs/superpowers/plans/2026-04-19-armory-hangar-unlocks-plan.md`.
```

Append to the authoritative-docs list near top:
```
- `docs/superpowers/plans/2026-04-19-armory-hangar-unlocks-plan.md` — Plan 15 (Armory + Hangar + R&D Unlocks). **In progress.**
```

- [ ] **Step 3: Mobile review (manual)**

Start dev server, DevTools 375px viewport. Walk through:
- `/campaign/:id/hangar` — filter chips wrap, tab switcher fits, squadron rows fit width, readiness bars visible
- `/campaign/:id/armory` — 4 tabs fit (use `overflow-x-auto` on the tab row — already in place)
- Missile equip modal opens as bottom sheet on mobile (`items-end sm:items-center`), scrollable
- AD install modal same pattern
- Turn Report UnlockBanner doesn't overflow
- Header links (Hangar, Armory) fit in the desktop flex; present in mobile hamburger

Fix any overflow inline. Add test-ids if needed for e2e later.

- [ ] **Step 4: Commit doc updates**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: add Plan 15 (Armory + Hangar + R&D Unlocks) to ROADMAP + CLAUDE.md

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: Push + Deploy

- [ ] **Step 1: Full backend suite**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

Expected: baseline 457 + ~28 new = ~485 pass.

- [ ] **Step 2: Full frontend suite**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

Expected: baseline 163 + ~10 new = ~173 pass.

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Build sanity**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build 2>&1 | tail -10
```

Fix any `TS6133` unused-param errors or similar that only surface in the stricter build.

- [ ] **Step 5: Push**

```bash
cd /Users/rsumit123/work/defense-game && git push origin main
```

- [ ] **Step 6: Deploy both**

```bash
./deploy.sh both
```

- [ ] **Step 7: Verify on prod**

- Visit https://pmc-tycoon.skdev.one
  - Start a new campaign
  - Advance ~4 turns (Astra Mk2 completes)
  - Turn Report should show unlock banner
  - Armory page should show Astra Mk2 under Missiles
  - Equip on a Rafale squadron → toast + queue message
  - Advance 3 more turns → completion toast → Hangar shows squadron with Astra Mk2 in loadout
- Hit https://pmc-tycoon-api.skdev.one/api/campaigns — responsive

- [ ] **Step 8: Flip to done**

In ROADMAP, change status to `🟢 done` and bump "Last updated":

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 15 done — Armory + Hangar + R&D unlocks complete

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage vs discussion:**
- Missile unlocks → loadout upgrade with queue → Tasks 1, 3, 4, 7, 11 ✅
- Drones (ISR + strike) → Tasks 1, 6, 11 ✅ (deferred: strike-drone new scenario archetypes)
- AD systems → Tasks 2, 5, 7, 11 ✅
- Hangar (fleet-wide view + filters) → Tasks 8, 10 ✅
- Armory UI surfaces every unlock with action → Task 11 ✅
- Turn Report unlock awareness → Task 12 ✅
- Mobile UX first class → Every frontend task explicitly notes mobile-first patterns (sticky headers, tab switchers, bottom-sheet modals, filter chips) ✅

**Placeholders:** None. Every step has concrete code.

**Type consistency:**
- `UnlockSpec.kind` uses the string set `missile | ad_system | isr_drone | strike_platform | platform | none` consistently across backend schema (Task 1), armory API (Task 7), and frontend types (Task 9).
- `MissileUnlock`, `ADSystemUnlock`, `ISRDroneUnlock`, `StrikePlatformUnlock`, `UnlocksResponse` names match exactly between `backend/app/schemas/armory.py` (Task 7) and `frontend/src/lib/types.ts` (Task 9).
- `HangarSquadron` / `HangarPlatformSummary` / `HangarResponse` likewise.
- `LoadoutUpgrade.status: "pending" | "completed" | "cancelled"` consistent across model (Task 4), schema (Task 7), frontend type (Task 9).
- `tick_loadout_upgrades` input shape `{id, squadron_id, weapon_id, base_loadout, completion_year, completion_quarter, status}` matches the `LoadoutUpgrade` ORM columns in Task 4.
- `resolve_ad_engagement` signature `(ao, batteries, bases_registry, ad_specs, adv_force, rng)` used consistently in Task 5 test, implementation, and resolver wiring.

**Gaps deliberately left:**
- Ammunition / depletion mechanic — deferred to Plan 16.
- Platform retirement — deferred to Plan 16.
- EW upgrade path — deferred to Plan 16.
- Pilot roster separate from airframe count — deferred to Plan 16.
- XP / ace progression UI — deferred to Plan 16 (Hangar page shows XP + ace_name, but no dedicated progression surface).
- Strike-drone scenario archetypes (`ucav_saturation_strike`, `manned_unmanned_teaming`) — deferred to Plan 16.
- Coalition request scenarios with reputation payoff — deferred to Plan 16.

All deferrals match the user's explicit scope ("missile unlocks into latter plan" → kept here; other deep-sim mechanics → Plan 16).
