# Engagement Mode E1 (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend support for interactive engagements: commit with `mode="interactive"` puts a vignette into an `engaged` state and serves a battle briefing; a result endpoint accepts the player-flight outcome, validates plausibility caps, resolves the residual force through the existing seeded resolver, and merges everything into the normal vignette outcome flow.

**Architecture:** All new pure logic lives in `app/engine/engagement.py` (briefing assembly, caps validation, residual-force computation, outcome merge — fully unit-tested). `app/crud/vignette.py` gains a thin `submit_engagement_result` that orchestrates DB effects by mirroring the existing `commit_vignette` side-effect blocks. Determinism: the interactive result is a recorded action; the auto path is untouched (byte-identical).

**Spec:** `docs/superpowers/specs/2026-07-02-engagement-mode-design.md`. **Deviation from spec (deliberate):** instead of auto-resolving abandoned `engaged` vignettes on turn advance, `engaged` joins `pending` in the turn-advance backpressure check, and commit is allowed FROM `engaged` (player can re-enter or fall back to auto-resolve). Simpler, zero determinism risk, no stuck campaigns.

**Grounding (verified in code):**
- `app/crud/vignette.py::commit_vignette` — validation block (lines ~71–107), resolver call with `ps_with_stock` + stock persistence, readiness-cost block, loss-deduction block, outcome/event/AAR persistence. Reuse these shapes.
- Resolver objective rule (`app/engine/vignette/resolver.py` ~383): `objective_met = adv_kia >= threshold["adv_kills_min"] and ind_kia <= threshold["ind_losses_max"]`; threshold comes from the scenario objective's `success_threshold` (see `content/scenario_templates.yaml`).
- Loadouts: `app/engine/vignette/bvr.py::PLATFORM_LOADOUTS` and `WEAPONS` (unit costs).
- Depot stock: `MissileStock(campaign_id, base_id, weapon_id, stock)`.
- Backpressure: `app/crud/campaign.py` ~152 filters `Vignette.status == "pending"`.
- Schemas: `app/schemas/vignette.py` (`VignetteStatus`, `VignetteCommitPayload`).
- Tests: in-memory SQLite + StaticPool fixture pattern (`backend/tests/test_campaigns_api.py`); canonical event types pinned in `tests/test_event_vocabulary.py` (no new event type needed — `vignette_resolved` gains `"interactive": true` in payload).

**Test baseline:** backend 681. All tasks TDD. Commit to `main` after each task.

---

### Task 1: Schemas — `engaged` status, commit `mode`, engagement payloads

**Files:** modify `backend/app/schemas/vignette.py`; test `backend/tests/test_engagement_schemas.py`

- [ ] Failing test:

```python
from app.schemas.vignette import (
    EngagementResultPayload, VignetteCommitPayload, VignetteRead,
)


def test_commit_payload_mode_defaults_to_auto():
    p = VignetteCommitPayload(squadrons=[], roe="weapons_free")
    assert p.mode == "auto"


def test_commit_payload_accepts_interactive():
    p = VignetteCommitPayload(mode="interactive", roe="weapons_free")
    assert p.mode == "interactive"


def test_engagement_result_payload_shape():
    r = EngagementResultPayload(
        player_squadron_id=3,
        flight_kills={"jf17_blk3": 2},
        flight_losses=1,
        munitions_expended={"astra_mk1": 3},
        flares_used=2,
        disengaged=False,
    )
    assert r.flight_kills["jf17_blk3"] == 2
    assert r.flight_losses == 1


def test_vignette_read_accepts_engaged_status():
    # Literal must include "engaged"
    v = VignetteRead(
        id=1, year=2026, quarter=2, scenario_id="s", status="engaged",
        planning_state={}, committed_force=None, event_trace=[], aar_text="",
        outcome={}, resolved_at=None,
    )
    assert v.status == "engaged"
```

- [ ] Implement: `VignetteStatus = Literal["pending", "engaged", "resolved"]`; add `mode: Literal["auto", "interactive"] = "auto"` to `VignetteCommitPayload`; add:

```python
class EngagementResultPayload(BaseModel):
    player_squadron_id: int
    flight_kills: dict[str, int] = Field(default_factory=dict)   # platform_id -> count
    flight_losses: int = Field(ge=0, default=0)
    munitions_expended: dict[str, int] = Field(default_factory=dict)  # weapon_id -> count
    flares_used: int = Field(ge=0, default=0)
    disengaged: bool = False


class EngagementBriefingResponse(BaseModel):
    vignette_id: int
    ao: dict
    roe: str
    support: dict
    time_budget_s: int
    flare_stock: int
    player_squadrons: list[dict]
    adversary: list[dict]
```

- [ ] Run: `cd backend && python -m pytest tests/test_engagement_schemas.py -q` → pass; full suite green; commit `feat(engagement): schemas — engaged status, commit mode, result/briefing payloads`.

### Task 2: Pure briefing assembler (TDD)

**Files:** create `backend/app/engine/engagement.py`; test `backend/tests/test_engagement_briefing.py`

