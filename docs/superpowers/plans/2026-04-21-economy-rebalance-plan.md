# Economy Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make budget meaningful. Player feedback: "I can order nearly everything from the amount of money I get — don't even need to worry about budget." Tighten the economy so R&D / acquisition / munition decisions have real tension.

**Architecture:** Three levers: (a) starting treasury + quarterly grant cut ~70%, grounded in real 2026 IAF capex (~₹85k cr/yr → our "realistic" ₹45k/q = ₹180k/yr ~2× reality, leaves breathing room); (b) difficulty multipliers applied to grant (relaxed 1.5× / realistic 1.0× / hard_peer 0.7× / worst_case 0.5×) with +3%/yr defense-spending growth; (c) R&D program costs bumped 1.5× (moderate because grant already cut ~3.4×). Folds in three resolved carry-overs: underfunded acquisitions silently delivering free → now slip quarters, R&D integer-rounding residual at completion, `datetime.utcnow()` deprecation sweep. CLAUDE.md cleaned up after.

**Tech Stack:** FastAPI / SQLAlchemy 2.x / Pydantic 2 / YAML content / pytest.

---

## File Structure

**Backend — modified:**
- `backend/app/engine/budget.py` — add `compute_quarterly_grant(difficulty, current_year, base=45000)`.
- `backend/app/crud/campaign.py` — `STARTING_BUDGET_CR` constant → computed, `create_campaign` uses the helper; `advance_turn` recomputes quarterly_grant_cr each turn for year-over-year growth.
- `backend/content/rd_programs.yaml` — 25 programs, `base_cost_cr × 1.5` rounded to nearest 500.
- `backend/app/engine/acquisition.py` — underfunded slip logic + new `acquisition_slipped` event.
- `backend/app/engine/rd.py` — final-quarter residual flush on program completion.
- `backend/tests/test_event_vocabulary.py` — register `acquisition_slipped`.
- `backend/tests/test_balance_simulation.py` — recalibrate assertions for new economy.
- Multiple files — `datetime.utcnow()` → `datetime.now(UTC)` sweep.
- `CLAUDE.md` — strike resolved carry-overs, add Plan 17 status line.

**No frontend changes.** Display uses existing `campaign.quarterly_grant_cr` + `campaign.budget_cr` fields.

---

## Task 1: compute_quarterly_grant helper

**Files:**
- Modify: `backend/app/engine/budget.py`
- Test: `backend/tests/test_budget_engine.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_budget_engine.py`:

```python
from app.engine.budget import compute_quarterly_grant


def test_compute_grant_realistic_2026():
    assert compute_quarterly_grant("realistic", 2026) == 45000


def test_compute_grant_difficulty_multipliers_2026():
    assert compute_quarterly_grant("relaxed",   2026) == 67500
    assert compute_quarterly_grant("realistic", 2026) == 45000
    assert compute_quarterly_grant("hard_peer", 2026) == 31500
    assert compute_quarterly_grant("worst_case", 2026) == 22500


def test_compute_grant_year_over_year_growth():
    # 3% compounded per year past 2026, rounded to nearest 1000
    assert compute_quarterly_grant("realistic", 2026) == 45000
    # 45000 * 1.03 = 46350 → rounded to 46000
    assert compute_quarterly_grant("realistic", 2027) == 46000
    # 45000 * 1.03^4 = 50643 → rounded to 51000
    assert compute_quarterly_grant("realistic", 2030) == 51000


def test_compute_grant_unknown_difficulty_defaults_realistic():
    assert compute_quarterly_grant("whatever", 2026) == 45000
```

- [ ] **Step 2: Add helper**

In `backend/app/engine/budget.py`:

```python
BASE_QUARTERLY_GRANT_CR = 45000

DIFFICULTY_GRANT_MULTIPLIER: dict[str, float] = {
    "relaxed":    1.5,
    "realistic":  1.0,
    "hard_peer":  0.7,
    "worst_case": 0.5,
}

# Defense-spending compounds ~3%/yr in line with India's long-run capex growth.
YOY_GRANT_GROWTH = 0.03


def compute_quarterly_grant(
    difficulty: str,
    current_year: int,
    base: int = BASE_QUARTERLY_GRANT_CR,
) -> int:
    mult = DIFFICULTY_GRANT_MULTIPLIER.get(difficulty, 1.0)
    years_past_start = max(0, current_year - 2026)
    raw = base * mult * (1 + YOY_GRANT_GROWTH) ** years_past_start
    # Round to nearest 1000 so grants read cleanly in the UI.
    return int(round(raw / 1000) * 1000)
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python3 -m pytest tests/test_budget_engine.py -v
```
Expected: 4 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/engine/budget.py backend/tests/test_budget_engine.py
git commit -m "feat(economy): compute_quarterly_grant helper — difficulty + YoY growth"
```

---

## Task 2: create_campaign + advance_turn use the helper

**Files:**
- Modify: `backend/app/crud/campaign.py`
- Test: `backend/tests/test_campaigns_api.py` (assertions adjust)

- [ ] **Step 1: Rewire campaign creation**

In `backend/app/crud/campaign.py`, change the `STARTING_BUDGET_CR` constant and `create_campaign`:

```python
# was: STARTING_BUDGET_CR = 620000
# Starting treasury = 1 quarter of the difficulty-adjusted grant, not 4.
# Campaigns begin cash-strapped, forcing early trade-offs.
```

And in `create_campaign`:

```python
from app.engine.budget import compute_quarterly_grant
# ...
grant = compute_quarterly_grant(payload.difficulty, 2026)
campaign = Campaign(
    name=payload.name,
    seed=seed,
    starting_year=2026,
    starting_quarter=2,
    current_year=2026,
    current_quarter=2,
    difficulty=payload.difficulty,
    objectives_json=payload.objectives,
    budget_cr=grant,                 # 1-quarter cushion
    quarterly_grant_cr=grant,
    current_allocation_json=None,
    reputation=50,
)
```

Remove the now-unused `STARTING_BUDGET_CR` constant.

- [ ] **Step 2: Recompute grant each turn for YoY growth**

In `advance_turn`, after the campaign's `current_year / current_quarter` is incremented, recompute:

```python
campaign.quarterly_grant_cr = compute_quarterly_grant(
    campaign.difficulty, campaign.current_year,
)
```

Locate the spot where `current_year` / `current_quarter` are bumped (search for `campaign.current_year =`). Insert the recompute line immediately after.

- [ ] **Step 3: Adjust existing tests that asserted the old 155000 grant**

Run `grep -rn "155000\|620000" backend/tests/` — for each hit, either:
- Replace with `compute_quarterly_grant(campaign.difficulty, campaign.current_year)`, or
- Replace with `45000` if the test is realistic-difficulty-specific.

- [ ] **Step 4: Run full suite**

```bash
cd backend && python3 -m pytest -q
```
Expected: all tests pass. Any failing assertions on old budget values must be updated to the new economy.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(economy): campaign + advance_turn use compute_quarterly_grant"
```

---

## Task 3: Bump R&D costs 1.5×

**Files:**
- Modify: `backend/content/rd_programs.yaml`

- [ ] **Step 1: Apply multiplier**

Multiply every `base_cost_cr` value by 1.5 and round to the nearest 500. Table of current → new (rounded to nearest 500):

```
amca_mk1:         150000 → 225000
amca_mk1_engine:   60000 →  90000
tejas_mk2:         50000 →  75000
tedbf:             40000 →  60000
ghatak_ucav:       25000 →  37500
astra_mk2:          8000 →  12000
astra_mk3:         15000 →  22500
rudram_2:           6000 →   9000
rudram_3:           8000 →  12000
brahmos_ng:        12000 →  18000
netra_mk2:         20000 →  30000
pralay_srbm:       10000 →  15000
tapas_uav:          8000 →  12000
amca_mk2:         200000 → 300000
su30_super:        30000 →  45000
uttam_aesa:        12000 →  18000
kaveri_engine:     25000 →  37500
maya_ew:            8000 →  12000
abhyas_lwm:        10000 →  15000
saaw:               5000 →   7500
long_range_sam:    35000 →  52500
project_kusha:     45000 →  67500
air_brahmos2:      20000 →  30000
mrsam_air:         12000 →  18000
ngarm:              9000 →  13500
```

Apply each change in `backend/content/rd_programs.yaml`.

- [ ] **Step 2: Sanity-check registry**

```bash
cd backend && python3 -c "
from app.content.registry import rd_programs
p = rd_programs()
print('amca_mk1 cost:', p['amca_mk1'].base_cost_cr)
print('astra_mk2 cost:', p['astra_mk2'].base_cost_cr)
print('total programs:', len(p))
"
```
Expected: `amca_mk1 cost: 225000`, `astra_mk2 cost: 12000`, `total programs: 25`.

