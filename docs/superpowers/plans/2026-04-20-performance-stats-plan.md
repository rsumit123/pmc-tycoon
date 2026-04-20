# Performance Stats Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give players campaign-to-date performance insight — per-platform K:D + win contribution, per-weapon hit rate + cost-per-kill, and AWACS/tanker/SEAD support-asset impact deltas — surfaced at a dedicated `/campaign/:id/performance` page.

**Architecture:** Pure aggregation over existing `Vignette.event_trace` + `Vignette.outcome.munitions_expended` + `Vignette.committed_force` rows (all already persisted per prior plans). One new FastAPI endpoint returns a precomputed stats bundle; one new React page consumes it with three tabs (Platforms / Missiles / Support) plus a campaign-totals ribbon and per-faction summary. No new DB tables, no new event types, no new LLM prompts. All-time stats only — no time-filter UI (option A).

**Tech Stack:** FastAPI + Pydantic 2 + SQLAlchemy 2 (read-only query); React 19 + TypeScript + Tailwind v4 + Zustand; Vitest for frontend unit tests, pytest for backend.

---

## File Structure

**Backend — new:**
- `backend/app/engine/performance.py` — pure aggregation functions (stateless, testable in isolation from DB). Takes a list of resolved-vignette dicts, returns `PerformanceBundle`.
- `backend/app/schemas/performance.py` — Pydantic response models (`PerformanceResponse`, `PlatformStat`, `WeaponStat`, `SupportStat`, `FactionStat`, `CampaignTotals`).
- `backend/app/api/performance.py` — thin FastAPI router at `/api/campaigns/{id}/performance`.
- `backend/tests/test_performance_engine.py` — unit tests for pure aggregation.
- `backend/tests/test_performance_api.py` — endpoint tests (fixture: seed 2-3 resolved vignettes, assert shape).

**Backend — modified:**
- `backend/main.py` — register the new router.

**Frontend — new:**
- `frontend/src/pages/PerformancePage.tsx` — tabbed page scaffold + data load.
- `frontend/src/components/performance/TotalsRibbon.tsx` — campaign-totals card at the top.
- `frontend/src/components/performance/FactionSummary.tsx` — 3-column per-faction ribbon.
- `frontend/src/components/performance/PlatformTable.tsx` — sortable table for Platforms tab.
- `frontend/src/components/performance/WeaponTable.tsx` — sortable table for Missiles tab.
- `frontend/src/components/performance/SupportPanel.tsx` — AWACS/tanker/SEAD deltas for Support tab.
- `frontend/src/components/performance/__tests__/PlatformTable.test.tsx` — render + empty-state.
- `frontend/src/components/performance/__tests__/WeaponTable.test.tsx` — render + cost-per-kill flag.
- `frontend/src/components/performance/__tests__/SupportPanel.test.tsx` — with/without delta.
- `frontend/src/pages/__tests__/PerformancePage.test.tsx` — tab switching + loading state.

**Frontend — modified:**
- `frontend/src/lib/types.ts` — add `PerformanceResponse`, `PlatformStat`, `WeaponStat`, `SupportStat`, `FactionStat`, `CampaignTotals`.
- `frontend/src/lib/api.ts` — add `api.getPerformance(campaignId)`.
- `frontend/src/store/campaignStore.ts` — add `performance: PerformanceResponse | null` + `loadPerformance(id)`.
- `frontend/src/App.tsx` — register `/campaign/:id/performance` route.
- `frontend/src/pages/CampaignMapView.tsx` — drawer nav link "📊 Performance".

---

## Data shape (locked upfront so every task matches)

```ts
// frontend/src/lib/types.ts (Pydantic equivalents live in backend schemas)

export interface PlatformStat {
  platform_id: string;          // e.g. "rafale_f4"
  platform_name: string;        // e.g. "Dassault Rafale F4"
  sorties: number;              // vignettes where any squadron of this platform was committed
  kills: number;                // event_trace kills credited to this platform (IAF side)
  losses: number;               // event_trace victim entries for this platform (IAF side)
  kd_ratio: number | null;      // kills / losses; null if losses == 0 (display as "∞" or "N/A")
  win_contribution_pct: number; // vignettes with platform AND objective_met / sorties (0..100)
  first_shot_pct: number;       // vignettes with platform committed AND detection advantage == "ind" / sorties
  top_weapon: string | null;    // most-fired weapon when this platform attacked; null if no launches
}

export interface WeaponStat {
  weapon_id: string;
  fired: number;
  hits: number;
  hit_rate_pct: number;         // round(hits / fired * 100); 0 if fired == 0
  avg_pk: number;               // mean of pk field in bvr_launch/wvr_launch events; 0 if fired == 0
  total_cost_cr: number;
  cost_per_kill_cr: number | null;  // total_cost_cr / hits; null if hits == 0
  top_target_platform: string | null;  // enemy platform most commonly hit; null if no hits
  weapon_class: string;         // "a2a_bvr" | "a2a_wvr" | "anti_ship" | ... (from WEAPONS[id].class)
}

export interface SupportStat {
  asset: "awacs" | "tanker" | "sead";
  with_sorties: number;
  without_sorties: number;
  with_win_rate_pct: number;    // 0 if with_sorties == 0
  without_win_rate_pct: number; // 0 if without_sorties == 0
  delta_win_rate_pp: number;    // with - without (percentage points)
}

export interface FactionStat {
  faction: "PLAAF" | "PAF" | "PLAN";
  sorties: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  avg_exchange_ratio: number | null; // sum(adv_losses) / max(1, sum(ind_losses)); null if zero sorties
  avg_munitions_cost_cr: number;     // sum(munitions_cost_total_cr) / sorties; 0 if zero sorties
}

export interface CampaignTotals {
  total_sorties: number;
  total_kills: number;
  total_losses: number;
  total_munitions_cost_cr: number;
  avg_cost_per_kill_cr: number | null;
}

export interface PerformanceResponse {
  totals: CampaignTotals;
  factions: FactionStat[];       // always 3 entries in fixed order: PLAAF, PAF, PLAN
  platforms: PlatformStat[];     // only platforms with sorties > 0, sorted by sorties desc
  weapons: WeaponStat[];         // only weapons with fired > 0 OR total_cost_cr > 0, sorted by fired desc
  support: SupportStat[];        // always 3 entries in fixed order: awacs, tanker, sead
}
```

**Source of truth for each field:**
- `event_trace[]` events: `{ kind: "kill" | "bvr_launch" | "wvr_launch" | "detection" | ..., side: "ind"|"adv", attacker_platform, victim_platform, attacker_squadron_id, victim_squadron_id, weapon, pk, distance_km }` — shape already stable per Plan 4 resolver.
- `outcome.objective_met: bool`
- `outcome.munitions_expended: [{weapon, fired, hits, unit_cost_cr, total_cost_cr}]`
- `outcome.munitions_cost_total_cr: int`
- `outcome.support: { awacs: bool, tanker: bool, sead_package: bool }`
- `committed_force.squadrons: [{squadron_id, airframes}]`
- `planning_state.eligible_squadrons` → lookup squadron_id → platform_id
- `planning_state.adversary_force[0].faction` → faction label

---

## Task 1: Backend aggregation engine — scaffold + first test

**Files:**
- Create: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_performance_engine.py
from app.engine.performance import compute_performance