- [ ] `build_briefing(ps, committed_force, squadron_rows, depot_stock, platform_specs, loadouts, flare_stock=6) -> dict`:
  - `squadron_rows`: list of dicts `{id, call_sign, platform_id, base_id, strength}` for committed squadrons (crud supplies from ORM).
  - `depot_stock`: `{(base_id, weapon_id): stock}`.
  - `platform_specs`: `{platform_id: {"radar_range_km": .., "rcs_band": .., "generation": ..}}`.
  - Output `player_squadrons`: per committed squadron — id, call_sign, platform_id, airframes_committed (from committed_force), radar_range_km, loadout weapon ids (bvr+wvr from `loadouts`), `depot`: {weapon_id: stock at that squadron's base for weapons in its loadout}.
  - `adversary`: pass through `ps["adversary_force"]` entries (platform, count, role) — plus `ps.get("adversary_force_observed")` if present as `observed` (fog handled client-side in E2/E3).
  - `time_budget_s`: 150 if `committed_force["support"]["tanker"]` else 100. `flare_stock` param. `ao`, `roe` from ps/committed_force.
- [ ] Tests: briefing lists only committed squadrons; depot filtered to loadout weapons at the right base; tanker flips time budget; adversary passthrough. TDD, then commit `feat(engagement): pure briefing assembler`.

### Task 3: Pure caps validation + residual forces + outcome merge (TDD — the meat)

**Files:** extend `backend/app/engine/engagement.py`; test `backend/tests/test_engagement_merge.py`

- [ ] `class EngagementResultError(Exception)` and:

```python
def validate_result(result: dict, ps: dict, committed_force: dict, depot_stock: dict,
                    squadron_rows: list[dict], loadouts: dict, flare_stock: int = 6) -> None
```
  Raises `EngagementResultError` unless: `player_squadron_id` is among committed squadrons; `flight_losses <= min(4, committed airframes for that squadron)`; per-platform `flight_kills[p] <= count of p in ps["adversary_force"]` and total kills ≤ adversary total; each `munitions_expended` weapon is in the player squadron's loadout AND count ≤ depot stock at its base; `flares_used <= flare_stock`; all counts ≥ 0.

- [ ] `residual_forces(ps, committed_force, result) -> tuple[dict, dict]`:
  - Residual planning state: deep-copied `ps` with `adversary_force` counts reduced by `flight_kills` (entries hitting 0 removed).
  - Residual committed force: deep-copied `committed_force` with the player squadron's airframes reduced by `min(4, its committed airframes)` (the flight the player flew — those airframes don't fight twice); squadron entries at 0 airframes removed.

- [ ] `merge_outcomes(result, residual_outcome, ps, flight_airframes) -> dict`:
  - `player_adv_kia = sum(flight_kills.values())`; `player_ind_kia = flight_losses`.
  - Sum with residual outcome's `adv_kia`/`ind_kia`/`*_airframes_lost` (residual outcome may be `None` when both residual forces are empty → treat as zeros with `objective_met` recomputed).
  - Recompute `objective_met` with the resolver's rule on MERGED totals: `threshold = ps["objective"].get("success_threshold", {})`; `met = adv_kia_total >= threshold.get("adv_kills_min", 0) and ind_kia_total <= threshold.get("ind_losses_max", 10**6)`.
  - Merge `munitions_expended` lists (player entries priced via `WEAPONS[..]["unit_cost_cr"]`, hits unknown → `hits` = kills capped by launches of that weapon's class? NO — keep honest: player entries carry `{"weapon", "count", "unit_cost_cr", "line_total_cr"}` without a hits field); `munitions_cost_total_cr` summed.
  - Carry `roe`, `support` from committed_force; add `"interactive": True` and `"disengaged": result["disengaged"]`.
- [ ] Tests (≥8): caps rejections (each rule), residual reduction math (kills remove adversary entries; player flight airframes removed), merge totals, objective threshold from ps, zero-residual path, munitions pricing. Commit `feat(engagement): caps validation, residual forces, outcome merge (pure)`.

### Task 4: CRUD — interactive commit branch + `submit_engagement_result`

**Files:** modify `backend/app/crud/vignette.py`; test `backend/tests/test_engagement_crud.py` (use the in-memory fixture pattern; build a small campaign via existing test helpers — copy the minimal setup from `tests/test_vignettes_api.py`)

- [ ] In `commit_vignette`: after the existing validation block (squadrons/range/roe — reuse as-is, do NOT duplicate), add:

```python
if committed_force.get("mode") == "interactive":
    if is_non_combat(ps.get("objective", {})):
        raise CommitValidationError("interactive mode is only available for combat vignettes")
    vignette.status = "engaged"
    vignette.committed_force = committed_force
    db.commit()
    db.refresh(vignette)
    return vignette
```
  (Placed AFTER validation so an interactive commit is validated identically; before the non-combat routing.) Also relax the top guard to allow re-commit from `engaged`: `if vignette.status not in ("pending", "engaged"): raise AlreadyResolvedError(...)` — a re-commit with `mode="auto"` (or omitted) falls through to the normal resolve path.

- [ ] New `submit_engagement_result(db, campaign, vignette, result: dict) -> Vignette`:
  1. Guard `vignette.status == "engaged"` else `AlreadyResolvedError`.
  2. Assemble `squadron_rows` (committed squadrons via `db.get(Squadron, ...)`), `depot_stock` from `MissileStock`, loadouts from `PLATFORM_LOADOUTS`; `validate_result(...)` → map `EngagementResultError` upward.
  3. `ps_res, cf_res = residual_forces(ps, vignette.committed_force, result)`.
  4. If residual committed squadrons AND residual adversary both non-empty → run the existing resolver block (same `platforms_dict` + `ps_with_stock` construction as auto path, seeded `campaign.seed/year/quarter`) → `residual_outcome, residual_trace`; persist missile/battery stock decrements exactly as the auto path does. Else `residual_outcome, residual_trace = None, []`.
  5. Decrement depot stock for the PLAYER's `munitions_expended` (player squadron's base rows; floor 0).
  6. `outcome = merge_outcomes(result, residual_outcome, ps, flight_airframes)`.
  7. Apply the SAME readiness-cost block as auto (ind_total from committed_force); deduct residual losses per `residual_trace` kill events (same block) AND deduct `flight_losses` from the player squadron's `strength`.
  8. `event_trace = [{"t_min": 0, "kind": "engagement_player_flight", **result}] + residual_trace`; status resolved, `committed_force` unchanged, AAR text mentions the flown flight; `vignette_resolved` event with `"interactive": True` in payload (plus the `munitions_cost` event when > 0, same as auto).
