# Feedback System + R&D Redesign + Combat Cadence Implementation Plan (Plan 14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a game-wide toast feedback system, seed AWACS + tanker squadrons, redesign R&D dashboard (optimistic UI, progress sorting, budget banner, clearer Active/Catalog split), and boost combat cadence via per-faction threat rolls + non-combat vignettes.

**Architecture:** Four independent subsystems. (1) A reusable `ToastManager` at the app root + `useToast` hook, wired into every mutating store action. (2) Seed data additions for Netra AWACS and IL-78 tankers so the AWACS-coverage mechanic from Plan 13 actually has assets to work with. (3) Per-program loading state on the campaign store + full RD component redesign. (4) Independent faction threat rolls in the turn orchestrator + three new scenario templates (airspace violation, SAR, show-of-force) for non-combat vignettes.

**Tech Stack:** FastAPI + SQLAlchemy 2.x, React 19 + Vite 8 + Tailwind v4 + Zustand, Vitest + pytest.

**Test baselines at start:** Backend **444** tests, Frontend **152** tests. Expected after plan: backend ~455, frontend ~170.

**Mobile UX is the highest priority. Every new UI ships 375px-first.**

---

## File Structure

### Backend — create / modify

- **Modify** `backend/app/crud/seed_starting_state.py` — add Netra AWACS + IL-78 tanker squadrons to `SEED_SQUADRONS`.
- **Modify** `backend/app/engine/vignette/threat.py` — add `should_fire_vignette_for_faction` (per-faction roll with faction-specific curves).
- **Modify** `backend/app/engine/turn.py` — call per-faction rolls, can fire up to 1 vignette per turn (keep single-concurrent-vignette invariant), but increase overall odds.
- **Create** `backend/content/scenario_templates.yaml` additions — 3 new non-combat scenario templates.
- **Create** `backend/app/engine/vignette/non_combat.py` — if a non-combat scenario is picked, resolve it differently (no BVR/WVR, just an XP/reputation swing based on committed force).
- **Modify** `backend/app/api/vignettes.py` (or wherever commit lives) — handle non-combat scenario resolution path.
- **Create** `backend/tests/test_threat_per_faction.py`
- **Create** `backend/tests/test_seed_awacs.py`
- **Create** `backend/tests/test_non_combat_vignette.py`

### Frontend — create / modify

- **Create** `frontend/src/components/primitives/Toast.tsx` — single toast UI component.
- **Create** `frontend/src/components/primitives/ToastStack.tsx` — rendered at app root, subscribes to store toasts.
- **Modify** `frontend/src/store/campaignStore.ts` — add `toasts: Toast[]` state, `pushToast`, `dismissToast` actions. Wire every mutating action to emit a toast on success/error. Also add per-program `rdLoading: Record<string, boolean>` for optimistic UI.
- **Modify** `frontend/src/App.tsx` — mount `<ToastStack />` at root so toasts survive route transitions.
- **Modify** `frontend/src/components/procurement/RDDashboard.tsx` — full redesign:
  - Progress-sorted active list (closest to completion first)
  - Sticky "Budget Banner" at top showing ₹ committed / quarterly R&D bucket
  - Category filter chips on Catalog (Fighters / Weapons / Sensors / Drones / Infrastructure)
  - Per-program optimistic UI (spinner + shake-on-error)
  - Clear visual boundary between Active + Catalog (tab switcher instead of stacked sections on mobile)
- **Modify** `frontend/src/lib/types.ts` — add `Toast` interface, `RDCategory`.
- **Modify** `frontend/src/pages/CampaignMapView.tsx` — remove the old `YearEndRecapToast` bespoke toast (replace with a push to the unified ToastStack on Q4→Q1).
- **Create** tests for Toast, ToastStack, RDDashboard redesign.
- **Create** `frontend/src/components/procurement/__tests__/RDBudgetBanner.test.tsx`

---

## Scope Check

This plan bundles 4 subsystems that share a common "player gets feedback" thread. Total: **12 tasks**. Each subsystem is testable on its own (toast system works with zero mutations wired; AWACS seed works without UI changes; R&D redesign is independent of cadence). Missile unlocks + Hangar + Armory deferred to Plan 15.

---

### Task 1: Seed Netra AWACS + IL-78 Tanker Squadrons

The AWACS mechanic from Plan 13 is unreachable because no Netra squadrons exist at game start. This is a data fix, not a code change.

**Files:**
- Modify: `backend/app/crud/seed_starting_state.py` (extend `SEED_SQUADRONS`)
- Create: `backend/tests/test_seed_awacs.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_seed_awacs.py`:

```python
"""Confirm starting state seeds AWACS + tanker squadrons at real-world bases."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from main import app
from app.core.database import Base, get_db
from app.models.squadron import Squadron

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


def test_campaign_seeds_netra_squadrons():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    with Session(engine) as s:
        netra = s.query(Squadron).filter_by(campaign_id=cid, platform_id="netra_aewc").all()
    assert len(netra) >= 2, f"expected >=2 Netra AWACS squadrons, got {len(netra)}"


def test_campaign_seeds_il78_squadron():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    with Session(engine) as s:
        tankers = s.query(Squadron).filter_by(campaign_id=cid, platform_id="il78mki").all()
    assert len(tankers) >= 1, f"expected >=1 IL-78 tanker squadron, got {len(tankers)}"


def test_netra_squadrons_have_nonzero_readiness():
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    with Session(engine) as s:
        netra = s.query(Squadron).filter_by(campaign_id=cid, platform_id="netra_aewc").all()
    for sq in netra:
        assert sq.readiness_pct > 0
        assert sq.strength > 0
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_seed_awacs.py -v
```

Expected: `len(netra) == 0`, tests fail.

- [ ] **Step 3: Extend `SEED_SQUADRONS`**

First, verify the exact IL-78 platform id by grepping:
```bash
grep -n "^\s*- id:" backend/content/platforms.yaml | grep -i "il.78\|tanker"
```
Expected output mentions `il78mki` or similar. If the id is different (e.g. `il78`), use that verbatim in the seed.

In `backend/app/crud/seed_starting_state.py`, after the final `("87 Sqn Falcons of Nal", "NALCON", "tejas_mk1a", "nal", 16, 83),` line and BEFORE the closing `]` of `SEED_SQUADRONS`, append:

```python
    # AWACS — Netra AEW&C at Bareilly + Agra + Panagarh (east coverage)
    ("50 Sqn Stallions", "STALLION", "netra_aewc", "bareilly", 3, 78),
    ("20 Sqn Lightnings-AWACS", "AWACS-W", "netra_aewc", "nal", 3, 75),
    # Tanker — IL-78MKI
    ("78 Sqn Tuskers", "TANKER", "il78mki", "ambala", 6, 72),
```

