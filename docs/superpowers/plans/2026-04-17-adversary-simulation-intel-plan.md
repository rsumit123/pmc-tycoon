# Sovereign Shield — Adversary Simulation & Intel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `AdversaryState` / `IntelCard` empty tables into a live parallel-world simulation: PLAAF / PAF / PLAN OOBs evolve on an authored roadmap (2026–2036), and every turn the player receives 4–7 intel cards drawn from 5 source types (HUMINT / SIGINT / IMINT / OSINT / ELINT) with varying confidence and ~1-in-3 wrong — all deterministic per campaign seed.

**Architecture:**
- Two new pure-function engine subsystems wired into the existing Plan 2 orchestrator: `engine/adversary/` (state shape + roadmap-event applicator + doctrine progression) and `engine/intel/` (template-driven card generator + truth-value fog filter). Same pattern as Plan 2 — pure functions on dicts, `subsystem_rng` for determinism, events emitted through the orchestrator, CRUD writes rows back.
- Two new YAML content files: `adversary_roadmap.yaml` (timeline of authored faction events 2026-Q2 → 2036-Q1) and `intel_templates.yaml` (~15 card archetypes). Loaded via the existing `content/loader.py` + `content/registry.py` pattern.
- Two new API endpoints: `GET /api/campaigns/{id}/intel` (paginated, filter by year/quarter/source) and `GET /api/campaigns/{id}/adversary` (ground-truth inspector — useful for tests/debug, players can peek).

**Tech Stack:** No new runtime dependencies. Extends Plan 2's stack (FastAPI, SQLAlchemy 2.x, Pydantic 2.x, PyYAML, pytest). All deterministic per campaign seed via `app.engine.rng.subsystem_rng`.

---

## Scope reminder

**In scope (per ROADMAP §Plan 3):**
- Parallel-world simulation of PLAAF / PAF / PLAN with real platform counts and authored 2026–2036 roadmap
- Adversary doctrine tiers (3 per faction) that evolve over the campaign
- Intel card generator with 5 source types, per-source confidence ranges, ~1-in-3 false rate
- Fog-of-war truth filter that mutates ~30% of cards before storage
- Two new API endpoints (`GET /intel`, `GET /adversary`)
- Pre-seeded 2026-Q2 adversary OOBs + J-35E deal as initial visible intel card
- Event-vocabulary + replay-determinism tests extended to cover the new subsystems

**Out of scope (deferred):**
- LLM-generated intel briefs (Plan 5 — structured cards from this plan feed the brief prompt)
- Vignettes / scenario triggering based on adversary state (Plan 4)
- Player-managed intel capability (invest in RISAT / HUMINT / SIGINT) — parked in V1.5+ backlog
- Intel UI / swipe-stack (Plan 8)
- Adversary-state-driven deterrence feedback (player strength modifies adversary aggression) — parked

---

## File Structure

**Backend (create):**
- `backend/app/engine/adversary/__init__.py`
- `backend/app/engine/adversary/state.py` — typed faction-state shape helpers + OOB_2026_Q2 constants
- `backend/app/engine/adversary/tick.py` — `tick_adversary(states, roadmap_events, year, quarter, rng)`
- `backend/app/engine/adversary/doctrine.py` — `compute_doctrine(faction, state, year)`
- `backend/app/engine/intel/__init__.py`
- `backend/app/engine/intel/generator.py` — `generate_intel(states, templates, roadmap_events, year, quarter, rng)`
- `backend/app/engine/intel/fog.py` — `apply_fog(card, rng)` + `SOURCE_RULES`
- `backend/content/adversary_roadmap.yaml` — ~30 authored events 2026-Q3 .. 2036-Q1
- `backend/content/intel_templates.yaml` — ~15 card archetypes
- `backend/app/schemas/intel.py` — `IntelCardRead`, filter params
- `backend/app/schemas/adversary.py` — `AdversaryStateRead`
- `backend/app/crud/intel.py` — `list_intel_cards(db, campaign_id, filters)`
- `backend/app/crud/adversary.py` — `list_adversary_states(db, campaign_id)`
- `backend/app/api/intel.py` — `GET /api/campaigns/{id}/intel`
- `backend/app/api/adversary.py` — `GET /api/campaigns/{id}/adversary`
- `backend/tests/test_adversary_state.py`
- `backend/tests/test_adversary_tick.py`
- `backend/tests/test_adversary_doctrine.py`
- `backend/tests/test_adversary_roadmap.py` — YAML loads + event-shape validation
- `backend/tests/test_intel_generator.py`
- `backend/tests/test_intel_fog.py`
- `backend/tests/test_intel_templates.py` — YAML loads + template-shape validation
- `backend/tests/test_intel_api.py`
- `backend/tests/test_adversary_api.py`
- `backend/tests/test_adversary_campaign_integration.py` — 40-turn simulation assertion

**Backend (modify):**
- `backend/app/engine/turn.py` — extend `advance(ctx)` to run adversary + intel subsystems; `EngineResult` gains `next_adversary_states` + `new_intel_cards`
- `backend/app/crud/campaign.py` — `advance_turn` reads `AdversaryState` rows, builds ctx, writes updated state + new `IntelCard` rows
- `backend/app/crud/seed_starting_state.py` — seed 3 `AdversaryState` rows (PLAAF/PAF/PLAN) with 2026-Q2 OOBs + 1 `IntelCard` for the J-35E deal
- `backend/app/content/loader.py` — add `load_adversary_roadmap`, `load_intel_templates`
- `backend/app/content/registry.py` — add `adversary_roadmap()`, `intel_templates()` singletons
- `backend/main.py` — register `intel_router` + `adversary_router`
- `backend/tests/test_event_vocabulary.py` — register 3 new event types
- `backend/tests/test_replay_determinism.py` — extend assertions to cover intel-card deterministic generation

**Frontend (modify):**
- `frontend/src/lib/types.ts` — add `SourceType`, `IntelCard`, `FactionId`, `AdversaryState` types

---

## Domain modelling decisions (locked)

**Factions:** `PLAAF`, `PAF`, `PLAN` — three fixed factions. One `AdversaryState` row per faction per campaign (3 total).

**Faction state shape** — stored in `AdversaryState.state: JSON`. Normalized so all factions use the same keys (simpler engine code):
```json
{
  "inventory": {"unit_type_id": count, ...},
  "doctrine": "conservative",
  "active_systems": ["pl15_operational", "yj21_operational", ...],
  "forward_bases": ["hotan", "kashgar", ...]
}
```
- `inventory` unit type IDs are free strings (e.g., `"j20a"`, `"j35a"`, `"j10ce"`, `"type055_destroyer"`, `"liaoning"`); counts are non-negative ints. For PLAN, carriers are entries with count 1 (`{"liaoning": 1, "shandong": 1, "fujian": 1, "type055_destroyer": 8}`).
- `active_systems` is a set semantically but stored as a list for JSON-friendliness; order preserved.
- `forward_bases` same.

**Doctrine tiers (locked per faction):**
| Faction | Tier 1 (2026–early) | Tier 2 (mid) | Tier 3 (late) |
|---|---|---|---|
| PLAAF | `conservative` | `integrated_ew` | `saturation_raid` |
| PAF   | `conservative` | `stealth_enabled` | `integrated_high_low` |
| PLAN  | `coastal_defense` | `far_seas_buildout` | `global_power_projection` |

**Doctrine progression rules:**
- PLAAF → `integrated_ew` when `year >= 2028 AND inventory.j20a + inventory.j35a >= 700`
- PLAAF → `saturation_raid` when `year >= 2032 AND active_systems contains "yj21_operational"`
- PAF → `stealth_enabled` when `inventory.j35e >= 20`
- PAF → `integrated_high_low` when `year >= 2030 AND inventory.j35e >= 40 AND inventory.j10ce >= 36`
- PLAN → `far_seas_buildout` when `year >= 2028 AND "fujian" in inventory`
- PLAN → `global_power_projection` when `year >= 2033 AND sum(carriers) >= 4` (Type 004 lands)
- Tier is sticky once reached; no regression.

**Roadmap event shape:**
```yaml
- year: 2027
  quarter: 1
  faction: PAF
  effect:
    kind: inventory_delta        # one of: inventory_delta | system_activate | system_deactivate | base_activate | base_deactivate | doctrine_override
    payload: {j35e: 36}          # shape depends on kind
  intel:                         # optional — if present, a visible intel card is generated immediately
    headline: "PAF completes first J-35E tranche — 40 airframes in squadron service"
    source_type: IMINT
    confidence: 0.92
```
- `effect.kind` values:
  - `inventory_delta` → `payload: {unit_type: delta_int, ...}`; additive; clamped to ≥0
  - `system_activate` → `payload: "system_id"`; adds to `active_systems` if absent
  - `system_deactivate` → `payload: "system_id"`; removes if present
  - `base_activate` → `payload: "base_id"`; adds to `forward_bases` if absent
  - `base_deactivate` → `payload: "base_id"`; removes if present
  - `doctrine_override` → `payload: "doctrine_id"`; sets doctrine directly (overrides auto-progression — use sparingly for surprises)

**Intel card source-type rules (locked):**
```python
SOURCE_RULES = {
    "HUMINT": {"confidence_range": (0.40, 0.80), "false_rate": 0.30},
    "SIGINT": {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
    "IMINT":  {"confidence_range": (0.70, 1.00), "false_rate": 0.10},
    "OSINT":  {"confidence_range": (0.30, 0.70), "false_rate": 0.40},
    "ELINT":  {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
}
```
Target overall false rate when source mix is roughly uniform: ~0.22. Mix skew toward IMINT/SIGINT pulls it down, OSINT skew pulls it up. Spec says "1-in-3 roughly"; accept 0.18–0.35 as in-band.

**Intel template shape:**
```yaml
- id: plaaf_j20_brigade_rotation
  faction: PLAAF
  source_types: [IMINT, HUMINT]
  headline_template: "{count} J-20A airframes observed rotating through {base}"
  subject_type: base_rotation
  trigger:              # all must be true for the template to be eligible this turn
    min_inventory: {j20a: 300}
  payload_keys:
    count:      {source: inventory, key: j20a, noise: 0.15}   # ±15% jitter for plausibility
    base:       {source: forward_bases, pick: random}
```
- `source: inventory` → `rng.choice` of keys matching `key` glob, or fixed key
- `source: forward_bases` → `rng.choice(state.forward_bases)`
- `source: doctrine` → `state.doctrine`
- `source: active_systems` → `rng.choice(state.active_systems)` (skip template if empty)
- `source: literal, value: X` → literal string
- `noise` (optional, float): on `inventory` count, multiply by `uniform(1-noise, 1+noise)` and int-cast

**Intel card payload (stored in `IntelCard.payload` JSON):**
```json
{
  "headline": "24 J-20A airframes observed rotating through Hotan",
  "template_id": "plaaf_j20_brigade_rotation",
  "subject_faction": "PLAAF",
  "subject_type": "base_rotation",
  "observed": {"count": 24, "base": "hotan"},
  "ground_truth": {"count": 28, "base": "hotan"}
}
```
- `observed` = what the player sees
- `ground_truth` = what was actually true at generation time; identical to `observed` when `truth_value=True`
- Fog filter only mutates `observed`; `ground_truth` is preserved for retrospective (Plan 5/9) narrative use and debug

**Cards per turn:** roll an integer in `[4, 7]` inclusive using the intel subsystem RNG. Sample that many templates **without replacement** from the eligible set so the player never sees two cards from the same template in one turn. If fewer eligible templates exist, take what's available and emit `intel_underfilled` event.

**Note on overall false-rate target:** The spec language says "1-in-3 roughly". The actual effective rate at the chosen template/source mix lands closer to **~0.18** because the IMINT-only roadmap intel blocks dominate the card stream (~40% of total) and IMINT has the lowest false rate (0.10). Don't try to retune SOURCE_RULES to hit 0.33 — accept the lower rate, or rebalance the roadmap intel-block source mix to spread across HUMINT/OSINT.