- [ ] **Step 3: Commit**

```bash
git add backend/content/rd_programs.yaml
git commit -m "feat(economy): R&D program costs × 1.5 — AMCA becomes multi-year commitment"
```

---

## Task 4: Underfunded acquisition slippage

**Files:**
- Modify: `backend/app/engine/acquisition.py`
- Modify: `backend/tests/test_event_vocabulary.py`

- [ ] **Step 1: Locate the current underfunded path**

In `backend/app/engine/acquisition.py`, find the block where the resolver compares `cost > bucket_remaining` and decide delivery. Currently it emits `acquisition_underfunded` but still proceeds with delivery (leaking free airframes).

Replace with: when `cost > bucket_remaining` AND `bucket_remaining < per_qtr_cost`, **skip this quarter's delivery entirely** — no airframes added, no cost deducted, emit `acquisition_slipped` instead of delivering. Push `foc_year/foc_quarter` out by 1 quarter (on the order dict). Preserve existing `acquisition_underfunded` event when partial funding is available.

Rough shape (adapt to the actual loop you find in the file):

```python
if cost > bucket_remaining:
    if bucket_remaining < per_qtr_cost // 2:
        # Too underfunded — skip delivery this quarter, slip FOC by 1.
        order["foc_year"], order["foc_quarter"] = _add_quarters(
            order["foc_year"], order["foc_quarter"], 1,
        )
        events.append({
            "event_type": "acquisition_slipped",
            "payload": {
                "order_id": order["id"],
                "platform_id": order["platform_id"],
                "new_foc_year": order["foc_year"],
                "new_foc_quarter": order["foc_quarter"],
                "reason": "bucket_insufficient",
            },
        })
        continue  # skip the delivery block entirely
    # Partial funding — proceed but log it.
    events.append({
        "event_type": "acquisition_underfunded",
        "payload": {...existing...},
    })
```

Add the `_add_quarters` helper at module top if not already present:

```python
def _add_quarters(year: int, quarter: int, n: int) -> tuple[int, int]:
    total = (year * 4 + (quarter - 1)) + n
    return total // 4, (total % 4) + 1
```

- [ ] **Step 2: Register new event type**

In `backend/tests/test_event_vocabulary.py`, add to `CANONICAL_EVENT_TYPES`:

```python
    # Plan 17: underfunded acquisitions slip delivery instead of silent free
    "acquisition_slipped",
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python3 -m pytest -q
```
Expected: all pass. If a test relied on free-delivery-when-underfunded it needs updating.

- [ ] **Step 4: Commit**

```bash
git add backend/app/engine/acquisition.py backend/tests/test_event_vocabulary.py
git commit -m "feat(economy): underfunded acquisitions slip delivery (+ acquisition_slipped event)"
```

---

## Task 5: R&D residual flush on completion

**Files:**
- Modify: `backend/app/engine/rd.py`

- [ ] **Step 1: Flush residual on completion**

In `backend/app/engine/rd.py::tick_rd`, find the block that marks a program `completed` (when `progress_pct >= 100`). Inside that branch, before emitting the `rd_completed` event, reconcile:

```python
expected_total = int(round(spec.base_cost_cr * FUNDING_FACTORS[state["funding_level"]][0]))
residual = max(0, expected_total - state["cost_invested_cr"])
if residual > 0:
    # Flush the rounding residual into this final quarter.
    state["cost_invested_cr"] = expected_total
    # Also deduct from the bucket so the grant balances. If the bucket can't
    # cover, the grant simply goes negative by the residual — handled by the
    # existing "advance spends more than treasury" path.
    allocation_rd -= residual  # (or equivalent — the real var in tick_rd)
```

Adapt variable names to what actually exists in the function. The key invariant: after completion, `cost_invested_cr == expected_total`.

- [ ] **Step 2: Run tests**

```bash
cd backend && python3 -m pytest -q
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/engine/rd.py
git commit -m "feat(economy): flush R&D rounding residual at program completion"
```

---

## Task 6: datetime.utcnow() sweep

**Files:**
- Modify: all files under `backend/app/` using `datetime.utcnow()`

- [ ] **Step 1: List usages**

```bash
grep -rn "datetime\.utcnow\(\)" backend/app backend/tests 2>/dev/null
```