**NOTE:** If the platform id grepped above is not `il78mki`, use the actual id. If Panagarh isn't in the SEED_BASES list (grep for `panagarh`), use `nal` as the second Netra base — both are real IAF western AWACS locations.

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_seed_awacs.py -v
```

- [ ] **Step 5: Run the full backend suite to catch regressions**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

Expected: baseline 444 + 3 new = 447 pass.

**WATCH FOR:** the replay determinism test (`tests/test_replay_determinism.py`) recomputes squadron fingerprints — adding 3 new seed squadrons WILL change the fingerprint. That's expected and correct. If it fails with "fingerprint mismatch", verify the failure is only the fingerprint delta (same seed, both sides consistent), then update the test's expected fingerprint. This is legitimate because seed data changed.

If existing content-validation tests (e.g. `test_content_validation.py`) check squadron counts or assume a specific number, update those expectations too.

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/seed_starting_state.py backend/tests/test_seed_awacs.py
# plus any tests you had to update due to the seed-data change
git commit -m "feat: seed Netra AWACS + IL-78 tanker squadrons at campaign start

2 Netra AEW&C squadrons (Bareilly, Nal) give AWACS orbit coverage
for both western LAC and Rajasthan sectors. 1 IL-78 tanker at Ambala
provides refueling support. Unblocks the AWACS-as-asset mechanic
from Plan 13 which had no backing squadrons.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Per-Faction Threat Rolls (backend)

Current `should_fire_vignette` does ONE roll per turn (0.15→0.55 across campaign). Change to per-faction rolls so PLAAF, PAF, and PLAN each have independent odds. Dramatic pace change for free.

**Files:**
- Modify: `backend/app/engine/vignette/threat.py` — add `should_fire_vignette_for_faction`.
- Create: `backend/tests/test_threat_per_faction.py`
- Modify: `backend/app/engine/turn.py` — use per-faction roll, still produce at most 1 vignette per turn (keep backpressure invariant).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_threat_per_faction.py`:

```python
"""Per-faction threat rolls yield higher combined vignette frequency."""
import random

from app.engine.vignette.threat import (
    threat_curve_prob,
    should_fire_vignette_for_faction,
    any_faction_fires,
)


def test_plaaf_prob_matches_base_curve():
    # PLAAF is the baseline: threat_curve_prob unchanged for PLAAF.
    p = threat_curve_prob(2031, 1)
    p_plaaf = threat_curve_prob_for_faction("PLAAF", 2031, 1)
    assert p == p_plaaf


def test_paf_prob_is_lower_than_plaaf():
    # PAF has lower baseline (less-aggressive posture) to keep total reasonable.
    p_plaaf = threat_curve_prob_for_faction("PLAAF", 2031, 1)
    p_paf = threat_curve_prob_for_faction("PAF", 2031, 1)
    assert p_paf < p_plaaf


def test_plan_prob_is_lowest_early_higher_late():
    # PLAN grows more aggressive late-campaign (carrier expansion).
    early = threat_curve_prob_for_faction("PLAN", 2026, 2)
    late = threat_curve_prob_for_faction("PLAN", 2036, 1)
    assert late > early


def test_should_fire_vignette_for_faction_deterministic():
    rng = random.Random(1234)
    r1 = should_fire_vignette_for_faction(rng, "PLAAF", 2031, 1)
    rng2 = random.Random(1234)
    r2 = should_fire_vignette_for_faction(rng2, "PLAAF", 2031, 1)
    assert r1 == r2


def test_any_faction_fires_at_midcampaign_has_higher_rate():
    """Over 1000 mid-campaign rolls, any_faction_fires should trigger
    more often than single-faction should_fire_vignette_for_faction."""
    hits_any = 0
    hits_plaaf = 0
    for seed in range(1000):
        r = random.Random(seed)
        hits_any += 1 if any_faction_fires(r, 2031, 1) else 0
        r2 = random.Random(seed)
        hits_plaaf += 1 if should_fire_vignette_for_faction(r2, "PLAAF", 2031, 1) else 0
    # any_faction should be strictly higher hit rate because it OR's 3 independent rolls.
    assert hits_any > hits_plaaf
```

Also import the new helper explicitly (so the test is self-documenting):
```python
from app.engine.vignette.threat import threat_curve_prob_for_faction
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_threat_per_faction.py -v
```

Expected: `ImportError` — none of these symbols exist yet.

- [ ] **Step 3: Extend `threat.py`**

Replace the whole file with:

```python
"""Threat curves: per-faction probability a vignette fires on a given turn.

Baseline curve (PLAAF): linear 0.20 -> 0.55 across 40 quarters (2026-Q2 to 2036-Q1).
PAF: scaled 0.70x of PLAAF curve (smaller air force, less strategic reach).
PLAN: starts at 0.05, ramps to 0.45 (naval buildup accelerates late-decade).

Any-faction composite: 3 independent rolls. At mid-campaign this yields
~58% fire rate vs the old ~34%, producing roughly one kinetic event every
1.7 turns instead of every 3.
"""

from __future__ import annotations

import random


START_PROB = 0.20      # bumped from 0.15
END_PROB = 0.55
TOTAL_QUARTERS = 40
_SPAN = TOTAL_QUARTERS - 1

FACTIONS: tuple[str, ...] = ("PLAAF", "PAF", "PLAN")


def _baseline_curve(year: int, quarter: int) -> float:
    q_index = (year - 2026) * 4 + (quarter - 2)
    if q_index < 0:
        return START_PROB
    if q_index >= _SPAN:
        return END_PROB
    return START_PROB + (q_index / _SPAN) * (END_PROB - START_PROB)


def threat_curve_prob(year: int, quarter: int) -> float:
    """Backwards-compatible alias — returns the PLAAF baseline curve."""
    return _baseline_curve(year, quarter)


def threat_curve_prob_for_faction(faction: str, year: int, quarter: int) -> float:
    base = _baseline_curve(year, quarter)
    if faction == "PLAAF":
        return base
    if faction == "PAF":
        return base * 0.70
    if faction == "PLAN":
        # Ramps slower early, same endpoint.
        q_index = (year - 2026) * 4 + (quarter - 2)
        t = max(0.0, min(1.0, q_index / _SPAN))
        start = 0.05
        end = 0.45
        return start + t * (end - start)
    return base  # unknown faction falls back to baseline


def should_fire_vignette_for_faction(
    rng: random.Random, faction: str, year: int, quarter: int,
) -> bool:
    return rng.random() < threat_curve_prob_for_faction(faction, year, quarter)


def any_faction_fires(rng: random.Random, year: int, quarter: int) -> bool:
    """Roll independently per faction; return True if any fires."""
    for f in FACTIONS:
        if should_fire_vignette_for_faction(rng, f, year, quarter):
            return True
    return False


# Legacy helper: keep signature for callers that don't yet care about faction.
def should_fire_vignette(rng: random.Random, year: int, quarter: int) -> bool:
    return any_faction_fires(rng, year, quarter)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_threat_per_faction.py -v
```

Expected: 5/5 pass.

- [ ] **Step 5: Run the full backend suite**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

**WATCH FOR:** `should_fire_vignette` still exists but now delegates to `any_faction_fires`, which produces more hits. If `test_replay_determinism.py` or any test relies on a SPECIFIC pattern of vignette firings per turn with a specific seed, that test will need its expected value updated — the bump from 0.15→0.20 baseline + per-faction OR logic changes determinism. Update expected vignette counts / fingerprints, not the engine.

If `test_vignette_threat_frequency.py` checks a specific fire-rate, update its expected range (it should be ~2x the old rate at mid-campaign).

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/vignette/threat.py backend/tests/test_threat_per_faction.py
# plus any frequency-test updates
git commit -m "feat: per-faction threat rolls for more combat cadence

PLAAF keeps the baseline curve (0.20 -> 0.55, bumped from 0.15 start).
PAF is 0.70x of PLAAF. PLAN ramps from 0.05 -> 0.45 (naval buildup).
any_faction_fires OR's three independent rolls -> mid-campaign goes
from ~34% to ~58% fire rate. should_fire_vignette kept as alias.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Non-Combat Scenario Templates (content)

Add 3 non-combat vignette archetypes. These fire via the same pipeline but resolve differently (XP/reputation, not airframe losses).

**Files:**
- Modify: `backend/content/scenario_templates.yaml` — append 3 templates.
- Modify: `backend/app/content/loader.py` — if schema needs a `category` field, add it; otherwise rely on scenario_id prefix `noncombat_`.
- Modify: `backend/tests/test_content_validation.py` — if it exists, update count expectations.