def test_empty_input_returns_zeroed_bundle():
    result = compute_performance(resolved_vignettes=[], platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 0
    assert result["totals"]["total_kills"] == 0
    assert result["totals"]["total_losses"] == 0
    assert result["totals"]["total_munitions_cost_cr"] == 0
    assert result["totals"]["avg_cost_per_kill_cr"] is None
    assert result["platforms"] == []
    assert result["weapons"] == []
    # Factions always return 3 entries in fixed order, even for empty input
    assert [f["faction"] for f in result["factions"]] == ["PLAAF", "PAF", "PLAN"]
    # Support always returns 3 entries in fixed order
    assert [s["asset"] for s in result["support"]] == ["awacs", "tanker", "sead"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.engine.performance'`

- [ ] **Step 3: Create the module with a minimal implementation**

```python
# backend/app/engine/performance.py
"""Pure-function campaign performance aggregator.

Given a list of resolved-vignette dicts (planning_state / committed_force /
event_trace / outcome), returns a dict matching PerformanceResponse
shape. No DB, no ORM, no side effects — easy to unit test.

Shape:
    {
        "totals": { total_sorties, total_kills, total_losses,
                    total_munitions_cost_cr, avg_cost_per_kill_cr },
        "factions": [ { faction, sorties, wins, losses, win_rate_pct,
                        avg_exchange_ratio, avg_munitions_cost_cr }, ... ],
        "platforms": [ { platform_id, platform_name, sorties, kills, losses,
                         kd_ratio, win_contribution_pct, first_shot_pct,
                         top_weapon }, ... ],
        "weapons":   [ { weapon_id, fired, hits, hit_rate_pct, avg_pk,
                         total_cost_cr, cost_per_kill_cr,
                         top_target_platform, weapon_class }, ... ],
        "support":   [ { asset, with_sorties, without_sorties,
                         with_win_rate_pct, without_win_rate_pct,
                         delta_win_rate_pp }, ... ],
    }
"""
from __future__ import annotations


FACTION_ORDER = ["PLAAF", "PAF", "PLAN"]
SUPPORT_KEYS = ["awacs", "tanker", "sead"]  # maps to support.awacs / support.tanker / support.sead_package


def compute_performance(
    resolved_vignettes: list[dict],
    platforms_by_id: dict[str, dict],
    weapons_by_id: dict[str, dict],
) -> dict:
    return {
        "totals": {
            "total_sorties": 0,
            "total_kills": 0,
            "total_losses": 0,
            "total_munitions_cost_cr": 0,
            "avg_cost_per_kill_cr": None,
        },
        "factions": [
            {
                "faction": f,
                "sorties": 0,
                "wins": 0,
                "losses": 0,
                "win_rate_pct": 0,
                "avg_exchange_ratio": None,
                "avg_munitions_cost_cr": 0,
            }
            for f in FACTION_ORDER
        ],
        "platforms": [],
        "weapons": [],
        "support": [
            {
                "asset": a,
                "with_sorties": 0,
                "without_sorties": 0,
                "with_win_rate_pct": 0,
                "without_win_rate_pct": 0,
                "delta_win_rate_pp": 0,
            }
            for a in SUPPORT_KEYS
        ],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): scaffold aggregation engine with empty-input test"
```

---

## Task 2: Aggregate campaign totals from resolved vignettes

**Files:**
- Modify: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_performance_engine.py`:

```python
def _mkv(
    faction="PLAAF",
    objective_met=True,
    ind_airframes_lost=2,
    adv_airframes_lost=5,
    munitions_cost=100,
    event_trace=None,
    committed=None,
    support=None,
    eligible=None,
):
    """Helper to build a minimal resolved-vignette dict for aggregation tests."""
    return {
        "planning_state": {
            "adversary_force": [{"faction": faction, "platform_id": "j20a", "count": 4}],
            "eligible_squadrons": eligible or [],
        },
        "committed_force": {
            "squadrons": committed or [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
        "event_trace": event_trace or [],
        "outcome": {
            "objective_met": objective_met,
            "ind_airframes_lost": ind_airframes_lost,
            "adv_airframes_lost": adv_airframes_lost,
            "munitions_cost_total_cr": munitions_cost,
            "munitions_expended": [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
    }


def test_totals_aggregate_across_vignettes():
    vs = [
        _mkv(ind_airframes_lost=2, adv_airframes_lost=5, munitions_cost=100,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "adv", "attacker_platform": "j20a", "victim_platform": "rafale_f4"},
             ]),
        _mkv(ind_airframes_lost=1, adv_airframes_lost=3, munitions_cost=50,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16"},
             ]),
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 2
    assert result["totals"]["total_kills"] == 3  # IAF kills (ind side)
    assert result["totals"]["total_losses"] == 1  # IAF losses (adv side kills)
    assert result["totals"]["total_munitions_cost_cr"] == 150
    # avg_cost_per_kill = 150 / 3 = 50
    assert result["totals"]["avg_cost_per_kill_cr"] == 50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py::test_totals_aggregate_across_vignettes -v`
Expected: FAIL — `total_sorties` is 0

- [ ] **Step 3: Implement totals aggregation**

Replace the body of `compute_performance` in `backend/app/engine/performance.py` with:

```python
def compute_performance(
    resolved_vignettes: list[dict],
    platforms_by_id: dict[str, dict],
    weapons_by_id: dict[str, dict],
) -> dict:
    total_sorties = len(resolved_vignettes)
    total_kills = 0
    total_losses = 0
    total_munitions_cost = 0

    for v in resolved_vignettes:
        trace = v.get("event_trace") or []
        outcome = v.get("outcome") or {}
        for ev in trace:
            if ev.get("kind") != "kill":
                continue
            if ev.get("side") == "ind":
                total_kills += 1
            elif ev.get("side") == "adv":
                total_losses += 1
        total_munitions_cost += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    avg_cost_per_kill = (total_munitions_cost // total_kills) if total_kills > 0 else None

    return {
        "totals": {
            "total_sorties": total_sorties,
            "total_kills": total_kills,
            "total_losses": total_losses,
            "total_munitions_cost_cr": total_munitions_cost,
            "avg_cost_per_kill_cr": avg_cost_per_kill,
        },
        "factions": [
            {
                "faction": f,
                "sorties": 0,
                "wins": 0,
                "losses": 0,
                "win_rate_pct": 0,
                "avg_exchange_ratio": None,
                "avg_munitions_cost_cr": 0,
            }
            for f in FACTION_ORDER
        ],
        "platforms": [],
        "weapons": [],
        "support": [
            {
                "asset": a,
                "with_sorties": 0,
                "without_sorties": 0,
                "with_win_rate_pct": 0,
                "without_win_rate_pct": 0,
                "delta_win_rate_pp": 0,
            }
            for a in SUPPORT_KEYS
        ],
    }
```

- [ ] **Step 4: Run all tests in this file to verify both pass**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): aggregate campaign totals (kills, losses, munitions cost)"
```

---

## Task 3: Aggregate per-faction stats

**Files:**
- Modify: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_performance_engine.py`:

```python
def test_factions_aggregate_and_preserve_order_even_for_unused_factions():
    vs = [
        _mkv(faction="PLAAF", objective_met=True, ind_airframes_lost=1, adv_airframes_lost=5, munitions_cost=200),
        _mkv(faction="PLAAF", objective_met=False, ind_airframes_lost=4, adv_airframes_lost=2, munitions_cost=300),
        _mkv(faction="PAF",   objective_met=True, ind_airframes_lost=0, adv_airframes_lost=3, munitions_cost=100),
        # No PLAN vignettes — should still appear with zeroes
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    by_faction = {f["faction"]: f for f in result["factions"]}
    assert [f["faction"] for f in result["factions"]] == ["PLAAF", "PAF", "PLAN"]

    assert by_faction["PLAAF"]["sorties"] == 2
    assert by_faction["PLAAF"]["wins"] == 1
    assert by_faction["PLAAF"]["losses"] == 1
    assert by_faction["PLAAF"]["win_rate_pct"] == 50
    # exchange_ratio = adv_losses_total (5+2=7) / max(1, ind_losses_total (1+4=5)) = 7/5 = 1.4
    assert by_faction["PLAAF"]["avg_exchange_ratio"] == 1.4
    # avg_munitions_cost = (200 + 300) / 2 = 250
    assert by_faction["PLAAF"]["avg_munitions_cost_cr"] == 250

    assert by_faction["PAF"]["sorties"] == 1
    assert by_faction["PAF"]["wins"] == 1
    assert by_faction["PAF"]["win_rate_pct"] == 100

    # PLAN — zero sorties, but entry still present with nulls / zeroes
    assert by_faction["PLAN"]["sorties"] == 0
    assert by_faction["PLAN"]["avg_exchange_ratio"] is None
    assert by_faction["PLAN"]["avg_munitions_cost_cr"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py::test_factions_aggregate_and_preserve_order_even_for_unused_factions -v`
Expected: FAIL — PLAAF sorties is 0

- [ ] **Step 3: Add faction aggregation**

In `backend/app/engine/performance.py`, add a helper and replace the factions section:

```python
def _faction_of(vignette: dict) -> str:
    force = vignette.get("planning_state", {}).get("adversary_force", [])
    if force and "faction" in force[0]:
        return force[0]["faction"]
    return "UNKNOWN"


def _aggregate_factions(resolved_vignettes: list[dict]) -> list[dict]:
    # Seed every faction with zeroes so the response order is stable.
    agg = {
        f: {"sorties": 0, "wins": 0, "losses": 0, "ind_losses": 0, "adv_losses": 0, "munitions": 0}
        for f in FACTION_ORDER
    }
    for v in resolved_vignettes:
        faction = _faction_of(v)
        if faction not in agg:
            continue  # skip UNKNOWN/unexpected factions rather than creating new rows
        outcome = v.get("outcome") or {}
        a = agg[faction]
        a["sorties"] += 1
        if outcome.get("objective_met"):
            a["wins"] += 1
        else:
            a["losses"] += 1
        a["ind_losses"] += int(outcome.get("ind_airframes_lost", 0) or 0)
        a["adv_losses"] += int(outcome.get("adv_airframes_lost", 0) or 0)
        a["munitions"] += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    out = []
    for f in FACTION_ORDER:
        a = agg[f]
        sorties = a["sorties"]
        win_rate = round((a["wins"] / sorties) * 100) if sorties > 0 else 0
        if sorties == 0:
            exchange = None
        else:
            exchange = round(a["adv_losses"] / max(1, a["ind_losses"]), 2)
        avg_munitions = (a["munitions"] // sorties) if sorties > 0 else 0
        out.append({
            "faction": f,
            "sorties": sorties,
            "wins": a["wins"],
            "losses": a["losses"],
            "win_rate_pct": win_rate,
            "avg_exchange_ratio": exchange,
            "avg_munitions_cost_cr": avg_munitions,
        })
    return out
```

Then replace the `"factions": [...]` block inside `compute_performance` with:

```python
        "factions": _aggregate_factions(resolved_vignettes),
```

- [ ] **Step 4: Run all tests to verify**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): aggregate per-faction sorties, win rate, exchange ratio, munitions"
```

---

## Task 4: Aggregate per-platform stats (sorties, K:D, win contribution, first-shot %)

**Files:**
- Modify: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_performance_engine.py`:

```python
def test_platform_stats_compute_sorties_kd_win_contribution_first_shot():
    platforms_by_id = {
        "rafale_f4": {"name": "Dassault Rafale F4"},
        "su30_mki":  {"name": "Sukhoi Su-30 MKI"},
    }
    v1 = _mkv(
        faction="PLAAF",
        objective_met=True,
        ind_airframes_lost=1,
        adv_airframes_lost=4,
        eligible=[
            {"squadron_id": 101, "platform_id": "rafale_f4"},
            {"squadron_id": 201, "platform_id": "su30_mki"},
        ],
        committed=[
            {"squadron_id": 101, "airframes": 6},
            {"squadron_id": 201, "airframes": 4},
        ],
        event_trace=[
            {"kind": "detection", "advantage": "ind"},
            # Rafale scores 2 kills, Su-30 scores 1
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "su30_mki", "weapon": "r77"},
            {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16", "weapon": "r77"},
            # Rafale loses 1
            {"kind": "kill", "side": "adv", "attacker_platform": "j20a", "victim_platform": "rafale_f4"},
        ],
    )
    v2 = _mkv(
        faction="PAF",
        objective_met=False,
        ind_airframes_lost=2,
        adv_airframes_lost=1,
        eligible=[{"squadron_id": 101, "platform_id": "rafale_f4"}],
        committed=[{"squadron_id": 101, "airframes": 4}],
        event_trace=[
            {"kind": "detection", "advantage": "adv"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "adv", "attacker_platform": "j10c", "victim_platform": "rafale_f4"},
            {"kind": "kill", "side": "adv", "attacker_platform": "j10c", "victim_platform": "rafale_f4"},
        ],
    )
    result = compute_performance([v1, v2], platforms_by_id=platforms_by_id, weapons_by_id={})
    # Platforms sorted by sorties desc — Rafale 2, Su-30 1
    assert [p["platform_id"] for p in result["platforms"]] == ["rafale_f4", "su30_mki"]
    rafale = next(p for p in result["platforms"] if p["platform_id"] == "rafale_f4")
    assert rafale["platform_name"] == "Dassault Rafale F4"
    assert rafale["sorties"] == 2
    assert rafale["kills"] == 2
    assert rafale["losses"] == 3
    # kd_ratio = 2 / 3 = 0.67 (rounded to 2 decimals)
    assert rafale["kd_ratio"] == 0.67
    # win_contribution: committed in 2 vignettes, 1 objective_met = 50%
    assert rafale["win_contribution_pct"] == 50
    # first_shot: committed in 2 vignettes, 1 had ind detection advantage = 50%
    assert rafale["first_shot_pct"] == 50
    assert rafale["top_weapon"] == "meteor"

    su30 = next(p for p in result["platforms"] if p["platform_id"] == "su30_mki")
    assert su30["sorties"] == 1
    assert su30["kills"] == 1
    assert su30["losses"] == 0
    # kd_ratio is None when losses == 0 (display as "∞" on the frontend)
    assert su30["kd_ratio"] is None
    assert su30["win_contribution_pct"] == 100
    assert su30["top_weapon"] == "r77"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py::test_platform_stats_compute_sorties_kd_win_contribution_first_shot -v`
Expected: FAIL — `result["platforms"]` is empty list

- [ ] **Step 3: Implement platform aggregation**

In `backend/app/engine/performance.py`, add:

```python
def _committed_platforms(vignette: dict) -> set[str]:
    """Set of platform_ids committed in this vignette (dedup across squadrons)."""
    eligible = {s["squadron_id"]: s for s in vignette.get("planning_state", {}).get("eligible_squadrons", [])}
    out: set[str] = set()
    for c in vignette.get("committed_force", {}).get("squadrons", []):
        es = eligible.get(c["squadron_id"])
        if es and es.get("platform_id"):
            out.add(es["platform_id"])
    return out


def _detection_advantage(vignette: dict) -> str | None:
    for ev in vignette.get("event_trace", []) or []:
        if ev.get("kind") == "detection":
            return ev.get("advantage")
    return None


def _aggregate_platforms(resolved_vignettes: list[dict], platforms_by_id: dict[str, dict]) -> list[dict]:
    # platform_id -> {sorties, kills, losses, wins, first_shots, weapon_counts: {weapon: int}}
    agg: dict[str, dict] = {}

    for v in resolved_vignettes:
        committed = _committed_platforms(v)
        if not committed:
            continue
        outcome = v.get("outcome") or {}
        won = bool(outcome.get("objective_met"))
        det = _detection_advantage(v)

        for pid in committed:
            a = agg.setdefault(pid, {
                "sorties": 0, "kills": 0, "losses": 0,
                "wins": 0, "first_shots": 0,
                "weapon_counts": {},
            })
            a["sorties"] += 1
            if won:
                a["wins"] += 1
            if det == "ind":
                a["first_shots"] += 1

        for ev in v.get("event_trace") or []:
            kind = ev.get("kind")
            if kind == "kill":
                if ev.get("side") == "ind":
                    pid = ev.get("attacker_platform")
                    if pid in agg:
                        agg[pid]["kills"] += 1
                elif ev.get("side") == "adv":
                    pid = ev.get("victim_platform")
                    if pid in agg:
                        agg[pid]["losses"] += 1
            elif kind in ("bvr_launch", "wvr_launch") and ev.get("side") == "ind":
                pid = ev.get("attacker_platform")
                w = ev.get("weapon")
                if pid in agg and w:
                    agg[pid]["weapon_counts"][w] = agg[pid]["weapon_counts"].get(w, 0) + 1

    out = []
    for pid, a in agg.items():
        sorties = a["sorties"]
        kd = None
        if a["losses"] > 0:
            kd = round(a["kills"] / a["losses"], 2)
        top_weapon = max(a["weapon_counts"].items(), key=lambda kv: kv[1])[0] if a["weapon_counts"] else None
        out.append({
            "platform_id": pid,
            "platform_name": (platforms_by_id.get(pid) or {}).get("name", pid),
            "sorties": sorties,
            "kills": a["kills"],
            "losses": a["losses"],
            "kd_ratio": kd,
            "win_contribution_pct": round((a["wins"] / sorties) * 100) if sorties > 0 else 0,
            "first_shot_pct": round((a["first_shots"] / sorties) * 100) if sorties > 0 else 0,
            "top_weapon": top_weapon,
        })
    # Sort by sorties desc, then platform_id asc for deterministic tie-break
    out.sort(key=lambda p: (-p["sorties"], p["platform_id"]))
    return out
```

Then replace `"platforms": [],` inside `compute_performance` with:

```python
        "platforms": _aggregate_platforms(resolved_vignettes, platforms_by_id),
```

- [ ] **Step 4: Run all tests to verify**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): per-platform sorties, K:D, win contribution, first-shot %"
```

---

## Task 5: Aggregate per-weapon stats (hit rate, cost-per-kill, top target, class, avg PK)

**Files:**
- Modify: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_performance_engine.py`:

```python
def test_weapon_stats_compute_hit_rate_cost_per_kill_top_target_avg_pk():
    weapons_by_id = {
        "meteor": {"unit_cost_cr": 18, "class": "a2a_bvr"},
        "r77":    {"unit_cost_cr":  4, "class": "a2a_bvr"},
    }
    v1 = _mkv(
        faction="PLAAF",
        objective_met=True,
        event_trace=[
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.30, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.10, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.50, "target_platform": "kj500"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "kj500", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "r77", "pk": 0.00, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "r77", "pk": 0.10, "target_platform": "j16"},
            {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16", "weapon": "r77"},
        ],
    )
    v1["outcome"]["munitions_expended"] = [
        {"weapon": "meteor", "fired": 3, "hits": 1, "unit_cost_cr": 18, "total_cost_cr": 54},
        {"weapon": "r77",    "fired": 2, "hits": 1, "unit_cost_cr":  4, "total_cost_cr":  8},
    ]
    v1["outcome"]["munitions_cost_total_cr"] = 62

    result = compute_performance([v1], platforms_by_id={}, weapons_by_id=weapons_by_id)
    # Sort: weapons with fired > 0 desc, then weapon_id asc
    assert [w["weapon_id"] for w in result["weapons"]] == ["meteor", "r77"]

    meteor = next(w for w in result["weapons"] if w["weapon_id"] == "meteor")
    assert meteor["fired"] == 3
    assert meteor["hits"] == 1
    # hit_rate = round(1/3 * 100) = 33
    assert meteor["hit_rate_pct"] == 33
    # avg_pk = mean(0.30, 0.10, 0.50) = 0.30 (rounded to 2 decimals)
    assert meteor["avg_pk"] == 0.30
    assert meteor["total_cost_cr"] == 54
    # cost_per_kill = 54 / 1 = 54
    assert meteor["cost_per_kill_cr"] == 54
    assert meteor["top_target_platform"] == "kj500"
    assert meteor["weapon_class"] == "a2a_bvr"

    r77 = next(w for w in result["weapons"] if w["weapon_id"] == "r77")
    assert r77["fired"] == 2
    assert r77["hits"] == 1
    assert r77["cost_per_kill_cr"] == 8
    assert r77["top_target_platform"] == "j16"


def test_weapon_with_fired_but_no_hits_has_null_cost_per_kill():
    weapons_by_id = {"meteor": {"unit_cost_cr": 18, "class": "a2a_bvr"}}
    v = _mkv(event_trace=[
        {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.0, "target_platform": "j20a"},
    ])
    v["outcome"]["munitions_expended"] = [
        {"weapon": "meteor", "fired": 1, "hits": 0, "unit_cost_cr": 18, "total_cost_cr": 18},
    ]
    v["outcome"]["munitions_cost_total_cr"] = 18

    result = compute_performance([v], platforms_by_id={}, weapons_by_id=weapons_by_id)
    meteor = next(w for w in result["weapons"] if w["weapon_id"] == "meteor")
    assert meteor["hits"] == 0
    assert meteor["hit_rate_pct"] == 0
    assert meteor["cost_per_kill_cr"] is None
    assert meteor["top_target_platform"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py::test_weapon_stats_compute_hit_rate_cost_per_kill_top_target_avg_pk tests/test_performance_engine.py::test_weapon_with_fired_but_no_hits_has_null_cost_per_kill -v`
Expected: FAIL — `result["weapons"]` is empty list

- [ ] **Step 3: Implement weapon aggregation**

In `backend/app/engine/performance.py`, add:

```python
def _aggregate_weapons(resolved_vignettes: list[dict], weapons_by_id: dict[str, dict]) -> list[dict]:
    # weapon_id -> {fired, hits, total_cost, pk_sum, pk_count, target_counts: {platform: int}}
    agg: dict[str, dict] = {}

    for v in resolved_vignettes:
        outcome = v.get("outcome") or {}

        # fired/hits/cost come from munitions_expended rows (authoritative — resolver writes these)
        for me in outcome.get("munitions_expended") or []:
            wid = me.get("weapon")
            if not wid:
                continue
            a = agg.setdefault(wid, {
                "fired": 0, "hits": 0, "total_cost": 0,
                "pk_sum": 0.0, "pk_count": 0,
                "target_counts": {},
            })
            a["fired"] += int(me.get("fired", 0) or 0)
            a["hits"] += int(me.get("hits", 0) or 0)
            a["total_cost"] += int(me.get("total_cost_cr", 0) or 0)

        # avg PK + top-target derived from event_trace (PK field lives there, not in munitions row)
        for ev in v.get("event_trace") or []:
            kind = ev.get("kind")
            if kind in ("bvr_launch", "wvr_launch") and ev.get("side") == "ind":
                wid = ev.get("weapon")
                if not wid:
                    continue
                a = agg.setdefault(wid, {
                    "fired": 0, "hits": 0, "total_cost": 0,
                    "pk_sum": 0.0, "pk_count": 0,
                    "target_counts": {},
                })
                pk = ev.get("pk")
                if isinstance(pk, (int, float)):
                    a["pk_sum"] += float(pk)
                    a["pk_count"] += 1
            elif kind == "kill" and ev.get("side") == "ind":
                wid = ev.get("weapon")
                victim = ev.get("victim_platform")
                if wid and victim and wid in agg:
                    agg[wid]["target_counts"][victim] = agg[wid]["target_counts"].get(victim, 0) + 1

    out = []
    for wid, a in agg.items():
        spec = weapons_by_id.get(wid) or {}
        fired = a["fired"]
        hits = a["hits"]
        hit_rate = round((hits / fired) * 100) if fired > 0 else 0
        avg_pk = round(a["pk_sum"] / a["pk_count"], 2) if a["pk_count"] > 0 else 0
        cost_per_kill = (a["total_cost"] // hits) if hits > 0 else None
        top_target = max(a["target_counts"].items(), key=lambda kv: kv[1])[0] if a["target_counts"] else None
        out.append({
            "weapon_id": wid,
            "fired": fired,
            "hits": hits,
            "hit_rate_pct": hit_rate,
            "avg_pk": avg_pk,
            "total_cost_cr": a["total_cost"],
            "cost_per_kill_cr": cost_per_kill,
            "top_target_platform": top_target,
            "weapon_class": spec.get("class", "a2a_bvr"),
        })

    # Drop entries with zero fired AND zero cost (defensive — shouldn't happen but prevents noise)
    out = [w for w in out if w["fired"] > 0 or w["total_cost_cr"] > 0]
    # Sort: fired desc, then weapon_id asc
    out.sort(key=lambda w: (-w["fired"], w["weapon_id"]))
    return out
```

Then replace `"weapons": [],` inside `compute_performance` with:

```python
        "weapons": _aggregate_weapons(resolved_vignettes, weapons_by_id),
```

- [ ] **Step 4: Run all tests to verify**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): per-weapon hit rate, avg PK, cost-per-kill, top target"
```

---

## Task 6: Aggregate support-asset deltas (AWACS / tanker / SEAD)

**Files:**
- Modify: `backend/app/engine/performance.py`
- Test: `backend/tests/test_performance_engine.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_performance_engine.py`:

```python
def test_support_deltas_awacs_tanker_sead():
    vs = [
        _mkv(objective_met=True,  support={"awacs": True,  "tanker": True,  "sead_package": False}),
        _mkv(objective_met=True,  support={"awacs": True,  "tanker": False, "sead_package": False}),
        _mkv(objective_met=False, support={"awacs": False, "tanker": True,  "sead_package": False}),
        _mkv(objective_met=False, support={"awacs": False, "tanker": False, "sead_package": False}),
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    by_asset = {s["asset"]: s for s in result["support"]}
    # Stable order
    assert [s["asset"] for s in result["support"]] == ["awacs", "tanker", "sead"]

    # AWACS: 2 with (both wins), 2 without (both losses)
    assert by_asset["awacs"]["with_sorties"] == 2
    assert by_asset["awacs"]["without_sorties"] == 2
    assert by_asset["awacs"]["with_win_rate_pct"] == 100
    assert by_asset["awacs"]["without_win_rate_pct"] == 0
    assert by_asset["awacs"]["delta_win_rate_pp"] == 100

    # Tanker: 2 with (1 win), 2 without (1 win)
    assert by_asset["tanker"]["with_sorties"] == 2
    assert by_asset["tanker"]["with_win_rate_pct"] == 50
    assert by_asset["tanker"]["without_win_rate_pct"] == 50
    assert by_asset["tanker"]["delta_win_rate_pp"] == 0

    # SEAD: 0 with, 4 without (2 wins)
    assert by_asset["sead"]["with_sorties"] == 0
    assert by_asset["sead"]["without_sorties"] == 4
    assert by_asset["sead"]["with_win_rate_pct"] == 0
    assert by_asset["sead"]["without_win_rate_pct"] == 50
    # Delta: with=0 means 0 - 50 = -50, but only meaningful when both sides have >= 1 sortie.
    # Spec: if with_sorties == 0 OR without_sorties == 0, delta_win_rate_pp == 0 (N/A).
    assert by_asset["sead"]["delta_win_rate_pp"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py::test_support_deltas_awacs_tanker_sead -v`
Expected: FAIL — `with_sorties` is 0

- [ ] **Step 3: Implement support aggregation**

In `backend/app/engine/performance.py`, add:

```python
# Map of support asset id → the key it lives under in committed_force.support
# ("sead" is stored as "sead_package" historically — preserve compatibility).
_SUPPORT_PAYLOAD_KEY = {"awacs": "awacs", "tanker": "tanker", "sead": "sead_package"}


def _aggregate_support(resolved_vignettes: list[dict]) -> list[dict]:
    tallies = {
        asset: {"with_sorties": 0, "with_wins": 0, "without_sorties": 0, "without_wins": 0}
        for asset in SUPPORT_KEYS
    }
    for v in resolved_vignettes:
        outcome = v.get("outcome") or {}
        support = outcome.get("support") or v.get("committed_force", {}).get("support") or {}
        won = bool(outcome.get("objective_met"))
        for asset in SUPPORT_KEYS:
            key = _SUPPORT_PAYLOAD_KEY[asset]
            if bool(support.get(key, False)):
                tallies[asset]["with_sorties"] += 1
                if won:
                    tallies[asset]["with_wins"] += 1
            else:
                tallies[asset]["without_sorties"] += 1
                if won:
                    tallies[asset]["without_wins"] += 1

    out = []
    for asset in SUPPORT_KEYS:
        t = tallies[asset]
        with_rate = round((t["with_wins"] / t["with_sorties"]) * 100) if t["with_sorties"] > 0 else 0
        without_rate = round((t["without_wins"] / t["without_sorties"]) * 100) if t["without_sorties"] > 0 else 0
        # Delta is only meaningful if both sides have sorties; otherwise zero it.
        if t["with_sorties"] == 0 or t["without_sorties"] == 0:
            delta = 0
        else:
            delta = with_rate - without_rate
        out.append({
            "asset": asset,
            "with_sorties": t["with_sorties"],
            "without_sorties": t["without_sorties"],
            "with_win_rate_pct": with_rate,
            "without_win_rate_pct": without_rate,
            "delta_win_rate_pp": delta,
        })
    return out
```

Then replace the `"support": [...]` block inside `compute_performance` with:

```python
        "support": _aggregate_support(resolved_vignettes),
```

- [ ] **Step 4: Run all tests to verify**

Run: `cd backend && python3 -m pytest tests/test_performance_engine.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/performance.py backend/tests/test_performance_engine.py
git commit -m "feat(performance): AWACS / tanker / SEAD with-vs-without win-rate deltas"
```

---

## Task 7: Pydantic schemas for the API response

**Files:**
- Create: `backend/app/schemas/performance.py`

- [ ] **Step 1: Write the schema file directly (no test — Pydantic models are exercised by the API test in Task 9)**

Create `backend/app/schemas/performance.py`:

```python
from pydantic import BaseModel


class CampaignTotals(BaseModel):
    total_sorties: int
    total_kills: int
    total_losses: int
    total_munitions_cost_cr: int
    avg_cost_per_kill_cr: int | None


class FactionStat(BaseModel):
    faction: str
    sorties: int
    wins: int
    losses: int
    win_rate_pct: int
    avg_exchange_ratio: float | None
    avg_munitions_cost_cr: int


class PlatformStat(BaseModel):
    platform_id: str
    platform_name: str
    sorties: int
    kills: int
    losses: int
    kd_ratio: float | None
    win_contribution_pct: int
    first_shot_pct: int
    top_weapon: str | None


class WeaponStat(BaseModel):
    weapon_id: str
    fired: int
    hits: int
    hit_rate_pct: int
    avg_pk: float
    total_cost_cr: int
    cost_per_kill_cr: int | None
    top_target_platform: str | None
    weapon_class: str


class SupportStat(BaseModel):
    asset: str
    with_sorties: int
    without_sorties: int
    with_win_rate_pct: int
    without_win_rate_pct: int
    delta_win_rate_pp: int


class PerformanceResponse(BaseModel):
    totals: CampaignTotals
    factions: list[FactionStat]
    platforms: list[PlatformStat]
    weapons: list[WeaponStat]
    support: list[SupportStat]
```

- [ ] **Step 2: Quick import sanity**

Run: `cd backend && python3 -c "from app.schemas.performance import PerformanceResponse; print(PerformanceResponse.model_fields.keys())"`
Expected: `dict_keys(['totals', 'factions', 'platforms', 'weapons', 'support'])`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/performance.py
git commit -m "feat(performance): Pydantic response schemas"
```

---

## Task 8: FastAPI router + main.py wiring

**Files:**
- Create: `backend/app/api/performance.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write the router**

Create `backend/app/api/performance.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.engine.performance import compute_performance
from app.models.vignette import Vignette
from app.schemas.performance import PerformanceResponse

router = APIRouter(prefix="/api/campaigns", tags=["performance"])


@router.get("/{campaign_id}/performance", response_model=PerformanceResponse)
def get_performance_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    rows = (
        db.query(Vignette)
        .filter(Vignette.campaign_id == campaign_id, Vignette.status == "resolved")
        .all()
    )
    vignette_dicts = [
        {
            "planning_state": v.planning_state or {},
            "committed_force": v.committed_force or {},
            "event_trace": v.event_trace or [],
            "outcome": v.outcome or {},
        }
        for v in rows
    ]

    # Build lookup tables from the content registries so aggregations can
    # enrich rows with display names + weapon classes without another query.
    from app.content.registry import platforms as platforms_reg
    from app.engine.vignette.bvr import WEAPONS
    platforms_by_id = {
        pid: {"name": p.name}
        for pid, p in platforms_reg().items()
    }
    weapons_by_id = {
        wid: {"unit_cost_cr": spec.get("unit_cost_cr", 0), "class": spec.get("class", "a2a_bvr")}
        for wid, spec in WEAPONS.items()
    }

    bundle = compute_performance(vignette_dicts, platforms_by_id, weapons_by_id)
    return PerformanceResponse(**bundle)
```

- [ ] **Step 2: Register the router in main.py**

Modify `backend/main.py` — find the `include_router` block (around lines 43-58) and add after `vignettes_router`:

```python
from app.api.performance import router as performance_router
# ...
app.include_router(performance_router)
```

Place the import next to the other api-router imports at the top and the `include_router` call next to the other ones.

- [ ] **Step 3: Sanity-import the app**

Run: `cd backend && python3 -c "from main import app; print([r.path for r in app.routes if 'performance' in r.path])"`
Expected: `['/api/campaigns/{campaign_id}/performance']`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/performance.py backend/main.py
git commit -m "feat(performance): FastAPI endpoint at /api/campaigns/{id}/performance"
```

---

## Task 9: API endpoint test (covers 404 + full-shape smoke test)

**Files:**
- Create: `backend/tests/test_performance_api.py`

- [ ] **Step 1: Write the API test**

Create `backend/tests/test_performance_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from main import app


@pytest.fixture
def client_with_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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


def test_performance_404_when_campaign_missing(client_with_session):
    client, _ = client_with_session
    r = client.get("/api/campaigns/999/performance")
    assert r.status_code == 404


def test_performance_returns_empty_bundle_for_new_campaign(client_with_session):
    client, SessionLocal = client_with_session
    # Create a minimal campaign via the existing campaigns endpoint
    resp = client.post("/api/campaigns", json={
        "name": "T",
        "difficulty": "realistic",
        "selected_objective_ids": ["modernize"],
    })
    assert resp.status_code == 201, resp.text
    cid = resp.json()["id"]

    r = client.get(f"/api/campaigns/{cid}/performance")
    assert r.status_code == 200
    body = r.json()
    assert body["totals"]["total_sorties"] == 0
    assert [f["faction"] for f in body["factions"]] == ["PLAAF", "PAF", "PLAN"]
    assert [s["asset"] for s in body["support"]] == ["awacs", "tanker", "sead"]
    assert body["platforms"] == []
    assert body["weapons"] == []
```

- [ ] **Step 2: Run the API tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_performance_api.py -v`
Expected: PASS (2 tests)

If `modernize` is not a real objective id in your content registry, the fixture will 400. Check with: `cd backend && python3 -c "from app.content.registry import objectives; print(list(objectives().keys())[:3])"` and substitute the first valid id you see. This is the only dynamic content lookup the plan makes — keep the rest strict.

- [ ] **Step 3: Run the full backend suite to catch regressions**

Run: `cd backend && python3 -m pytest -q`
Expected: all tests pass (baseline was 489 passing before this plan; should now be 496)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_performance_api.py
git commit -m "test(performance): API endpoint 404 + empty-campaign shape"
```

---

## Task 10: Frontend types + api.ts + store wiring

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/store/campaignStore.ts`

- [ ] **Step 1: Add types**

In `frontend/src/lib/types.ts`, append (before the `// ----------` comment that separates sections is fine — just at the end of the file is easiest):

```ts
// ---------- Plan 16: performance stats types ----------

export interface CampaignTotals {
  total_sorties: number;
  total_kills: number;
  total_losses: number;
  total_munitions_cost_cr: number;
  avg_cost_per_kill_cr: number | null;
}

export interface FactionStat {
  faction: "PLAAF" | "PAF" | "PLAN";
  sorties: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  avg_exchange_ratio: number | null;
  avg_munitions_cost_cr: number;
}

export interface PlatformStat {
  platform_id: string;
  platform_name: string;
  sorties: number;
  kills: number;
  losses: number;
  kd_ratio: number | null;
  win_contribution_pct: number;
  first_shot_pct: number;
  top_weapon: string | null;
}

export interface WeaponStat {
  weapon_id: string;
  fired: number;
  hits: number;
  hit_rate_pct: number;
  avg_pk: number;
  total_cost_cr: number;
  cost_per_kill_cr: number | null;
  top_target_platform: string | null;
  weapon_class: string;
}

export interface SupportStat {
  asset: "awacs" | "tanker" | "sead";
  with_sorties: number;
  without_sorties: number;
  with_win_rate_pct: number;
  without_win_rate_pct: number;
  delta_win_rate_pp: number;
}

export interface PerformanceResponse {
  totals: CampaignTotals;
  factions: FactionStat[];
  platforms: PlatformStat[];
  weapons: WeaponStat[];
  support: SupportStat[];
}
```

**Note:** there is an older `CampaignTotals` naming collision risk — grep first:
Run: `grep -n "CampaignTotals\|FactionStat\|PlatformStat\|WeaponStat\|SupportStat\|PerformanceResponse" frontend/src/lib/types.ts`
Expected: no hits except the new ones we're adding. If any collide, rename the new type (e.g. `PerfCampaignTotals`) and thread the rename through all files that reference it.

- [ ] **Step 2: Add the API method**

In `frontend/src/lib/api.ts`, first extend the imports list at the top — find the existing import from `./types` and add `PerformanceResponse`:

```ts
import type {
  // ... existing imports ...
  PerformanceResponse,
} from "./types";
```

Then add a method inside the `export const api = { ... }` block (the others are alphabetical-ish; drop this near `getHangar` for proximity):

```ts
  async getPerformance(campaignId: number): Promise<PerformanceResponse> {
    const { data } = await http.get<PerformanceResponse>(
      `/api/campaigns/${campaignId}/performance`,
    );
    return data;
  },
```

- [ ] **Step 3: Add store state + action**

In `frontend/src/store/campaignStore.ts`:

a) Add to the state interface (near other loadable caches like `hangar` / `armoryUnlocks`):

```ts
  performance: PerformanceResponse | null;
  loadPerformance: (campaignId: number) => Promise<void>;
```

b) Add import at top of file (use the existing `import type` block from `../lib/types`):

```ts
import type { PerformanceResponse } from "../lib/types";
```

c) Initial value in `create(...)` — alongside `hangar: null, armoryUnlocks: null,`:

```ts
  performance: null,
```

d) Action implementation — put it near `loadHangar`:

```ts
  loadPerformance: async (campaignId: number) => {
    try {
      const performance = await api.getPerformance(campaignId);
      set({ performance });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
```

e) Reset — in the `reset: () => set({...})` block, add `performance: null,`:

```ts
  reset: () => set({
    // ... existing keys ...
    performance: null,
  }),
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run build 2>&1 | tail -8`
Expected: build succeeds (warnings about chunk sizes are fine; no TS errors)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts
git commit -m "feat(performance): frontend types, api method, store wiring"
```

---

## Task 11: TotalsRibbon + FactionSummary components

**Files:**
- Create: `frontend/src/components/performance/TotalsRibbon.tsx`
- Create: `frontend/src/components/performance/FactionSummary.tsx`

- [ ] **Step 1: TotalsRibbon**

Create `frontend/src/components/performance/TotalsRibbon.tsx`:

```tsx
import type { CampaignTotals } from "../../lib/types";

export function TotalsRibbon({ totals }: { totals: CampaignTotals }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Sorties", value: String(totals.total_sorties) },
    { label: "Kills", value: String(totals.total_kills) },
    { label: "Losses", value: String(totals.total_losses) },
    {
      label: "Munitions ₹cr",
      value: totals.total_munitions_cost_cr.toLocaleString("en-US"),
    },
    {
      label: "Cost / Kill",
      value: totals.avg_cost_per_kill_cr == null
        ? "—"
        : `₹${totals.avg_cost_per_kill_cr.toLocaleString("en-US")} cr`,
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-900 border border-slate-800 rounded-lg p-3">
      {items.map((i) => (
        <div key={i.label} className="text-center">
          <div className="text-[10px] uppercase opacity-60">{i.label}</div>
          <div className="text-sm font-mono font-semibold">{i.value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: FactionSummary**

Create `frontend/src/components/performance/FactionSummary.tsx`:

```tsx
import type { FactionStat } from "../../lib/types";

export function FactionSummary({ factions }: { factions: FactionStat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {factions.map((f) => {
        const rateColor = f.win_rate_pct >= 50 ? "text-emerald-300" : "text-rose-300";
        return (
          <div key={f.faction} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-semibold">vs {f.faction}</span>
              <span className="text-[10px] opacity-60">{f.sorties} sortie{f.sorties === 1 ? "" : "s"}</span>
            </div>
            {f.sorties === 0 ? (
              <p className="text-xs opacity-60 italic">No engagements yet</p>
            ) : (
              <>
                <div className="text-xs">
                  <span className="opacity-70">Record: </span>
                  <span className="font-mono">{f.wins}W · {f.losses}L</span>
                  <span className={`ml-2 font-semibold ${rateColor}`}>{f.win_rate_pct}%</span>
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Avg exchange: <span className="font-mono">
                    {f.avg_exchange_ratio == null ? "—" : `${f.avg_exchange_ratio}:1`}
                  </span>
                </div>
                <div className="text-[11px] opacity-80">
                  Avg munitions: <span className="font-mono">
                    ₹{f.avg_munitions_cost_cr.toLocaleString("en-US")} cr
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds, no TS errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/performance/TotalsRibbon.tsx frontend/src/components/performance/FactionSummary.tsx
git commit -m "feat(performance): totals ribbon + per-faction summary cards"
```

---

## Task 12: PlatformTable component + test

**Files:**
- Create: `frontend/src/components/performance/PlatformTable.tsx`
- Test: `frontend/src/components/performance/__tests__/PlatformTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/performance/__tests__/PlatformTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlatformTable } from "../PlatformTable";
import type { PlatformStat } from "../../../lib/types";

describe("PlatformTable", () => {
  it("renders empty-state when no platforms have committed to combat yet", () => {
    render(<PlatformTable platforms={[]} />);
    expect(screen.getByText(/No combat yet/i)).toBeTruthy();
  });

  it("renders rows with K:D, win contribution %, top weapon", () => {
    const rows: PlatformStat[] = [
      {
        platform_id: "rafale_f4", platform_name: "Dassault Rafale F4",
        sorties: 10, kills: 24, losses: 8, kd_ratio: 3.0,
        win_contribution_pct: 80, first_shot_pct: 70, top_weapon: "meteor",
      },
      {
        platform_id: "su30_mki", platform_name: "Sukhoi Su-30 MKI",
        sorties: 6, kills: 4, losses: 0, kd_ratio: null,
        win_contribution_pct: 50, first_shot_pct: 33, top_weapon: "r77",
      },
    ];
    render(<PlatformTable platforms={rows} />);
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
    expect(screen.getByText(/3\.0/)).toBeTruthy();          // K:D for Rafale
    expect(screen.getByText(/Sukhoi Su-30 MKI/)).toBeTruthy();
    // Su-30 has losses=0 → K:D renders as "∞"
    expect(screen.getByText("∞")).toBeTruthy();
    expect(screen.getByText(/meteor/i)).toBeTruthy();
    expect(screen.getByText(/r77/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run PlatformTable 2>&1 | tail -10`
Expected: FAIL — `PlatformTable` module not found

- [ ] **Step 3: Write the component**

Create `frontend/src/components/performance/PlatformTable.tsx`:

```tsx
import type { PlatformStat } from "../../lib/types";

export function PlatformTable({ platforms }: { platforms: PlatformStat[] }) {
  if (platforms.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No combat yet.</p>
        <p className="text-xs opacity-50 mt-1">
          Platform stats appear after you commit squadrons to a vignette.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left opacity-60 border-b border-slate-800">
            <th className="py-1 pr-2 font-medium">Platform</th>
            <th className="py-1 px-2 font-medium text-right">Sorties</th>
            <th className="py-1 px-2 font-medium text-right">K</th>
            <th className="py-1 px-2 font-medium text-right">L</th>
            <th className="py-1 px-2 font-medium text-right">K:D</th>
            <th className="py-1 px-2 font-medium text-right">Win%</th>
            <th className="py-1 px-2 font-medium text-right">First-shot</th>
            <th className="py-1 pl-2 font-medium">Top wpn</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((p) => {
            const kdDisplay = p.kd_ratio == null
              ? (p.kills > 0 ? "∞" : "—")
              : p.kd_ratio.toFixed(2);
            return (
              <tr key={p.platform_id} className="border-b border-slate-900/60">
                <td className="py-1 pr-2 font-semibold truncate max-w-[12rem]">{p.platform_name}</td>
                <td className="py-1 px-2 text-right">{p.sorties}</td>
                <td className="py-1 px-2 text-right text-emerald-300">{p.kills}</td>
                <td className="py-1 px-2 text-right text-rose-300">{p.losses}</td>
                <td className="py-1 px-2 text-right font-mono">{kdDisplay}</td>
                <td className="py-1 px-2 text-right">{p.win_contribution_pct}%</td>
                <td className="py-1 px-2 text-right">{p.first_shot_pct}%</td>
                <td className="py-1 pl-2 font-mono opacity-80">{p.top_weapon ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run PlatformTable 2>&1 | tail -5`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/performance/PlatformTable.tsx frontend/src/components/performance/__tests__/PlatformTable.test.tsx
git commit -m "feat(performance): platform table with K:D + win contribution"
```

---

## Task 13: WeaponTable component + test

**Files:**
- Create: `frontend/src/components/performance/WeaponTable.tsx`
- Test: `frontend/src/components/performance/__tests__/WeaponTable.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/performance/__tests__/WeaponTable.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeaponTable } from "../WeaponTable";
import type { WeaponStat } from "../../../lib/types";

describe("WeaponTable", () => {
  it("renders empty-state when no weapons have fired yet", () => {
    render(<WeaponTable weapons={[]} />);
    expect(screen.getByText(/No weapons fired yet/i)).toBeTruthy();
  });

  it("splits A2A and strike sections, flags extreme cost-per-kill", () => {
    const rows: WeaponStat[] = [
      {
        weapon_id: "meteor", fired: 46, hits: 4, hit_rate_pct: 9, avg_pk: 0.09,
        total_cost_cr: 828, cost_per_kill_cr: 207, top_target_platform: "kj500",
        weapon_class: "a2a_bvr",
      },
      {
        weapon_id: "r77", fired: 6, hits: 3, hit_rate_pct: 50, avg_pk: 0.25,
        total_cost_cr: 24, cost_per_kill_cr: 8, top_target_platform: "j10c",
        weapon_class: "a2a_bvr",
      },
      {
        weapon_id: "air_brahmos2", fired: 0, hits: 0, hit_rate_pct: 0, avg_pk: 0,
        total_cost_cr: 0, cost_per_kill_cr: null, top_target_platform: null,
        weapon_class: "anti_ship",
      },
    ];
    render(<WeaponTable weapons={rows} />);
    expect(screen.getByText(/Air-to-Air/i)).toBeTruthy();
    expect(screen.getByText(/Strike/i)).toBeTruthy();
    // Meteor's cost/kill of 207 is above the 100 cr flag threshold → should be rose
    const meteorCell = screen.getByText(/₹207/i);
    expect(meteorCell.className).toMatch(/rose|red/);
    // R-77's 8 cr/kill is normal
    expect(screen.getByText(/₹8/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run WeaponTable 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `frontend/src/components/performance/WeaponTable.tsx`:

```tsx
import type { WeaponStat } from "../../lib/types";

const COST_PER_KILL_WARN_CR = 100;  // highlight threshold

function Row({ w }: { w: WeaponStat }) {
  const cpk = w.cost_per_kill_cr;
  const warn = cpk != null && cpk >= COST_PER_KILL_WARN_CR;
  return (
    <tr className="border-b border-slate-900/60">
      <td className="py-1 pr-2 font-mono uppercase">{w.weapon_id}</td>
      <td className="py-1 px-2 text-right">{w.fired}</td>
      <td className="py-1 px-2 text-right text-emerald-300">{w.hits}</td>
      <td className="py-1 px-2 text-right">{w.hit_rate_pct}%</td>
      <td className="py-1 px-2 text-right font-mono">{w.avg_pk.toFixed(2)}</td>
      <td className="py-1 px-2 text-right font-mono">
        ₹{w.total_cost_cr.toLocaleString("en-US")}
      </td>
      <td className={`py-1 px-2 text-right font-mono ${warn ? "text-rose-400 font-semibold" : ""}`}>
        {cpk == null ? "—" : `₹${cpk.toLocaleString("en-US")}`}
      </td>
      <td className="py-1 pl-2 font-mono opacity-80">{w.top_target_platform ?? "—"}</td>
    </tr>
  );
}

function Table({ rows, title }: { rows: WeaponStat[]; title: string }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-80">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left opacity-60 border-b border-slate-800">
              <th className="py-1 pr-2 font-medium">Weapon</th>
              <th className="py-1 px-2 font-medium text-right">Fired</th>
              <th className="py-1 px-2 font-medium text-right">Hits</th>
              <th className="py-1 px-2 font-medium text-right">Hit%</th>
              <th className="py-1 px-2 font-medium text-right">Avg PK</th>
              <th className="py-1 px-2 font-medium text-right">Total ₹</th>
              <th className="py-1 px-2 font-medium text-right">₹ / Kill</th>
              <th className="py-1 pl-2 font-medium">Top target</th>
            </tr>
          </thead>
          <tbody>{rows.map((w) => <Row key={w.weapon_id} w={w} />)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function WeaponTable({ weapons }: { weapons: WeaponStat[] }) {
  if (weapons.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No weapons fired yet.</p>
        <p className="text-xs opacity-50 mt-1">
          Weapon stats appear after your first committed engagement.
        </p>
      </div>
    );
  }
  const a2a = weapons.filter((w) => w.weapon_class.startsWith("a2a") && w.fired > 0);
  const strike = weapons.filter((w) => !w.weapon_class.startsWith("a2a"));
  return (
    <div className="space-y-4">
      <Table rows={a2a} title="Air-to-Air" />
      {strike.length > 0 && <Table rows={strike} title="Strike Munitions (not yet used in A2A vignettes)" />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run WeaponTable 2>&1 | tail -5`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/performance/WeaponTable.tsx frontend/src/components/performance/__tests__/WeaponTable.test.tsx
git commit -m "feat(performance): weapon table w/ cost-per-kill flag + A2A/strike split"
```

---

## Task 14: SupportPanel component + test

**Files:**
- Create: `frontend/src/components/performance/SupportPanel.tsx`
- Test: `frontend/src/components/performance/__tests__/SupportPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/performance/__tests__/SupportPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportPanel } from "../SupportPanel";
import type { SupportStat } from "../../../lib/types";

describe("SupportPanel", () => {
  it("renders all three assets even if some have zero sorties", () => {
    const rows: SupportStat[] = [
      { asset: "awacs", with_sorties: 6, without_sorties: 4, with_win_rate_pct: 83, without_win_rate_pct: 50, delta_win_rate_pp: 33 },
      { asset: "tanker", with_sorties: 0, without_sorties: 10, with_win_rate_pct: 0, without_win_rate_pct: 60, delta_win_rate_pp: 0 },
      { asset: "sead", with_sorties: 0, without_sorties: 10, with_win_rate_pct: 0, without_win_rate_pct: 60, delta_win_rate_pp: 0 },
    ];
    render(<SupportPanel support={rows} />);
    expect(screen.getByText(/AWACS/i)).toBeTruthy();
    expect(screen.getByText(/Tanker/i)).toBeTruthy();
    expect(screen.getByText(/SEAD/i)).toBeTruthy();
    // AWACS positive delta shows "+33 pp" with emerald tint
    expect(screen.getByText(/\+33 pp/)).toBeTruthy();
    // Tanker / SEAD with zero sorties on one side — shows "—" delta, not "+0 pp"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run SupportPanel 2>&1 | tail -8`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `frontend/src/components/performance/SupportPanel.tsx`:

```tsx
import type { SupportStat } from "../../lib/types";

const ASSET_LABELS: Record<SupportStat["asset"], string> = {
  awacs: "AWACS",
  tanker: "Tanker (IL-78)",
  sead: "SEAD package",
};

function deltaDisplay(s: SupportStat): { text: string; color: string } {
  if (s.with_sorties === 0 || s.without_sorties === 0) {
    return { text: "—", color: "opacity-50" };
  }
  const sign = s.delta_win_rate_pp > 0 ? "+" : "";
  const color = s.delta_win_rate_pp > 0
    ? "text-emerald-300"
    : s.delta_win_rate_pp < 0
      ? "text-rose-300"
      : "opacity-70";
  return { text: `${sign}${s.delta_win_rate_pp} pp`, color };
}

export function SupportPanel({ support }: { support: SupportStat[] }) {
  return (
    <div className="space-y-2">
      {support.map((s) => {
        const d = deltaDisplay(s);
        const isUnused = s.with_sorties === 0;
        return (
          <div
            key={s.asset}
            className={[
              "bg-slate-900 border rounded-lg p-3",
              isUnused ? "border-slate-800 opacity-70" : "border-slate-700",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-semibold">{ASSET_LABELS[s.asset]}</span>
              <span className={`text-sm font-mono font-semibold ${d.color}`}>{d.text}</span>
            </div>
            {isUnused ? (
              <p className="text-[11px] italic opacity-70">
                Not yet toggled on in any committed vignette — no delta to report.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="opacity-60">With:</span>{" "}
                  <span className="font-mono">{s.with_sorties} sorties</span>
                  <span className="font-semibold text-emerald-300 ml-1">
                    {s.with_win_rate_pct}%
                  </span>
                </div>
                <div>
                  <span className="opacity-60">Without:</span>{" "}
                  <span className="font-mono">{s.without_sorties} sorties</span>
                  <span className="font-semibold text-rose-300 ml-1">
                    {s.without_win_rate_pct}%
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run SupportPanel 2>&1 | tail -5`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/performance/SupportPanel.tsx frontend/src/components/performance/__tests__/SupportPanel.test.tsx
git commit -m "feat(performance): support-asset impact panel (AWACS / tanker / SEAD deltas)"
```

---

## Task 15: PerformancePage with tab switcher + integration test

**Files:**
- Create: `frontend/src/pages/PerformancePage.tsx`
- Test: `frontend/src/pages/__tests__/PerformancePage.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Create `frontend/src/pages/__tests__/PerformancePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PerformancePage } from "../PerformancePage";
import { useCampaignStore } from "../../store/campaignStore";
import type { PerformanceResponse } from "../../lib/types";

const bundle: PerformanceResponse = {
  totals: {
    total_sorties: 14, total_kills: 42, total_losses: 12,
    total_munitions_cost_cr: 4500, avg_cost_per_kill_cr: 107,
  },
  factions: [
    { faction: "PLAAF", sorties: 9, wins: 6, losses: 3, win_rate_pct: 67, avg_exchange_ratio: 2.1, avg_munitions_cost_cr: 400 },
    { faction: "PAF", sorties: 4, wins: 3, losses: 1, win_rate_pct: 75, avg_exchange_ratio: 4.0, avg_munitions_cost_cr: 180 },
    { faction: "PLAN", sorties: 1, wins: 0, losses: 1, win_rate_pct: 0, avg_exchange_ratio: 0.5, avg_munitions_cost_cr: 250 },
  ],
  platforms: [
    { platform_id: "rafale_f4", platform_name: "Dassault Rafale F4", sorties: 10, kills: 24, losses: 8, kd_ratio: 3.0, win_contribution_pct: 80, first_shot_pct: 70, top_weapon: "meteor" },
  ],
  weapons: [
    { weapon_id: "meteor", fired: 46, hits: 4, hit_rate_pct: 9, avg_pk: 0.09, total_cost_cr: 828, cost_per_kill_cr: 207, top_target_platform: "kj500", weapon_class: "a2a_bvr" },
  ],
  support: [
    { asset: "awacs", with_sorties: 6, without_sorties: 8, with_win_rate_pct: 83, without_win_rate_pct: 50, delta_win_rate_pp: 33 },
    { asset: "tanker", with_sorties: 0, without_sorties: 14, with_win_rate_pct: 0, without_win_rate_pct: 57, delta_win_rate_pp: 0 },
    { asset: "sead", with_sorties: 0, without_sorties: 14, with_win_rate_pct: 0, without_win_rate_pct: 57, delta_win_rate_pp: 0 },
  ],
};

describe("PerformancePage", () => {
  beforeEach(() => {
    useCampaignStore.setState({
      performance: bundle,
      loadPerformance: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("renders totals + faction summary + platforms tab by default", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    // Totals ribbon value
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText(/Dassault Rafale F4/)).toBeTruthy();
  });

  it("switches to Missiles tab on click", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Missiles/i }));
    // WeaponTable header
    expect(screen.getByText(/Air-to-Air/i)).toBeTruthy();
    // Meteor row
    expect(screen.getByText(/meteor/i)).toBeTruthy();
  });

  it("switches to Support tab on click", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/performance"]}>
        <Routes>
          <Route path="/campaign/:id/performance" element={<PerformancePage />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Support/i }));
    expect(screen.getByText(/AWACS/i)).toBeTruthy();
    expect(screen.getByText(/\+33 pp/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run PerformancePage 2>&1 | tail -8`
Expected: FAIL — `PerformancePage` module not found

- [ ] **Step 3: Write the page**

Create `frontend/src/pages/PerformancePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { TotalsRibbon } from "../components/performance/TotalsRibbon";
import { FactionSummary } from "../components/performance/FactionSummary";
import { PlatformTable } from "../components/performance/PlatformTable";
import { WeaponTable } from "../components/performance/WeaponTable";
import { SupportPanel } from "../components/performance/SupportPanel";

type Tab = "platforms" | "missiles" | "support";

export function PerformancePage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const performance = useCampaignStore((s) => s.performance);
  const loadPerformance = useCampaignStore((s) => s.loadPerformance);
  const [tab, setTab] = useState<Tab>("platforms");

  useEffect(() => {
    if (Number.isFinite(cid)) loadPerformance(cid);
  }, [cid, loadPerformance]);

  if (!performance) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <p className="text-sm opacity-70">Loading performance…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <h1 className="text-sm font-bold">📊 Performance</h1>
        <Link to={`/campaign/${cid}`} className="text-xs underline opacity-80 hover:opacity-100">
          Map
        </Link>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4 pb-20">
        <TotalsRibbon totals={performance.totals} />
        <FactionSummary factions={performance.factions} />

        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {(["platforms", "missiles", "support"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "flex-1 px-3 py-1.5 text-xs font-semibold rounded capitalize",
                tab === t ? "bg-amber-600 text-slate-900" : "text-slate-300",
              ].join(" ")}
            >
              {t === "missiles" ? "Missiles" : t === "support" ? "Support" : "Platforms"}
            </button>
          ))}
        </div>

        {tab === "platforms" && <PlatformTable platforms={performance.platforms} />}
        {tab === "missiles" && <WeaponTable weapons={performance.weapons} />}
        {tab === "support" && <SupportPanel support={performance.support} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run PerformancePage 2>&1 | tail -5`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PerformancePage.tsx frontend/src/pages/__tests__/PerformancePage.test.tsx
git commit -m "feat(performance): PerformancePage with 3-tab switcher"
```

---

## Task 16: Route + drawer nav + final build/test sweep

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: Register route**

In `frontend/src/App.tsx`, add the import (alphabetical):

```tsx
import { PerformancePage } from "./pages/PerformancePage";
```

Then add the route inside the `<Routes>` block next to the other `/campaign/:id/...` routes:

```tsx
<Route path="/campaign/:id/performance" element={<PerformancePage />} />
```

- [ ] **Step 2: Add drawer nav link**

In `frontend/src/pages/CampaignMapView.tsx`, find the existing drawer menu `<Link>` group (look for the Combat History link added earlier — `⚔ Combat History`) and add a sibling immediately above or below:

```tsx
<Link
  onClick={() => setShowMenu(false)}
  to={`/campaign/${campaign.id}/performance`}
  className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
>📊 Performance</Link>
```

- [ ] **Step 3: Typecheck + full vitest**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds, no TS errors.

Run: `cd frontend && npm run test -- --run 2>&1 | tail -5`
Expected: all tests pass. The baseline before this plan was 170 passing; should now be ≥176 (one test added per UI component, minus any that consolidate).

- [ ] **Step 4: Full backend test sweep**

Run: `cd backend && python3 -m pytest -q 2>&1 | tail -5`
Expected: all tests pass. Baseline was 489; should now be 496.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(performance): route + drawer nav link"
```

- [ ] **Step 6: Deploy**

Run: `./deploy.sh both 2>&1 | tail -8`
Expected: `✓ Backend deployed`, `✓ Frontend deployed`, `═══ Deploy complete ═══`.

Quick prod smoke:
Run: `curl -s "https://pmc-tycoon-api.skdev.one/api/campaigns/5/performance" | python3 -m json.tool | head -30`
Expected: JSON with the five top-level keys `totals`, `factions`, `platforms`, `weapons`, `support`.

- [ ] **Step 7: Update carry-over notes in CLAUDE.md**

Append a new bullet under "Known carry-overs / tuning backlog" in `/Users/rsumit123/work/defense-game/CLAUDE.md`:

```markdown
- **Performance page — all-time only.** Shows campaign-to-date stats with no time-filter (option A from design conversation). Adding a "Last 4 Q / Last 8 Q / All-time" toggle is a V1.1 candidate if players want to evaluate R&D-impact over time (did equipping Astra Mk3 last year actually improve cost-per-kill). (Plan 16)
```

Then:

```bash
git add CLAUDE.md
git commit -m "docs: note performance-page time-filter as future V1.1 work"
```

---

## Self-Review

**1. Spec coverage.**

| Spec item from conversation | Task |
|---|---|
| Platform K:D, sorties, win contribution, first-shot %, top weapon | Task 4 + Task 12 |
| Missile fired/hits/hit-rate/avg PK/cost-per-kill/top target + A2A/strike split | Task 5 + Task 13 |
| AWACS / tanker / SEAD with-vs-without deltas | Task 6 + Task 14 |
| Faction summary ribbon (vs PLAAF / PAF / PLAN) | Task 3 + Task 11 (FactionSummary) |
| Campaign totals card at top | Task 2 + Task 11 (TotalsRibbon) |
| All-time only (option A) | Design locked — no time-filter UI anywhere |
| Empty-state ("No engagements yet…") | Tasks 12, 13, 14 each have an empty-state branch + tests |
| Cost-per-kill highlighted when absurd | Task 13 (`COST_PER_KILL_WARN_CR = 100`) |
| Drawer nav link | Task 16 |
| New route `/campaign/:id/performance` | Task 16 |
| Backend endpoint + shape | Tasks 1-9 |
| Tests: backend unit + API + frontend component + integration | Tasks 1-6, 9, 12-15 |

No gaps.

**2. Placeholder scan.** No "TBD", "TODO", "add validation", "similar to Task N". Every code step is concrete. Backend `modernize` objective-id fallback in Task 9 includes a deterministic lookup command rather than hand-waving.

**3. Type consistency.**
- Response shape identical across `compute_performance` return dict (Python), `PerformanceResponse` Pydantic (Task 7), and `PerformanceResponse` TS interface (Task 10). Field names match. Optional fields (`kd_ratio`, `cost_per_kill_cr`, `avg_exchange_ratio`, `avg_cost_per_kill_cr`, `top_weapon`, `top_target_platform`) consistently `int | None` / `float | None` / `number | null` / `string | null`.
- Support-asset keys: backend uses `"awacs" | "tanker" | "sead"` (with internal mapping to `sead_package` via `_SUPPORT_PAYLOAD_KEY`) — frontend type narrows to the same three literals (Task 10). UI label map in `SupportPanel` (Task 14) matches.
- Faction literal `"PLAAF" | "PAF" | "PLAN"` consistent everywhere.
- Weapon class strings echo backend `WEAPONS[id].class` values (`a2a_bvr`, `a2a_wvr`, `anti_ship`, `land_attack`, `anti_radiation`, `glide_bomb`) — used by `WeaponTable` split (`startsWith("a2a")`).

No inconsistencies.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-performance-stats-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