- [ ] Tests (≥6): happy path resolves + merges; caps rejection surfaces; stock decremented for player munitions; player losses hit squadron strength; zero-residual (player killed everything) still resolves with objective rule; auto path regression — a plain commit on an untouched campaign produces byte-identical outcome to before (assert against a captured pre-change fingerprint OR simply that existing vignette tests stay green). Commit `feat(engagement): interactive commit branch + engagement result resolution`.

### Task 5: API endpoints

**Files:** modify `backend/app/api/vignettes.py`; test `backend/tests/test_engagement_api.py`

- [ ] `GET /{campaign_id}/vignettes/{vignette_id}/engagement-briefing` (response `EngagementBriefingResponse`): 404 unknown; 409 unless status `engaged`; assembles inputs (same as crud step 2) and returns `build_briefing(...)`.
- [ ] `POST /{campaign_id}/vignettes/{vignette_id}/engagement-result` (response `VignetteRead`): maps `EngagementResultError`/`CommitValidationError` → 422, `AlreadyResolvedError` → 409; calls `submit_engagement_result`.
- [ ] Commit endpoint: no signature change needed (payload already carries `mode`); returned `VignetteRead` now surfaces `engaged`.
- [ ] Tests: interactive commit → status engaged; briefing returns committed squadrons + depots; result → resolved with merged outcome; briefing/result on wrong status → 409; caps violation → 422. Router-protection sweep (`test_router_protection_sweep.py`) covers the new routes automatically because they're on the campaign-scoped router — confirm it passes. Commit `feat(engagement): briefing + result endpoints`.

### Task 6: Turn-advance backpressure includes `engaged`

**Files:** modify `backend/app/crud/campaign.py` (~line 152 filter); test: extend `backend/tests/test_engagement_crud.py`

- [ ] Change the pending-vignette existence filter to `Vignette.status.in_(["pending", "engaged"])` (both places if the status filter appears more than once for backpressure — grep first).
- [ ] Test: campaign with an `engaged` vignette cannot advance the turn (same error/flag as pending). Commit `feat(engagement): engaged vignettes block turn advance (no stuck campaigns, no silent auto-resolve)`.

### Task 7: Replay determinism extension

**Files:** extend `backend/tests/test_replay_determinism.py`

- [ ] New test: two independent in-memory DBs, same seed, same actions, where the vignette is resolved via `commit(mode="interactive")` + identical `submit_engagement_result` payloads → identical campaign fingerprints. Also assert the existing auto-path determinism test still passes untouched. Commit `test(engagement): replay determinism holds for recorded interactive results`.

### Task 8 (controller): Full verification + docs

- [ ] `python -m pytest -q` → **~710+ tests** green (681 baseline + ~30 new). Frontend untouched (`npm run test` stays 283).
- [ ] Update ROADMAP note + CLAUDE.md status (E1 done, E2/E3 remaining); spec sequencing table mark E1 ✅ with the backpressure deviation noted. Commit `docs(engagement): E1 backend done`.

## Self-review notes
- Spec coverage: commit mode + engaged state (T1/T4), briefing (T2/T5), caps (T3), residual resolve + merge (T3/T4), recorded-outcome determinism (T7), no-stuck-campaigns (T6, deviation documented), auto path untouched (T4 regression + T7).
- Type consistency: `EngagementResultPayload` field names match `validate_result`/`merge_outcomes` dict keys (`player_squadron_id`, `flight_kills`, `flight_losses`, `munitions_expended`, `flares_used`, `disengaged`) across T1/T3/T4/T5.
- Risk pinned: resolver reuse for residual is the same code path as auto — no resolver edits anywhere in this plan.
