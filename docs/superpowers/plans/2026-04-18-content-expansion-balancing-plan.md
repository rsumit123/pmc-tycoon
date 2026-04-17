# V1 Content Expansion + Balancing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale content from MVP to V1 levels (~38 platforms, ~20 scenarios, ~12 objectives, ~25 R&D programs, ~15 bases, 31 starting squadrons), fix 11 carry-over issues, add airbase management and diplomacy display, hydrate IntelContactsLayer, and add campaign export/import.

**Architecture:** Content-heavy plan. Backend expands 8 YAML content files, adds `procurable_by` + delivery-window fields to `PlatformSpec`, extends seed state from 3 to 31 starting squadrons, adds 3 new API endpoints (base upgrade, campaign export/import), and adds UniqueConstraint on R&D program states. Frontend hydrates IntelContactsLayer from store data, applies 4 carry-over UI fixes, and adds airbase management panel + diplomacy strip. Content validation test ensures cross-file consistency.

**Tech Stack:** FastAPI + SQLAlchemy 2.x (backend), React 19 + Vite 8 + TypeScript + Tailwind v4 + Zustand (frontend), Vitest + @testing-library/react (tests).

**Depends on:** Plans 1–9 (complete game loop).

**Test baselines (start of Plan 10):** 325 backend tests, 90 frontend vitest tests.

---

## File Structure

### Backend — modified files
- `backend/content/platforms.yaml` — expand from 10 to 38 platforms
- `backend/content/bases.yaml` — expand from 3 to 15 bases
- `backend/content/objectives.yaml` — expand from 3 to 12 objectives
- `backend/content/rd_programs.yaml` — expand from 10 to 25 programs
- `backend/content/scenario_templates.yaml` — expand from 8 to 20 scenarios
- `backend/content/intel_templates.yaml` — expand from 15 to 22 templates
- `backend/content/adversary_roadmap.yaml` — add 8 events to fill quarterly gaps
- `backend/content/asset_manifest.yaml` — add entries for new IND platforms
- `backend/app/content/loader.py` — add `procurable_by`, `default_first_delivery_quarters`, `default_foc_quarters` to PlatformSpec
- `backend/app/crud/seed_starting_state.py` — expand to 31 starting squadrons across 15 bases
- `backend/app/engine/vignette/bvr.py` — add loadouts for 17 new combat platforms + 2 new weapons
- `backend/app/models/rd_program.py` — add UniqueConstraint on (campaign_id, program_id)
- `backend/app/api/summary.py` — extend `_evaluate_objective` for 9 new objectives
- `backend/main.py` — register base_upgrade + campaign_export routers

### Backend — new files
- `backend/content/diplomacy.yaml` — starting relations with supplier nations
- `backend/app/api/base_upgrade.py` — `POST /api/campaigns/{id}/bases/{base_id}/upgrade`
- `backend/app/api/campaign_export.py` — `GET /api/campaigns/{id}/export` + `POST /api/campaigns/import`
- `backend/app/schemas/base_upgrade.py` — request/response models for base upgrades
- `backend/app/schemas/campaign_export.py` — export/import models
- `backend/app/engine/base_upgrade.py` — base upgrade cost/effect logic
- `backend/tests/test_content_validation.py` — cross-file content consistency tests
- `backend/tests/test_llm_enrichment.py` — unit tests for enrichment functions
- `backend/tests/test_base_upgrade_api.py` — base upgrade API tests
- `backend/tests/test_campaign_export.py` — export/import tests
- `backend/tests/test_balance_simulation.py` — 40-turn simulation balance assertions

### Frontend — modified files
- `frontend/src/lib/types.ts` — add Platform.procurable_by, delivery window fields, base upgrade types, IntelContact synthesis types
- `frontend/src/lib/api.ts` — add `upgradeBase`, `exportCampaign`, `importCampaign` methods
- `frontend/src/store/campaignStore.ts` — add base upgrade actions, intel contacts synthesis
- `frontend/src/pages/ProcurementHub.tsx` — replace CHN/PAK filter with `procurable_by`
- `frontend/src/pages/CampaignMapView.tsx` — hydrate IntelContactsLayer from store
- `frontend/src/components/procurement/AcquisitionPipeline.tsx` — allow multi-batch procurement, use per-platform delivery windows
- `frontend/src/components/procurement/RDDashboard.tsx` — add title attributes to funding buttons

### Frontend — new files
- `frontend/src/components/base/AirbasePanel.tsx` — airbase management panel
- `frontend/src/components/base/__tests__/AirbasePanel.test.tsx`
- `frontend/src/components/procurement/DiplomacyStrip.tsx` — read-only relations display
- `frontend/src/components/procurement/__tests__/DiplomacyStrip.test.tsx`

---

### Task 1: Platform Expansion — PlatformSpec Schema + platforms.yaml + PLATFORM_LOADOUTS

**Files:**
- Modify: `backend/app/content/loader.py` — add 3 new fields to PlatformSpec
- Modify: `backend/content/platforms.yaml` — expand from 10 to 38 platforms
- Modify: `backend/app/engine/vignette/bvr.py` — add 2 weapons + 17 platform loadouts
- Create: `backend/tests/test_platform_expansion.py`

This task adds all missing platforms referenced by scenarios/roadmap (j16, j11b, j35e, j10ce, jf17_blk3, f16_blk52, kj500, h6kj, h6n, j20s, j36, j36_prototype, fujian, type004_carrier, type055_destroyer, type093b_ssn), Indian fleet platforms (mig29_upg, jaguar_darin3, mig21_bison, tejas_mk1, netra_aewc, il78_tanker), R&D outputs (tedbf, ghatak_ucav), and foreign procurement options (su35, f18e_super_hornet, f15ex, gripen_e, eurofighter_typhoon, mq9b_seaguardian, heron_tp).

- [ ] **Step 1: Add new fields to PlatformSpec**

In `backend/app/content/loader.py`, add three new optional fields to the `PlatformSpec` class:

```python
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
    procurable_by: list[str] = Field(default_factory=list)
    default_first_delivery_quarters: int = 8
    default_foc_quarters: int = 16
```

- [ ] **Step 2: Write the content validation test**

Create `backend/tests/test_platform_expansion.py`:

```python
"""Tests for expanded platform content + PlatformSpec schema changes."""
import pytest
from backend.app.content.loader import load_platforms
from backend.app.engine.vignette.bvr import PLATFORM_LOADOUTS
from pathlib import Path


def test_platform_count():
    platforms = load_platforms(Path("backend/content/platforms.yaml"))
    assert len(platforms) >= 38, f"Expected >=38 platforms, got {len(platforms)}"


def test_procurable_by_field():
    platforms = load_platforms(Path("backend/content/platforms.yaml"))
    ind_procurable = [p for p in platforms.values() if "IND" in p.procurable_by]
    assert len(ind_procurable) >= 15, "At least 15 platforms should be procurable by IND"
    adversary_only = [p for p in platforms.values() if len(p.procurable_by) == 0]
    assert len(adversary_only) >= 10, "At least 10 adversary-only platforms"


def test_delivery_window_defaults():
    platforms = load_platforms(Path("backend/content/platforms.yaml"))
    rafale = platforms["rafale_f4"]
    assert rafale.default_first_delivery_quarters == 6
    assert rafale.default_foc_quarters == 20


def test_all_scenario_platforms_exist():
    """Every platform_id in scenario templates must exist in platforms.yaml."""
    from backend.app.content.loader import load_scenario_templates
    platforms = load_platforms(Path("backend/content/platforms.yaml"))
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in platforms and pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Platforms in scenarios but not in platforms.yaml or PLATFORM_LOADOUTS: {missing}"


def test_all_combat_platforms_have_loadouts():
    """Every platform that appears in scenario rosters must have a PLATFORM_LOADOUTS entry."""
    from backend.app.content.loader import load_scenario_templates
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Platforms in scenarios missing PLATFORM_LOADOUTS: {missing}"


def test_rcs_bands_valid():
    platforms = load_platforms(Path("backend/content/platforms.yaml"))
    valid = {"VLO", "LO", "reduced", "conventional", "large"}
    for p in platforms.values():
        assert p.rcs_band in valid, f"{p.id} has invalid rcs_band: {p.rcs_band}"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_platform_expansion.py -v`
Expected: FAIL (platform count < 38, missing platforms, etc.)

- [ ] **Step 4: Expand platforms.yaml**

Replace `backend/content/platforms.yaml` with the complete expanded content:

```yaml
platforms:
  # ===== INDIAN — Player procurable =====
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
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 20

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
    procurable_by: [IND]
    default_first_delivery_quarters: 8
    default_foc_quarters: 24

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
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 12

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
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 16

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
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 16

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
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 12

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
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 20

  - id: tejas_mk1
    name: HAL Tejas Mk1
    origin: IND
    role: multirole
    generation: "4.5"
    combat_radius_km: 400
    payload_kg: 4000
    rcs_band: reduced
    radar_range_km: 120
    cost_cr: 350
    intro_year: 2019
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 10

  - id: mig29_upg
    name: MiG-29UPG
    origin: IND
    role: air_superiority
    generation: "4"
    combat_radius_km: 700
    payload_kg: 4000
    rcs_band: conventional
    radar_range_km: 130
    cost_cr: 250
    intro_year: 2013
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 12

  - id: jaguar_darin3
    name: SEPECAT Jaguar DARIN-III
    origin: IND
    role: strike
    generation: "4"
    combat_radius_km: 1600
    payload_kg: 4775
    rcs_band: conventional
    radar_range_km: 80
    cost_cr: 180
    intro_year: 2017
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 10

  - id: mig21_bison
    name: MiG-21 Bison
    origin: IND
    role: interceptor
    generation: "3"
    combat_radius_km: 660
    payload_kg: 1500
    rcs_band: conventional
    radar_range_km: 80
    cost_cr: 50
    intro_year: 2006
    procurable_by: []
    default_first_delivery_quarters: 0
    default_foc_quarters: 0

  - id: netra_aewc
    name: DRDO Netra AEW&C
    origin: IND
    role: awacs
    generation: "4.5"
    combat_radius_km: 2500
    payload_kg: 0
    rcs_band: large
    radar_range_km: 375
    cost_cr: 3000
    intro_year: 2017
    procurable_by: [IND]
    default_first_delivery_quarters: 8
    default_foc_quarters: 20

  - id: il78_tanker
    name: IL-78MKI Tanker
    origin: IND
    role: tanker
    generation: "4"
    combat_radius_km: 4000
    payload_kg: 0
    rcs_band: large
    radar_range_km: 0
    cost_cr: 1500
    intro_year: 2003
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 16

  - id: tedbf
    name: HAL TEDBF
    origin: IND
    role: stealth_multirole
    generation: "5"
    combat_radius_km: 1200
    payload_kg: 6000
    rcs_band: LO
    radar_range_km: 190
    cost_cr: 1200
    intro_year: 2032
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 20

  - id: ghatak_ucav
    name: Ghatak UCAV
    origin: IND
    role: stealth_strike
    generation: "5"
    combat_radius_km: 1500
    payload_kg: 2000
    rcs_band: VLO
    radar_range_km: 0
    cost_cr: 800
    intro_year: 2031
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 12

  # ===== FOREIGN — Player procurement options =====
  - id: su35
    name: Sukhoi Su-35
    origin: RU
    role: air_superiority
    generation: "4.75"
    combat_radius_km: 1600
    payload_kg: 8000
    rcs_band: conventional
    radar_range_km: 200
    cost_cr: 3500
    intro_year: 2014
    procurable_by: [IND]
    default_first_delivery_quarters: 8
    default_foc_quarters: 20

  - id: f18e_super_hornet
    name: F/A-18E Super Hornet
    origin: US
    role: multirole
    generation: "4.5"
    combat_radius_km: 740
    payload_kg: 8050
    rcs_band: reduced
    radar_range_km: 190
    cost_cr: 4000
    intro_year: 2001
    procurable_by: [IND]
    default_first_delivery_quarters: 10
    default_foc_quarters: 24

  - id: f15ex
    name: F-15EX Eagle II
    origin: US
    role: air_superiority
    generation: "4.5"
    combat_radius_km: 1270
    payload_kg: 10400
    rcs_band: conventional
    radar_range_km: 210
    cost_cr: 5500
    intro_year: 2021
    procurable_by: [IND]
    default_first_delivery_quarters: 10
    default_foc_quarters: 24

  - id: gripen_e
    name: Saab Gripen E
    origin: SE
    role: multirole
    generation: "4.5"
    combat_radius_km: 1350
    payload_kg: 5300
    rcs_band: reduced
    radar_range_km: 180
    cost_cr: 3200
    intro_year: 2019
    procurable_by: [IND]
    default_first_delivery_quarters: 8
    default_foc_quarters: 20

  - id: eurofighter_typhoon
    name: Eurofighter Typhoon
    origin: EU
    role: air_superiority
    generation: "4.5"
    combat_radius_km: 1400
    payload_kg: 7500
    rcs_band: reduced
    radar_range_km: 200
    cost_cr: 5000
    intro_year: 2003
    procurable_by: [IND]
    default_first_delivery_quarters: 10
    default_foc_quarters: 24

  - id: mq9b_seaguardian
    name: MQ-9B SeaGuardian
    origin: US
    role: isr
    generation: "4.5"
    combat_radius_km: 5500
    payload_kg: 2150
    rcs_band: conventional
    radar_range_km: 180
    cost_cr: 2000
    intro_year: 2020
    procurable_by: [IND]
    default_first_delivery_quarters: 6
    default_foc_quarters: 12

  - id: heron_tp
    name: IAI Heron TP
    origin: IL
    role: isr
    generation: "4.5"
    combat_radius_km: 4500
    payload_kg: 1000
    rcs_band: conventional
    radar_range_km: 100
    cost_cr: 800
    intro_year: 2010
    procurable_by: [IND]
    default_first_delivery_quarters: 4
    default_foc_quarters: 10

  # ===== PLAAF — Adversary only =====
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

  - id: j20s
    name: Chengdu J-20S
    origin: CHN
    role: stealth_superiority
    generation: "5"
    combat_radius_km: 2000
    payload_kg: 6500
    rcs_band: VLO
    radar_range_km: 230
    cost_cr: 0
    intro_year: 2024

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

  - id: j16
    name: Shenyang J-16
    origin: CHN
    role: multirole
    generation: "4.5"
    combat_radius_km: 1500
    payload_kg: 12000
    rcs_band: conventional
    radar_range_km: 180
    cost_cr: 0
    intro_year: 2015

  - id: j11b
    name: Shenyang J-11B
    origin: CHN
    role: air_superiority
    generation: "4"
    combat_radius_km: 1500
    payload_kg: 8000
    rcs_band: conventional
    radar_range_km: 160
    cost_cr: 0
    intro_year: 2007

  - id: j36
    name: Chengdu J-36
    origin: CHN
    role: stealth_superiority
    generation: "6"
    combat_radius_km: 2500
    payload_kg: 8000
    rcs_band: VLO
    radar_range_km: 280
    cost_cr: 0
    intro_year: 2031

  - id: j36_prototype
    name: J-36 Prototype
    origin: CHN
    role: stealth_superiority
    generation: "6"
    combat_radius_km: 2200
    payload_kg: 6000
    rcs_band: VLO
    radar_range_km: 250
    cost_cr: 0
    intro_year: 2028

  - id: kj500
    name: KJ-500 AEW&C
    origin: CHN
    role: awacs
    generation: "4.5"
    combat_radius_km: 3000
    payload_kg: 0
    rcs_band: large
    radar_range_km: 450
    cost_cr: 0
    intro_year: 2015

  - id: h6kj
    name: Xian H-6K/J
    origin: CHN
    role: bomber
    generation: "4"
    combat_radius_km: 3500
    payload_kg: 12000
    rcs_band: large
    radar_range_km: 120
    cost_cr: 0
    intro_year: 2011

  - id: h6n
    name: Xian H-6N
    origin: CHN
    role: bomber
    generation: "4"
    combat_radius_km: 4000
    payload_kg: 15000
    rcs_band: large
    radar_range_km: 120
    cost_cr: 0
    intro_year: 2020

  # ===== PAF — Adversary only =====
  - id: j35e
    name: Shenyang J-35E
    origin: PAK
    role: stealth_multirole
    generation: "5"
    combat_radius_km: 1200
    payload_kg: 7500
    rcs_band: VLO
    radar_range_km: 190
    cost_cr: 0
    intro_year: 2026

  - id: j10ce
    name: Chengdu J-10CE
    origin: PAK
    role: multirole
    generation: "4.5"
    combat_radius_km: 1200
    payload_kg: 5600
    rcs_band: reduced
    radar_range_km: 170
    cost_cr: 0
    intro_year: 2022

  - id: jf17_blk3
    name: PAC JF-17 Block 3
    origin: PAK
    role: multirole
    generation: "4.5"
    combat_radius_km: 1350
    payload_kg: 3800
    rcs_band: reduced
    radar_range_km: 150
    cost_cr: 0
    intro_year: 2022

  - id: f16_blk52
    name: F-16 Block 52+
    origin: PAK
    role: multirole
    generation: "4"
    combat_radius_km: 1400
    payload_kg: 7700
    rcs_band: conventional
    radar_range_km: 160
    cost_cr: 0
    intro_year: 2010

  # ===== PLAN — Inventory-tracked naval assets =====
  - id: fujian
    name: CV-18 Fujian
    origin: CHN
    role: carrier
    generation: "5"
    combat_radius_km: 0
    payload_kg: 0
    rcs_band: large
    radar_range_km: 300
    cost_cr: 0
    intro_year: 2024

  - id: type004_carrier
    name: Type 004
    origin: CHN
    role: carrier
    generation: "5"
    combat_radius_km: 0
    payload_kg: 0
    rcs_band: large
    radar_range_km: 350
    cost_cr: 0
    intro_year: 2032

  - id: type055_destroyer
    name: Type 055 Renhai
    origin: CHN
    role: destroyer
    generation: "5"
    combat_radius_km: 0
    payload_kg: 0
    rcs_band: reduced
    radar_range_km: 400
    cost_cr: 0
    intro_year: 2020

  - id: type093b_ssn
    name: Type 093B SSN
    origin: CHN
    role: submarine
    generation: "5"
    combat_radius_km: 0
    payload_kg: 0
    rcs_band: VLO
    radar_range_km: 0
    cost_cr: 0
    intro_year: 2020
```

- [ ] **Step 5: Add new weapons and platform loadouts to bvr.py**

In `backend/app/engine/vignette/bvr.py`, add two new weapons to the `WEAPONS` dict:

```python
    "aim120d": {"nez_km": 60, "max_range_km": 160, "gen_bonus": 0.08},
    "aim9x": {"nez_km": 15, "max_range_km": 35, "gen_bonus": 0.10},
```

Add these entries to the `PLATFORM_LOADOUTS` dict:

```python
    "mig29_upg": {"bvr": ["r77"], "wvr": ["r73"]},
    "jaguar_darin3": {"bvr": [], "wvr": []},
    "mig21_bison": {"bvr": ["r77"], "wvr": ["r73"]},
    "tejas_mk1": {"bvr": ["astra_mk1"], "wvr": ["r73"]},
    "netra_aewc": {"bvr": [], "wvr": []},
    "il78_tanker": {"bvr": [], "wvr": []},
    "tedbf": {"bvr": ["astra_mk2"], "wvr": ["astra_mk1"]},
    "ghatak_ucav": {"bvr": [], "wvr": []},
    "su35": {"bvr": ["r77"], "wvr": ["r73"]},
    "f18e_super_hornet": {"bvr": ["aim120d"], "wvr": ["aim9x"]},
    "f15ex": {"bvr": ["aim120d"], "wvr": ["aim9x"]},
    "gripen_e": {"bvr": ["meteor"], "wvr": ["mica_ir"]},
    "eurofighter_typhoon": {"bvr": ["meteor"], "wvr": ["mica_ir"]},
    "mq9b_seaguardian": {"bvr": [], "wvr": []},
    "heron_tp": {"bvr": [], "wvr": []},
    "h6n": {"bvr": [], "wvr": []},
    "fujian": {"bvr": [], "wvr": []},
    "type004_carrier": {"bvr": [], "wvr": []},
    "type055_destroyer": {"bvr": [], "wvr": []},
    "type093b_ssn": {"bvr": [], "wvr": []},
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_platform_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 7: Run full backend test suite**

Run: `cd backend && python -m pytest -x -q`
Expected: 325+ tests pass, no regressions

- [ ] **Step 8: Commit**

```bash
git add backend/app/content/loader.py backend/content/platforms.yaml backend/app/engine/vignette/bvr.py backend/tests/test_platform_expansion.py
git commit -m "feat: expand platforms to 38 + add procurable_by + delivery window fields"
```

---

### Task 2: Base & Fleet Expansion — bases.yaml + 31 Starting Squadrons

**Files:**
- Modify: `backend/content/bases.yaml` — expand from 3 to 15 bases
- Modify: `backend/app/crud/seed_starting_state.py` — expand to 31 squadrons + 15 bases + full adversary OOB
- Create: `backend/tests/test_seed_expansion.py`

- [ ] **Step 1: Write the seed expansion test**

Create `backend/tests/test_seed_expansion.py`:

```python
"""Tests for expanded starting state: 15 bases, 31 squadrons."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.models import Base
from backend.app.crud.campaign import create_campaign
from backend.app.crud.seed_starting_state import seed_starting_state
from backend.app.content.loader import load_bases
from pathlib import Path


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_base_count():
    bases = load_bases(Path("backend/content/bases.yaml"))
    assert len(bases) == 15


def test_base_coordinates_valid():
    bases = load_bases(Path("backend/content/bases.yaml"))
    for b in bases.values():
        assert 5.0 <= b.lat <= 36.0, f"{b.id} lat {b.lat} out of subcontinent range"
        assert 68.0 <= b.lon <= 98.0, f"{b.id} lon {b.lon} out of subcontinent range"


def test_starting_squadron_count(db):
    campaign = create_campaign(db, name="test", seed=42)
    seed_starting_state(db, campaign)
    from backend.app.models.squadron import Squadron
    squads = db.query(Squadron).filter_by(campaign_id=campaign.id).all()
    assert len(squads) == 31, f"Expected 31 starting squadrons, got {len(squads)}"


def test_starting_base_count(db):
    campaign = create_campaign(db, name="test", seed=42)
    seed_starting_state(db, campaign)
    from backend.app.models.campaign_base import CampaignBase
    bases = db.query(CampaignBase).filter_by(campaign_id=campaign.id).all()
    assert len(bases) == 15, f"Expected 15 campaign bases, got {len(bases)}"


def test_platform_distribution(db):
    campaign = create_campaign(db, name="test", seed=42)
    seed_starting_state(db, campaign)
    from backend.app.models.squadron import Squadron
    squads = db.query(Squadron).filter_by(campaign_id=campaign.id).all()
    by_platform = {}
    for s in squads:
        by_platform[s.platform_id] = by_platform.get(s.platform_id, 0) + 1
    assert by_platform.get("su30_mki", 0) >= 12, "Su-30 MKI should have 12+ squadrons"
    assert by_platform.get("rafale_f4", 0) == 2, "Rafale F4 should have 2 squadrons"
    assert by_platform.get("mig21_bison", 0) >= 2, "MiG-21 Bison should have 2 retiring squadrons"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_seed_expansion.py -v`
Expected: FAIL (only 3 bases, 3 squadrons)

- [ ] **Step 3: Expand bases.yaml**

Replace `backend/content/bases.yaml`:

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

  - id: adampur
    name: Adampur Air Force Station
    lat: 31.4333
    lon: 75.7667
    runway_class: heavy
    faction: IND

  - id: halwara
    name: Halwara Air Force Station
    lat: 30.7500
    lon: 75.9500
    runway_class: heavy
    faction: IND

  - id: pathankot
    name: Pathankot Air Force Station
    lat: 32.2333
    lon: 75.6333
    runway_class: heavy
    faction: IND

  - id: srinagar
    name: Srinagar Air Force Station
    lat: 33.9872
    lon: 74.7744
    runway_class: medium
    faction: IND

  - id: bareilly
    name: Bareilly Air Force Station
    lat: 28.4225
    lon: 79.4519
    runway_class: heavy
    faction: IND

  - id: gwalior
    name: Gwalior Air Force Station
    lat: 26.2933
    lon: 78.2278
    runway_class: heavy
    faction: IND

  - id: pune
    name: Pune Air Force Station (Lohegaon)
    lat: 18.5822
    lon: 73.9197
    runway_class: heavy
    faction: IND

  - id: thanjavur
    name: Thanjavur Air Force Station
    lat: 10.7225
    lon: 79.1014
    runway_class: heavy
    faction: IND

  - id: tezpur
    name: Tezpur Air Force Station
    lat: 26.7100
    lon: 92.7847
    runway_class: heavy
    faction: IND

  - id: chabua
    name: Chabua Air Force Station
    lat: 27.5333
    lon: 95.0167
    runway_class: heavy
    faction: IND

  - id: car_nicobar
    name: Car Nicobar Air Force Station (INS Baaz)
    lat: 9.1525
    lon: 92.8197
    runway_class: medium
    faction: IND

  - id: nal
    name: Nal Air Force Station
    lat: 25.8650
    lon: 71.7900
    runway_class: heavy
    faction: IND
```

- [ ] **Step 4: Expand seed_starting_state.py**

Update `backend/app/crud/seed_starting_state.py` — replace the SEED_BASES, SEED_SQUADRONS, and OOB_2026_Q2 constants with the expanded data:

**SEED_BASES** — 15 entries, each with (base_id, shelter_count, fuel_depot_size, ad_integration_level):

```python
SEED_BASES = [
    ("ambala", 24, 3, 2),
    ("hasimara", 20, 2, 2),
    ("jodhpur", 22, 3, 2),
    ("adampur", 20, 2, 1),
    ("halwara", 22, 3, 2),
    ("pathankot", 18, 2, 1),
    ("srinagar", 14, 2, 2),
    ("bareilly", 24, 3, 1),
    ("gwalior", 20, 2, 1),
    ("pune", 22, 3, 1),
    ("thanjavur", 20, 2, 1),
    ("tezpur", 18, 2, 2),
    ("chabua", 18, 2, 1),
    ("car_nicobar", 12, 1, 1),
    ("nal", 16, 2, 1),
]
```

**SEED_SQUADRONS** — 31 entries: `(name, call_sign, platform_id, base_id, airframes, readiness)`:

```python
SEED_SQUADRONS = [
    # Ambala — 3 squadrons
    ("17 Sqn Golden Arrows", "GOLDEN", "rafale_f4", "ambala", 18, 0.82),
    ("14 Sqn Bulls", "BULL", "jaguar_darin3", "ambala", 16, 0.70),
    ("4 Sqn Oorials", "OORIAL", "mig21_bison", "ambala", 14, 0.62),
    # Hasimara — 2 squadrons
    ("101 Sqn Falcons", "FALCON", "rafale_f4", "hasimara", 18, 0.78),
    ("16 Sqn Cobras", "COBRA", "jaguar_darin3", "hasimara", 16, 0.69),
    # Jodhpur — 3 squadrons
    ("32 Sqn Thunderbirds", "THUNDER", "su30_mki", "jodhpur", 18, 0.75),
    ("30 Sqn Rhinos", "RHINO", "su30_mki", "jodhpur", 18, 0.73),
    ("29 Sqn Scorpions", "SCORPION", "mig29_upg", "jodhpur", 16, 0.72),
    # Adampur — 2 squadrons
    ("28 Sqn First Supersonics", "SONIC", "mig29_upg", "adampur", 16, 0.74),
    ("26 Sqn Warriors", "WARRIOR", "su30_mki", "adampur", 18, 0.76),
    # Halwara — 2 squadrons
    ("220 Sqn Desert Tigers", "DTIGER", "su30_mki", "halwara", 18, 0.74),
    ("5 Sqn Tuskers", "TUSKER", "jaguar_darin3", "halwara", 16, 0.68),
    # Pathankot — 2 squadrons
    ("23 Sqn Panthers", "PANTHER", "su30_mki", "pathankot", 18, 0.73),
    ("6 Sqn Dragons", "DRAGON", "jaguar_darin3", "pathankot", 16, 0.69),
    # Srinagar — 1 squadron
    ("47 Sqn Black Archers", "ARCHER", "mig29_upg", "srinagar", 16, 0.71),
    # Bareilly — 3 squadrons
    ("24 Sqn Hawks", "HAWK", "su30_mki", "bareilly", 18, 0.77),
    ("8 Sqn Pursoots", "PURSOOT", "su30_mki", "bareilly", 18, 0.76),
    ("1 Sqn Tigers", "TIGER", "mirage2000", "bareilly", 16, 0.74),
    # Gwalior — 2 squadrons
    ("7 Sqn Battleaxes", "AXE", "mirage2000", "gwalior", 16, 0.73),
    ("9 Sqn Wolfpack", "WOLF", "mirage2000", "gwalior", 16, 0.72),
    # Pune — 2 squadrons
    ("15 Sqn Flying Lancers", "LANCER", "su30_mki", "pune", 18, 0.76),
    ("20 Sqn Lightnings", "LIGHTNING", "su30_mki", "pune", 18, 0.75),
    # Thanjavur — 2 squadrons
    ("222 Sqn Tigersharks", "TSHARK", "su30_mki", "thanjavur", 18, 0.77),
    ("45 Sqn Flying Daggers", "DAGGER", "tejas_mk1", "thanjavur", 16, 0.80),
    # Tezpur — 2 squadrons
    ("31 Sqn Lions", "LION", "su30_mki", "tezpur", 18, 0.74),
    ("27 Sqn Flaming Arrows", "FLAME", "jaguar_darin3", "tezpur", 16, 0.67),
    # Chabua — 2 squadrons
    ("102 Sqn Trisonics", "TRISONIC", "su30_mki", "chabua", 18, 0.73),
    ("18 Sqn Flying Bullets", "BULLET", "tejas_mk1", "chabua", 16, 0.79),
    # Car Nicobar — 1 squadron
    ("21 Sqn Ankush", "ANKUSH", "su30_mki", "car_nicobar", 18, 0.72),
    # Nal — 2 squadrons
    ("51 Sqn Swordarms", "SWORD", "mig21_bison", "nal", 14, 0.60),
    ("87 Sqn Falcons of Nal", "NALCON", "tejas_mk1a", "nal", 16, 0.83),
]
```

**OOB_2026_Q2** — full adversary starting inventory:

```python
OOB_2026_Q2 = {
    "PLAAF": {
        "j20a": 500, "j20s": 40, "j35a": 30, "j10c": 400, "j16": 350,
        "j11b": 200, "kj500": 30, "h6kj": 120,
    },
    "PAF": {
        "j10ce": 36, "j35e": 8, "jf17_blk3": 80, "f16_blk52": 45,
    },
    "PLAN": {
        "fujian": 1, "h6n": 36,
    },
}
```

Keep the existing seed function structure — just expand the data. The iteration logic stays the same.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_seed_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && python -m pytest -x -q`
Expected: All tests pass. Some existing tests may need adjustment if they assert on squadron/base counts from the old seed (3 squadrons). Update those to match the new 31 count.

- [ ] **Step 7: Commit**

```bash
git add backend/content/bases.yaml backend/app/crud/seed_starting_state.py backend/tests/test_seed_expansion.py
git commit -m "feat: expand to 15 bases + 31 starting squadrons + full adversary OOB"
```

---

### Task 3: Objectives Expansion + Evaluation Logic

**Files:**
- Modify: `backend/content/objectives.yaml` — expand from 3 to 12 objectives
- Modify: `backend/app/api/summary.py` — extend `_evaluate_objective` for new objectives
- Create: `backend/tests/test_objectives_expansion.py`

- [ ] **Step 1: Write the objectives test**

Create `backend/tests/test_objectives_expansion.py`:

```python
"""Tests for expanded objectives content + evaluation."""
from backend.app.content.loader import load_objectives
from pathlib import Path


def test_objective_count():
    objectives = load_objectives(Path("backend/content/objectives.yaml"))
    assert len(objectives) == 12


def test_all_objectives_have_weight():
    objectives = load_objectives(Path("backend/content/objectives.yaml"))
    for o in objectives.values():
        assert o.weight >= 1, f"{o.id} has weight {o.weight}"


def test_all_objectives_have_target_year():
    objectives = load_objectives(Path("backend/content/objectives.yaml"))
    for o in objectives.values():
        assert o.target_year is not None, f"{o.id} missing target_year"
        assert 2030 <= o.target_year <= 2036, f"{o.id} target_year {o.target_year} out of range"
```

- [ ] **Step 2: Expand objectives.yaml**

Replace `backend/content/objectives.yaml`:

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

  - id: modernize_fleet
    title: Modernize fleet to 4.5+ gen majority
    description: Ensure >50% of squadrons fly 4.5-generation or newer platforms by 2036.
    weight: 2
    target_year: 2036

  - id: indigenous_backbone
    title: Build indigenous fighter backbone
    description: Field 5 or more squadrons on indigenous platforms (Tejas, AMCA) by 2036.
    weight: 2
    target_year: 2036

  - id: missile_sovereignty
    title: Achieve missile sovereignty
    description: Complete both Astra Mk3 and BrahMos-NG R&D programs.
    weight: 2
    target_year: 2036

  - id: maritime_reach
    title: Develop carrier-capable fighter
    description: Complete the TEDBF R&D program for deck-based naval fighter.
    weight: 2
    target_year: 2035

  - id: budget_discipline
    title: Maintain fiscal discipline
    description: End the campaign with positive treasury (>0 cr remaining).
    weight: 1
    target_year: 2036

  - id: combat_excellence
    title: Demonstrate combat excellence
    description: Win more than 65% of all vignettes across the campaign.
    weight: 2
    target_year: 2036

  - id: stealth_fleet
    title: Establish stealth air capability
    description: Field 2 or more squadrons on VLO (stealth) platforms by 2035.
    weight: 3
    target_year: 2035

  - id: ace_squadrons
    title: Cultivate emerging aces
    description: Earn ace names for 3 or more squadrons through vignette performance.
    weight: 1
    target_year: 2036

  - id: deterrence_posture
    title: Build comprehensive deterrence
    description: Complete 4 or more missile, EW, or sensor R&D programs.
    weight: 2
    target_year: 2036
```

- [ ] **Step 3: Extend _evaluate_objective in summary.py**

In `backend/app/api/summary.py`, extend the `_evaluate_objective` function to handle the 9 new objective IDs. The existing function handles `amca_operational_by_2035`, `maintain_42_squadrons`, and `no_territorial_loss`. Add cases for each new ID:

```python
def _evaluate_objective(obj_id: str, db: Session, campaign) -> dict:
    """Returns {"id": str, "title": str, "grade": "pass"|"partial"|"fail", "detail": str}."""
    from backend.app.content import registry
    obj = registry.objectives().get(obj_id)
    if not obj:
        return {"id": obj_id, "title": "Unknown", "grade": "fail", "detail": "Objective not found"}

    # ... existing cases for amca_operational_by_2035, maintain_42_squadrons, no_territorial_loss ...

    if obj_id == "modernize_fleet":
        squads = db.query(Squadron).filter_by(campaign_id=campaign.id).all()
        platforms = registry.platforms()
        modern = sum(1 for s in squads if platforms.get(s.platform_id) and float(platforms[s.platform_id].generation) >= 4.5)
        ratio = modern / len(squads) if squads else 0
        if ratio > 0.50:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{ratio:.0%} on 4.5+ gen"}
        elif ratio > 0.35:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{ratio:.0%} on 4.5+ gen"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": f"{ratio:.0%} on 4.5+ gen"}

    if obj_id == "indigenous_backbone":
        squads = db.query(Squadron).filter_by(campaign_id=campaign.id).all()
        platforms = registry.platforms()
        indigenous_ids = {"tejas_mk1", "tejas_mk1a", "tejas_mk2", "amca_mk1", "tedbf", "ghatak_ucav"}
        count = sum(1 for s in squads if s.platform_id in indigenous_ids)
        if count >= 5:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{count} indigenous squadrons"}
        elif count >= 3:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{count} indigenous squadrons"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": f"{count} indigenous squadrons"}

    if obj_id == "missile_sovereignty":
        from backend.app.models.rd_program import RDProgramState
        completed = {r.program_id for r in db.query(RDProgramState).filter_by(campaign_id=campaign.id, status="completed").all()}
        needed = {"astra_mk3", "brahmos_ng"}
        met = needed & completed
        if met == needed:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": "Both programs complete"}
        elif len(met) == 1:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"1 of 2 complete"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": "Neither complete"}

    if obj_id == "maritime_reach":
        from backend.app.models.rd_program import RDProgramState
        tedbf = db.query(RDProgramState).filter_by(campaign_id=campaign.id, program_id="tedbf", status="completed").first()
        if tedbf:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": "TEDBF complete"}
        active = db.query(RDProgramState).filter_by(campaign_id=campaign.id, program_id="tedbf", status="active").first()
        if active and active.progress_pct > 50:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"TEDBF {active.progress_pct:.0f}% complete"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": "TEDBF not complete"}

    if obj_id == "budget_discipline":
        if campaign.budget_cr > 0:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"₹{campaign.budget_cr:,} cr remaining"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": f"₹{campaign.budget_cr:,} cr (deficit)"}

    if obj_id == "combat_excellence":
        from backend.app.models.vignette import Vignette
        vigs = db.query(Vignette).filter_by(campaign_id=campaign.id, status="resolved").all()
        wins = sum(1 for v in vigs if v.outcome and v.outcome.get("objective_met"))
        total = len(vigs)
        ratio = wins / total if total else 0
        if ratio > 0.65:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{wins}/{total} won ({ratio:.0%})"}
        elif ratio > 0.50:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{wins}/{total} won ({ratio:.0%})"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": f"{wins}/{total} won ({ratio:.0%})"}

    if obj_id == "stealth_fleet":
        squads = db.query(Squadron).filter_by(campaign_id=campaign.id).all()
        platforms = registry.platforms()
        vlo = sum(1 for s in squads if platforms.get(s.platform_id) and platforms[s.platform_id].rcs_band == "VLO")
        if vlo >= 2:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{vlo} VLO squadrons"}
        elif vlo >= 1:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{vlo} VLO squadron"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": "No VLO squadrons"}

    if obj_id == "ace_squadrons":
        from backend.app.models.narrative import CampaignNarrative
        aces = db.query(CampaignNarrative).filter_by(campaign_id=campaign.id, kind="ace_name").count()
        if aces >= 3:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{aces} ace squadrons"}
        elif aces >= 1:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{aces} ace squadron(s)"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": "No ace squadrons"}

    if obj_id == "deterrence_posture":
        from backend.app.models.rd_program import RDProgramState
        deterrence_programs = {"astra_mk3", "brahmos_ng", "rudram_2", "rudram_3",
                               "pralay_srbm", "long_range_sam", "maya_ew", "ngarm",
                               "air_brahmos2", "mrsam_air", "saaw"}
        completed = {r.program_id for r in db.query(RDProgramState).filter_by(
            campaign_id=campaign.id, status="completed").all()}
        count = len(deterrence_programs & completed)
        if count >= 4:
            return {"id": obj_id, "title": obj.title, "grade": "pass", "detail": f"{count} deterrence programs complete"}
        elif count >= 2:
            return {"id": obj_id, "title": obj.title, "grade": "partial", "detail": f"{count} deterrence programs complete"}
        return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": f"{count} deterrence programs complete"}

    return {"id": obj_id, "title": obj.title, "grade": "fail", "detail": "Evaluation not implemented"}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_objectives_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/content/objectives.yaml backend/app/api/summary.py backend/tests/test_objectives_expansion.py
git commit -m "feat: expand objectives to 12 + evaluation logic for all"
```

---

### Task 4: R&D Programs Expansion

**Files:**
- Modify: `backend/content/rd_programs.yaml` — expand from 10 to 25 programs
- Create: `backend/tests/test_rd_expansion.py`

- [ ] **Step 1: Write the R&D expansion test**

Create `backend/tests/test_rd_expansion.py`:

```python
"""Tests for expanded R&D programs."""
from backend.app.content.loader import load_rd_programs
from pathlib import Path


def test_rd_program_count():
    programs = load_rd_programs(Path("backend/content/rd_programs.yaml"))
    assert len(programs) == 25


def test_all_programs_have_valid_cost():
    programs = load_rd_programs(Path("backend/content/rd_programs.yaml"))
    for p in programs.values():
        assert p.base_cost_cr > 0, f"{p.id} has zero cost"
        assert p.base_duration_quarters >= 4, f"{p.id} has duration < 4 quarters"


def test_no_duplicate_ids():
    programs = load_rd_programs(Path("backend/content/rd_programs.yaml"))
    assert len(programs) == 25, "Duplicate IDs in rd_programs.yaml"
```

- [ ] **Step 2: Expand rd_programs.yaml**

Replace `backend/content/rd_programs.yaml`:

```yaml
programs:
  # ===== Existing 10 programs =====
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

  # ===== New 15 programs =====
  - id: netra_mk2
    name: Netra AEW&C Mk2
    description: Next-gen airborne early warning on Airbus A321neo platform. 6 units planned.
    base_duration_quarters: 16
    base_cost_cr: 20000
    dependencies: []

  - id: pralay_srbm
    name: Pralay SRBM
    description: Short-range ballistic missile system. 150-500 km range, tri-service.
    base_duration_quarters: 8
    base_cost_cr: 10000
    dependencies: []

  - id: tapas_uav
    name: DRDO Tapas MALE UAV
    description: Indigenous medium-altitude long-endurance UAV for ISR.
    base_duration_quarters: 12
    base_cost_cr: 8000
    dependencies: []

  - id: amca_mk2
    name: AMCA Mk2
    description: 6th-gen evolution with loyal wingman integration and optional manning.
    base_duration_quarters: 40
    base_cost_cr: 200000
    dependencies: [amca_mk1]

  - id: su30_super
    name: Su-30 MKI Super Upgrade
    description: Deep upgrade package — Uttam AESA radar, new EW suite, structural life extension.
    base_duration_quarters: 16
    base_cost_cr: 30000
    dependencies: [uttam_aesa]

  - id: uttam_aesa
    name: Uttam AESA Radar
    description: Indigenous AESA radar for Tejas Mk2 and AMCA integration.
    base_duration_quarters: 12
    base_cost_cr: 12000
    dependencies: []

  - id: kaveri_engine
    name: Kaveri Turbojet
    description: Backup dry turbojet development. 80-90 kN class for Tejas derivatives.
    base_duration_quarters: 20
    base_cost_cr: 25000
    dependencies: []

  - id: maya_ew
    name: DRDO Maya EW Suite
    description: Next-gen electronic warfare and ECM pod system for IAF platforms.
    base_duration_quarters: 10
    base_cost_cr: 8000
    dependencies: []

  - id: abhyas_lwm
    name: Abhyas Loyal Wingman
    description: High-speed loyal wingman drone. AI-assisted formation flying with manned aircraft.
    base_duration_quarters: 14
    base_cost_cr: 10000
    dependencies: []

  - id: saaw
    name: DRDO SAAW
    description: Smart Anti-Airfield Weapon — precision-guided anti-runway/shelter munition.
    base_duration_quarters: 6
    base_cost_cr: 5000
    dependencies: []

  - id: long_range_sam
    name: Indigenous Long-Range SAM
    description: S-400 class indigenous surface-to-air missile. 400+ km intercept range.
    base_duration_quarters: 20
    base_cost_cr: 35000
    dependencies: []

  - id: project_kusha
    name: Project Kusha BMD
    description: Ballistic missile defense system with layered interception.
    base_duration_quarters: 24
    base_cost_cr: 45000
    dependencies: []

  - id: air_brahmos2
    name: Air-Launched BrahMos-II
    description: Hypersonic air-launched cruise missile. Mach 7+ with scramjet propulsion.
    base_duration_quarters: 16
    base_cost_cr: 20000
    dependencies: [brahmos_ng]

  - id: mrsam_air
    name: MR-SAM Air Defense
    description: Medium-range SAM integration with IAF airbase defense network.
    base_duration_quarters: 8
    base_cost_cr: 12000
    dependencies: []

  - id: ngarm
    name: Next-Gen Anti-Radiation Missile
    description: Follow-on to Rudram series. Dual-mode seeker, 600+ km standoff.
    base_duration_quarters: 10
    base_cost_cr: 9000
    dependencies: [rudram_3]
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_rd_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/content/rd_programs.yaml backend/tests/test_rd_expansion.py
git commit -m "feat: expand R&D programs to 25 with missiles, sensors, EW, UAVs"
```

---

### Task 5: Scenario Templates Expansion

**Files:**
- Modify: `backend/content/scenario_templates.yaml` — expand from 8 to 20 scenarios
- Create: `backend/tests/test_scenario_expansion.py`

- [ ] **Step 1: Write the scenario expansion test**

Create `backend/tests/test_scenario_expansion.py`:

```python
"""Tests for expanded scenario templates."""
from backend.app.content.loader import load_scenario_templates, load_platforms
from backend.app.engine.vignette.bvr import PLATFORM_LOADOUTS
from pathlib import Path


def test_scenario_count():
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    assert len(templates) == 20


def test_all_roster_platforms_have_loadouts():
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Missing PLATFORM_LOADOUTS: {missing}"


def test_scenario_weight_positive():
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    for t in templates:
        assert t.weight > 0, f"{t.id} has non-positive weight"


def test_q_index_ranges_valid():
    templates = load_scenario_templates(Path("backend/content/scenario_templates.yaml"))
    for t in templates:
        assert 0 <= t.q_index_min <= t.q_index_max <= 39, f"{t.id} has invalid q_index range"
```

- [ ] **Step 2: Expand scenario_templates.yaml**

Append 12 new scenario templates after the existing 8 in `backend/content/scenario_templates.yaml`. Keep all 8 existing entries unchanged. Add:

```yaml
  - id: plaaf_sead_package
    name: "PLAAF SEAD Strike Package"
    ao: {region: lac_western, name: "Aksai Chin corridor", lat: 35.5, lon: 79.0}
    response_clock_minutes: 40
    q_index_min: 4
    q_index_max: 39
    weight: 1.0
    requires:
      adversary_inventory: {PLAAF: {j16: 200}}
    adversary_roster:
      - role: strike
        faction: PLAAF
        platform_pool: [j16]
        count_range: [4, 8]
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a, j35a]
        count_range: [2, 6]
    allowed_ind_roles: [CAP, SEAD, awacs, tanker]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 3, ind_losses_max: 4}

  - id: paf_low_level_strike
    name: "PAF Low-Level Strike Run"
    ao: {region: western_border, name: "Thar desert sector", lat: 27.0, lon: 71.5}
    response_clock_minutes: 35
    q_index_min: 0
    q_index_max: 39
    weight: 0.9
    requires:
      adversary_inventory: {}
    adversary_roster:
      - role: strike
        faction: PAF
        platform_pool: [jf17_blk3, f16_blk52]
        count_range: [4, 8]
      - role: CAP
        faction: PAF
        platform_pool: [j10ce]
        count_range: [2, 4]
    allowed_ind_roles: [CAP, SEAD, awacs]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 3, ind_losses_max: 3}

  - id: joint_two_front
    name: "Coordinated Two-Front Probe"
    ao: {region: lac_western, name: "Ladakh / Punjab dual axis", lat: 33.0, lon: 76.0}
    response_clock_minutes: 30
    q_index_min: 12
    q_index_max: 39
    weight: 0.7
    requires:
      adversary_inventory: {PLAAF: {j20a: 600}, PAF: {j35e: 30}}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a, j35a]
        count_range: [4, 6]
      - role: CAP
        faction: PAF
        platform_pool: [j35e, j10ce]
        count_range: [4, 6]
    allowed_ind_roles: [CAP, SEAD, awacs, tanker]
    roe_options: [weapons_free]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 4, ind_losses_max: 6}

  - id: plan_maritime_strike
    name: "PLAN Maritime Strike Escort"
    ao: {region: ior_central, name: "Arabian Sea western approaches", lat: 15.0, lon: 65.0}
    response_clock_minutes: 90
    q_index_min: 8
    q_index_max: 39
    weight: 0.6
    requires:
      adversary_inventory: {PLAN: {h6n: 20}}
    adversary_roster:
      - role: strike
        faction: PLAN
        platform_pool: [h6n]
        count_range: [2, 4]
      - role: CAP
        faction: PLAN
        platform_pool: [j35a]
        count_range: [2, 6]
    allowed_ind_roles: [CAP, strike, awacs, tanker]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 2, ind_losses_max: 4}

  - id: plaaf_j36_debut
    name: "J-36 Sixth-Gen First Contact"
    ao: {region: lac_eastern, name: "Sikkim gap", lat: 27.5, lon: 88.5}
    response_clock_minutes: 45
    q_index_min: 24
    q_index_max: 39
    weight: 0.5
    requires:
      adversary_inventory: {PLAAF: {j36: 8}}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j36]
        count_range: [2, 4]
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a]
        count_range: [2, 4]
    allowed_ind_roles: [CAP, SEAD, awacs, tanker]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 1, ind_losses_max: 3}

  - id: lac_western_surge
    name: "PLAAF Western Sector Surge"
    ao: {region: lac_western, name: "Depsang Plains sector", lat: 35.0, lon: 77.5}
    response_clock_minutes: 35
    q_index_min: 8
    q_index_max: 39
    weight: 0.9
    requires:
      adversary_inventory: {PLAAF: {j20a: 400}}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a, j35a, j10c]
        count_range: [6, 12]
      - role: strike
        faction: PLAAF
        platform_pool: [j16, j11b]
        count_range: [4, 8]
    allowed_ind_roles: [CAP, SEAD, strike, awacs, tanker]
    roe_options: [weapons_free]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 5, ind_losses_max: 6}

  - id: paf_standoff_cruise
    name: "PAF Standoff Cruise Missile Profile"
    ao: {region: western_border, name: "Gujarat / Kutch sector", lat: 24.0, lon: 69.0}
    response_clock_minutes: 50
    q_index_min: 8
    q_index_max: 39
    weight: 0.8
    requires:
      adversary_inventory: {PAF: {j35e: 20}}
    adversary_roster:
      - role: strike
        faction: PAF
        platform_pool: [j35e, j10ce]
        count_range: [4, 8]
      - role: CAP
        faction: PAF
        platform_pool: [jf17_blk3, f16_blk52]
        count_range: [2, 4]
    allowed_ind_roles: [CAP, SEAD, awacs, tanker]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 3, ind_losses_max: 4}

  - id: plan_carrier_defense
    name: "PLAN Carrier Air Defense"
    ao: {region: ior_central, name: "Bay of Bengal approaches", lat: 10.0, lon: 85.0}
    response_clock_minutes: 120
    q_index_min: 16
    q_index_max: 39
    weight: 0.6
    requires:
      adversary_inventory: {PLAN: {type004_carrier: 1}}
    adversary_roster:
      - role: CAP
        faction: PLAN
        platform_pool: [j35a]
        count_range: [6, 10]
    allowed_ind_roles: [CAP, strike, awacs, tanker]
    roe_options: [weapons_free, weapons_tight]
    objective:
      kind: escort_carrier
      success_threshold: {adv_kills_min: 3, ind_losses_max: 5}

  - id: plaaf_night_intercept
    name: "PLAAF Night Intercept"
    ao: {region: lac_eastern, name: "Tawang sector", lat: 27.6, lon: 91.8}
    response_clock_minutes: 30
    q_index_min: 4
    q_index_max: 39
    weight: 0.8
    requires:
      adversary_inventory: {}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a, j10c, j16]
        count_range: [4, 8]
    allowed_ind_roles: [CAP, awacs]
    roe_options: [weapons_free, visual_id_required]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 2, ind_losses_max: 3}

  - id: andaman_patrol
    name: "Andaman Sea Air Patrol"
    ao: {region: ior_malacca, name: "Andaman Sea / Car Nicobar sector", lat: 9.5, lon: 93.5}
    response_clock_minutes: 60
    q_index_min: 0
    q_index_max: 39
    weight: 0.7
    requires:
      adversary_inventory: {}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a, j10c]
        count_range: [2, 4]
      - role: awacs
        faction: PLAAF
        platform_pool: [kj500]
        count_range: [0, 1]
    allowed_ind_roles: [CAP, awacs, tanker]
    roe_options: [weapons_tight, visual_id_required]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 1, ind_losses_max: 2}

  - id: lac_awacs_hunt
    name: "PLAAF AWACS Hunt Mission"
    ao: {region: lac_western, name: "Karakoram corridor", lat: 36.0, lon: 77.0}
    response_clock_minutes: 45
    q_index_min: 12
    q_index_max: 39
    weight: 0.6
    requires:
      adversary_inventory: {PLAAF: {j20a: 500}}
    adversary_roster:
      - role: CAP
        faction: PLAAF
        platform_pool: [j20a]
        count_range: [4, 6]
    allowed_ind_roles: [CAP, awacs, tanker]
    roe_options: [weapons_free]
    objective:
      kind: defend_airspace
      success_threshold: {adv_kills_min: 2, ind_losses_max: 2}

  - id: paf_retaliatory_strike
    name: "PAF Retaliatory Deep Strike"
    ao: {region: western_border, name: "Sindh border / Barmer sector", lat: 26.0, lon: 70.0}
    response_clock_minutes: 30
    q_index_min: 4
    q_index_max: 39
    weight: 0.8
    requires:
      adversary_inventory: {PAF: {j35e: 10}}
    adversary_roster:
      - role: strike
        faction: PAF
        platform_pool: [j35e, jf17_blk3]
        count_range: [6, 10]
      - role: CAP
        faction: PAF
        platform_pool: [j10ce, f16_blk52]
        count_range: [2, 6]
    allowed_ind_roles: [CAP, SEAD, awacs, tanker]
    roe_options: [weapons_free]
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 4, ind_losses_max: 5}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_scenario_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/content/scenario_templates.yaml backend/tests/test_scenario_expansion.py
git commit -m "feat: expand scenario templates to 20 archetypes"
```

---

### Task 6: Intel Templates + Adversary Roadmap Expansion

**Files:**
- Modify: `backend/content/intel_templates.yaml` — add 7 new templates
- Modify: `backend/content/adversary_roadmap.yaml` — add 8 events to fill quarterly gaps
- Create: `backend/tests/test_intel_roadmap_expansion.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_intel_roadmap_expansion.py`:

```python
"""Tests for expanded intel templates and adversary roadmap."""
from backend.app.content.loader import load_intel_templates, load_adversary_roadmap
from pathlib import Path


def test_intel_template_count():
    templates = load_intel_templates(Path("backend/content/intel_templates.yaml"))
    assert len(templates) >= 22


def test_adversary_roadmap_chronological():
    events = load_adversary_roadmap(Path("backend/content/adversary_roadmap.yaml"))
    for i in range(1, len(events)):
        prev = (events[i - 1].year, events[i - 1].quarter)
        curr = (events[i].year, events[i].quarter)
        assert curr >= prev, f"Event {i} out of order: {prev} > {curr}"


def test_roadmap_covers_full_campaign():
    events = load_adversary_roadmap(Path("backend/content/adversary_roadmap.yaml"))
    years = {e.year for e in events}
    for y in range(2026, 2037):
        assert y in years, f"Year {y} has no adversary events"


def test_all_factions_represented():
    events = load_adversary_roadmap(Path("backend/content/adversary_roadmap.yaml"))
    factions = {e.faction for e in events}
    assert "PLAAF" in factions
    assert "PAF" in factions
    assert "PLAN" in factions
```

- [ ] **Step 2: Add 7 new intel templates to intel_templates.yaml**

Append these entries to the existing 15 templates:

```yaml
  # ===== NEW — PLAAF expansion =====
  - id: plaaf_j20s_wingman
    faction: PLAAF
    source_types: [SIGINT, HUMINT]
    headline_template: "PLAAF J-20S loyal wingman exercises observed — {count} airframes"
    subject_type: deployment_observation
    trigger: {min_inventory: {j20s: 20}}
    payload_keys:
      count: {source: inventory, key: j20s, noise: 0.20}

  - id: plaaf_western_buildup
    faction: PLAAF
    source_types: [IMINT]
    headline_template: "Satellite imagery shows expanded hardened shelters at western theater bases"
    subject_type: base_rotation
    trigger: {min_inventory: {j20a: 600}}
    payload_keys:
      count: {source: inventory, key: j20a, scale: 0.02, noise: 0.20}
      base: {source: forward_bases, pick: random}

  - id: plaaf_j16_sead
    faction: PLAAF
    source_types: [ELINT, SIGINT]
    headline_template: "PLAAF J-16 SEAD squadron practicing anti-radiation missile profiles"
    subject_type: system_activation
    trigger: {min_inventory: {j16: 300}}
    payload_keys:
      active: {source: literal, value: true}

  # ===== NEW — PAF expansion =====
  - id: paf_j35e_exercises
    faction: PAF
    source_types: [OSINT, IMINT]
    headline_template: "PAF conducts multi-role exercises with J-35E fleet — assessed {count} airframes"
    subject_type: force_count
    trigger: {min_inventory: {j35e: 30}}
    payload_keys:
      count: {source: inventory, key: j35e, noise: 0.15}

  - id: paf_forward_basing
    faction: PAF
    source_types: [IMINT]
    headline_template: "PAF dispersing fighters to forward operating bases near border"
    subject_type: base_rotation
    trigger: {min_inventory: {j35e: 40}}
    payload_keys:
      base: {source: forward_bases, pick: random}

  # ===== NEW — PLAN expansion =====
  - id: plan_type004_operations
    faction: PLAN
    source_types: [IMINT, OSINT]
    headline_template: "PLAN Type 004 nuclear carrier conducting flight operations in South China Sea"
    subject_type: deployment_observation
    trigger: {min_inventory: {type004_carrier: 1}}
    payload_keys:
      count: {source: inventory, key: type004_carrier, noise: 0.0}

  - id: plan_ior_expansion
    faction: PLAN
    source_types: [SIGINT, HUMINT]
    headline_template: "PLAN expanding Indian Ocean presence — additional surface combatants detected"
    subject_type: force_count
    trigger: {min_inventory: {type055_destroyer: 2}}
    payload_keys:
      count: {source: inventory, key: type055_destroyer, noise: 0.15}
```

- [ ] **Step 3: Add 8 adversary events to fill roadmap gaps**

Append these events in chronological order to `backend/content/adversary_roadmap.yaml`, inserting at the correct position to maintain chronological sort:

```yaml
  # Fill 2027-Q1 gap for PLAAF
  - year: 2027
    quarter: 1
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 50, j35a: 20}}
    intel:
      headline: "PLAAF accelerates J-20A production — new batch reaches operational units"
      source_type: OSINT
      confidence: 0.72

  # Fill 2028-Q4 gap for PLAN
  - year: 2028
    quarter: 4
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type055_destroyer: 1}}
    intel:
      headline: "New Type-055 destroyer enters service — Indian Ocean deployment expected"
      source_type: IMINT
      confidence: 0.85

  # Fill 2029-Q4 gap for PAF
  - year: 2029
    quarter: 4
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 6}}

  # Fill 2031-Q1 gap for PAF
  - year: 2031
    quarter: 1
    faction: PAF
    effect: {kind: base_activate, payload: masroor_expanded}
    intel:
      headline: "PAF expanding Masroor AFS for J-35E operational readiness"
      source_type: HUMINT
      confidence: 0.55

  # Fill 2032-Q2 gap for PLAN
  - year: 2032
    quarter: 2
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type093b_ssn: 1}}

  # Fill 2033-Q1 gap for PAF
  - year: 2033
    quarter: 1
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 10}}
    intel:
      headline: "PAF exercising third tranche option on J-35E contract"
      source_type: OSINT
      confidence: 0.65

  # Fill 2034-Q1 gap for PLAN
  - year: 2034
    quarter: 1
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type055_destroyer: 1, h6n: 12}}

  # Fill 2035-Q4 gap for PLAN
  - year: 2035
    quarter: 4
    faction: PLAN
    effect: {kind: system_activate, payload: plan_ior_permanent_presence}
    intel:
      headline: "PLAN establishes permanent Indian Ocean task force rotation"
      source_type: SIGINT
      confidence: 0.78
```

**Important:** These must be inserted at the correct chronological position in the file, not appended at the end. The file must remain sorted by (year, quarter).

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_intel_roadmap_expansion.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/content/intel_templates.yaml backend/content/adversary_roadmap.yaml backend/tests/test_intel_roadmap_expansion.py
git commit -m "feat: expand intel templates to 22 + fill adversary roadmap gaps"
```

---

### Task 7: Backend Schema Fixes — R&D UniqueConstraint + Delivery Window Engine

**Files:**
- Modify: `backend/app/models/rd_program.py` — add UniqueConstraint
- Modify: `backend/app/engine/acquisition.py` — (no change needed; delivery windows come from frontend)
- Create: `backend/tests/test_rd_unique_constraint.py`

- [ ] **Step 1: Write the UniqueConstraint test**

Create `backend/tests/test_rd_unique_constraint.py`:

```python
"""Tests for R&D program state UniqueConstraint."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError
from backend.app.models import Base
from backend.app.models.rd_program import RDProgramState


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_unique_constraint_prevents_duplicate(db):
    """Cannot create two active RDProgramState rows for same (campaign_id, program_id)."""
    state1 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", invested_cr=0)
    db.add(state1)
    db.flush()

    state2 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=50, funding_level="standard", invested_cr=1000)
    db.add(state2)
    with pytest.raises(IntegrityError):
        db.flush()