- [ ] **Step 2: Replace**

For each hit, change:
- `datetime.utcnow()` → `datetime.now(UTC)`
- Ensure the file's `from datetime import` line includes `UTC`.

- [ ] **Step 3: Run full suite**

```bash
cd backend && python3 -m pytest -q 2>&1 | grep -E "warning|passed|failed"
```
Expected: no `DeprecationWarning: datetime.utcnow` output. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "chore: datetime.utcnow() → datetime.now(UTC) across backend"
```

---

## Task 7: Rebalance test_balance_simulation assertions

**Files:**
- Modify: `backend/tests/test_balance_simulation.py`

- [ ] **Step 1: Run it and observe failure**

```bash
cd backend && python3 -m pytest tests/test_balance_simulation.py -v
```
Expected: fails on `budget_cr > -500000` (new economy means player ends the 40-turn auto-simulation much tighter).

- [ ] **Step 2: Recalibrate**

Replace the budget-floor assertion with something reasonable for the new economy:

```python
# Budget shouldn't spiral catastrophically. With ₹45k/q grant compounding
# at 3%/yr over 40 turns, cumulative grant ≈ ₹2M cr. Allow final treasury
# to dip to -2M cr — anything worse means a pricing bug.
assert campaign.budget_cr > -2_000_000, f"Budget spiraled to {campaign.budget_cr}"
```

- [ ] **Step 3: Run**

```bash
cd backend && python3 -m pytest tests/test_balance_simulation.py -v
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_balance_simulation.py
git commit -m "test(economy): rebalance 40-turn simulation floor for new grant"
```

---

## Task 8: CLAUDE.md cleanup + Plan 17 status entry

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Strike resolved carry-overs**

In the "Known carry-overs / tuning backlog" section, mark these as RESOLVED in Plan 17 (use the existing `~~...~~ **RESOLVED in Plan 17**` pattern):

- "Underfunded acquisitions are effectively free in MVP" → RESOLVED in Plan 17 via `acquisition_slipped`.
- "Integer cost rounding accumulates over long R&D programs" → RESOLVED in Plan 17 via residual flush.
- "`datetime.utcnow()` deprecation warnings" → RESOLVED in Plan 17 via sweep.
- "H-6KJ bombers have empty loadouts" → ALREADY RESOLVED (confirmed `h6kj: {bvr: [yj21, cj20]}` present); just strike it.

- [ ] **Step 2: Add Plan 17 status line**

In the "Current status" section, after the Plan 15 / Plan 16 lines, insert:

```markdown
- **Plan 17 (Economy Rebalance)** — ✅ done. Quarterly grant cut from ₹155k to ₹45k (realistic), with new difficulty multipliers (relaxed 1.5× / realistic 1.0× / hard_peer 0.7× / worst_case 0.5×) and +3%/yr YoY growth via `compute_quarterly_grant` in `engine/budget.py`. R&D program costs bumped 1.5× in `rd_programs.yaml` — AMCA Mk1 now ₹225k cr (multi-year commitment). Starting treasury = 1 quarter of grant, not 4. Underfunded acquisitions now slip delivery (new `acquisition_slipped` event) instead of silently delivering for free. R&D integer-rounding residual flushed at program completion. `datetime.utcnow()` → `datetime.now(UTC)` sweep across backend. Resolves four carry-overs from the pre-Plan-17 backlog.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Plan 17 done — economy rebalance + 3 carry-overs resolved"
```

---

## Self-Review

**1. Spec coverage.** 8 tasks map 1:1 to the economy dials confirmed with the user + the three resolved carry-overs. No gaps.

**2. Placeholder scan.** Task 4's slip-logic pseudocode says "adapt to the actual loop you find" — that's acceptable because the exact variable names in `acquisition.py` depend on the current file shape, and the implementer is expected to read the surrounding code. Task 5's pseudocode has the same caveat. All other tasks have concrete code.

**3. Type consistency.** `compute_quarterly_grant` returns `int`; both `Campaign.quarterly_grant_cr` and `Campaign.budget_cr` are `int` columns — matches. `acquisition_slipped` event payload follows the same shape as `acquisition_underfunded` (order_id / platform_id + reason). `CANONICAL_EVENT_TYPES` updated.

---

## Execution

Committed directly to `main` per user preference. Subagent-driven execution for mechanical tasks (1-7), controller finalizes docs (Task 8) + deploys.