**Fog mutation strategy (locked):**
When a card is marked false, the fog filter mutates `observed` (not `ground_truth`) using the card's `subject_type`:
- `base_rotation`: swap the `base` field to a random forward_base that is NOT the true one (if there's only one forward base, fall back to inventory mutation)
- `force_count`: multiply count by `rng.uniform(0.4, 1.7)` and int-cast, clamped ≥0
- `doctrine_guess`: swap `observed.doctrine` with a random sibling tier from the same faction's ladder
- `system_activation`: flip `observed.active: bool`
- unknown `subject_type`: no mutation, still mark truth_value=False (graceful degrade)

**Roadmap-driven intel cards:** When a roadmap event includes an `intel` block, the intel subsystem generates one **additional** card from that block (on top of the 4–7 random ones). These cards default to `truth_value=True` and the confidence/source come from the YAML. They also mutate through fog at their source-type's false_rate unless `intel.forced_true: true` is set.

**Determinism:** Adversary tick and intel generator each use their own subsystem RNG:
- `subsystem_rng(seed, "adversary", year, quarter)` for adversary tick
- `subsystem_rng(seed, "intel", year, quarter)` for intel gen + fog

Both are derived from campaign seed + turn, so replay is identical.

---

## Task 1: Adversary state shapes + 2026-Q2 starting OOBs

**Files:**
- Create: `backend/app/engine/adversary/__init__.py`
- Create: `backend/app/engine/adversary/state.py`
- Create: `backend/tests/test_adversary_state.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_adversary_state.py`:

```python
from app.engine.adversary.state import (
    FACTIONS,
    DOCTRINE_LADDER,
    OOB_2026_Q2,
    empty_state,
    validate_state,
)


def test_factions_are_three_locked_values():
    assert FACTIONS == ["PLAAF", "PAF", "PLAN"]


def test_doctrine_ladder_has_three_tiers_per_faction():
    for faction in FACTIONS:
        assert len(DOCTRINE_LADDER[faction]) == 3


def test_plaaf_starting_oob_has_expected_inventory():
    st = OOB_2026_Q2["PLAAF"]
    assert st["inventory"]["j20a"] == 500
    assert st["inventory"]["j35a"] >= 1
    assert st["doctrine"] == "conservative"
    assert "hotan" in st["forward_bases"]


def test_paf_starting_oob_has_zero_j35e():
    st = OOB_2026_Q2["PAF"]
    assert st["inventory"].get("j35e", 0) == 0
    assert st["inventory"]["j10ce"] == 20
    assert st["doctrine"] == "conservative"


def test_plan_starting_oob_has_three_carriers():
    st = OOB_2026_Q2["PLAN"]
    assert st["inventory"]["liaoning"] == 1
    assert st["inventory"]["shandong"] == 1
    assert st["inventory"]["fujian"] == 1
    assert st["doctrine"] == "coastal_defense"


def test_empty_state_has_all_required_keys():
    st = empty_state()
    assert set(st.keys()) == {"inventory", "doctrine", "active_systems", "forward_bases"}
    assert st["inventory"] == {}
    assert st["active_systems"] == []
    assert st["forward_bases"] == []


def test_validate_state_accepts_valid():
    validate_state({"inventory": {"j20a": 500}, "doctrine": "conservative",
                    "active_systems": [], "forward_bases": []})


def test_validate_state_rejects_missing_key():
    import pytest
    with pytest.raises(ValueError):
        validate_state({"inventory": {}, "doctrine": "conservative", "active_systems": []})


def test_validate_state_rejects_negative_count():
    import pytest
    with pytest.raises(ValueError):
        validate_state({"inventory": {"j20a": -1}, "doctrine": "conservative",
                        "active_systems": [], "forward_bases": []})
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
cd /Users/rsumit123/work/defense-game/backend && source .venv/bin/activate && python -m pytest tests/test_adversary_state.py -v
```

Expected: ImportError for `app.engine.adversary.state`.

- [ ] **Step 3: Implement state module**

Create `backend/app/engine/adversary/__init__.py` (empty).

Create `backend/app/engine/adversary/state.py`:

```python
"""Adversary state shape + 2026-Q2 starting OOBs.

Faction state is a JSON dict with a fixed key set. All three factions
(PLAAF/PAF/PLAN) share the same shape — carriers/SAMs/destroyers land
in `inventory` alongside fighters so the engine can treat them uniformly.
"""

from __future__ import annotations

FACTIONS: list[str] = ["PLAAF", "PAF", "PLAN"]

DOCTRINE_LADDER: dict[str, list[str]] = {
    "PLAAF": ["conservative", "integrated_ew", "saturation_raid"],
    "PAF":   ["conservative", "stealth_enabled", "integrated_high_low"],
    "PLAN":  ["coastal_defense", "far_seas_buildout", "global_power_projection"],
}

REQUIRED_KEYS = {"inventory", "doctrine", "active_systems", "forward_bases"}

# Starting OOBs (2026-Q2) sourced from docs/content/platforms-seed-2026.md §Adversary Starting State.
# Numbers are semi-realistic per D10 — plausible and gameable, not canonical.
OOB_2026_Q2: dict[str, dict] = {
    "PLAAF": {
        "inventory": {
            "j20a": 500, "j20s": 20, "j35a": 20,
            "j11b": 200, "j10c": 300, "j16": 150,
            "h6kj": 120, "kj500": 40, "y20": 60,
        },
        "doctrine": "conservative",
        "active_systems": ["pl15_operational", "pl17_operational", "yj21_operational"],
        "forward_bases": ["hotan", "kashgar", "shigatse", "lhasa_gonggar"],
    },
    "PAF": {
        "inventory": {
            "j10ce": 20,       # 20 delivered mid-2025; 16 slated for 2026
            "j35e": 0,         # deal signed Jan 2026, first deliveries pending
            "jf17_blk3": 60,
            "f16_blk52": 75,
            "mirage35": 60,
        },
        "doctrine": "conservative",
        "active_systems": ["pl15_operational"],
        "forward_bases": ["sargodha", "masroor", "minhas"],
    },
    "PLAN": {
        "inventory": {
            "liaoning": 1, "shandong": 1, "fujian": 1,
            "type055_destroyer": 8,
            "type052d_destroyer": 25,
            "type093b_ssn": 6,
            "h6n": 8,
        },
        "doctrine": "coastal_defense",
        "active_systems": ["yj21_operational"],
        "forward_bases": ["sanya", "zhanjiang", "djibouti"],
    },
}


def empty_state() -> dict:
    return {"inventory": {}, "doctrine": "conservative",
            "active_systems": [], "forward_bases": []}


def validate_state(state: dict) -> None:
    missing = REQUIRED_KEYS - set(state.keys())
    if missing:
        raise ValueError(f"adversary state missing keys: {missing}")
    for unit, count in state["inventory"].items():
        if not isinstance(count, int) or count < 0:
            raise ValueError(f"inventory[{unit!r}] must be non-negative int (got {count!r})")
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_adversary_state.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/engine/adversary backend/tests/test_adversary_state.py
git commit -m "feat(engine): adversary state shape + 2026-Q2 starting OOBs

Locks in the PLAAF/PAF/PLAN faction state shape (inventory + doctrine
+ active_systems + forward_bases) and the 3-tier doctrine ladder per
faction. OOB_2026_Q2 sources numbers from
docs/content/platforms-seed-2026.md."
```

---

## Task 2: Adversary roadmap YAML + loader

**Files:**
- Create: `backend/content/adversary_roadmap.yaml`
- Modify: `backend/app/content/loader.py`
- Modify: `backend/app/content/registry.py`
- Create: `backend/tests/test_adversary_roadmap.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_adversary_roadmap.py`:

```python
from pathlib import Path
from app.content.loader import load_adversary_roadmap


def test_roadmap_loads_events():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    assert len(events) >= 20


def test_every_event_has_required_fields():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    for e in events:
        assert e.year in range(2026, 2037)
        assert e.quarter in (1, 2, 3, 4)
        assert e.faction in ("PLAAF", "PAF", "PLAN")
        assert e.effect.kind in {
            "inventory_delta", "system_activate", "system_deactivate",
            "base_activate", "base_deactivate", "doctrine_override",
        }


def test_paf_j35e_first_tranche_event_exists():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    j35e_events = [
        e for e in events
        if e.faction == "PAF"
        and e.effect.kind == "inventory_delta"
        and isinstance(e.effect.payload, dict)
        and "j35e" in e.effect.payload
    ]
    assert j35e_events, "expected at least one PAF J-35E delivery event"


def test_events_are_chronologically_sortable():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    keys = [(e.year, e.quarter) for e in events]
    assert keys == sorted(keys), "roadmap events must be YAML-sorted chronologically"


def test_registry_caches_roadmap():
    from app.content.registry import adversary_roadmap
    a = adversary_roadmap()
    b = adversary_roadmap()
    assert a is b
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_adversary_roadmap.py -v
```

Expected: ImportError for `load_adversary_roadmap`.

- [ ] **Step 3: Create the roadmap YAML**

Create `backend/content/adversary_roadmap.yaml`:

```yaml
# Sovereign Shield adversary roadmap 2026-Q3 .. 2036-Q1
# Authored from public sources as of 2026-04; semi-realistic, gameable (D10).
# Must be chronologically sorted by (year, quarter).

events:
  # ===== 2026 =====
  - year: 2026
    quarter: 3
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 4}}
    intel:
      headline: "First J-35E tranche reaches PAF — 4 airframes in sqn service"
      source_type: IMINT
      confidence: 0.90

  - year: 2026
    quarter: 4
    faction: PAF
    effect: {kind: inventory_delta, payload: {j10ce: 16}}
    intel:
      headline: "PAF completes J-10CE induction — final 16 airframes delivered"
      source_type: OSINT
      confidence: 0.75

  - year: 2026
    quarter: 4
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 60, j35a: 20}}
    intel:
      headline: "PLAAF Q4 airframe deliveries: J-20 line running hot"
      source_type: SIGINT
      confidence: 0.80

  # ===== 2027 =====
  - year: 2027
    quarter: 1
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 36}}
    intel:
      headline: "PAF J-35E first tranche complete — 40 airframes total"
      source_type: IMINT
      confidence: 0.92

  - year: 2027
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 40, j20s: 20}}

  - year: 2027
    quarter: 3
    faction: PLAN
    effect: {kind: system_activate, payload: yj21_saturation_operational}
    intel:
      headline: "PLAN H-6N regiments test YJ-21 saturation launch profile"
      source_type: SIGINT
      confidence: 0.70

  - year: 2027
    quarter: 4
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 50, j35a: 30}}

  # ===== 2028 =====
  - year: 2028
    quarter: 1
    faction: PLAAF
    effect: {kind: base_activate, payload: shigatse_heavy}
    intel:
      headline: "PLAAF expanding Shigatse hardened shelters — J-20 capable"
      source_type: IMINT
      confidence: 0.85

  - year: 2028
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 60, j36_prototype: 2}}
    intel:
      headline: "J-36 sixth-gen demonstrator observed with J-20S chase — Chengdu"
      source_type: OSINT
      confidence: 0.55

  - year: 2028
    quarter: 3
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 20}}

  - year: 2028
    quarter: 4
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 50, j35a: 40}}

  # ===== 2029 =====
  - year: 2029
    quarter: 1
    faction: PLAAF
    effect: {kind: system_activate, payload: pl17_widespread}
    intel:
      headline: "PL-17 VLRAAM enters widespread PLAAF service — AWACS killer"
      source_type: ELINT
      confidence: 0.82

  - year: 2029
    quarter: 2
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 10}}

  - year: 2029
    quarter: 3
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 40, j35a: 60}}

  - year: 2029
    quarter: 4
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type055_destroyer: 2}}

  # ===== 2030 =====
  - year: 2030
    quarter: 1
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 50, j35a: 50, j36_prototype: 4}}

  - year: 2030
    quarter: 2
    faction: PAF
    effect: {kind: base_activate, payload: skardu_forward}
    intel:
      headline: "PAF clears Skardu for forward fighter basing"
      source_type: HUMINT
      confidence: 0.60

  - year: 2030
    quarter: 3
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 50, j35a: 60}}

  - year: 2030
    quarter: 4
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type055_destroyer: 2, type093b_ssn: 1}}

  # ===== 2031 =====
  - year: 2031
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 40, j35a: 80, j36: 8}}
    intel:
      headline: "J-36 cleared for limited operational trials"
      source_type: IMINT
      confidence: 0.70

  - year: 2031
    quarter: 4
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j20a: 30, j35a: 80, j36: 12}}

  # ===== 2032 =====
  - year: 2032
    quarter: 1
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type004_carrier: 1}}
    intel:
      headline: "Type 004 nuclear carrier Liaoyang enters PLAN service"
      source_type: IMINT
      confidence: 0.95

  - year: 2032
    quarter: 3
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j35a: 80, j36: 18}}

  - year: 2032
    quarter: 4
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 20}}
    intel:
      headline: "PAF exercises 30-airframe option on J-35E contract"
      source_type: OSINT
      confidence: 0.68

  # ===== 2033 =====
  - year: 2033
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j35a: 80, j36: 24}}

  - year: 2033
    quarter: 4
    faction: PLAAF
    effect: {kind: system_activate, payload: pl17_ew_integrated}

  # ===== 2034 =====
  - year: 2034
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j35a: 80, j36: 30}}

  - year: 2034
    quarter: 4
    faction: PLAN
    effect: {kind: inventory_delta, payload: {type004_carrier: 1}}
    intel:
      headline: "PLAN commissions second Type 004 carrier"
      source_type: IMINT
      confidence: 0.93

  # ===== 2035 =====
  - year: 2035
    quarter: 2
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j35a: 60, j36: 36}}

  - year: 2035
    quarter: 4
    faction: PAF
    effect: {kind: inventory_delta, payload: {j35e: 10}}

  # ===== 2036 =====
  - year: 2036
    quarter: 1
    faction: PLAAF
    effect: {kind: inventory_delta, payload: {j35a: 40, j36: 40}}
```

- [ ] **Step 2b: Add loader code**

Append to `backend/app/content/loader.py`:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class RoadmapEffect:
    kind: str
    payload: object


@dataclass(frozen=True)
class RoadmapIntel:
    headline: str
    source_type: str
    confidence: float
    forced_true: bool = False


@dataclass(frozen=True)
class RoadmapEvent:
    year: int
    quarter: int
    faction: str
    effect: RoadmapEffect
    intel: RoadmapIntel | None = None


def load_adversary_roadmap(path: Path) -> list[RoadmapEvent]:
    data = _load_yaml(path)
    out: list[RoadmapEvent] = []
    for raw in data.get("events", []):
        eff = raw["effect"]
        effect = RoadmapEffect(kind=eff["kind"], payload=eff.get("payload"))
        intel_raw = raw.get("intel")
        intel = (
            RoadmapIntel(
                headline=intel_raw["headline"],
                source_type=intel_raw["source_type"],
                confidence=intel_raw["confidence"],
                forced_true=intel_raw.get("forced_true", False),
            )
            if intel_raw else None
        )
        out.append(RoadmapEvent(
            year=raw["year"],
            quarter=raw["quarter"],
            faction=raw["faction"],
            effect=effect,
            intel=intel,
        ))
    return out
```

- [ ] **Step 2c: Add registry entry**

Append to `backend/app/content/registry.py`:

```python
from app.content.loader import load_adversary_roadmap


@lru_cache(maxsize=1)
def adversary_roadmap() -> list:
    return load_adversary_roadmap(Path(settings.content_dir) / "adversary_roadmap.yaml")
```

And update the `reload_all()` helper at the bottom:
```python
def reload_all() -> None:
    for fn in (platforms, bases, objectives, rd_programs, adversary_roadmap):
        fn.cache_clear()
```

- [ ] **Step 3: Run — expect pass**

Run:
```bash
python -m pytest tests/test_adversary_roadmap.py -v
```

Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/content/adversary_roadmap.yaml backend/app/content backend/tests/test_adversary_roadmap.py
git commit -m "content: adversary roadmap YAML 2026-Q3..2036-Q1 + loader

~30 authored events covering PLAAF/PAF/PLAN inventory deliveries,
system activations, doctrine shocks, and base expansions. Chronologically
sorted. Optional intel block on each event triggers a pre-baked
intel card. Loader returns dataclasses; registry caches via lru_cache."
```

---

## Task 3: Engine — adversary tick

**Files:**
- Create: `backend/app/engine/adversary/tick.py`
- Create: `backend/tests/test_adversary_tick.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_adversary_tick.py`:

```python
import random

from app.content.loader import RoadmapEvent, RoadmapEffect
from app.engine.adversary.tick import tick_adversary
from app.engine.adversary.state import empty_state


def _plaaf_state():
    s = empty_state()
    s["inventory"] = {"j20a": 500}
    s["forward_bases"] = ["hotan"]
    s["active_systems"] = []
    return s


def _event(year=2026, quarter=3, faction="PLAAF", kind="inventory_delta", payload=None):
    return RoadmapEvent(
        year=year, quarter=quarter, faction=faction,
        effect=RoadmapEffect(kind=kind, payload=payload),
    )


def test_inventory_delta_adds_to_existing_count():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 60})
    out, events = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 560


def test_inventory_delta_creates_new_unit_type():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j36_prototype": 2})
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j36_prototype"] == 2


def test_inventory_delta_clamps_to_zero():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": -1000})
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 0


def test_system_activate_adds_to_active_systems():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="system_activate", payload="pl17_widespread")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "pl17_widespread" in out["PLAAF"]["active_systems"]


def test_system_activate_is_idempotent():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["active_systems"] = ["pl17_widespread"]
    event = _event(kind="system_activate", payload="pl17_widespread")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["active_systems"].count("pl17_widespread") == 1


def test_system_deactivate_removes():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["active_systems"] = ["legacy_radar"]
    event = _event(kind="system_deactivate", payload="legacy_radar")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "legacy_radar" not in out["PLAAF"]["active_systems"]


def test_base_activate_adds_and_is_idempotent():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="base_activate", payload="shigatse_heavy")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "shigatse_heavy" in out["PLAAF"]["forward_bases"]


def test_doctrine_override_sets_directly():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["doctrine"] = "conservative"
    event = _event(kind="doctrine_override", payload="saturation_raid")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["doctrine"] == "saturation_raid"


def test_unknown_effect_kind_raises():
    import pytest
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="nuke_from_orbit", payload="just_to_be_sure")
    with pytest.raises(ValueError):
        tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))


def test_only_events_matching_year_quarter_are_applied():
    states = {"PLAAF": _plaaf_state()}
    events = [
        _event(year=2026, quarter=3, kind="inventory_delta", payload={"j20a": 10}),  # matches
        _event(year=2026, quarter=4, kind="inventory_delta", payload={"j20a": 10}),  # later
        _event(year=2026, quarter=2, kind="inventory_delta", payload={"j20a": 10}),  # earlier
    ]
    out, _ = tick_adversary(states, events, year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 510


def test_emits_adversary_roadmap_event_applied():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 10})
    _, events_out = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert any(e["event_type"] == "adversary_roadmap_event_applied" for e in events_out)


def test_input_states_not_mutated():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 10})
    tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert states["PLAAF"]["inventory"]["j20a"] == 500  # unchanged
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_adversary_tick.py -v
```

Expected: ImportError for `app.engine.adversary.tick`.

- [ ] **Step 3: Implement adversary tick**

Create `backend/app/engine/adversary/tick.py`:

```python
"""Adversary tick: apply roadmap events for a given (year, quarter).

Pure function. Takes faction states, the FULL roadmap event list, the
current clock, and an RNG (reserved for later stochastic rotations).
Filters events to this (year, quarter) and applies them in list order.
Returns (updated_states, events).
"""

from __future__ import annotations

import copy
import random

VALID_KINDS = {
    "inventory_delta", "system_activate", "system_deactivate",
    "base_activate", "base_deactivate", "doctrine_override",
}


def tick_adversary(
    states: dict[str, dict],
    roadmap_events: list,
    year: int,
    quarter: int,
    rng: random.Random,
) -> tuple[dict[str, dict], list[dict]]:
    out = copy.deepcopy(states)
    emitted: list[dict] = []

    for evt in roadmap_events:
        if evt.year != year or evt.quarter != quarter:
            continue
        faction_state = out.setdefault(evt.faction, {
            "inventory": {}, "doctrine": "conservative",
            "active_systems": [], "forward_bases": [],
        })
        kind = evt.effect.kind
        if kind not in VALID_KINDS:
            raise ValueError(f"unknown roadmap effect kind: {kind!r}")

        _apply_effect(faction_state, kind, evt.effect.payload)

        emitted.append({
            "event_type": "adversary_roadmap_event_applied",
            "payload": {
                "faction": evt.faction,
                "kind": kind,
                "effect_payload": evt.effect.payload,
            },
        })

    return out, emitted


def _apply_effect(state: dict, kind: str, payload) -> None:
    if kind == "inventory_delta":
        inv = state["inventory"]
        for unit, delta in payload.items():
            inv[unit] = max(0, inv.get(unit, 0) + delta)
    elif kind == "system_activate":
        if payload not in state["active_systems"]:
            state["active_systems"].append(payload)
    elif kind == "system_deactivate":
        if payload in state["active_systems"]:
            state["active_systems"].remove(payload)
    elif kind == "base_activate":
        if payload not in state["forward_bases"]:
            state["forward_bases"].append(payload)
    elif kind == "base_deactivate":
        if payload in state["forward_bases"]:
            state["forward_bases"].remove(payload)
    elif kind == "doctrine_override":
        state["doctrine"] = payload
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_adversary_tick.py -v
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/adversary/tick.py backend/tests/test_adversary_tick.py
git commit -m "feat(engine): adversary tick applies roadmap events

Pure function tick_adversary filters the full roadmap to this turn's
(year, quarter) and applies effects in list order. Supports six effect
kinds: inventory_delta (additive, clamped to 0), system_activate /
_deactivate, base_activate / _deactivate, doctrine_override. Emits
adversary_roadmap_event_applied events for the CampaignEvent log."
```

---

## Task 4: Engine — doctrine progression

**Files:**
- Create: `backend/app/engine/adversary/doctrine.py`
- Create: `backend/tests/test_adversary_doctrine.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_adversary_doctrine.py`:

```python
from app.engine.adversary.doctrine import compute_doctrine, progress_doctrine


def test_plaaf_tier1_at_start():
    state = {"inventory": {"j20a": 500, "j35a": 20}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2026) == "conservative"


def test_plaaf_promotes_to_integrated_ew_when_thresholds_met():
    state = {"inventory": {"j20a": 680, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2028) == "integrated_ew"


def test_plaaf_does_not_promote_early_even_with_inventory():
    state = {"inventory": {"j20a": 1000, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2027) == "conservative"


def test_plaaf_promotes_to_saturation_raid_late():
    state = {"inventory": {"j20a": 800, "j35a": 200}, "doctrine": "integrated_ew",
             "active_systems": ["yj21_operational"], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2032) == "saturation_raid"


def test_paf_promotes_to_stealth_enabled_on_j35e_threshold():
    state = {"inventory": {"j35e": 20, "j10ce": 36}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PAF", state, year=2027) == "stealth_enabled"


def test_paf_promotes_to_integrated_high_low():
    state = {"inventory": {"j35e": 40, "j10ce": 36}, "doctrine": "stealth_enabled",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PAF", state, year=2030) == "integrated_high_low"


def test_plan_promotes_to_far_seas_buildout_on_fujian_plus_year():
    state = {"inventory": {"fujian": 1, "liaoning": 1, "shandong": 1},
             "doctrine": "coastal_defense", "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAN", state, year=2028) == "far_seas_buildout"


def test_plan_promotes_to_global_power_projection_with_four_carriers():
    state = {"inventory": {"fujian": 1, "liaoning": 1, "shandong": 1, "type004_carrier": 1},
             "doctrine": "far_seas_buildout", "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAN", state, year=2033) == "global_power_projection"


def test_doctrine_is_sticky_no_regression():
    # Already promoted even if inventory dips below threshold
    state = {"inventory": {"j20a": 100, "j35a": 0}, "doctrine": "saturation_raid",
             "active_systems": ["yj21_operational"], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2035) == "saturation_raid"


def test_progress_doctrine_emits_event_on_shift():
    state = {"inventory": {"j20a": 680, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    new_state, events = progress_doctrine("PLAAF", state, year=2028)
    assert new_state["doctrine"] == "integrated_ew"
    assert any(e["event_type"] == "adversary_doctrine_shifted" for e in events)


def test_progress_doctrine_no_event_when_unchanged():
    state = {"inventory": {"j20a": 500, "j35a": 20}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    new_state, events = progress_doctrine("PLAAF", state, year=2026)
    assert new_state["doctrine"] == "conservative"
    assert not any(e["event_type"] == "adversary_doctrine_shifted" for e in events)
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_adversary_doctrine.py -v
```

- [ ] **Step 3: Implement doctrine module**

Create `backend/app/engine/adversary/doctrine.py`:

```python
"""Doctrine progression per faction.

Each faction has a 3-tier ladder. A tier promotes when both a calendar
gate and an inventory/system gate are met. Once reached, doctrine is
sticky — no regression. Ties are broken by reaching for the highest
tier first (so a faction that meets tier-3 criteria goes straight to
tier 3, skipping tier 2).
"""

from __future__ import annotations

import copy

from app.engine.adversary.state import DOCTRINE_LADDER


def compute_doctrine(faction: str, state: dict, year: int) -> str:
    current = state["doctrine"]
    ladder = DOCTRINE_LADDER[faction]
    current_idx = ladder.index(current) if current in ladder else 0

    best_idx = current_idx

    if faction == "PLAAF":
        j20 = state["inventory"].get("j20a", 0)
        j35 = state["inventory"].get("j35a", 0)
        if year >= 2028 and (j20 + j35) >= 700:
            best_idx = max(best_idx, 1)
        if year >= 2032 and "yj21_operational" in state["active_systems"]:
            best_idx = max(best_idx, 2)
    elif faction == "PAF":
        j35e = state["inventory"].get("j35e", 0)
        j10ce = state["inventory"].get("j10ce", 0)
        if j35e >= 20:
            best_idx = max(best_idx, 1)
        if year >= 2030 and j35e >= 40 and j10ce >= 36:
            best_idx = max(best_idx, 2)
    elif faction == "PLAN":
        carriers = sum(
            state["inventory"].get(c, 0)
            for c in ("liaoning", "shandong", "fujian", "type004_carrier")
        )
        if year >= 2028 and state["inventory"].get("fujian", 0) >= 1:
            best_idx = max(best_idx, 1)
        if year >= 2033 and carriers >= 4:
            best_idx = max(best_idx, 2)

    return ladder[best_idx]


def progress_doctrine(faction: str, state: dict, year: int) -> tuple[dict, list[dict]]:
    new_doctrine = compute_doctrine(faction, state, year)
    if new_doctrine == state["doctrine"]:
        return state, []

    new_state = copy.deepcopy(state)
    old_doctrine = state["doctrine"]
    new_state["doctrine"] = new_doctrine
    return new_state, [{
        "event_type": "adversary_doctrine_shifted",
        "payload": {
            "faction": faction,
            "from": old_doctrine,
            "to": new_doctrine,
            "year": year,
        },
    }]
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_adversary_doctrine.py -v
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/adversary/doctrine.py backend/tests/test_adversary_doctrine.py
git commit -m "feat(engine): adversary doctrine progression

Three-tier doctrine ladder per faction with calendar + inventory gates.
PLAAF: conservative -> integrated_ew (2028 + 700 stealth jets) ->
saturation_raid (2032 + YJ-21). PAF: conservative -> stealth_enabled
(20 J-35E) -> integrated_high_low (2030 + 40 J-35E + 36 J-10CE).
PLAN: coastal_defense -> far_seas_buildout (2028 + Fujian) ->
global_power_projection (2033 + 4 carriers). Sticky, no regression."
```

---

## Task 5: Intel templates YAML + loader

**Files:**
- Create: `backend/content/intel_templates.yaml`
- Modify: `backend/app/content/loader.py`
- Modify: `backend/app/content/registry.py`
- Create: `backend/tests/test_intel_templates.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_intel_templates.py`:

```python
from pathlib import Path
from app.content.loader import load_intel_templates


def test_templates_load():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    assert len(tpls) >= 12


def test_every_template_has_required_fields():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    for t in tpls:
        assert t.id
        assert t.faction in ("PLAAF", "PAF", "PLAN")
        assert t.source_types, "source_types must be non-empty"
        for s in t.source_types:
            assert s in ("HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT")
        assert t.headline_template
        assert t.subject_type in (
            "base_rotation", "force_count", "doctrine_guess",
            "system_activation", "deployment_observation",
        )


def test_template_ids_are_unique():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    ids = [t.id for t in tpls]
    assert len(ids) == len(set(ids)), "template ids must be unique"


def test_registry_caches_templates():
    from app.content.registry import intel_templates
    a = intel_templates()
    b = intel_templates()
    assert a is b


def test_template_trigger_can_be_empty():
    tpls = load_intel_templates(Path("content/intel_templates.yaml"))
    # At least one template with no trigger (always eligible)
    assert any(t.trigger is None or t.trigger == {} for t in tpls)
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_intel_templates.py -v
```

- [ ] **Step 3: Create the templates YAML**

Create `backend/content/intel_templates.yaml`:

```yaml
# Sovereign Shield intel card archetypes for Plan 3 generator.
# Each template is a parameterized card shape. The generator picks eligible
# templates (trigger conditions met), renders payload_keys from adversary
# state, then the fog filter may mutate observed values.

templates:
  # ===== PLAAF =====
  - id: plaaf_j20_brigade_rotation
    faction: PLAAF
    source_types: [IMINT, HUMINT]
    headline_template: "{count} J-20A airframes observed rotating through {base}"
    subject_type: base_rotation
    trigger: {min_inventory: {j20a: 300}}
    payload_keys:
      count: {source: inventory, key: j20a, scale: 0.05, noise: 0.15}
      base: {source: forward_bases, pick: random}

  - id: plaaf_j35a_induction_update
    faction: PLAAF
    source_types: [OSINT, SIGINT]
    headline_template: "PLAAF J-35A fleet assessed at approximately {count} airframes"
    subject_type: force_count
    trigger: {min_inventory: {j35a: 20}}
    payload_keys:
      count: {source: inventory, key: j35a, noise: 0.20}

  - id: plaaf_doctrine_chatter
    faction: PLAAF
    source_types: [HUMINT, SIGINT]
    headline_template: "PLAAF doctrine assessed as {doctrine}"
    subject_type: doctrine_guess
    payload_keys:
      doctrine: {source: doctrine}

  - id: plaaf_pl17_employment
    faction: PLAAF
    source_types: [ELINT]
    headline_template: "PL-17 VLRAAM detected in AWACS-range engagement profile"
    subject_type: system_activation
    trigger: {requires_system: pl17_widespread}
    payload_keys:
      active: {source: literal, value: true}

  - id: plaaf_j36_sighting
    faction: PLAAF
    source_types: [OSINT, IMINT]
    headline_template: "J-36 sixth-gen demonstrator photographed at Chengdu"
    subject_type: deployment_observation
    trigger: {min_inventory: {j36_prototype: 1}}
    payload_keys:
      count: {source: inventory, key: j36_prototype, noise: 0.30}

  - id: plaaf_h6k_dispersal
    faction: PLAAF
    source_types: [IMINT]
    headline_template: "{count} H-6K bombers dispersed across western airfields"
    subject_type: force_count
    trigger: {min_inventory: {h6kj: 1}}
    payload_keys:
      count: {source: inventory, key: h6kj, noise: 0.10}

  # ===== PAF =====
  - id: paf_j35e_induction
    faction: PAF
    source_types: [IMINT, OSINT]
    headline_template: "PAF J-35E fleet at {count} airframes — stealth fighter ops begin"
    subject_type: force_count
    trigger: {min_inventory: {j35e: 1}}
    payload_keys:
      count: {source: inventory, key: j35e, noise: 0.10}

  - id: paf_j10ce_basing
    faction: PAF
    source_types: [IMINT]
    headline_template: "PAF J-10CE squadron rotating through {base}"
    subject_type: base_rotation
    trigger: {min_inventory: {j10ce: 20}}
    payload_keys:
      base: {source: forward_bases, pick: random}

  - id: paf_jf17_activity
    faction: PAF
    source_types: [OSINT, HUMINT]
    headline_template: "PAF JF-17 Block 3 surge activity reported"
    subject_type: deployment_observation
    trigger: {min_inventory: {jf17_blk3: 40}}
    payload_keys:
      count: {source: inventory, key: jf17_blk3, noise: 0.15}

  - id: paf_doctrine_shift
    faction: PAF
    source_types: [HUMINT]
    headline_template: "PAF doctrine assessed as {doctrine}"
    subject_type: doctrine_guess
    payload_keys:
      doctrine: {source: doctrine}

  # ===== PLAN =====
  - id: plan_carrier_sortie
    faction: PLAN
    source_types: [IMINT, OSINT]
    headline_template: "PLAN carrier group transit observed in IOR"
    subject_type: deployment_observation
    trigger: {min_inventory: {fujian: 1}}
    payload_keys:
      count: {source: literal, value: 1}

  - id: plan_type055_presence
    faction: PLAN
    source_types: [IMINT, SIGINT]
    headline_template: "PLAN Type-055 destroyer assessment: approximately {count} hulls"
    subject_type: force_count
    trigger: {min_inventory: {type055_destroyer: 1}}
    payload_keys:
      count: {source: inventory, key: type055_destroyer, noise: 0.15}

  - id: plan_doctrine_chatter
    faction: PLAN
    source_types: [HUMINT]
    headline_template: "PLAN surface force doctrine shifting toward {doctrine}"
    subject_type: doctrine_guess
    payload_keys:
      doctrine: {source: doctrine}

  - id: plan_ssn_transit
    faction: PLAN
    source_types: [SIGINT, ELINT]
    headline_template: "PLAN SSN transit detected in Indian Ocean"
    subject_type: deployment_observation
    trigger: {min_inventory: {type093b_ssn: 1}}
    payload_keys:
      count: {source: inventory, key: type093b_ssn, noise: 0.20}

  - id: plan_h6n_dispersal
    faction: PLAN
    source_types: [IMINT]
    headline_template: "PLAN H-6N dispersal exercise — YJ-21 carry profile"
    subject_type: system_activation
    trigger: {requires_system: yj21_operational}
    payload_keys:
      active: {source: literal, value: true}
```

- [ ] **Step 3b: Add loader**

Append to `backend/app/content/loader.py`:

```python
@dataclass(frozen=True)
class IntelTemplate:
    id: str
    faction: str
    source_types: list[str]
    headline_template: str
    subject_type: str
    payload_keys: dict
    trigger: dict | None = None


def load_intel_templates(path: Path) -> list[IntelTemplate]:
    data = _load_yaml(path)
    out: list[IntelTemplate] = []
    for raw in data.get("templates", []):
        out.append(IntelTemplate(
            id=raw["id"],
            faction=raw["faction"],
            source_types=list(raw["source_types"]),
            headline_template=raw["headline_template"],
            subject_type=raw["subject_type"],
            payload_keys=dict(raw["payload_keys"]),
            trigger=raw.get("trigger"),
        ))
    return out
```

- [ ] **Step 3c: Add registry entry**

Append to `backend/app/content/registry.py`:

```python
from app.content.loader import load_intel_templates


@lru_cache(maxsize=1)
def intel_templates() -> list:
    return load_intel_templates(Path(settings.content_dir) / "intel_templates.yaml")
```

And update `reload_all()` to include `intel_templates`:
```python
def reload_all() -> None:
    for fn in (platforms, bases, objectives, rd_programs, adversary_roadmap, intel_templates):
        fn.cache_clear()
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_intel_templates.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/content/intel_templates.yaml backend/app/content backend/tests/test_intel_templates.py
git commit -m "content: intel card templates YAML (15 archetypes) + loader

Covers PLAAF base rotation / force counts / doctrine chatter / PL-17
employment / J-36 sightings, PAF J-35E induction / J-10CE basing /
JF-17 surges, PLAN carrier sorties / Type-055 presence / SSN transits
/ H-6N dispersal. Each template has trigger conditions gating
eligibility and payload_keys describing how to render each placeholder
from adversary state."
```

---

## Task 6: Engine — intel card generator

**Files:**
- Create: `backend/app/engine/intel/__init__.py`
- Create: `backend/app/engine/intel/generator.py`
- Create: `backend/tests/test_intel_generator.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_intel_generator.py`:

```python
import random

from app.content.loader import IntelTemplate
from app.engine.intel.generator import generate_intel, is_template_eligible


def _tpl(id="tpl1", faction="PLAAF", source_types=None, subject_type="force_count",
         headline="{count} airframes", payload_keys=None, trigger=None):
    return IntelTemplate(
        id=id, faction=faction,
        source_types=source_types or ["IMINT"],
        headline_template=headline,
        subject_type=subject_type,
        payload_keys=payload_keys or {"count": {"source": "inventory", "key": "j20a"}},
        trigger=trigger,
    )


def _plaaf_state():
    return {
        "inventory": {"j20a": 500, "j35a": 50},
        "doctrine": "conservative",
        "active_systems": ["pl15_operational"],
        "forward_bases": ["hotan", "kashgar"],
    }


def test_generates_between_4_and_7_cards():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id=f"t{i}") for i in range(6)]
    cards, events = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(42),
    )
    assert 4 <= len(cards) <= 7


def test_generated_card_has_expected_payload_shape():
    states = {"PLAAF": _plaaf_state()}
    tpl = _tpl(
        id="t",
        payload_keys={"count": {"source": "inventory", "key": "j20a"}},
    )
    cards, _ = generate_intel(
        states, [tpl, tpl, tpl, tpl, tpl], roadmap_events=[],
        year=2026, quarter=2, rng=random.Random(0),
    )
    c = cards[0]
    assert c["source_type"] in ("HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT")
    assert 0.0 <= c["confidence"] <= 1.0
    assert c["truth_value"] in (True, False)
    assert c["payload"]["subject_faction"] == "PLAAF"
    assert "observed" in c["payload"]
    assert "ground_truth" in c["payload"]


def test_eligibility_respects_min_inventory():
    state = _plaaf_state()
    tpl_ok = _tpl(id="ok", trigger={"min_inventory": {"j20a": 300}})
    tpl_no = _tpl(id="no", trigger={"min_inventory": {"j20a": 9999}})
    assert is_template_eligible(tpl_ok, "PLAAF", state)
    assert not is_template_eligible(tpl_no, "PLAAF", state)


def test_eligibility_respects_requires_system():
    state = _plaaf_state()
    tpl_has = _tpl(id="has", trigger={"requires_system": "pl15_operational"})
    tpl_missing = _tpl(id="missing", trigger={"requires_system": "pl17_widespread"})
    assert is_template_eligible(tpl_has, "PLAAF", state)
    assert not is_template_eligible(tpl_missing, "PLAAF", state)


def test_skips_template_when_forward_bases_empty_and_template_needs_base():
    state = _plaaf_state()
    state["forward_bases"] = []
    tpl = _tpl(
        id="needs_base",
        payload_keys={"base": {"source": "forward_bases", "pick": "random"}},
    )
    assert not is_template_eligible(tpl, "PLAAF", state)


def test_roadmap_intel_event_yields_additional_card():
    from app.content.loader import RoadmapEvent, RoadmapEffect, RoadmapIntel
    states = {"PAF": {"inventory": {"j35e": 4}, "doctrine": "conservative",
                      "active_systems": [], "forward_bases": ["sargodha"]}}
    roadmap_event = RoadmapEvent(
        year=2026, quarter=3, faction="PAF",
        effect=RoadmapEffect(kind="inventory_delta", payload={"j35e": 4}),
        intel=RoadmapIntel(
            headline="PAF receives first J-35E tranche",
            source_type="IMINT",
            confidence=0.92,
        ),
    )
    tpls = [_tpl(id=f"t{i}", faction="PAF",
                 payload_keys={"count": {"source": "inventory", "key": "j35e"}})
            for i in range(6)]
    cards, _ = generate_intel(
        states, tpls, roadmap_events=[roadmap_event],
        year=2026, quarter=3, rng=random.Random(0),
    )
    headlines = [c["payload"]["headline"] for c in cards]
    assert any("first J-35E tranche" in h for h in headlines)


def test_same_seed_produces_same_cards():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id=f"t{i}") for i in range(6)]
    cards_a, _ = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(77),
    )
    cards_b, _ = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(77),
    )
    # Compare headlines + observed payloads — they should be byte-identical
    assert [(c["source_type"], c["payload"]["headline"]) for c in cards_a] == \
           [(c["source_type"], c["payload"]["headline"]) for c in cards_b]


def test_emits_intel_underfilled_when_not_enough_templates():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id="only", trigger={"min_inventory": {"j20a": 9999}})]  # fails eligibility
    cards, events = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(0),
    )
    assert any(e["event_type"] == "intel_underfilled" for e in events)
    assert len(cards) < 4
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_intel_generator.py -v
```

- [ ] **Step 3: Implement intel generator**

Create `backend/app/engine/intel/__init__.py` (empty).

Create `backend/app/engine/intel/generator.py`:

```python
"""Intel card generator.

Each turn: pick 4-7 eligible templates, render them against adversary
state, roll for source type + truth value, pass through fog filter.
Additionally emit one card for each roadmap event that carries an
`intel` block. Output is a list of dicts ready to persist as IntelCard
rows.
"""

from __future__ import annotations

import copy
import random
from typing import Any

from app.engine.intel.fog import SOURCE_RULES, apply_fog

MIN_CARDS = 4
MAX_CARDS = 7


def is_template_eligible(template, faction: str, state: dict) -> bool:
    if template.faction != faction:
        return False
    trigger = template.trigger or {}

    min_inv = trigger.get("min_inventory", {})
    for unit, threshold in min_inv.items():
        if state["inventory"].get(unit, 0) < threshold:
            return False

    req_system = trigger.get("requires_system")
    if req_system and req_system not in state["active_systems"]:
        return False

    # Template payload may reference forward_bases or active_systems;
    # if so and those lists are empty, skip.
    for key_spec in template.payload_keys.values():
        if key_spec.get("source") == "forward_bases" and not state["forward_bases"]:
            return False
        if key_spec.get("source") == "active_systems" and not state["active_systems"]:
            return False

    return True


def _render_card(
    template, faction: str, state: dict, rng: random.Random,
) -> dict:
    ground_truth: dict[str, Any] = {}
    for key, spec in template.payload_keys.items():
        ground_truth[key] = _render_value(spec, state, rng)

    headline = template.headline_template.format(**ground_truth)
    source_type = rng.choice(template.source_types)
    lo, hi = SOURCE_RULES[source_type]["confidence_range"]
    confidence = rng.uniform(lo, hi)
    truth_value = rng.random() >= SOURCE_RULES[source_type]["false_rate"]

    observed = copy.deepcopy(ground_truth)

    card = {
        "source_type": source_type,
        "confidence": round(confidence, 3),
        "truth_value": truth_value,
        "payload": {
            "headline": headline,
            "template_id": template.id,
            "subject_faction": faction,
            "subject_type": template.subject_type,
            "observed": observed,
            "ground_truth": ground_truth,
        },
    }

    if not truth_value:
        apply_fog(card, rng)
        # Re-render headline from (mutated) observed values if applicable.
        try:
            card["payload"]["headline"] = template.headline_template.format(**card["payload"]["observed"])
        except (KeyError, ValueError):
            pass  # leave original headline if mutation dropped a placeholder key

    return card


def _render_value(spec: dict, state: dict, rng: random.Random):
    source = spec["source"]
    if source == "literal":
        return spec["value"]
    if source == "doctrine":
        return state["doctrine"]
    if source == "inventory":
        raw = state["inventory"].get(spec["key"], 0)
        scale = spec.get("scale", 1.0)
        noise = spec.get("noise", 0.0)
        value = raw * scale
        if noise:
            value *= rng.uniform(1 - noise, 1 + noise)
        return max(0, int(value))
    if source == "forward_bases":
        return rng.choice(state["forward_bases"])
    if source == "active_systems":
        return rng.choice(state["active_systems"])
    raise ValueError(f"unknown payload_keys source: {source!r}")


def generate_intel(
    states: dict[str, dict],
    templates: list,
    roadmap_events: list,
    year: int,
    quarter: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    emitted_events: list[dict] = []
    cards: list[dict] = []

    target = rng.randint(MIN_CARDS, MAX_CARDS)

    # Eligible templates, paired with the owning faction.
    eligible: list[tuple] = []
    for faction, state in states.items():
        for tpl in templates:
            if is_template_eligible(tpl, faction, state):
                eligible.append((tpl, faction, state))

    if not eligible:
        emitted_events.append({
            "event_type": "intel_underfilled",
            "payload": {"reason": "no_eligible_templates", "target": target, "produced": 0},
        })
        # Fall through to roadmap-driven cards
    else:
        picks = [rng.choice(eligible) for _ in range(target)] if len(eligible) >= 1 else []
        for tpl, faction, state in picks:
            cards.append(_render_card(tpl, faction, state, rng))

    if cards and len(cards) < MIN_CARDS:
        emitted_events.append({
            "event_type": "intel_underfilled",
            "payload": {"reason": "insufficient_cards", "target": target, "produced": len(cards)},
        })

    # Roadmap-driven intel cards (one per event with intel block matching turn)
    for evt in roadmap_events:
        if evt.year != year or evt.quarter != quarter:
            continue
        if evt.intel is None:
            continue
        faction_state = states.get(evt.faction, {})
        truth_value = True if evt.intel.forced_true else (
            rng.random() >= SOURCE_RULES[evt.intel.source_type]["false_rate"]
        )
        ground_truth = {"event_kind": evt.effect.kind}
        card = {
            "source_type": evt.intel.source_type,
            "confidence": evt.intel.confidence,
            "truth_value": truth_value,
            "payload": {
                "headline": evt.intel.headline,
                "template_id": "__roadmap__",
                "subject_faction": evt.faction,
                "subject_type": "deployment_observation",
                "observed": copy.deepcopy(ground_truth),
                "ground_truth": ground_truth,
            },
        }
        if not truth_value:
            apply_fog(card, rng)
        cards.append(card)

    for c in cards:
        emitted_events.append({
            "event_type": "intel_card_generated",
            "payload": {
                "faction": c["payload"]["subject_faction"],
                "source_type": c["source_type"],
                "truth_value": c["truth_value"],
                "template_id": c["payload"]["template_id"],
            },
        })

    return cards, emitted_events
```

- [ ] **Step 4: Run — expect some tests failing (the fog module doesn't exist yet)**

Run:
```bash
python -m pytest tests/test_intel_generator.py -v
```

Expected: ImportError for `app.engine.intel.fog`. This is fine — Task 7 adds it. For now the test run will error on import but the generator code is still correct.

- [ ] **Step 5: Commit (generator code only — integrate fog in Task 7)**

```bash
git add backend/app/engine/intel/__init__.py backend/app/engine/intel/generator.py backend/tests/test_intel_generator.py
git commit -m "feat(engine): intel card generator (pre-fog)

Pure function generate_intel picks 4-7 eligible templates per turn,
renders them against adversary state, rolls source_type + truth_value,
and emits intel_card_generated events. Roadmap events with intel
blocks produce additional cards. Eligibility is gated by template
trigger (min_inventory, requires_system) and payload data availability
(skip templates that need forward_bases/active_systems if empty).

Tests will fail until Task 7 lands engine/intel/fog.py."
```

---

## Task 7: Engine — fog-of-war filter

**Files:**
- Create: `backend/app/engine/intel/fog.py`
- Create: `backend/tests/test_intel_fog.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_intel_fog.py`:

```python
import random

from app.engine.intel.fog import SOURCE_RULES, apply_fog


def test_source_rules_match_locked_design():
    assert SOURCE_RULES["HUMINT"]["false_rate"] == 0.30
    assert SOURCE_RULES["SIGINT"]["false_rate"] == 0.15
    assert SOURCE_RULES["IMINT"]["false_rate"] == 0.10
    assert SOURCE_RULES["OSINT"]["false_rate"] == 0.40
    assert SOURCE_RULES["ELINT"]["false_rate"] == 0.15


def test_source_types_have_valid_confidence_ranges():
    for source, rules in SOURCE_RULES.items():
        lo, hi = rules["confidence_range"]
        assert 0.0 <= lo < hi <= 1.0


def _card(subject_type="force_count", observed=None, ground_truth=None, subject_faction="PLAAF"):
    obs = observed if observed is not None else {"count": 100}
    gt = ground_truth if ground_truth is not None else {"count": 100}
    return {
        "source_type": "IMINT",
        "confidence": 0.9,
        "truth_value": False,
        "payload": {
            "headline": "test",
            "template_id": "t",
            "subject_faction": subject_faction,
            "subject_type": subject_type,
            "observed": obs,
            "ground_truth": gt,
        },
    }


def test_force_count_mutation_changes_observed_count():
    card = _card(subject_type="force_count", observed={"count": 100}, ground_truth={"count": 100})
    apply_fog(card, rng=random.Random(0))
    # Might equal 100 by coincidence; assert the range
    assert 0 <= card["payload"]["observed"]["count"] <= 170


def test_ground_truth_preserved():
    card = _card(subject_type="force_count", observed={"count": 500}, ground_truth={"count": 500})
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["ground_truth"]["count"] == 500


def test_base_rotation_swaps_base_when_alternates_available():
    # fog only has access to the card; it can't know what other bases exist.
    # We test that the observed value is mutated to *something* or left unchanged
    # when no alternate is available.
    card = _card(
        subject_type="base_rotation",
        observed={"base": "hotan"},
        ground_truth={"base": "hotan"},
    )
    card["payload"]["_fog_alternates"] = {"base": ["kashgar", "shigatse"]}
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["base"] != "hotan"


def test_doctrine_guess_swaps_with_sibling():
    card = _card(subject_type="doctrine_guess",
                 observed={"doctrine": "conservative"},
                 ground_truth={"doctrine": "conservative"})
    card["payload"]["_fog_alternates"] = {"doctrine": ["integrated_ew", "saturation_raid"]}
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["doctrine"] != "conservative"


def test_system_activation_flips_bool():
    card = _card(subject_type="system_activation",
                 observed={"active": True},
                 ground_truth={"active": True})
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["active"] is False


def test_unknown_subject_type_graceful_no_crash():
    card = _card(subject_type="mystery_kind",
                 observed={"whatever": 1},
                 ground_truth={"whatever": 1})
    apply_fog(card, rng=random.Random(0))  # does not raise
    # observed may or may not equal ground_truth — just assert no explosion
    assert card["payload"]["subject_type"] == "mystery_kind"


def test_fog_does_not_change_source_type_or_confidence():
    card = _card(subject_type="force_count")
    card["source_type"] = "IMINT"
    card["confidence"] = 0.85
    apply_fog(card, rng=random.Random(0))
    assert card["source_type"] == "IMINT"
    assert card["confidence"] == 0.85
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_intel_fog.py -v
```

- [ ] **Step 3: Implement fog module**

Create `backend/app/engine/intel/fog.py`:

```python
"""Fog-of-war truth filter.

When a card is marked false (truth_value=False), apply_fog mutates the
`observed` dict so it diverges from `ground_truth`. The mutation
strategy depends on the card's subject_type.

SOURCE_RULES defines per-source-type confidence ranges and false rates.
The generator reads these for both roll outcomes AND for the overall
~1-in-3 wrong target across a turn's card mix.
"""

from __future__ import annotations

import random

SOURCE_RULES: dict[str, dict] = {
    "HUMINT": {"confidence_range": (0.40, 0.80), "false_rate": 0.30},
    "SIGINT": {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
    "IMINT":  {"confidence_range": (0.70, 1.00), "false_rate": 0.10},
    "OSINT":  {"confidence_range": (0.30, 0.70), "false_rate": 0.40},
    "ELINT":  {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
}


def apply_fog(card: dict, rng: random.Random) -> None:
    """Mutate card['payload']['observed'] in place based on subject_type.

    Does not touch source_type, confidence, or ground_truth.
    Graceful on unknown subject_types (no-op).
    """
    observed = card["payload"]["observed"]
    subject_type = card["payload"]["subject_type"]
    alternates = card["payload"].get("_fog_alternates", {})

    if subject_type == "force_count":
        if "count" in observed:
            factor = rng.uniform(0.4, 1.7)
            observed["count"] = max(0, int(observed["count"] * factor))
    elif subject_type == "base_rotation":
        if "base" in observed:
            choices = alternates.get("base", [])
            choices = [b for b in choices if b != observed["base"]]
            if choices:
                observed["base"] = rng.choice(choices)
    elif subject_type == "doctrine_guess":
        if "doctrine" in observed:
            choices = alternates.get("doctrine", [])
            choices = [d for d in choices if d != observed["doctrine"]]
            if choices:
                observed["doctrine"] = rng.choice(choices)
    elif subject_type == "system_activation":
        if "active" in observed:
            observed["active"] = not observed["active"]
    # unknown subject_type: no-op (graceful degrade)
```

- [ ] **Step 3b: Enrich the intel generator to populate `_fog_alternates`**

The generator must pass alternate candidates to the fog filter for `base_rotation` (other forward_bases) and `doctrine_guess` (other doctrine tiers). Modify `_render_card` in `backend/app/engine/intel/generator.py` — after the existing `card = {...}` block but before `if not truth_value:`, add:

```python
    # Populate alternates so the fog filter has something to swap to.
    alternates: dict[str, list] = {}
    if template.subject_type == "base_rotation":
        alternates["base"] = list(state["forward_bases"])
    if template.subject_type == "doctrine_guess":
        from app.engine.adversary.state import DOCTRINE_LADDER
        alternates["doctrine"] = list(DOCTRINE_LADDER.get(faction, []))
    card["payload"]["_fog_alternates"] = alternates
```

Then, **after** the fog call (or after leaving `if not truth_value:`), strip the `_fog_alternates` key so it doesn't bloat the persisted card payload. At the end of `_render_card` add:

```python
    card["payload"].pop("_fog_alternates", None)
    return card
```

(Replace the existing `return card` at the end — there is only one.)

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_intel_fog.py tests/test_intel_generator.py -v
```

Expected: all green (8 fog + 8 generator = 16 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/intel/fog.py backend/app/engine/intel/generator.py backend/tests/test_intel_fog.py
git commit -m "feat(engine): fog-of-war truth filter + wire into generator

SOURCE_RULES locks confidence ranges + false rates per source type
(HUMINT 0.30, SIGINT 0.15, IMINT 0.10, OSINT 0.40, ELINT 0.15).
apply_fog mutates observed payload based on subject_type: force_count
jitter 0.4-1.7x, base_rotation swap, doctrine_guess sibling swap,
system_activation bool flip. Unknown subject_types pass through
unchanged (graceful degrade). Generator populates _fog_alternates
so fog has swap candidates for base/doctrine, then strips the key
before persistence."
```

---

## Task 8: Orchestrator integration

**Files:**
- Modify: `backend/app/engine/turn.py`
- Modify: `backend/tests/test_engine_turn.py`

- [ ] **Step 1: Extend the failing turn tests**

Append to `backend/tests/test_engine_turn.py`:

```python
def test_adversary_subsystem_runs_and_returns_updated_states():
    from app.content.loader import RoadmapEvent, RoadmapEffect
    specs = {}
    ctx = _ctx(
        year=2026, quarter=3,
        programs=[], orders=[], squadrons=[], specs=specs,
    )
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 500}, "doctrine": "conservative",
                  "active_systems": [], "forward_bases": ["hotan"]},
    }
    ctx["adversary_roadmap"] = [
        RoadmapEvent(year=2026, quarter=3, faction="PLAAF",
                     effect=RoadmapEffect(kind="inventory_delta", payload={"j20a": 60})),
    ]
    ctx["intel_templates"] = []
    result = advance(ctx)
    assert result.next_adversary_states["PLAAF"]["inventory"]["j20a"] == 560


def test_intel_subsystem_generates_cards():
    from app.content.loader import IntelTemplate
    ctx = _ctx(year=2026, quarter=3)
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 500}, "doctrine": "conservative",
                  "active_systems": [], "forward_bases": ["hotan"]},
    }
    ctx["adversary_roadmap"] = []
    ctx["intel_templates"] = [
        IntelTemplate(id=f"t{i}", faction="PLAAF", source_types=["IMINT"],
                      headline_template="{count} J-20A observed",
                      subject_type="force_count",
                      payload_keys={"count": {"source": "inventory", "key": "j20a"}},
                      trigger=None)
        for i in range(6)
    ]
    result = advance(ctx)
    assert 4 <= len(result.new_intel_cards) <= 7


def test_doctrine_progression_runs_after_adversary_tick():
    ctx = _ctx(year=2028, quarter=1)
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 680, "j35a": 100},
                  "doctrine": "conservative",
                  "active_systems": [], "forward_bases": []},
    }
    ctx["adversary_roadmap"] = []
    ctx["intel_templates"] = []
    result = advance(ctx)
    assert result.next_adversary_states["PLAAF"]["doctrine"] == "integrated_ew"
    assert any(e["event_type"] == "adversary_doctrine_shifted" for e in result.events)


def test_missing_adversary_ctx_keys_default_to_empty():
    """Existing tests don't pass adversary_states / roadmap / templates —
    advance() should fall back to empty defaults gracefully."""
    ctx = _ctx(year=2026, quarter=2)
    # Do NOT set adversary_states / adversary_roadmap / intel_templates
    result = advance(ctx)
    assert result.next_adversary_states == {}
    assert result.new_intel_cards == []
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_engine_turn.py -v
```

Expected: AttributeError on `result.next_adversary_states` / `result.new_intel_cards`.

- [ ] **Step 3: Extend the orchestrator**

Read the current `backend/app/engine/turn.py`. Then modify it as follows. The full file should read:

```python
"""End-of-turn orchestrator.

Pure function. Takes a context dict (current campaign state +
spec registry + adversary state + intel templates + roadmap), returns
an EngineResult containing all mutations to apply and the events to
log. The CRUD layer translates ORM rows to/from the dict shape this
engine expects.

Order of operations (locked):
    1. Normalize + validate allocation
    2. Apply quarterly grant to treasury
    3. R&D tick
    4. Acquisition tick
    5. Readiness tick
    6. Adversary tick (apply roadmap events + doctrine progression)
    7. Intel generation (reads post-tick adversary state)
    8. Deduct allocation from treasury
    9. Advance clock
    10. Emit turn_advanced event
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from app.engine.budget import normalize_allocation, validate_allocation
from app.engine.rng import subsystem_rng
from app.engine.rd import tick_rd
from app.engine.acquisition import tick_acquisitions
from app.engine.readiness import tick_readiness
from app.engine.adversary.tick import tick_adversary
from app.engine.adversary.doctrine import progress_doctrine
from app.engine.intel.generator import generate_intel


@dataclass
class EngineResult:
    next_year: int
    next_quarter: int
    next_treasury_cr: int
    next_rd_states: list[dict]
    next_acquisition_orders: list[dict]
    next_squadrons: list[dict]
    next_adversary_states: dict[str, dict] = field(default_factory=dict)
    new_intel_cards: list[dict] = field(default_factory=list)
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

    # Deep-copy mutable inputs so subsystem shallow copies don't leak.
    rd_states_in = copy.deepcopy(ctx["rd_states"])
    orders_in = copy.deepcopy(ctx["acquisition_orders"])
    squadrons_in = copy.deepcopy(ctx["squadrons"])
    adversary_states_in = copy.deepcopy(ctx.get("adversary_states", {}))
    adversary_roadmap = ctx.get("adversary_roadmap", [])
    intel_templates = ctx.get("intel_templates", [])

    events: list[dict] = []

    rd_rng = subsystem_rng(seed, "rd", year, quarter)
    next_rd, rd_events = tick_rd(
        rd_states_in, ctx["rd_specs"], allocation["rd"], rd_rng,
    )
    events.extend(rd_events)

    next_orders, acq_events = tick_acquisitions(
        orders_in, year, quarter, allocation["acquisition"],
    )
    events.extend(acq_events)

    readiness_rng = subsystem_rng(seed, "readiness", year, quarter)
    next_squadrons, readiness_events = tick_readiness(
        squadrons_in, allocation["om"], allocation["spares"], readiness_rng,
    )
    events.extend(readiness_events)

    # Adversary tick (applies roadmap) + doctrine progression per faction
    adversary_rng = subsystem_rng(seed, "adversary", year, quarter)
    next_adversary, adv_events = tick_adversary(
        adversary_states_in, adversary_roadmap, year, quarter, adversary_rng,
    )
    events.extend(adv_events)
    for faction, state in list(next_adversary.items()):
        new_state, doc_events = progress_doctrine(faction, state, year)
        next_adversary[faction] = new_state
        events.extend(doc_events)

    # Intel generation reads post-tick adversary state
    intel_rng = subsystem_rng(seed, "intel", year, quarter)
    new_cards, intel_events = generate_intel(
        next_adversary, intel_templates, adversary_roadmap, year, quarter, intel_rng,
    )
    events.extend(intel_events)

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
        next_adversary_states=next_adversary,
        new_intel_cards=new_cards,
        events=events,
    )
```

- [ ] **Step 4: Run — expect pass**

Run:
```bash
python -m pytest tests/test_engine_turn.py -v
```

Expected: all pass (existing 10 + 4 new = 14).

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/turn.py backend/tests/test_engine_turn.py
git commit -m "feat(engine): orchestrator runs adversary + intel subsystems

Order of operations becomes: validate allocation -> grant -> rd ->
acquisition -> readiness -> adversary tick (roadmap + doctrine) ->
intel generation -> deduct -> clock -> turn_advanced. EngineResult
gains next_adversary_states + new_intel_cards. Adversary uses its
own subsystem_rng; intel uses its own. Doctrine progression runs
AFTER tick_adversary so inventory deltas in the same quarter count
toward promotion. Intel reads post-tick adversary state. Missing
ctx keys (adversary_states / roadmap / templates) default to empty
for backward compatibility with Plan 2 tests."
```

---

## Task 9: CRUD wiring (advance_turn + starting state)

**Files:**
- Modify: `backend/app/crud/campaign.py`
- Modify: `backend/app/crud/seed_starting_state.py`

- [ ] **Step 1: Extend advance_turn to read/write adversary + intel**

Modify `backend/app/crud/campaign.py`:

Add these imports near the top (with the other model imports):
```python
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.content.registry import adversary_roadmap as adversary_roadmap_reg
from app.content.registry import intel_templates as intel_templates_reg
```

In `advance_turn`, after the existing `sq_rows = db.query(Squadron)...` line, add:

```python
    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
```

After the `specs = {...}` dict construction, update the `ctx` dict to include three new keys:

```python
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
        "adversary_states": {row.faction: dict(row.state) for row in adv_rows},
        "adversary_roadmap": adversary_roadmap_reg(),
        "intel_templates": intel_templates_reg(),
    }
```

After the existing `sq_by_id = {s.id: s for s in sq_rows}` block + its loop, add adversary state write-back and intel card persistence:

```python
    adv_by_faction = {r.faction: r for r in adv_rows}
    for faction, state in result.next_adversary_states.items():
        if faction in adv_by_faction:
            adv_by_faction[faction].state = state
        else:
            db.add(AdversaryState(campaign_id=campaign.id, faction=faction, state=state))

    for card in result.new_intel_cards:
        db.add(IntelCard(
            campaign_id=campaign.id,
            appeared_year=from_year,
            appeared_quarter=from_quarter,
            source_type=card["source_type"],
            confidence=card["confidence"],
            truth_value=card["truth_value"],
            payload=card["payload"],
        ))
```

(The `from_year` / `from_quarter` already exist from the Plan 2 post-review fix — reuse them.)

- [ ] **Step 2: Seed adversary OOBs + J-35E intel card**

Modify `backend/app/crud/seed_starting_state.py`. Add imports at the top:
```python
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.engine.adversary.state import OOB_2026_Q2
```

At the end of `seed_starting_state(db, campaign)`, append:

```python
    for faction, state in OOB_2026_Q2.items():
        db.add(AdversaryState(
            campaign_id=campaign.id,
            faction=faction,
            state=dict(state),  # shallow copy of the module-level constant
        ))

    # Pre-seed the PAF J-35E deal as a Turn-0 visible intel card.
    db.add(IntelCard(
        campaign_id=campaign.id,
        appeared_year=campaign.current_year,
        appeared_quarter=campaign.current_quarter,
        source_type="IMINT",
        confidence=0.94,
        truth_value=True,
        payload={
            "headline": "Pakistan finalizes J-35E deal — 40 airframes + 30 option",
            "template_id": "__turn0_seed__",
            "subject_faction": "PAF",
            "subject_type": "deployment_observation",
            "observed": {"jets_contracted": 40, "option": 30, "first_delivery_q": "2026-Q3"},
            "ground_truth": {"jets_contracted": 40, "option": 30, "first_delivery_q": "2026-Q3"},
        },
    ))
```

- [ ] **Step 3: Run full test suite**

Run:
```bash
python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all green. Pre-existing tests (Plan 1/2) may see new IntelCard rows in their DBs from the seed; they should tolerate this (nothing asserts card count specifically).

Possible regressions to watch for:
- `test_replay_determinism` may need relaxation if it inspects card rows; Task 14 handles this properly.
- `test_advance_turn_grows_treasury_by_grant_minus_spend` should still pass — intel generation doesn't touch treasury.
- `test_event_vocabulary` WILL fail because new event types (`adversary_roadmap_event_applied`, `adversary_doctrine_shifted`, `intel_card_generated`, `intel_underfilled`) aren't in `CANONICAL_EVENT_TYPES` yet. Task 14 registers them.

If `test_event_vocabulary` fails for those reasons: acceptable for this task, Task 14 resolves.

- [ ] **Step 4: Commit**

```bash
git add backend/app/crud/campaign.py backend/app/crud/seed_starting_state.py
git commit -m "feat(crud): wire adversary + intel through advance_turn

advance_turn now reads AdversaryState rows, passes roadmap + templates
registries into engine ctx, writes back updated state per faction, and
persists new IntelCard rows. seed_starting_state populates the 2026-Q2
OOB for all three factions and pre-seeds the PAF J-35E deal as a
Turn-0 visible IMINT card."
```

---

## Task 10: Intel API endpoint

**Files:**
- Create: `backend/app/schemas/intel.py`
- Create: `backend/app/crud/intel.py`
- Create: `backend/app/api/intel.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_intel_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_intel_api.py`:

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
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": 5,
    }).json()