- [ ] **Step 1: Append the 3 templates to `scenario_templates.yaml`**

Read existing templates first to match style exactly (`head -30 backend/content/scenario_templates.yaml`). At the END of the file (after the last existing template, before EOF), append:

```yaml
  - id: noncombat_airspace_violation
    name: "Airspace Violation — Civilian Overflight"
    ao: {region: western_border, name: "Wagah / Attari corridor", lat: 31.6, lon: 74.57}
    response_clock_minutes: 40
    q_index_min: 0
    q_index_max: 39
    weight: 1.0
    requires:
      adversary_inventory: {}
    adversary_roster:
      - role: CAP
        faction: PAF
        platform_pool: [f16_blk52, jf17_blk3]
        count_range: [1, 2]
    allowed_ind_roles: [CAP, awacs]
    roe_options: [visual_id_required, weapons_tight]
    objective:
      kind: escort_intercept
      success_threshold: {escort_clean: true}

  - id: noncombat_sar
    name: "Search and Rescue — Aircrew Down"
    ao: {region: ior_central, name: "Arabian Sea — MH370-style SAR", lat: 12.0, lon: 70.0}
    response_clock_minutes: 90
    q_index_min: 8
    q_index_max: 39
    weight: 0.7
    requires:
      adversary_inventory: {}
    adversary_roster: []
    allowed_ind_roles: [CAP, awacs, tanker]
    roe_options: [weapons_tight]
    objective:
      kind: sar_recovery
      success_threshold: {awacs_committed: true}

  - id: noncombat_show_of_force
    name: "Show of Force — Diplomatic Signalling"
    ao: {region: lac_eastern, name: "Arunachal border demo", lat: 27.5, lon: 93.0}
    response_clock_minutes: 60
    q_index_min: 4
    q_index_max: 39
    weight: 0.8
    requires:
      adversary_inventory: {}
    adversary_roster: []
    allowed_ind_roles: [CAP, strike, awacs, tanker]
    roe_options: [weapons_tight, visual_id_required]
    objective:
      kind: show_of_force
      success_threshold: {airframes_committed_min: 6}
```

- [ ] **Step 2: Verify content loader accepts the new objective kinds**

Read `backend/app/content/loader.py` to see if `objective.kind` is an enum. If it IS validated against a closed set, add the three new kinds (`escort_intercept`, `sar_recovery`, `show_of_force`) to that set.

Grep first:
```bash
grep -n "escort_intercept\|sar_recovery\|show_of_force\|kind:" backend/app/content/loader.py | head -10
```

If no enum exists (objective is just a dict), no change needed.

- [ ] **Step 3: Validate YAML parses**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -c "from app.content.registry import scenario_templates; ts = scenario_templates(); print(len(ts), 'templates loaded'); noncombat = [t for t in ts if t.id.startswith('noncombat_')]; print(len(noncombat), 'non-combat'); assert len(noncombat) == 3"
```

Expected: `20 templates loaded` → now `23 templates loaded`, with `3 non-combat`. (Exact count depends on current template count; adjust expectation.)

- [ ] **Step 4: If `test_content_validation.py` asserts a specific template count, update it**

```bash
grep -rn "scenario_templates\|len.*templates" backend/tests/ | head -5
```

Bump expected count by 3 in any file that asserts a specific number.

- [ ] **Step 5: Run full backend suite**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/content/scenario_templates.yaml backend/app/content/loader.py backend/tests/
git commit -m "feat: add 3 non-combat scenario templates

airspace_violation (visual-ID intercept, no kills expected),
sar (search and rescue requires AWACS),
show_of_force (posture demonstration — needs 6+ airframes).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Non-Combat Resolver (backend)

Non-combat scenarios shouldn't run through the BVR/WVR resolver. Add a branch that checks the objective kind and resolves non-combat by a simple committed-force heuristic.

**Files:**
- Create: `backend/app/engine/vignette/non_combat.py` — pure function.
- Modify: `backend/app/crud/vignette.py` (or the commit handler) — if `objective.kind` is one of the three non-combat kinds, call the new resolver instead of `resolve()`.
- Create: `backend/tests/test_non_combat_vignette.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_non_combat_vignette.py`:

```python
"""Non-combat vignettes resolve by commitment heuristic, not BVR combat."""
from app.engine.vignette.non_combat import resolve_non_combat, is_non_combat


def test_is_non_combat_detects_noncombat_kinds():
    for kind in ("escort_intercept", "sar_recovery", "show_of_force"):
        assert is_non_combat({"kind": kind, "success_threshold": {}}) is True
    for kind in ("defend_airspace", "defeat_strike", "air_superiority"):
        assert is_non_combat({"kind": kind, "success_threshold": {}}) is False


def test_escort_intercept_clean_success():
    """Committing AWACS + CAP squadrons with visual_id ROE wins an escort."""
    ps = {
        "objective": {"kind": "escort_intercept", "success_threshold": {"escort_clean": True}},
        "adversary_force": [{"faction": "PAF", "count": 2, "platform_id": "f16_blk52", "role": "CAP"}],
    }
    commit = {"squadrons": [{"squadron_id": 1, "airframes": 4}],
              "support": {"awacs": True, "tanker": False, "sead_package": False},
              "roe": "visual_id_required"}
    outcome, trace = resolve_non_combat(ps, commit)
    assert outcome["objective_met"] is True
    assert outcome["ind_kia"] == 0
    assert outcome["adv_kia"] == 0
    assert any(e["kind"] == "escort_complete" for e in trace)


def test_escort_intercept_no_commit_fails():
    ps = {
        "objective": {"kind": "escort_intercept", "success_threshold": {"escort_clean": True}},
        "adversary_force": [],
    }
    commit = {"squadrons": [], "support": {"awacs": False, "tanker": False, "sead_package": False},
              "roe": "weapons_tight"}
    outcome, _ = resolve_non_combat(ps, commit)
    assert outcome["objective_met"] is False