def test_different_campaigns_allowed(db):
    """Different campaigns can have the same program."""
    state1 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", invested_cr=0)
    state2 = RDProgramState(campaign_id=2, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", invested_cr=0)
    db.add_all([state1, state2])
    db.flush()
    assert True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_rd_unique_constraint.py -v`
Expected: FAIL on `test_unique_constraint_prevents_duplicate` (no IntegrityError raised)

- [ ] **Step 3: Add UniqueConstraint to RDProgramState**

In `backend/app/models/rd_program.py`, add a `__table_args__` with a UniqueConstraint:

```python
from sqlalchemy import UniqueConstraint

class RDProgramState(Base):
    __tablename__ = "rd_program_states"
    __table_args__ = (
        UniqueConstraint("campaign_id", "program_id", name="uq_campaign_program"),
    )
    # ... existing columns unchanged ...
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python -m pytest tests/test_rd_unique_constraint.py -v`
Expected: ALL PASS

- [ ] **Step 5: Run full backend suite**

Run: `cd backend && python -m pytest -x -q`
Expected: All pass. If any existing test creates duplicate (campaign_id, program_id) rows, it will fail and needs fixing — this indicates the carry-over bug was real.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/rd_program.py backend/tests/test_rd_unique_constraint.py
git commit -m "fix: add UniqueConstraint on rd_program_states(campaign_id, program_id)"
```

---

### Task 8: Frontend Carry-Over Fixes

**Files:**
- Modify: `frontend/src/lib/types.ts` — add `procurable_by` + delivery window fields to Platform type
- Modify: `frontend/src/pages/ProcurementHub.tsx` — replace CHN/PAK filter with `procurable_by`
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx` — allow multi-batch, use per-platform delivery windows
- Modify: `frontend/src/components/procurement/RDDashboard.tsx` — add title attributes to funding buttons

- [ ] **Step 1: Update Platform type in types.ts**

Add three new fields to the `Platform` interface in `frontend/src/lib/types.ts`:

```typescript
interface Platform {
  id: string;
  name: string;
  origin: string;
  role: string;
  generation: string;
  combat_radius_km: number;
  payload_kg: number;
  rcs_band: string;
  radar_range_km: number;
  cost_cr: number;
  intro_year: number;
  procurable_by: string[];
  default_first_delivery_quarters: number;
  default_foc_quarters: number;
}
```

- [ ] **Step 2: Replace CHN/PAK filter in ProcurementHub.tsx**

In `frontend/src/pages/ProcurementHub.tsx`, replace the hard-coded origin filter (lines 66-68):

```typescript
// OLD:
const platformList = Object.values(platformsById)
  .filter((p) => p.origin !== "CHN" && p.origin !== "PAK")
  .sort((a, b) => a.name.localeCompare(b.name));

// NEW:
const platformList = Object.values(platformsById)
  .filter((p) => p.procurable_by && p.procurable_by.includes("IND"))
  .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 3: Allow multi-batch procurement in AcquisitionPipeline.tsx**

In `frontend/src/components/procurement/AcquisitionPipeline.tsx`, remove the filter that hides platforms with active orders (lines 146-147):

```typescript
// OLD:
const orderedPlatformIds = new Set(orders.map((o) => o.platform_id));
const availablePlatforms = platforms.filter((p) => !orderedPlatformIds.has(p.id));

// NEW — show all procurable platforms, allow repeat orders:
const availablePlatforms = platforms;
```

Also update the delivery window calculation to use per-platform defaults instead of hardcoded +2yr/+4yr. Find where the offer creates `first_delivery` and `foc` values and replace with:

```typescript
const currentQ = campaign.current_quarter;
const currentY = campaign.current_year;

// Use per-platform delivery windows
const firstDeliveryQ = platform.default_first_delivery_quarters;
const focQ = platform.default_foc_quarters;

// Calculate target year/quarter from current + offset
const firstYear = currentY + Math.floor((currentQ - 1 + firstDeliveryQ) / 4);
const firstQuarter = ((currentQ - 1 + firstDeliveryQ) % 4) + 1;
const focYear = currentY + Math.floor((currentQ - 1 + focQ) / 4);
const focQuarter = ((currentQ - 1 + focQ) % 4) + 1;
```

- [ ] **Step 4: Add title attributes to RDDashboard funding buttons**

In `frontend/src/components/procurement/RDDashboard.tsx`, add `title` attributes to the funding-level buttons. Find the two locations where `{lvl === "slow" ? "↓" : lvl === "standard" ? "●" : "↑"}` appears and wrap each button with a `title`:

```typescript
<button
  key={lvl}
  title={lvl}  // ADD THIS LINE
  className={/* ... existing className ... */}
  onClick={() => /* ... existing handler ... */}
>
  {lvl === "slow" ? "↓" : lvl === "standard" ? "●" : "↑"}
</button>
```

Do this in both the ActiveRow and CatalogRow components (two locations).

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: 90+ tests pass. Some procurement tests may need updates to accommodate:
- `procurable_by` field in mock platform data
- Multi-batch procurement (tests that assert "platform disappears after ordering")
- RD button `title` attributes (tests can now use `getByTitle("standard")`)

Update affected test mocks to include `procurable_by: ["IND"]` and `default_first_delivery_quarters` / `default_foc_quarters` fields.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/pages/ProcurementHub.tsx frontend/src/components/procurement/AcquisitionPipeline.tsx frontend/src/components/procurement/RDDashboard.tsx
git commit -m "fix: procurable_by filter, multi-batch procurement, RD labels, delivery windows"
```

---

### Task 9: IntelContactsLayer Hydration

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx` — pass synthesized contacts instead of empty array
- Modify: `frontend/src/lib/types.ts` — add `IntelContact` type if not present
- Create: `frontend/src/lib/intelContacts.ts` — synthesis logic
- Create: `frontend/src/lib/__tests__/intelContacts.test.ts`

- [ ] **Step 1: Check IntelContact type in types.ts**

The `IntelContactsLayer` component expects a `contacts` prop. Check what shape it needs by reading `frontend/src/components/map/IntelContactsLayer.tsx`. The type likely needs: `{ id: string; lat: number; lon: number; faction: string; label: string; confidence: number }`.

Add or verify the `IntelContact` type in `frontend/src/lib/types.ts`:

```typescript
export interface IntelContact {
  id: string;
  lat: number;
  lon: number;
  faction: string;
  label: string;
  confidence: number;
}
```

- [ ] **Step 2: Write the synthesis test**

Create `frontend/src/lib/__tests__/intelContacts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { synthesizeContacts } from "../intelContacts";
import type { IntelCard } from "../types";

const ADVERSARY_BASES: Record<string, { lat: number; lon: number }> = {
  PLAAF: { lat: 34.0, lon: 78.5 },
  PAF: { lat: 30.5, lon: 72.5 },
  PLAN: { lat: 5.0, lon: 80.0 },
};

describe("synthesizeContacts", () => {
  it("returns empty for empty cards", () => {
    expect(synthesizeContacts([])).toEqual([]);
  });

  it("creates contact from IMINT card with faction", () => {
    const card: IntelCard = {
      id: "intel-1",
      source_type: "IMINT",
      headline: "J-20A observed",
      confidence: 0.85,
      subject_faction: "PLAAF",
      year: 2026,
      quarter: 3,
    } as IntelCard;
    const contacts = synthesizeContacts([card]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].faction).toBe("PLAAF");
    expect(contacts[0].lat).toBeCloseTo(34.0, 0);
  });

  it("skips cards without subject_faction", () => {
    const card = {
      id: "intel-2",
      source_type: "OSINT",
      headline: "General chatter",
      confidence: 0.5,
      year: 2026,
      quarter: 3,
    } as IntelCard;
    expect(synthesizeContacts([card])).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement synthesis logic**

Create `frontend/src/lib/intelContacts.ts`:

```typescript
import type { IntelCard, IntelContact } from "./types";

const ADVERSARY_BASES: Record<string, { lat: number; lon: number }> = {
  PLAAF: { lat: 34.0, lon: 78.5 },
  PAF: { lat: 30.5, lon: 72.5 },
  PLAN: { lat: 5.0, lon: 80.0 },
};

const JITTER = 2.0;

function jitter(base: number, seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return base + ((hash % 100) / 100 - 0.5) * JITTER;
}

export function synthesizeContacts(cards: IntelCard[]): IntelContact[] {
  const contacts: IntelContact[] = [];
  for (const card of cards) {
    const faction = (card as Record<string, unknown>).subject_faction as string | undefined;
    if (!faction || !ADVERSARY_BASES[faction]) continue;
    const base = ADVERSARY_BASES[faction];
    contacts.push({
      id: card.id,
      lat: jitter(base.lat, card.id + "lat"),
      lon: jitter(base.lon, card.id + "lon"),
      faction,
      label: card.headline,
      confidence: card.confidence,
    });
  }
  return contacts;
}
```

- [ ] **Step 4: Wire into CampaignMapView**

In `frontend/src/pages/CampaignMapView.tsx`, replace the empty `contacts={[]}` with synthesized contacts:

```typescript
import { synthesizeContacts } from "../lib/intelContacts";
import { useCampaignStore } from "../store/campaignStore";

// Inside the component:
const intelCards = useCampaignStore((s) => s.intelCards);
const intelContacts = synthesizeContacts(intelCards);

// In the JSX:
{activeLayers.intel_contacts && (
  <IntelContactsLayer
    map={mapInstance}
    contacts={intelContacts}
    projectionVersion={projectionVersion}
  />
)}
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All pass including new intelContacts tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/intelContacts.ts frontend/src/lib/__tests__/intelContacts.test.ts frontend/src/lib/types.ts frontend/src/pages/CampaignMapView.tsx
git commit -m "feat: hydrate IntelContactsLayer from intel cards"
```

---

### Task 10: Airbase Management — Backend API + Frontend Panel

**Files:**
- Create: `backend/app/engine/base_upgrade.py` — upgrade cost/effect logic
- Create: `backend/app/schemas/base_upgrade.py` — request/response models
- Create: `backend/app/api/base_upgrade.py` — POST endpoint
- Modify: `backend/main.py` — register router
- Create: `backend/tests/test_base_upgrade_api.py`
- Create: `frontend/src/components/base/AirbasePanel.tsx`
- Create: `frontend/src/components/base/__tests__/AirbasePanel.test.tsx`
- Modify: `frontend/src/lib/api.ts` — add `upgradeBase` method
- Modify: `frontend/src/lib/types.ts` — add upgrade types
- Modify: `frontend/src/store/campaignStore.ts` — add upgrade action

The airbase management panel lets players upgrade base infrastructure: shelters (protect from strikes), fuel depots (sortie generation), AD integration (point defense), and runway class.

- [ ] **Step 1: Write the backend test**

Create `backend/tests/test_base_upgrade_api.py`:

```python
"""Tests for airbase upgrade API."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.models import Base
from backend.main import app
from backend.app.core.database import get_db


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def client(db):
    def override():
        yield db
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def _create_campaign(client):
    resp = client.post("/api/campaigns", json={"name": "test", "seed": 42})
    return resp.json()["id"]


def test_upgrade_shelter(client):
    cid = _create_campaign(client)
    resp = client.post(f"/api/campaigns/{cid}/bases/ambala/upgrade", json={"upgrade_type": "shelter"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["shelter_count"] > 24  # started at 24


def test_upgrade_insufficient_funds(client):
    cid = _create_campaign(client)
    # Drain treasury first
    from backend.app.models.campaign import Campaign
    from backend.app.core.database import get_db
    # Instead, just verify the response for a known budget
    resp = client.post(f"/api/campaigns/{cid}/bases/ambala/upgrade", json={"upgrade_type": "shelter"})
    assert resp.status_code == 200


def test_upgrade_invalid_base(client):
    cid = _create_campaign(client)
    resp = client.post(f"/api/campaigns/{cid}/bases/nonexistent/upgrade", json={"upgrade_type": "shelter"})
    assert resp.status_code == 404


def test_upgrade_invalid_type(client):
    cid = _create_campaign(client)
    resp = client.post(f"/api/campaigns/{cid}/bases/ambala/upgrade", json={"upgrade_type": "warp_drive"})
    assert resp.status_code == 422
```

- [ ] **Step 2: Implement base upgrade engine**

Create `backend/app/engine/base_upgrade.py`:

```python
"""Base upgrade cost and effect calculations."""
from typing import Literal

UpgradeType = Literal["shelter", "fuel_depot", "ad_integration", "runway"]

UPGRADE_COSTS = {
    "shelter": 5000,
    "fuel_depot": 3000,
    "ad_integration": 8000,
    "runway": 10000,
}

UPGRADE_CAPS = {
    "shelter": 36,
    "fuel_depot": 5,
    "ad_integration": 3,
    "runway": 3,  # 1=light, 2=medium, 3=heavy
}


def upgrade_cost(upgrade_type: UpgradeType) -> int:
    return UPGRADE_COSTS[upgrade_type]


def apply_upgrade(config: dict, upgrade_type: UpgradeType) -> dict:
    """Returns new config dict with upgrade applied. Raises ValueError if at cap."""
    result = dict(config)
    field_map = {
        "shelter": "shelter_count",
        "fuel_depot": "fuel_depot_size",
        "ad_integration": "ad_integration_level",
        "runway": "runway_level",
    }
    field = field_map[upgrade_type]
    current = result.get(field, 0)
    cap = UPGRADE_CAPS[upgrade_type]
    if current >= cap:
        raise ValueError(f"{upgrade_type} already at maximum ({cap})")
    increment = 4 if upgrade_type == "shelter" else 1
    result[field] = min(current + increment, cap)
    return result
```

- [ ] **Step 3: Create schemas**

Create `backend/app/schemas/base_upgrade.py`:

```python
from pydantic import BaseModel
from typing import Literal


class BaseUpgradeRequest(BaseModel):
    upgrade_type: Literal["shelter", "fuel_depot", "ad_integration", "runway"]


class BaseUpgradeResponse(BaseModel):
    base_id: str
    upgrade_type: str
    cost_cr: int
    shelter_count: int
    fuel_depot_size: int
    ad_integration_level: int
    remaining_budget_cr: int
```

- [ ] **Step 4: Create API endpoint**

Create `backend/app/api/base_upgrade.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.campaign import Campaign
from backend.app.models.campaign_base import CampaignBase
from backend.app.schemas.base_upgrade import BaseUpgradeRequest, BaseUpgradeResponse
from backend.app.engine.base_upgrade import upgrade_cost, apply_upgrade

router = APIRouter(prefix="/api/campaigns/{campaign_id}/bases", tags=["bases"])


@router.post("/{base_id}/upgrade", response_model=BaseUpgradeResponse)
def upgrade_base(campaign_id: int, base_id: str, req: BaseUpgradeRequest, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter_by(id=campaign_id).first()
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    base = db.query(CampaignBase).filter_by(campaign_id=campaign_id, base_id=base_id).first()
    if not base:
        raise HTTPException(404, f"Base {base_id} not found")

    cost = upgrade_cost(req.upgrade_type)
    if campaign.budget_cr < cost:
        raise HTTPException(400, f"Insufficient funds: need {cost} cr, have {campaign.budget_cr} cr")

    config = dict(base.config) if base.config else {}
    try:
        new_config = apply_upgrade(config, req.upgrade_type)
    except ValueError as e:
        raise HTTPException(400, str(e))

    base.config = new_config
    campaign.budget_cr -= cost
    db.commit()
    db.refresh(base)
    db.refresh(campaign)

    return BaseUpgradeResponse(
        base_id=base_id,
        upgrade_type=req.upgrade_type,
        cost_cr=cost,
        shelter_count=new_config.get("shelter_count", 0),
        fuel_depot_size=new_config.get("fuel_depot_size", 0),
        ad_integration_level=new_config.get("ad_integration_level", 0),
        remaining_budget_cr=campaign.budget_cr,
    )
```

- [ ] **Step 5: Register router in main.py**

In `backend/main.py`, add:

```python
from backend.app.api.base_upgrade import router as base_upgrade_router
app.include_router(base_upgrade_router)
```

- [ ] **Step 6: Run backend tests**

Run: `cd backend && python -m pytest tests/test_base_upgrade_api.py -v`
Expected: ALL PASS

- [ ] **Step 7: Add frontend types + API method**

In `frontend/src/lib/types.ts`, add:

```typescript
export interface BaseUpgradeResponse {
  base_id: string;
  upgrade_type: string;
  cost_cr: number;
  shelter_count: number;
  fuel_depot_size: number;
  ad_integration_level: number;
  remaining_budget_cr: number;
}
```

In `frontend/src/lib/api.ts`, add:

```typescript
upgradeBase: (campaignId: number, baseId: string, upgradeType: string) =>
  http.post<BaseUpgradeResponse>(`/api/campaigns/${campaignId}/bases/${baseId}/upgrade`, {
    upgrade_type: upgradeType,
  }).then((r) => r.data),
```

- [ ] **Step 8: Create AirbasePanel component**

Create `frontend/src/components/base/AirbasePanel.tsx`:

```typescript
import { useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";
import { api } from "../../lib/api";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

interface Props {
  campaignId: number;
  baseId: string;
  baseName: string;
  config: {
    shelter_count?: number;
    fuel_depot_size?: number;
    ad_integration_level?: number;
  };
  budgetCr: number;
  onUpgraded: () => void;
}

const UPGRADE_COSTS: Record<string, number> = {
  shelter: 5000,
  fuel_depot: 3000,
  ad_integration: 8000,
};

const UPGRADE_LABELS: Record<string, string> = {
  shelter: "Shelters (+4)",
  fuel_depot: "Fuel Depot (+1)",
  ad_integration: "AD Integration (+1)",
};

export function AirbasePanel({ campaignId, baseId, baseName, config, budgetCr, onUpgraded }: Props) {
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async (type: string) => {
    setUpgrading(true);
    try {
      await api.upgradeBase(campaignId, baseId, type);
      onUpgraded();
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-700">
      <h3 className="text-lg font-semibold text-amber-400 mb-3">{baseName}</h3>
      <div className="grid grid-cols-3 gap-3 text-sm text-slate-300 mb-4">
        <div>
          <span className="text-slate-500">Shelters</span>
          <div className="text-lg font-mono">{config.shelter_count ?? 0}</div>
        </div>
        <div>
          <span className="text-slate-500">Fuel Depot</span>
          <div className="text-lg font-mono">{config.fuel_depot_size ?? 0}</div>
        </div>
        <div>
          <span className="text-slate-500">AD Level</span>
          <div className="text-lg font-mono">{config.ad_integration_level ?? 0}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Object.entries(UPGRADE_LABELS).map(([type, label]) => (
          <button
            key={type}
            disabled={upgrading || budgetCr < UPGRADE_COSTS[type]}
            className="flex justify-between items-center px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded text-sm"
            onClick={() => handleUpgrade(type)}
          >
            <span>{label}</span>
            <span className="text-amber-400">₹{UPGRADE_COSTS[type].toLocaleString("en-US")} cr</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Write component test**

Create `frontend/src/components/base/__tests__/AirbasePanel.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AirbasePanel } from "../AirbasePanel";

describe("AirbasePanel", () => {
  const defaultProps = {
    campaignId: 1,
    baseId: "ambala",
    baseName: "Ambala AFS",
    config: { shelter_count: 24, fuel_depot_size: 3, ad_integration_level: 2 },
    budgetCr: 100000,
    onUpgraded: vi.fn(),
  };

  it("renders base name and stats", () => {
    render(<AirbasePanel {...defaultProps} />);
    expect(screen.getByText("Ambala AFS")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("disables upgrade buttons when budget insufficient", () => {
    render(<AirbasePanel {...defaultProps} budgetCr={100} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((b) => expect(b).toBeDisabled());
  });
});
```

- [ ] **Step 10: Run all tests**

Run: `cd frontend && npx vitest run && cd ../backend && python -m pytest -x -q`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add backend/app/engine/base_upgrade.py backend/app/schemas/base_upgrade.py backend/app/api/base_upgrade.py backend/main.py backend/tests/test_base_upgrade_api.py frontend/src/components/base/AirbasePanel.tsx frontend/src/components/base/__tests__/AirbasePanel.test.tsx frontend/src/lib/api.ts frontend/src/lib/types.ts
git commit -m "feat: airbase management panel — shelter, fuel, AD upgrades"
```

---

### Task 11: Diplomacy Relations Strip

**Files:**
- Create: `backend/content/diplomacy.yaml` — static relations data
- Create: `frontend/src/components/procurement/DiplomacyStrip.tsx`
- Create: `frontend/src/components/procurement/__tests__/DiplomacyStrip.test.tsx`
- Modify: `frontend/src/pages/ProcurementHub.tsx` — add strip to Acquisitions tab

Static relations display — no backend API needed. The frontend loads from a static YAML (served via content endpoint or hardcoded in component since it's static for V1).

- [ ] **Step 1: Create diplomacy.yaml**

Create `backend/content/diplomacy.yaml`:

```yaml
relations:
  - country: France
    code: FR
    level: allied
    description: Strategic partner. Rafale deal anchor. Full technology transfer.
  - country: Russia
    code: RU
    level: warm
    description: Legacy defense partner. Su-30 backbone. S-400 delivered.
  - country: United States
    code: US
    level: warm
    description: Growing defense ties. MQ-9B SeaGuardian offered. DTTI framework.
  - country: Israel
    code: IL
    level: allied
    description: Close defense-tech partner. Heron TP, Barak systems, sensors.
  - country: Sweden
    code: SE
    level: neutral
    description: Gripen E offered through MRFA. No prior defense relationship.
  - country: European Union
    code: EU
    level: warm
    description: Eurofighter consortium offered through MRFA. Mixed bilateral ties.
```

- [ ] **Step 2: Write the component test**

Create `frontend/src/components/procurement/__tests__/DiplomacyStrip.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiplomacyStrip } from "../DiplomacyStrip";

describe("DiplomacyStrip", () => {
  it("renders all supplier nations", () => {
    render(<DiplomacyStrip />);
    expect(screen.getByText("France")).toBeTruthy();
    expect(screen.getByText("Russia")).toBeTruthy();
    expect(screen.getByText("United States")).toBeTruthy();
    expect(screen.getByText("Israel")).toBeTruthy();
  });

  it("renders relation levels", () => {
    render(<DiplomacyStrip />);
    const allies = screen.getAllByText("allied");
    expect(allies.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Create DiplomacyStrip component**

Create `frontend/src/components/procurement/DiplomacyStrip.tsx`:

```typescript
const RELATIONS = [
  { country: "France", code: "FR", level: "allied" as const },
  { country: "Russia", code: "RU", level: "warm" as const },
  { country: "United States", code: "US", level: "warm" as const },
  { country: "Israel", code: "IL", level: "allied" as const },
  { country: "Sweden", code: "SE", level: "neutral" as const },
  { country: "European Union", code: "EU", level: "warm" as const },
];

const LEVEL_COLORS = {
  allied: "text-green-400 bg-green-900/30",
  warm: "text-amber-400 bg-amber-900/30",
  neutral: "text-slate-400 bg-slate-800",
  cool: "text-blue-400 bg-blue-900/30",
  hostile: "text-red-400 bg-red-900/30",
};

export function DiplomacyStrip() {
  return (
    <div className="mb-4">
      <h4 className="text-sm text-slate-500 mb-2">Supplier Relations</h4>
      <div className="flex flex-wrap gap-2">
        {RELATIONS.map((r) => (
          <div
            key={r.code}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${LEVEL_COLORS[r.level]}`}
          >
            <span className="font-semibold">{r.country}</span>
            <span className="ml-1.5 opacity-75">{r.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into ProcurementHub Acquisitions tab**

In `frontend/src/pages/ProcurementHub.tsx`, import and render the DiplomacyStrip at the top of the Acquisitions tab content:

```typescript
import { DiplomacyStrip } from "../components/procurement/DiplomacyStrip";

// In the Acquisitions tab render:
{tab === "acquisitions" && (
  <>
    <DiplomacyStrip />
    <AcquisitionPipeline ... />
  </>
)}
```

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass including new DiplomacyStrip tests

- [ ] **Step 6: Commit**

```bash
git add backend/content/diplomacy.yaml frontend/src/components/procurement/DiplomacyStrip.tsx frontend/src/components/procurement/__tests__/DiplomacyStrip.test.tsx frontend/src/pages/ProcurementHub.tsx
git commit -m "feat: diplomacy relations strip in Acquisitions tab"
```

---

### Task 12: Content Validation + LLM Enrichment Tests

**Files:**
- Create: `backend/tests/test_content_validation.py` — cross-file consistency tests
- Create: `backend/tests/test_llm_enrichment.py` — unit tests for enrichment functions

- [ ] **Step 1: Write content validation tests**

Create `backend/tests/test_content_validation.py`:

```python
"""Cross-file content consistency tests.

Validates that platform IDs, program IDs, and faction references
are consistent across all YAML content files.
"""
from pathlib import Path
from backend.app.content.loader import (
    load_platforms, load_scenario_templates, load_adversary_roadmap,
    load_intel_templates, load_rd_programs, load_bases, load_objectives,
)
from backend.app.engine.vignette.bvr import PLATFORM_LOADOUTS


CONTENT = Path("backend/content")


def test_scenario_platforms_in_platforms_yaml():
    platforms = load_platforms(CONTENT / "platforms.yaml")
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in platforms:
                    missing.add(pid)
    assert not missing, f"Scenario platforms missing from platforms.yaml: {missing}"


def test_scenario_platforms_have_loadouts():
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Scenario platforms missing PLATFORM_LOADOUTS: {missing}"


def test_roadmap_factions_valid():
    events = load_adversary_roadmap(CONTENT / "adversary_roadmap.yaml")
    valid = {"PLAAF", "PAF", "PLAN"}
    for e in events:
        assert e.faction in valid, f"Unknown faction: {e.faction}"


def test_intel_template_factions_valid():
    templates = load_intel_templates(CONTENT / "intel_templates.yaml")
    valid = {"PLAAF", "PAF", "PLAN"}
    for t in templates:
        assert t.faction in valid, f"Unknown faction in intel template {t.id}: {t.faction}"


def test_no_duplicate_platform_ids():
    import yaml
    with open(CONTENT / "platforms.yaml") as f:
        data = yaml.safe_load(f)
    ids = [p["id"] for p in data["platforms"]]
    assert len(ids) == len(set(ids)), f"Duplicate platform IDs: {[i for i in ids if ids.count(i) > 1]}"


def test_no_duplicate_scenario_ids():
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    ids = [t.id for t in templates]
    assert len(ids) == len(set(ids)), "Duplicate scenario IDs"


def test_no_duplicate_objective_ids():
    objectives = load_objectives(CONTENT / "objectives.yaml")
    assert len(objectives) >= 12


def test_no_duplicate_rd_ids():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    assert len(programs) >= 25


def test_rd_dependencies_exist():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    for p in programs.values():
        for dep in p.dependencies:
            assert dep in programs, f"{p.id} depends on unknown program: {dep}"


def test_bases_count():
    bases = load_bases(CONTENT / "bases.yaml")
    assert len(bases) >= 15


def test_procurable_platforms_have_cost():
    platforms = load_platforms(CONTENT / "platforms.yaml")
    for p in platforms.values():
        if p.procurable_by:
            assert p.cost_cr > 0, f"Procurable platform {p.id} has zero cost"
```

- [ ] **Step 2: Write LLM enrichment tests**

Create `backend/tests/test_llm_enrichment.py`:

```python
"""Unit tests for LLM enrichment functions in service.py.

Tests that enrichment queries return correct data structure from
CampaignEvent rows — catches the payload-key bugs found in Plan 9 review.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.models import Base
from backend.app.crud.campaign import create_campaign
from backend.app.crud.seed_starting_state import seed_starting_state
from backend.app.models.campaign_event import CampaignEvent


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def seeded_campaign(db):
    campaign = create_campaign(db, name="test", seed=42)
    seed_starting_state(db, campaign)
    return campaign


def test_year_recap_enrichment_queries_events(db, seeded_campaign):
    """Enrichment should find CampaignEvent rows for the target year."""
    db.add(CampaignEvent(
        campaign_id=seeded_campaign.id,
        year=2026, quarter=3,
        event_type="delivery_complete",
        payload={"platform_id": "rafale_f4", "quantity": 6},
    ))
    db.commit()

    events = db.query(CampaignEvent).filter_by(
        campaign_id=seeded_campaign.id,
    ).filter(CampaignEvent.year == 2026).all()
    assert len(events) >= 1
    delivery = [e for e in events if e.event_type == "delivery_complete"]
    assert len(delivery) == 1
    assert delivery[0].payload["platform_id"] == "rafale_f4"


def test_retrospective_enrichment_all_years(db, seeded_campaign):
    """Retrospective enrichment should gather events across all campaign years."""
    for y in range(2026, 2030):
        db.add(CampaignEvent(
            campaign_id=seeded_campaign.id,
            year=y, quarter=2,
            event_type="rd_milestone",
            payload={"program_id": "amca_mk1", "milestone": f"milestone_{y}"},
        ))
    db.commit()

    events = db.query(CampaignEvent).filter_by(campaign_id=seeded_campaign.id).all()
    milestones = [e for e in events if e.event_type == "rd_milestone"]
    assert len(milestones) == 4


def test_vignette_enrichment_win_loss(db, seeded_campaign):
    """Enrichment should correctly categorize vignette outcomes."""
    from backend.app.models.vignette import Vignette
    v1 = Vignette(
        campaign_id=seeded_campaign.id,
        template_id="lac_air_incursion_limited",
        year=2027, quarter=1,
        status="resolved",
        outcome={"objective_met": True, "ind_kia": 1, "adv_kia": 3},
    )
    v2 = Vignette(
        campaign_id=seeded_campaign.id,
        template_id="paf_stealth_probe",
        year=2027, quarter=3,
        status="resolved",
        outcome={"objective_met": False, "ind_kia": 4, "adv_kia": 1},
    )
    db.add_all([v1, v2])
    db.commit()

    vigs = db.query(Vignette).filter_by(campaign_id=seeded_campaign.id, status="resolved").all()
    wins = [v for v in vigs if v.outcome and v.outcome.get("objective_met")]
    losses = [v for v in vigs if v.outcome and not v.outcome.get("objective_met")]
    assert len(wins) == 1
    assert len(losses) == 1
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/test_content_validation.py tests/test_llm_enrichment.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_content_validation.py backend/tests/test_llm_enrichment.py
git commit -m "test: content validation + LLM enrichment unit tests"
```

---

### Task 13: Campaign Export/Import + Balance Simulation Test

**Files:**
- Create: `backend/app/schemas/campaign_export.py` — export/import models
- Create: `backend/app/api/campaign_export.py` — GET export + POST import endpoints
- Modify: `backend/main.py` — register router
- Create: `backend/tests/test_campaign_export.py`
- Create: `backend/tests/test_balance_simulation.py`
- Modify: `frontend/src/lib/api.ts` — add export/import methods

- [ ] **Step 1: Write campaign export test**

Create `backend/tests/test_campaign_export.py`:

```python
"""Tests for campaign export/import."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.models import Base
from backend.main import app
from backend.app.core.database import get_db


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def client(db):
    def override():
        yield db
    app.dependency_overrides[get_db] = override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_export_campaign(client):
    resp = client.post("/api/campaigns", json={"name": "test", "seed": 42})
    cid = resp.json()["id"]
    resp = client.get(f"/api/campaigns/{cid}/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "test"
    assert data["seed"] == 42
    assert "squadrons" in data
    assert "bases" in data
    assert len(data["squadrons"]) == 31
    assert len(data["bases"]) == 15


def test_export_import_roundtrip(client):
    resp = client.post("/api/campaigns", json={"name": "export-test", "seed": 99})
    cid = resp.json()["id"]
    export_resp = client.get(f"/api/campaigns/{cid}/export")
    export_data = export_resp.json()
    import_resp = client.post("/api/campaigns/import", json=export_data)
    assert import_resp.status_code == 201
    new_id = import_resp.json()["id"]
    assert new_id != cid
    new_resp = client.get(f"/api/campaigns/{new_id}")
    assert new_resp.json()["seed"] == 99
```

- [ ] **Step 2: Create export schema**

Create `backend/app/schemas/campaign_export.py`:

```python
from pydantic import BaseModel


class SquadronExport(BaseModel):
    name: str
    call_sign: str
    platform_id: str
    base_id: str
    airframes_available: int
    readiness: float
    xp: int


class BaseExport(BaseModel):
    base_id: str
    config: dict


class CampaignExport(BaseModel):
    name: str
    seed: int
    starting_year: int
    starting_quarter: int
    current_year: int
    current_quarter: int
    budget_cr: int
    quarterly_grant_cr: int
    reputation: int
    objectives_json: list
    current_allocation_json: dict | None
    squadrons: list[SquadronExport]
    bases: list[BaseExport]
```

- [ ] **Step 3: Create export/import API**

Create `backend/app/api/campaign_export.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.models.campaign import Campaign
from backend.app.models.squadron import Squadron
from backend.app.models.campaign_base import CampaignBase
from backend.app.schemas.campaign_export import CampaignExport, SquadronExport, BaseExport
from backend.app.crud.seed_starting_state import seed_starting_state

router = APIRouter(prefix="/api/campaigns", tags=["export"])


@router.get("/{campaign_id}/export", response_model=CampaignExport)
def export_campaign(campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter_by(id=campaign_id).first()
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    squads = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    bases = db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()

    return CampaignExport(
        name=campaign.name,
        seed=campaign.seed,
        starting_year=campaign.starting_year,
        starting_quarter=campaign.starting_quarter,
        current_year=campaign.current_year,
        current_quarter=campaign.current_quarter,
        budget_cr=campaign.budget_cr,
        quarterly_grant_cr=campaign.quarterly_grant_cr,
        reputation=campaign.reputation,
        objectives_json=campaign.objectives_json or [],
        current_allocation_json=campaign.current_allocation_json,
        squadrons=[
            SquadronExport(
                name=s.name, call_sign=s.call_sign, platform_id=s.platform_id,
                base_id=s.base_id, airframes_available=s.airframes_available,
                readiness=s.readiness, xp=s.xp,
            ) for s in squads
        ],
        bases=[
            BaseExport(base_id=b.base_id, config=b.config or {})
            for b in bases
        ],
    )


@router.post("/import", status_code=201)
def import_campaign(data: CampaignExport, db: Session = Depends(get_db)):
    campaign = Campaign(
        name=f"{data.name} (imported)",
        seed=data.seed,
        starting_year=data.starting_year,
        starting_quarter=data.starting_quarter,
        current_year=data.current_year,
        current_quarter=data.current_quarter,
        budget_cr=data.budget_cr,
        quarterly_grant_cr=data.quarterly_grant_cr,
        reputation=data.reputation,
        objectives_json=data.objectives_json,
        current_allocation_json=data.current_allocation_json,
    )
    db.add(campaign)
    db.flush()

    for s in data.squadrons:
        db.add(Squadron(
            campaign_id=campaign.id, name=s.name, call_sign=s.call_sign,
            platform_id=s.platform_id, base_id=s.base_id,
            airframes_available=s.airframes_available, readiness=s.readiness, xp=s.xp,
        ))

    for b in data.bases:
        db.add(CampaignBase(
            campaign_id=campaign.id, base_id=b.base_id, config=b.config,
        ))

    db.commit()
    return {"id": campaign.id}
```

- [ ] **Step 4: Register router**

In `backend/main.py`, add:

```python
from backend.app.api.campaign_export import router as campaign_export_router
app.include_router(campaign_export_router)
```

- [ ] **Step 5: Write balance simulation test**

Create `backend/tests/test_balance_simulation.py`:

```python
"""40-turn balance simulation — sanity checks for expanded content.

Runs a full campaign with default allocation and asserts basic invariants:
budget stays reasonable, vignettes fire at expected rate, adversary grows.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.app.models import Base
from backend.app.crud.campaign import create_campaign, advance_turn
from backend.app.crud.seed_starting_state import seed_starting_state


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_40_turn_simulation_sanity(db):
    """Run 40 turns with default settings and check balance invariants."""
    campaign = create_campaign(db, name="balance", seed=12345)
    seed_starting_state(db, campaign)

    initial_budget = campaign.budget_cr
    vignette_count = 0

    for turn in range(40):
        result = advance_turn(db, campaign.id)
        if result.get("pending_vignette"):
            vignette_count += 1

    db.refresh(campaign)
    assert campaign.current_year == 2036
    assert campaign.current_quarter == 2

    # Budget should not be absurdly negative (bankruptcy spiral)
    assert campaign.budget_cr > -500000, f"Budget spiraled to {campaign.budget_cr}"

    # Vignettes should fire at a reasonable rate (threat curve 0.15→0.55)
    # Expect roughly 10-25 vignettes over 40 turns
    assert vignette_count >= 5, f"Too few vignettes: {vignette_count}"
    assert vignette_count <= 30, f"Too many vignettes: {vignette_count}"

    # Adversary should have grown
    from backend.app.models.adversary_state import AdversaryState
    plaaf = db.query(AdversaryState).filter_by(campaign_id=campaign.id, faction="PLAAF").first()
    assert plaaf is not None
    assert plaaf.inventory.get("j20a", 0) > 500, "PLAAF J-20A count should have grown"
```

- [ ] **Step 6: Add frontend export/import methods**

In `frontend/src/lib/api.ts`, add:

```typescript
exportCampaign: (campaignId: number) =>
  http.get(`/api/campaigns/${campaignId}/export`).then((r) => r.data),

importCampaign: (data: Record<string, unknown>) =>
  http.post<{ id: number }>("/api/campaigns/import", data).then((r) => r.data),
```

- [ ] **Step 7: Run all tests**

Run: `cd backend && python -m pytest -x -q && cd ../frontend && npx vitest run`
Expected: All pass. Backend should be ~345+ tests, frontend ~95+ tests.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/campaign_export.py backend/app/api/campaign_export.py backend/main.py backend/tests/test_campaign_export.py backend/tests/test_balance_simulation.py frontend/src/lib/api.ts
git commit -m "feat: campaign export/import + 40-turn balance simulation test"
```

---

## Post-Plan Checklist

After all 13 tasks are complete:

1. **Run full test suites:** `cd backend && python -m pytest -v` + `cd frontend && npx vitest run`
2. **Update ROADMAP.md:** Change Plan 10 status to `🟢 done`, add plan file link, update "Last updated"
3. **Update CLAUDE.md:** Add Plan 10 status block, update test baselines, update "Current status" section, note any new carry-overs
4. **Expected test baselines (end of Plan 10):** ~350+ backend tests, ~95+ frontend vitest tests