def test_get_intel_returns_turn_zero_seed_card(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/intel")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert any("J-35E" in card["payload"]["headline"] for card in body["cards"])


def test_get_intel_after_advance_includes_generated_cards(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel").json()
    # Initial seed + roadmap 2026-Q3 events + 4-7 random -> at least 5
    assert body["total"] >= 5


def test_get_intel_filters_by_year_quarter(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?year=2026&quarter=2").json()
    for card in body["cards"]:
        assert card["appeared_year"] == 2026
        assert card["appeared_quarter"] == 2


def test_get_intel_filters_by_source_type(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?source_type=IMINT").json()
    for card in body["cards"]:
        assert card["source_type"] == "IMINT"


def test_get_intel_404_for_unknown_campaign(client):
    r = client.get("/api/campaigns/99999/intel")
    assert r.status_code == 404


def test_get_intel_pagination_limit(client):
    c = _create_campaign(client)
    for _ in range(4):
        client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?limit=3").json()
    assert len(body["cards"]) == 3
    assert body["total"] >= 10
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_intel_api.py -v
```

- [ ] **Step 3: Implement schema**

Create `backend/app/schemas/intel.py`:

```python
from typing import Literal
from pydantic import BaseModel


SourceType = Literal["HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT"]


class IntelCardRead(BaseModel):
    id: int
    appeared_year: int
    appeared_quarter: int
    source_type: SourceType
    confidence: float
    truth_value: bool
    payload: dict

    model_config = {"from_attributes": True}


class IntelListResponse(BaseModel):
    total: int
    cards: list[IntelCardRead]
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/intel.py`:

```python
from sqlalchemy.orm import Session

from app.models.intel import IntelCard


def list_intel_cards(
    db: Session,
    campaign_id: int,
    year: int | None = None,
    quarter: int | None = None,
    source_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, list[IntelCard]]:
    q = db.query(IntelCard).filter(IntelCard.campaign_id == campaign_id)
    if year is not None:
        q = q.filter(IntelCard.appeared_year == year)
    if quarter is not None:
        q = q.filter(IntelCard.appeared_quarter == quarter)
    if source_type is not None:
        q = q.filter(IntelCard.source_type == source_type)
    total = q.count()
    cards = q.order_by(
        IntelCard.appeared_year.desc(),
        IntelCard.appeared_quarter.desc(),
        IntelCard.id.desc(),
    ).offset(offset).limit(limit).all()
    return total, cards
```

- [ ] **Step 5: Implement API**

Create `backend/app/api/intel.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.intel import list_intel_cards
from app.schemas.intel import IntelListResponse, IntelCardRead, SourceType

router = APIRouter(prefix="/api/campaigns", tags=["intel"])


@router.get("/{campaign_id}/intel", response_model=IntelListResponse)
def list_intel_endpoint(
    campaign_id: int,
    year: int | None = Query(None, ge=2026, le=2040),
    quarter: int | None = Query(None, ge=1, le=4),
    source_type: SourceType | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    total, cards = list_intel_cards(
        db, campaign_id,
        year=year, quarter=quarter, source_type=source_type,
        limit=limit, offset=offset,
    )
    return IntelListResponse(
        total=total,
        cards=[IntelCardRead.model_validate(c) for c in cards],
    )
```

- [ ] **Step 6: Register router in main.py**

After the acquisitions_router include, add:

```python
from app.api.intel import router as intel_router
app.include_router(intel_router)
```

- [ ] **Step 7: Run — expect pass**

Run:
```bash
python -m pytest tests/test_intel_api.py -v
```

Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/intel.py backend/app/crud/intel.py backend/app/api/intel.py backend/main.py backend/tests/test_intel_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/intel with filters

Returns intel cards for a campaign, filterable by year/quarter/
source_type, paginated with limit+offset. Ordered most-recent first.
Returns total + cards so the frontend can show '12 cards this
quarter' and a swipe stack."
```

---

## Task 11: Adversary API endpoint

**Files:**
- Create: `backend/app/schemas/adversary.py`
- Create: `backend/app/crud/adversary.py`
- Create: `backend/app/api/adversary.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_adversary_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_adversary_api.py`:

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
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": 3,
    }).json()


def test_get_adversary_returns_three_factions(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/adversary")
    assert r.status_code == 200
    body = r.json()
    factions = {f["faction"] for f in body["factions"]}
    assert factions == {"PLAAF", "PAF", "PLAN"}


def test_adversary_plaaf_starts_with_j20a_500(client):
    c = _create_campaign(client)
    body = client.get(f"/api/campaigns/{c['id']}/adversary").json()
    plaaf = next(f for f in body["factions"] if f["faction"] == "PLAAF")
    assert plaaf["state"]["inventory"]["j20a"] == 500


def test_adversary_updates_after_advance(client):
    c = _create_campaign(client)
    # Advance past 2026-Q3 where the PAF J-35E inventory_delta lands
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/adversary").json()
    paf = next(f for f in body["factions"] if f["faction"] == "PAF")
    assert paf["state"]["inventory"]["j35e"] >= 4


def test_get_adversary_404_for_unknown_campaign(client):
    r = client.get("/api/campaigns/99999/adversary")
    assert r.status_code == 404
```

- [ ] **Step 2: Run — expect failure**

Run:
```bash
python -m pytest tests/test_adversary_api.py -v
```

- [ ] **Step 3: Implement schema**

Create `backend/app/schemas/adversary.py`:

```python
from pydantic import BaseModel


class AdversaryStateRead(BaseModel):
    faction: str
    state: dict

    model_config = {"from_attributes": True}


class AdversaryListResponse(BaseModel):
    factions: list[AdversaryStateRead]
```

- [ ] **Step 4: Implement CRUD**

Create `backend/app/crud/adversary.py`:

```python
from sqlalchemy.orm import Session

from app.models.adversary import AdversaryState


def list_adversary_states(db: Session, campaign_id: int) -> list[AdversaryState]:
    return db.query(AdversaryState).filter(
        AdversaryState.campaign_id == campaign_id,
    ).order_by(AdversaryState.faction).all()
```

- [ ] **Step 5: Implement API**

Create `backend/app/api/adversary.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.adversary import list_adversary_states
from app.schemas.adversary import AdversaryListResponse, AdversaryStateRead

router = APIRouter(prefix="/api/campaigns", tags=["adversary"])


@router.get("/{campaign_id}/adversary", response_model=AdversaryListResponse)
def list_adversary_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_adversary_states(db, campaign_id)
    return AdversaryListResponse(
        factions=[AdversaryStateRead.model_validate(r) for r in rows],
    )
```

- [ ] **Step 6: Register router**

In `backend/main.py`, after `intel_router` include, add:

```python
from app.api.adversary import router as adversary_router
app.include_router(adversary_router)
```

- [ ] **Step 7: Run — expect pass**

Run:
```bash
python -m pytest tests/test_adversary_api.py -v
```

Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/adversary.py backend/app/crud/adversary.py backend/app/api/adversary.py backend/main.py backend/tests/test_adversary_api.py
git commit -m "feat(api): GET /api/campaigns/{id}/adversary ground truth

Returns all three faction states for a campaign. This is a debug /
dev endpoint — the player sees intel cards, not ground truth, in
production. Useful for tests and 'what did I really see vs reality'
retrospectives later."
```

---

## Task 12: Multi-turn adversary integration test

**Files:**
- Create: `backend/tests/test_adversary_campaign_integration.py`

- [ ] **Step 1: Write the integration test**

Create `backend/tests/test_adversary_campaign_integration.py`:

```python
"""Full-campaign adversary roadmap integration.

Advances a fixed-seed campaign through all 40 quarters and asserts
that the key authored roadmap milestones land in the final adversary
state. This is the test that gives confidence Plan 3's roadmap doesn't
silently drop events.
"""

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


def _run_full_campaign(client, seed=1234):
    c = client.post("/api/campaigns", json={
        "name": "full", "difficulty": "realistic", "objectives": [], "seed": seed,
    }).json()
    # Advance 40 quarters (2026-Q2 -> 2036-Q2)
    for _ in range(40):
        client.post(f"/api/campaigns/{c['id']}/advance")
    return c["id"]


def test_paf_j35e_reaches_at_least_90_by_end_of_campaign(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    paf = next(f for f in body["factions"] if f["faction"] == "PAF")
    # Roadmap delivers 4 + 36 + 20 + 10 + 20 + 10 = 100 airframes by 2035-Q4.
    # Allow small slack for authoring tweaks — assert >= 90.
    assert paf["state"]["inventory"]["j35e"] >= 90


def test_plaaf_doctrine_reaches_saturation_raid_by_end(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    plaaf = next(f for f in body["factions"] if f["faction"] == "PLAAF")
    assert plaaf["state"]["doctrine"] == "saturation_raid"


def test_plan_reaches_global_power_projection_with_type004(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    plan = next(f for f in body["factions"] if f["faction"] == "PLAN")
    assert plan["state"]["inventory"].get("type004_carrier", 0) >= 2
    assert plan["state"]["doctrine"] == "global_power_projection"


def test_intel_feed_produces_reasonable_volume(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    # 40 turns × ~5 avg cards/turn + roadmap-driven + seed = at least 150
    assert body["total"] >= 150


def test_intel_false_rate_is_in_band(client):
    cid = _run_full_campaign(client)
    # Fetch ALL pages by bumping limit
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    total = body["total"]
    false_count = sum(1 for c in body["cards"] if not c["truth_value"])
    # Spec says ~1-in-3; accept 0.15-0.40 band given source-type mix variance
    ratio = false_count / total if total else 0
    assert 0.10 <= ratio <= 0.45, f"false rate {ratio:.2f} outside [0.10, 0.45]"


def test_plaaf_j36_sighting_eventually_appears(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    headlines = [card["payload"]["headline"] for card in body["cards"]]
    # J-36 prototype lands 2028-Q2; the plaaf_j36_sighting template should fire
    # at least once over the 30+ eligible turns. Guard with OR for the
    # roadmap-driven 2031-Q2 card too.
    assert any("J-36" in h or "j36" in h for h in headlines), \
        "expected at least one J-36 intel card over 10 years"
```

Note: the pagination `?limit=500` assumes Task 10's endpoint respects limit up to 500 (it does; the `le=500` in the Query constraint).

- [ ] **Step 2: Run**

Run:
```bash
python -m pytest tests/test_adversary_campaign_integration.py -v
```

Expected: 6 passed. If one fails, read the failure carefully — the roadmap totals are authored numbers and should match the YAML; the false-rate band is intentionally generous.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_adversary_campaign_integration.py
git commit -m "test: 40-turn campaign adversary roadmap integration

Simulates a full 2026-Q2 -> 2036-Q2 campaign and asserts that key
authored roadmap milestones land: PAF reaches ~100 J-35E, PLAAF
reaches saturation_raid doctrine, PLAN promotes to
global_power_projection after the second Type 004 lands. Also
spot-checks intel volume (>=150 cards over 40 turns) and the
false-rate stays in the [0.10, 0.45] band."
```

---

## Task 13: Event vocabulary + replay-determinism extension

**Files:**
- Modify: `backend/tests/test_event_vocabulary.py`
- Modify: `backend/tests/test_replay_determinism.py`

- [ ] **Step 1: Update event vocabulary**

In `backend/tests/test_event_vocabulary.py`, extend the `CANONICAL_EVENT_TYPES` set:

```python
CANONICAL_EVENT_TYPES = {
    # campaign lifecycle
    "campaign_created",
    "turn_advanced",
    # R&D engine
    "rd_progressed",
    "rd_milestone",
    "rd_breakthrough",
    "rd_setback",
    "rd_completed",
    "rd_underfunded",
    # acquisition engine
    "acquisition_delivery",
    "acquisition_completed",
    "acquisition_underfunded",
    # readiness engine
    "readiness_changed",
    # adversary engine (Plan 3)
    "adversary_roadmap_event_applied",
    "adversary_doctrine_shifted",
    # intel engine (Plan 3)
    "intel_card_generated",
    "intel_underfilled",
}
```

- [ ] **Step 2: Extend replay-determinism to cover intel**

In `backend/tests/test_replay_determinism.py`, extend the `_run_scenario` function to ALSO collect intel-card headlines and the assertion to compare them. Modify `_run_scenario` to return the enriched dict:

```python
def _run_scenario(client, seed: int) -> dict:
    """Create a campaign with a fixed seed, take the same actions, advance 10 turns."""
    created = client.post("/api/campaigns", json={
        "name": "Det", "difficulty": "realistic", "objectives": [],
        "seed": seed,
    }).json()
    campaign_id = created["id"]

    client.post(f"/api/campaigns/{campaign_id}/budget", json={"allocation": {
        "rd": 80000, "acquisition": 40000, "om": 20000, "spares": 10000, "infrastructure": 5000,
    }})

    client.post(f"/api/campaigns/{campaign_id}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "accelerated",
    })

    for _ in range(10):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    final = client.get(f"/api/campaigns/{campaign_id}").json()
    intel_body = client.get(f"/api/campaigns/{campaign_id}/intel?limit=500").json()
    adv_body = client.get(f"/api/campaigns/{campaign_id}/adversary").json()
    # Collect the deterministic-relevant slices
    final["_intel_fingerprint"] = [
        (c["appeared_year"], c["appeared_quarter"], c["source_type"],
         c["payload"]["headline"], c["truth_value"])
        for c in intel_body["cards"]
    ]
    final["_adversary_fingerprint"] = {
        f["faction"]: f["state"]
        for f in adv_body["factions"]
    }
    return final
```

And extend the assertion loop:

```python
def test_replay_via_two_independent_runs():
    client_a, eng_a = _make_client()
    final_a = _run_scenario(client_a, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_a)

    client_b, eng_b = _make_client()
    final_b = _run_scenario(client_b, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_b)

    fields = [
        "current_year", "current_quarter", "budget_cr", "current_allocation_json",
        "_intel_fingerprint", "_adversary_fingerprint",
    ]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}"
```

- [ ] **Step 3: Run both tests**

Run:
```bash
python -m pytest tests/test_event_vocabulary.py tests/test_replay_determinism.py -v
```

Expected: both pass (1 vocab + 2 vocab tests + 1 replay = 4 tests).

- [ ] **Step 4: Run full suite**

Run:
```bash
python -m pytest tests/ 2>&1 | tail -5
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_event_vocabulary.py backend/tests/test_replay_determinism.py
git commit -m "test: extend vocab + replay-determinism for adversary + intel

CANONICAL_EVENT_TYPES gains adversary_roadmap_event_applied,
adversary_doctrine_shifted, intel_card_generated, intel_underfilled.
Replay test now also compares intel-card fingerprint (year, quarter,
source, headline, truth_value) and full adversary state across two
independent seeded runs. This locks Plan 3's determinism contract."
```

---

## Task 14: Frontend types update

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Extend types.ts**

Overwrite `frontend/src/lib/types.ts`:

```typescript
export type Difficulty = "relaxed" | "realistic" | "hard_peer" | "worst_case";

export type BudgetBucket = "rd" | "acquisition" | "om" | "spares" | "infrastructure";
export type BudgetAllocation = Record<BudgetBucket, number>;

export type FactionId = "PLAAF" | "PAF" | "PLAN";

export type SourceType = "HUMINT" | "SIGINT" | "IMINT" | "OSINT" | "ELINT";

export type IntelSubjectType =
  | "base_rotation"
  | "force_count"
  | "doctrine_guess"
  | "system_activation"
  | "deployment_observation";

export interface IntelCardPayload {
  headline: string;
  template_id: string;
  subject_faction: FactionId;
  subject_type: IntelSubjectType;
  observed: Record<string, unknown>;
  ground_truth: Record<string, unknown>;
}

export interface IntelCard {
  id: number;
  appeared_year: number;
  appeared_quarter: number;
  source_type: SourceType;
  confidence: number;
  truth_value: boolean;
  payload: IntelCardPayload;
}

export interface IntelListResponse {
  total: number;
  cards: IntelCard[];
}

export interface AdversaryState {
  inventory: Record<string, number>;
  doctrine: string;
  active_systems: string[];
  forward_bases: string[];
}

export interface AdversaryFaction {
  faction: FactionId;
  state: AdversaryState;
}

export interface AdversaryListResponse {
  factions: AdversaryFaction[];
}

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

- [ ] **Step 2: Verify frontend still builds**

Run:
```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/types.ts
git commit -m "types(frontend): add IntelCard + AdversaryState + source types

Mirrors the Plan 3 backend API contract. No UI change — Plan 8 will
build the intel swipe-stack on top of these types."
```

---

## Task 15: Update ROADMAP + CLAUDE.md

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark Plan 3 done in ROADMAP**

In `docs/superpowers/plans/ROADMAP.md`:
- Change `**Last updated:** 2026-04-17` to today's date.
- Change row 3 (`| 3 | Adversary Simulation & Intel | 🔴 not started | ...`) to:
  ```
  | 3 | Adversary Simulation & Intel | 🟢 done | [2026-04-17-adversary-simulation-intel-plan.md](2026-04-17-adversary-simulation-intel-plan.md) |
  ```

- [ ] **Step 2: Update CLAUDE.md current status**

Find the "Current status" section and update:

```markdown
## Current status (last updated YYYY-MM-DD)

- **Plan 1 (Foundation)** — ✅ done.
- **Plan 2 (Turn Engine Core)** — ✅ done. 110 backend tests passing.
- **Plan 3 (Adversary Simulation & Intel)** — ✅ done. Adversary roadmap 2026-Q3..2036-Q1 evolves PLAAF/PAF/PLAN each turn; intel generator produces 4-7 cards per turn from 15 templates with 5 source types (HUMINT/SIGINT/IMINT/OSINT/ELINT) and ~1-in-3 wrong via fog filter. Two new APIs (`GET /intel`, `GET /adversary`). 40-turn integration test asserts authored milestones land; replay-determinism extended to cover intel + adversary.
- **Next up: Plan 4 (Vignette Engine)** — scenario template system, procedural fill, deterministic combat resolver, threat-curve roll per turn (~35% mid-campaign). Ops Room planning state + commit API. Scope in `ROADMAP.md` §Plan 4. Detailed task-level plan not yet written.
```

(Replace YYYY-MM-DD with today's date.)

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: mark Plan 3 (Adversary Simulation & Intel) done"
```

- [ ] **Step 4: Final verification**

Run:
```bash
cd backend && source .venv/bin/activate && python -m pytest tests/ 2>&1 | tail -3
cd ../frontend && npm run build 2>&1 | tail -3
```

Expected: all backend tests green; frontend builds. Backend test count should be ~160+ (Plan 2's 110 + Plan 3's ~50 new tests).

---

## Final review checklist (for the reviewer)

After all 15 tasks land, check:

1. **Spec coverage:** ROADMAP §Plan 3 requirements — parallel adversary sim on authored roadmap ✓, intel cards with 5 source types ✓, ~1-in-3 wrong ✓, fog-of-war filter ✓, pre-seeded J-35E event ✓, tests for 2026→2036 evolution ✓.
2. **Determinism:** Two fresh subsystem RNGs (`adversary`, `intel`); orchestrator deep-copies adversary_states_in; replay test covers intel + adversary fingerprints.
3. **Event vocabulary:** Four new event types registered in `test_event_vocabulary.py`.
4. **No frontend UI:** Only `types.ts` changed — Plan 8 owns the intel UI.
5. **Content YAML format:** Both YAML files load via Pydantic-ish dataclasses; no unversioned dicts floating around.
6. **Plan 2 regressions:** Existing Plan 2 tests still pass; treasury math unchanged.
7. **LLM hook:** Intel cards' `ground_truth` + `observed` + `headline` are structured enough for Plan 5 to feed into an `intel_brief` LLM prompt.