def test_sar_requires_awacs():
    ps = {"objective": {"kind": "sar_recovery", "success_threshold": {"awacs_committed": True}},
          "adversary_force": []}
    commit_no = {"squadrons": [{"squadron_id": 1, "airframes": 2}],
                 "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    commit_yes = {"squadrons": [{"squadron_id": 1, "airframes": 2}],
                  "support": {"awacs": True, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    o_no, _ = resolve_non_combat(ps, commit_no)
    o_yes, _ = resolve_non_combat(ps, commit_yes)
    assert o_no["objective_met"] is False
    assert o_yes["objective_met"] is True


def test_show_of_force_requires_min_airframes():
    ps = {"objective": {"kind": "show_of_force", "success_threshold": {"airframes_committed_min": 6}},
          "adversary_force": []}
    commit_small = {"squadrons": [{"squadron_id": 1, "airframes": 4}],
                    "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    commit_big = {"squadrons": [{"squadron_id": 1, "airframes": 6}, {"squadron_id": 2, "airframes": 4}],
                  "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    o_small, _ = resolve_non_combat(ps, commit_small)
    o_big, _ = resolve_non_combat(ps, commit_big)
    assert o_small["objective_met"] is False
    assert o_big["objective_met"] is True
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_non_combat_vignette.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement `non_combat.py`**

Create `backend/app/engine/vignette/non_combat.py`:

```python
"""Non-combat vignette resolution (escort, SAR, show of force).

These are handled separately from the BVR resolver because no kinetic
engagement occurs. The outcome depends on the player's commitment
relative to the objective's success_threshold.
"""

from __future__ import annotations

NON_COMBAT_KINDS: set[str] = {"escort_intercept", "sar_recovery", "show_of_force"}


def is_non_combat(objective: dict) -> bool:
    return objective.get("kind") in NON_COMBAT_KINDS


def resolve_non_combat(planning_state: dict, committed_force: dict) -> tuple[dict, list[dict]]:
    """Pure function. Returns (outcome, trace) shaped like the combat resolver.

    outcome fields:
      ind_kia, adv_kia, ind_airframes_lost, adv_airframes_lost (all 0),
      objective_met (bool), roe, support.
    trace: list of {t_min, kind, ...} mirroring the combat tracer vocabulary.
    """
    objective = planning_state.get("objective", {})
    kind = objective.get("kind")
    threshold = objective.get("success_threshold", {})
    support = committed_force.get("support", {})
    roe = committed_force.get("roe", "weapons_tight")
    ind_airframes = sum(s.get("airframes", 0) for s in committed_force.get("squadrons", []))

    trace: list[dict] = [{"t_min": 0, "kind": "noncombat_start", "scenario_kind": kind}]
    met = False

    if kind == "escort_intercept":
        # Clean escort: at least 2 airframes + any ROE EXCEPT weapons_free.
        clean = ind_airframes >= 2 and roe in ("visual_id_required", "weapons_tight")
        met = bool(threshold.get("escort_clean", True)) and clean
        trace.append({"t_min": 5, "kind": "escort_complete", "intercept_airframes": ind_airframes, "roe": roe})

    elif kind == "sar_recovery":
        awacs_req = bool(threshold.get("awacs_committed", False))
        met = ind_airframes >= 1 and (not awacs_req or bool(support.get("awacs", False)))
        trace.append({"t_min": 10, "kind": "sar_swept", "awacs": bool(support.get("awacs")), "airframes": ind_airframes})

    elif kind == "show_of_force":
        need = int(threshold.get("airframes_committed_min", 1))
        met = ind_airframes >= need
        trace.append({"t_min": 5, "kind": "show_of_force_demo", "airframes": ind_airframes, "required": need})

    outcome = {
        "ind_kia": 0,
        "adv_kia": 0,
        "ind_airframes_lost": 0,
        "adv_airframes_lost": 0,
        "objective_met": met,
        "roe": roe,
        "support": {
            "awacs": bool(support.get("awacs", False)),
            "tanker": bool(support.get("tanker", False)),
            "sead_package": bool(support.get("sead_package", False)),
        },
    }
    trace.append({"t_min": 12, "kind": "outcome", "outcome": outcome})
    return outcome, trace
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest tests/test_non_combat_vignette.py -v
```

Expected: 5/5 pass.

- [ ] **Step 5: Wire into the commit handler**

Read `backend/app/crud/vignette.py` (the commit handler — `commit_vignette`). Locate where `resolve()` is called. Add a branch BEFORE the call:

```python
from app.engine.vignette.non_combat import is_non_combat, resolve_non_combat

# ... inside commit_vignette, after loading planning_state and constructing committed_dict ...
if is_non_combat(planning_state.get("objective", {})):
    outcome, trace = resolve_non_combat(planning_state, committed_dict)
else:
    outcome, trace = resolve(planning_state, committed_dict, platforms_reg, seed, year, quarter)
```

The rest of the handler (writing outcome + trace + readiness cost) should already work uniformly since `outcome` has the same shape.

- [ ] **Step 6: Run full suite**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/engine/vignette/non_combat.py backend/tests/test_non_combat_vignette.py backend/app/crud/vignette.py
git commit -m "feat: non-combat vignette resolver (escort, SAR, show-of-force)

Non-kinetic scenarios resolve by commitment heuristic (airframes,
support assets, ROE) rather than BVR engagement math. Outcome has
zero kills/losses and writes an escort/sar/demo event in the trace.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Frontend Toast Primitive

**Files:**
- Create: `frontend/src/lib/types.ts` additions for `Toast` interface.
- Create: `frontend/src/components/primitives/Toast.tsx`
- Create: `frontend/src/components/primitives/ToastStack.tsx`
- Create: `frontend/src/components/primitives/__tests__/ToastStack.test.tsx`

- [ ] **Step 1: Add type to `frontend/src/lib/types.ts`**

Append (near other small utility types):

```typescript
export type ToastVariant = "success" | "info" | "warning" | "error";

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  /** ms until auto-dismiss. 0 = never. Default 3000. */
  duration?: number;
}
```

- [ ] **Step 2: Write failing test**

Create `frontend/src/components/primitives/__tests__/ToastStack.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastStack } from "../ToastStack";
import { useCampaignStore } from "../../../store/campaignStore";

vi.mock("../../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

describe("ToastStack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders no toasts when store is empty", () => {
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: { toasts: unknown[] }) => unknown) => sel({ toasts: [] })
    );
    const { container } = render(<ToastStack />);
    // Stack container still renders but empty.
    expect(container.querySelectorAll("[role='status']").length).toBe(0);
  });

  it("renders each toast with its message", () => {
    const dismiss = vi.fn();
    const store = {
      toasts: [
        { id: "a", variant: "success", message: "Squadron rebased to Ambala" },
        { id: "b", variant: "warning", message: "Budget exceeded" },
      ],
      dismissToast: dismiss,
    };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store)
    );
    render(<ToastStack />);
    expect(screen.getByText("Squadron rebased to Ambala")).toBeTruthy();
    expect(screen.getByText("Budget exceeded")).toBeTruthy();
  });

  it("calls dismissToast when toast is clicked", () => {
    const dismiss = vi.fn();
    const store = {
      toasts: [{ id: "x", variant: "info", message: "Hello" }],
      dismissToast: dismiss,
    };
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof store) => unknown) => sel(store)
    );
    render(<ToastStack />);
    screen.getByText("Hello").click();
    expect(dismiss).toHaveBeenCalledWith("x");
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run src/components/primitives/__tests__/ToastStack.test.tsx
```

- [ ] **Step 4: Implement `Toast.tsx`**

Create `frontend/src/components/primitives/Toast.tsx`:

```tsx
import { useEffect } from "react";
import type { Toast as ToastType } from "../../lib/types";

const VARIANT_STYLES: Record<string, string> = {
  success: "bg-emerald-600/90 text-slate-900 border-emerald-400",
  info:    "bg-slate-700/95 text-slate-100 border-slate-500",
  warning: "bg-amber-600/90 text-slate-900 border-amber-400",
  error:   "bg-red-700/95 text-slate-100 border-red-400",
};

export interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const duration = toast.duration ?? 3000;
  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      className={[
        "px-4 py-2 rounded-lg shadow-lg border text-sm cursor-pointer",
        "max-w-[calc(100vw-2rem)] sm:max-w-sm",
        VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info,
      ].join(" ")}
    >
      {toast.message}
    </div>
  );
}
```

- [ ] **Step 5: Implement `ToastStack.tsx`**

Create `frontend/src/components/primitives/ToastStack.tsx`:

```tsx
import { useCampaignStore } from "../../store/campaignStore";
import { Toast } from "./Toast";

export function ToastStack() {
  const toasts = useCampaignStore((s) => s.toasts);
  const dismiss = useCampaignStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      <div className="flex flex-col gap-2 items-center pointer-events-auto">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run src/components/primitives/__tests__/ToastStack.test.tsx
```

Expected: 3/3 pass. Typecheck separately — store types aren't wired yet so tsc may fail until Task 6.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/primitives/Toast.tsx frontend/src/components/primitives/ToastStack.tsx frontend/src/components/primitives/__tests__/ToastStack.test.tsx frontend/src/lib/types.ts
git commit -m "feat: toast primitive + ToastStack with 4 variants

Mobile-first, viewport-clamped width, auto-dismiss after 3s,
click to dismiss. Renders via useCampaignStore subscription.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Wire Toast State into the Store + Emit on Every Mutation

**Files:**
- Modify: `frontend/src/store/campaignStore.ts`

- [ ] **Step 1: Add state + actions**

In `campaignStore.ts`:

Add to imports:
```typescript
import type { Toast, ToastVariant } from "../lib/types";
```

Add to `CampaignState` interface (put near `toasts`):
```typescript
toasts: Toast[];
rdLoading: Record<string, boolean>;
pushToast: (variant: ToastVariant, message: string, duration?: number) => void;
dismissToast: (id: string) => void;
```

In the `create` initial state, add:
```typescript
toasts: [],
rdLoading: {},
```

Add the actions inside `create`:
```typescript
pushToast: (variant, message, duration) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  set((s) => ({ toasts: [...s.toasts, { id, variant, message, duration }] }));
},
dismissToast: (id) => {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
},
```

- [ ] **Step 2: Emit toasts on key mutations**

Find these actions in the same file and wrap them with success/error toasts. For each, wrap the existing body in try/catch and `pushToast` at the end.

Examples — apply the same pattern to `setBudget`, `startRdProgram`, `updateRdProgram`, `createAcquisition`, `rebaseSquadron`:

```typescript
rebaseSquadron: async (squadronId, targetBaseId) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  try {
    const updated = await api.rebaseSquadron(cid, squadronId, targetBaseId);
    // existing update logic
    await get().loadBases(cid);
    const baseName = get().bases.find((b) => b.id === updated.base_id)?.name ?? "new base";
    get().pushToast("success", `Squadron rebased to ${baseName}`);
  } catch (e) {
    get().pushToast("error", "Rebase failed");
    throw e;
  }
},
```

For R&D:
```typescript
updateRdProgram: async (programId, payload) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  set((s) => ({ rdLoading: { ...s.rdLoading, [programId]: true } }));
  try {
    await api.updateRdProgram(cid, programId, payload);
    await get().loadRdActive(cid);
    if (payload.funding_level) {
      get().pushToast("success", `Funding changed to ${payload.funding_level}`);
    } else if (payload.status === "cancelled") {
      get().pushToast("info", "Program cancelled");
    }
  } catch (e) {
    get().pushToast("error", "R&D update failed");
    throw e;
  } finally {
    set((s) => {
      const next = { ...s.rdLoading };
      delete next[programId];
      return { rdLoading: next };
    });
  }
},

startRdProgram: async (programId, fundingLevel) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  set((s) => ({ rdLoading: { ...s.rdLoading, [programId]: true } }));
  try {
    await api.startRdProgram(cid, programId, fundingLevel);
    await get().loadRdActive(cid);
    get().pushToast("success", `R&D started: ${programId}`);
  } catch (e) {
    get().pushToast("error", "Failed to start R&D program");
    throw e;
  } finally {
    set((s) => {
      const next = { ...s.rdLoading };
      delete next[programId];
      return { rdLoading: next };
    });
  }
},
```

For budget:
```typescript
setBudget: async (allocation) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  try {
    await api.setBudget(cid, allocation);
    await get().loadCampaign(cid);
    get().pushToast("success", "Budget allocation updated");
  } catch (e) {
    get().pushToast("error", "Budget update failed");
    throw e;
  }
},
```

For acquisition:
```typescript
createAcquisition: async (payload) => {
  const cid = get().campaign?.id;
  if (!cid) return;
  try {
    await api.createAcquisition(cid, payload);
    await get().loadAcquisitions(cid);
    get().pushToast("success", `Order signed: ${payload.platform_id}`);
  } catch (e) {
    get().pushToast("error", "Order failed");
    throw e;
  }
},
```

For airbase upgrade (if the action exists in the store — grep first):
```bash
grep -n "upgradeBase" frontend/src/store/campaignStore.ts
```

If it exists, wrap it similarly with success/error toasts.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run the full frontend test suite**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

Some existing tests may break if they intercepted store methods without mocking `pushToast`. For any test that fails with `pushToast is not a function` or similar, add it to the mock store shape with `pushToast: vi.fn()` and `dismissToast: vi.fn()` and `rdLoading: {}` and `toasts: []`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/campaignStore.ts frontend/src/**/*.test.*
git commit -m "feat: emit success/error toasts from every mutating store action

rebase, budget, rd start/update, acquisitions all push toasts on
success or error. Per-program rdLoading state enables optimistic UI.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Mount ToastStack at App Root, Replace YearEndRecapToast

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/CampaignMapView.tsx` — remove YearEndRecapToast component.
- Modify: `frontend/src/store/campaignStore.ts::advanceTurn` — replace setting `yearRecapToast` with a `pushToast` call.
- Delete (optional): `frontend/src/components/endgame/YearEndRecapToast.tsx` + its test. Keep the `YearEndRecapToast` name pushed into the unified system to preserve behaviour.

- [ ] **Step 1: Mount ToastStack at root**

In `frontend/src/App.tsx`, import `ToastStack` and render it inside the router container (once, at the root):

```tsx
import { ToastStack } from "./components/primitives/ToastStack";
// ...
return (
  <BrowserRouter>
    <Routes>
      {/* ... existing routes ... */}
    </Routes>
    <ToastStack />
  </BrowserRouter>
);
```

- [ ] **Step 2: Replace year-recap toast behavior**

In `campaignStore.ts::advanceTurn`, find where `yearRecapToast` is set after a Q4→Q1 transition. Replace the `set({ yearRecapToast: ... })` call with:

```typescript
get().pushToast("info", `Year ${prevYear} recap — review in White Paper`, 8000);
```

Keep the `yearRecapToast` field for now to avoid breaking any reader; set it alongside for backwards compat if other code reads it. Simplest: leave the existing set AND add the `pushToast`.

- [ ] **Step 3: Keep YearEndRecapToast component mounted (delete later)**

Do not delete `YearEndRecapToast` this task — leave it as-is so that we don't cascade-break its test. The new ToastStack appears alongside it; both will fire, which is harmless for now. Delete in a follow-up cleanup if desired.

- [ ] **Step 4: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/store/campaignStore.ts
git commit -m "feat: mount ToastStack at app root + year-recap fires via unified toast

Toasts now persist across route transitions. Year-end recap also
pushes into the unified toast stack (8s duration) alongside the
existing YearEndRecapToast component.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: R&D Dashboard — Sort + Budget Banner + Category Filter

This task restructures the R&D UI. The core is Active-is-a-tab + Catalog-is-a-tab (no more stacked sections that collapse confusingly on mobile), plus a sticky budget banner.

**Files:**
- Modify: `frontend/src/components/procurement/RDDashboard.tsx`
- Modify: `frontend/src/components/procurement/__tests__/RDDashboard.test.tsx`

- [ ] **Step 1: Draft the new component structure**

Rewrite `frontend/src/components/procurement/RDDashboard.tsx`:

```tsx
import { useMemo, useState } from "react";
import type {
  RDProgramSpec, RDProgramState, RDFundingLevel, RDUpdatePayload,
} from "../../lib/types";
import { CommitHoldButton } from "../primitives/CommitHoldButton";
import { useCampaignStore } from "../../store/campaignStore";

export interface RDDashboardProps {
  catalog: RDProgramSpec[];
  active: RDProgramState[];
  onStart: (programId: string, fundingLevel: RDFundingLevel) => void;
  onUpdate: (programId: string, payload: RDUpdatePayload) => void;
  disabled?: boolean;
}

const FUNDING_LEVELS: RDFundingLevel[] = ["slow", "standard", "accelerated"];
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Fighters: ["amca", "tejas", "tedbf", "rafale", "mig"],
  Weapons:  ["astra", "brahmos", "rudram", "meteor", "missile"],
  Sensors:  ["netra", "aewc", "uttam", "aesa", "radar"],
  Drones:   ["ghatak", "archer", "tapas", "drone", "ucav"],
  Infrastructure: ["shelter", "runway", "base", "fuel"],
};

function categorize(spec: RDProgramSpec): string {
  const id = spec.id.toLowerCase();
  const name = spec.name.toLowerCase();
  for (const [cat, keys] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keys.some((k) => id.includes(k) || name.includes(k))) return cat;
  }
  return "Other";
}

function specOf(catalog: RDProgramSpec[], programId: string): RDProgramSpec | undefined {
  return catalog.find((s) => s.id === programId);
}

function ActiveRow({
  state, spec, onUpdate, loading,
}: {
  state: RDProgramState;
  spec?: RDProgramSpec;
  onUpdate: RDDashboardProps["onUpdate"];
  loading: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  const statusBadge =
    state.status === "completed"
      ? { text: "Completed", classes: "bg-emerald-900/50 text-emerald-200" }
      : state.status === "cancelled"
      ? { text: "Cancelled", classes: "bg-slate-800 text-slate-300" }
      : { text: "Active", classes: "bg-amber-900/50 text-amber-200" };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 relative">
      {loading && (
        <div className="absolute inset-0 bg-slate-950/40 rounded-lg flex items-center justify-center z-10">
          <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{spec?.name ?? state.program_id}</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${statusBadge.classes}`}>
          {statusBadge.text}
        </span>
      </div>
      <div className="relative h-2 rounded bg-slate-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-amber-500 transition-all"
          style={{ width: `${Math.min(100, state.progress_pct)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>Progress {state.progress_pct}%</span>
        <span>Invested ₹{state.cost_invested_cr.toLocaleString("en-US")} cr</span>
      </div>

      {state.status === "active" && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs opacity-60">Funding</span>
            <div className="grid grid-cols-3 gap-1">
              {FUNDING_LEVELS.map((lvl) => {
                const proj = state.projections?.[lvl];
                const selected = lvl === state.funding_level;
                return (
                  <button
                    key={lvl}
                    type="button"
                    aria-label={`Set funding ${lvl}`}
                    disabled={loading}
                    onClick={() => onUpdate(state.program_id, { funding_level: lvl })}
                    className={[
                      "text-xs rounded p-1.5 border flex flex-col items-center gap-0.5 transition-colors",
                      selected
                        ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                        : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-200",
                      loading ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <span className="capitalize">{lvl}</span>
                    {proj ? (
                      <>
                        <span className="text-[10px] opacity-80">{proj.completion_year} Q{proj.completion_quarter}</span>
                        <span className="text-[10px] opacity-80">₹{proj.quarterly_cost_cr.toLocaleString("en-US")}/q</span>
                      </>
                    ) : (
                      <span className="text-[10px] opacity-40">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {confirming ? (
            <div className="border border-rose-800 rounded p-2 bg-rose-900/20 text-xs space-y-2">
              <div className="text-rose-200">
                Cancelling will stop further spend.
                <strong className="block">
                  ₹{state.cost_invested_cr.toLocaleString("en-US")} cr already invested is
                  written off — it is not refunded.
                </strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(state.program_id, { status: "cancelled" });
                    setConfirming(false);
                  }}
                  className="text-xs px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                >
                  Confirm cancel
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                >
                  Keep running
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-rose-300 hover:text-rose-200 underline"
            >
              Cancel program
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CatalogRow({
  spec, onStart, disabled,
}: { spec: RDProgramSpec; onStart: RDDashboardProps["onStart"]; disabled?: boolean }) {
  const [funding, setFunding] = useState<RDFundingLevel>("standard");
  const campaign = useCampaignStore((s) => s.campaign);

  function clientProjection(lvl: RDFundingLevel, progress: number) {
    const FUNDING_FACTORS: Record<RDFundingLevel, [number, number]> = {
      slow: [0.5, 0.5],
      standard: [1.0, 1.0],
      accelerated: [1.5, 1.4],
    };
    const [costFactor, progFactor] = FUNDING_FACTORS[lvl];
    const basePerQtr = 100 / spec.base_duration_quarters;
    const effPerQtr = basePerQtr * progFactor;
    const remaining = Math.max(0, 100 - progress);
    const quartersRemaining = effPerQtr <= 0 ? 0 : Math.ceil(remaining / effPerQtr);
    const currentYear = campaign?.current_year ?? 2026;
    const currentQuarter = campaign?.current_quarter ?? 2;
    const totalQ = currentYear * 4 + (currentQuarter - 1) + quartersRemaining;
    const completion_year = Math.floor(totalQ / 4);
    const completion_quarter = (totalQ % 4) + 1;
    const quarterly_cost_cr = Math.floor((spec.base_cost_cr / spec.base_duration_quarters) * costFactor);
    return { completion_year, completion_quarter, quarterly_cost_cr };
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="text-sm font-semibold">{spec.name}</div>
      <div className="text-xs opacity-70">{spec.description}</div>
      <div className="text-xs opacity-60">
        Duration ~{spec.base_duration_quarters}q • Base cost ₹
        {spec.base_cost_cr.toLocaleString("en-US")} cr
        {spec.dependencies.length > 0 && (
          <> • Depends on: {spec.dependencies.join(", ")}</>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Speed</span>
        <div className="grid grid-cols-3 gap-1">
          {FUNDING_LEVELS.map((lvl) => {
            const proj = clientProjection(lvl, 0);
            const selected = lvl === funding;
            return (
              <button
                key={lvl}
                type="button"
                aria-label={`Set funding ${lvl}`}
                onClick={() => setFunding(lvl)}
                className={[
                  "text-xs rounded p-1.5 border flex flex-col items-center gap-0.5",
                  selected
                    ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                    : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-200",
                ].join(" ")}
              >
                <span className="capitalize">{lvl}</span>
                <span className="text-[10px] opacity-80">{proj.completion_year} Q{proj.completion_quarter}</span>
                <span className="text-[10px] opacity-80">₹{proj.quarterly_cost_cr.toLocaleString("en-US")}/q</span>
              </button>
            );
          })}
        </div>
      </div>
      <CommitHoldButton
        label="Hold to start"
        holdMs={1800}
        disabled={disabled}
        onCommit={() => onStart(spec.id, funding)}
        className="w-full"
      />
    </div>
  );
}

export function RDDashboard({
  catalog, active, onStart, onUpdate, disabled,
}: RDDashboardProps) {
  const rdLoading = useCampaignStore((s) => s.rdLoading);
  const campaign = useCampaignStore((s) => s.campaign);

  const [tab, setTab] = useState<"active" | "catalog">(active.length > 0 ? "active" : "catalog");
  const [category, setCategory] = useState<string>("All");

  const sortedActive = useMemo(
    () => [...active].sort((a, b) => b.progress_pct - a.progress_pct),
    [active],
  );

  const activeIds = useMemo(
    () => new Set(
      active.filter((a) => a.status === "active" || a.status === "completed")
            .map((a) => a.program_id),
    ),
    [active],
  );

  const availableCatalog = useMemo(
    () => catalog.filter((s) => !activeIds.has(s.id)),
    [catalog, activeIds],
  );

  const filteredCatalog = useMemo(() => {
    if (category === "All") return availableCatalog;
    return availableCatalog.filter((s) => categorize(s) === category);
  }, [availableCatalog, category]);

  // Sum quarterly cost of all active programs at their current funding level
  const totalQuarterlyCost = useMemo(() => {
    return active.reduce((sum, a) => {
      const proj = a.projections?.[a.funding_level];
      return sum + (proj?.quarterly_cost_cr ?? 0);
    }, 0);
  }, [active]);

  const rdBucket = campaign?.current_allocation_json?.rd ?? 0;
  const overBudget = totalQuarterlyCost > rdBucket;

  return (
    <div className="space-y-4">
      {/* Sticky budget banner */}
      <div className={[
        "sticky top-0 z-20 -mx-4 sm:mx-0 px-4 py-2 border-b",
        overBudget ? "bg-rose-950/80 border-rose-800" : "bg-slate-900 border-slate-700",
      ].join(" ")}>
        <div className="flex items-baseline justify-between text-xs">
          <span className="opacity-70">Quarterly R&D spend</span>
          <span className={overBudget ? "text-rose-300 font-semibold" : "text-slate-200 font-semibold"}>
            ₹{totalQuarterlyCost.toLocaleString("en-US")} / ₹{rdBucket.toLocaleString("en-US")} cr
          </span>
        </div>
        {overBudget && (
          <p className="text-[10px] text-rose-300 mt-1">
            Projected spend exceeds R&D budget bucket — programs will get underfunded pro-rata.
          </p>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={[
            "flex-1 px-3 py-1.5 text-xs font-semibold rounded",
            tab === "active" ? "bg-amber-600 text-slate-900" : "text-slate-300",
          ].join(" ")}
        >
          Active ({active.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={[
            "flex-1 px-3 py-1.5 text-xs font-semibold rounded",
            tab === "catalog" ? "bg-amber-600 text-slate-900" : "text-slate-300",
          ].join(" ")}
        >
          Catalog ({availableCatalog.length})
        </button>
      </div>

      {tab === "active" ? (
        <section className="space-y-2">
          {sortedActive.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No R&D programs underway. Open Catalog to start one.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedActive.map((a) => (
                <ActiveRow
                  key={a.id}
                  state={a}
                  spec={specOf(catalog, a.program_id)}
                  onUpdate={onUpdate}
                  loading={!!rdLoading[a.program_id]}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {["All", "Fighters", "Weapons", "Sensors", "Drones", "Infrastructure", "Other"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  "text-[11px] rounded-full px-2.5 py-1 border",
                  category === c
                    ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                    : "bg-slate-800 border-slate-700 text-slate-300",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>

          {filteredCatalog.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No programs in this category.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredCatalog.map((spec) => (
                <CatalogRow
                  key={spec.id}
                  spec={spec}
                  onStart={onStart}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the existing test to match new structure**

Read `frontend/src/components/procurement/__tests__/RDDashboard.test.tsx`. The existing test renders `RDDashboard` and reads text. The new UI has:
- A tab switcher labelled `Active (N)` / `Catalog (N)`
- A budget banner showing `Quarterly R&D spend`
- Loading spinner overlay on an active program when `rdLoading[id]` is true

The test must now mock `useCampaignStore` for `rdLoading` and `campaign.current_allocation_json.rd`.

Update the test to mock the store properly:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RDDashboard } from "../RDDashboard";
import { useCampaignStore } from "../../../store/campaignStore";
import type { RDProgramSpec, RDProgramState } from "../../../lib/types";

vi.mock("../../../store/campaignStore", () => ({
  useCampaignStore: vi.fn(),
}));

const catalog: RDProgramSpec[] = [
  { id: "amca_mk1", name: "AMCA Mk1", description: "Indigenous 5th-gen stealth", base_duration_quarters: 36, base_cost_cr: 150000, dependencies: [] },
  { id: "astra_mk2", name: "Astra Mk2", description: "BVR missile", base_duration_quarters: 8, base_cost_cr: 4000, dependencies: [] },
];

const active: RDProgramState[] = [
  {
    id: 1, program_id: "amca_mk1", status: "active", progress_pct: 25,
    cost_invested_cr: 30000, funding_level: "standard",
    projections: {
      slow: { completion_year: 2036, completion_quarter: 2, quarters_remaining: 54, quarterly_cost_cr: 2083 },
      standard: { completion_year: 2033, completion_quarter: 2, quarters_remaining: 27, quarterly_cost_cr: 4166 },
      accelerated: { completion_year: 2031, completion_quarter: 4, quarters_remaining: 20, quarterly_cost_cr: 6250 },
    },
  },
];

const defaultStore = {
  rdLoading: {},
  campaign: {
    id: 1, name: "Test", current_year: 2026, current_quarter: 4,
    current_allocation_json: { rd: 10000, om: 5000, spares: 5000, acquisition: 10000, infra: 2500 },
  } as any,
};

function setup(overrides = {}) {
  const store = { ...defaultStore, ...overrides };
  (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: typeof store) => unknown) => sel(store)
  );
  return render(
    <RDDashboard
      catalog={catalog}
      active={active}
      onStart={vi.fn()}
      onUpdate={vi.fn()}
    />
  );
}

describe("RDDashboard", () => {
  it("renders budget banner with quarterly spend vs bucket", () => {
    setup();
    expect(screen.getByText(/Quarterly R&D spend/)).toBeTruthy();
    // ₹4,166 from standard funding vs ₹10,000 budget
    expect(screen.getByText(/4,166/)).toBeTruthy();
    expect(screen.getByText(/10,000/)).toBeTruthy();
  });

  it("switches between Active and Catalog tabs", () => {
    setup();
    expect(screen.getByText(/AMCA Mk1/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Catalog \(/));
    expect(screen.getByText(/Astra Mk2/)).toBeTruthy();
  });

  it("shows loading spinner when program is in rdLoading", () => {
    const { container } = setup({ rdLoading: { amca_mk1: true } });
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("filters catalog by category", () => {
    setup();
    fireEvent.click(screen.getByText(/Catalog \(/));
    fireEvent.click(screen.getByRole("button", { name: "Weapons" }));
    expect(screen.queryByText("AMCA Mk1")).toBeNull();
    expect(screen.getByText("Astra Mk2")).toBeTruthy();
  });

  it("empty Active tab shows helpful message", () => {
    (useCampaignStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (sel: (s: typeof defaultStore) => unknown) => sel(defaultStore)
    );
    render(
      <RDDashboard
        catalog={catalog}
        active={[]}
        onStart={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText(/No R&D programs underway/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run src/components/procurement/__tests__/RDDashboard.test.tsx
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
```

Expected: 5/5 pass, typecheck clean.

- [ ] **Step 4: Run full frontend suite**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/procurement/RDDashboard.tsx frontend/src/components/procurement/__tests__/RDDashboard.test.tsx
git commit -m "feat: RD dashboard redesign — tabs, budget banner, category filter, loading UI

Active/Catalog tab switcher replaces stacked sections. Sticky budget
banner shows committed quarterly spend vs bucket (rose when over).
Category chips (Fighters/Weapons/Sensors/Drones/Infra) filter catalog.
Per-program loading spinner overlay fixes the 'Accelerate did nothing'
perception bug.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Rebase Squadron — Animated Feedback

Complement the toast on rebase with a visible marker transition so players see WHERE the squadron went.

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx` — after rebase, briefly flash the destination base marker.
- Modify: `frontend/src/components/map/RebaseOverlay.tsx` if it exists (or the component that handles rebase completion).

- [ ] **Step 1: Identify the rebase flow**

```bash
grep -rn "onRebase\|rebaseSquadron\|handleRebase" frontend/src/pages/CampaignMapView.tsx frontend/src/components/map/
```

- [ ] **Step 2: Add a transient `flashBaseId` state + visual highlight**

In `frontend/src/pages/CampaignMapView.tsx`, add state:
```tsx
const [flashBaseId, setFlashBaseId] = useState<number | null>(null);
```

In `handleRebase`, after `rebaseSquadron(sqnId, targetBaseId)` succeeds, set `flashBaseId`:
```tsx
const handleRebase = async (sqnId: number, targetBaseId: number) => {
  await rebaseSquadron(sqnId, targetBaseId);
  setRebaseTarget(null);
  setSelectedBase(null);
  setFlashBaseId(targetBaseId);
  setTimeout(() => setFlashBaseId(null), 2000);
};
```

Pass `flashBaseId` down to `SubcontinentMap` if markers support it. If they don't, add a simple SVG overlay at the destination base's projected position (use the existing `projectionVersion` + marker projection helper `markerProjection.ts`).

If your `SubcontinentMap` doesn't expose a flash prop, the simplest path is a small `<div>` pulse positioned absolutely inside the map wrapper using the `bases` lookup + `kmToPixels`/projector. Skip if too complex and rely on the toast alone — this is the stretch.

- [ ] **Step 3: Run tests + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx frontend/src/components/map/
git commit -m "feat: rebase — flash destination base for 2s after successful rebase

Combined with the toast from Task 6, players now see visual confirmation
both in message form and at the destination marker.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Mobile Review Sweep

**Files:**
- Spot-check the following at 375px viewport by running dev server:
  - TurnReport page
  - OpsRoom
  - AAR
  - RD Dashboard (new tabs, budget banner, category chips)
  - ToastStack (bottom, above fold, doesn't cover End Turn button)

- [ ] **Step 1: Start dev server + open a mobile viewport**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run dev
```

Open http://localhost:5173 in Chrome DevTools → Toggle Device Toolbar → 375×812 (iPhone SE).

- [ ] **Step 2: Walk through flow, note any overflow**

Expected checkpoints:
- RD Dashboard tabs fit side-by-side without overflow
- Budget banner text wraps gracefully
- Category chips wrap onto 2 rows on 375px
- ToastStack toasts clamp to viewport width (already have `max-w-[calc(100vw-2rem)]`)

Fix any layout issues inline. No formal unit tests — visual pass.

- [ ] **Step 3: Commit any inline fixes**

```bash
git add frontend/src/
git commit -m "fix: mobile polish at 375px after plan 14 changes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

(If no fixes needed, skip commit.)

---

### Task 11: Update ROADMAP.md + CLAUDE.md

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update ROADMAP status line + table**

In `docs/superpowers/plans/ROADMAP.md`:

Change:
```
**Last updated:** 2026-04-19 (Plan 13 done)
```
to:
```
**Last updated:** 2026-04-19 (Plan 14 in progress)
```

In the Current Status Summary table, after the Plan 13 row, append:
```
| 14 | Feedback + R&D Redesign + Combat Cadence | 🟡 in progress | [2026-04-19-feedback-rd-redesign-plan.md](2026-04-19-feedback-rd-redesign-plan.md) |
```

Append a Plan 14 section somewhere logical (before the V1.5+ backlog):

```markdown
## Plan 14 — Feedback + R&D Redesign + Combat Cadence

**Goal:** Ship game-wide toast feedback, seed AWACS + tanker squadrons to make Plan 13's AWACS mechanic exercisable, redesign R&D dashboard (optimistic UI, Active/Catalog tabs, budget banner, category filter), and boost combat cadence via per-faction threat rolls + non-combat scenario templates.

**Deliverable:** Every state mutation now surfaces a toast. AWACS + IL-78 tanker squadrons seeded at Bareilly/Nal/Ambala. R&D page is tabbed, loading states are per-program, budget banner shows cause-and-effect. Combat cadence ~2x at mid-campaign.

**Depends on:** Plans 1–13.

**Explicitly deferred to Plan 15:** Hangar (fleet-wide force management), Armory (completed tech unlocks + missile/weapon assignment), `on_complete` schema for R&D programs.

**Detailed plan file:** [2026-04-19-feedback-rd-redesign-plan.md](2026-04-19-feedback-rd-redesign-plan.md)
```

- [ ] **Step 2: Update CLAUDE.md current-status block**

In `CLAUDE.md`, add below the Plan 13 line:

```
- **Plan 14 (Feedback + R&D Redesign + Combat Cadence)** — 🟡 in progress. Backend: Netra AWACS + IL-78 tanker seeded at campaign start, per-faction threat rolls (PLAAF baseline, PAF 0.7x, PLAN 0.05→0.45), 3 non-combat scenario templates (airspace_violation, sar, show_of_force) + non_combat.py resolver. Frontend: reusable Toast primitive + ToastStack at app root, every mutating store action emits toasts, `rdLoading` per-program state, RD Dashboard redesign (tabbed Active/Catalog, sticky budget banner, category filter chips, loading spinner overlay). Plan file: `docs/superpowers/plans/2026-04-19-feedback-rd-redesign-plan.md`.
```

Also append the plan doc to the "Authoritative docs" list:
```
- `docs/superpowers/plans/2026-04-19-feedback-rd-redesign-plan.md` — Plan 14 (Feedback + R&D Redesign + Combat Cadence). **In progress.**
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: add Plan 14 (Feedback + R&D Redesign + Combat Cadence) to ROADMAP + CLAUDE.md

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Push + Deploy

- [ ] **Step 1: Full backend suite**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
```
Expected: ~455 pass (444 + 11 new).

- [ ] **Step 2: Full frontend suite**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx vitest run
```
Expected: ~170 pass (152 + ~18 new).

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Deploy both**

```bash
./deploy.sh both
```

- [ ] **Step 6: Verify**

- Visit https://pmc-tycoon.skdev.one — check that:
  - Starting a new campaign shows Netra + IL-78 in base sheets (tap Bareilly / Nal / Ambala)
  - Ops Room shows AWACS covering entry instead of "unavailable"
  - RD page has tabs + budget banner
  - Rebase shows toast
- Hit https://pmc-tycoon-api.skdev.one — responsive.

- [ ] **Step 7: Flip Plan 14 to done**

Update ROADMAP.md status → `🟢 done`, bump "Last updated", and in CLAUDE.md change `🟡 in progress` → `✅ done`:

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 14 done — feedback system, AWACS seed, R&D redesign, combat cadence

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage against the discussion:**
- Reusable toast system wired to every mutation → Tasks 5, 6, 7 ✅
- AWACS seed at real bases + IL-78 tanker → Task 1 ✅
- Rebase feedback (toast + flash) → Task 6 (toast) + Task 9 (flash) ✅
- R&D optimistic UI + loading state → Task 6 (`rdLoading`) + Task 8 (overlay) ✅
- R&D Active/Catalog clearer separation → Task 8 (tabs) ✅
- R&D mobile readability → Task 8 (tabs, chips) + Task 10 (manual sweep) ✅
- Per-faction threat rolls for higher combat cadence → Task 2 ✅
- Non-combat scenario variety → Tasks 3 + 4 ✅
- Allied/coalition request scenarios — **deferred** (falls under non-combat category but adding real coalition mechanics requires reputation + relations, which is Plan 15 scope). Task 3's `show_of_force` + `sar_recovery` are the minimum variety for now; full coalition requests are backlogged.

**Placeholders:** None. Every step has concrete code.

**Type consistency:** `Toast`/`ToastVariant` used consistently across types.ts, Toast.tsx, ToastStack.tsx, and store. `rdLoading: Record<string, boolean>` keyed by `program_id` is consistent. `RDProjections` type reused from Plan 13 (already in types.ts). `threat_curve_prob_for_faction` / `should_fire_vignette_for_faction` / `any_faction_fires` names match between tests and implementation. Non-combat resolver returns `(outcome, trace)` tuple matching existing `resolve()` signature so the commit handler branch is drop-in.

**Gaps filled:** Hangar + Armory + missile unlocks explicitly deferred to Plan 15 by user request. No scope creep.
