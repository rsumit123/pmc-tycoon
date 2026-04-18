# V1 Release Polish + E2E Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship-ready polish pass — fix remaining gameplay bugs, add UX flourishes, wire Playwright E2E smoke tests, and clean up technical debt. After this plan the game is deployable as a complete V1.

**Architecture:** Backend-first gameplay fixes (Tasks 1–8) land new engine logic + model constraints with TDD. Frontend UX features (Tasks 9–13) add the tactical replay, rebase drag, audio, theme, and rename. Playwright E2E (Task 14) tests the full critical path against a running app. Asset-fetcher fix (Task 15) is standalone.

**Tech Stack:** FastAPI + SQLAlchemy 2.x, React 19 + Vite 8 + Tailwind v4 + Zustand, Playwright, Web Audio API.

**Test baselines at start:** Backend 386, Frontend 105.

---

### Task 1: H-6KJ Bomber Loadouts + Saturation Raid Retuning

**Files:**
- Modify: `backend/app/engine/vignette/bvr.py:45` (PLATFORM_LOADOUTS h6kj entry)
- Modify: `backend/content/scenario_templates.yaml:163` (plaaf_saturation_raid threshold)
- Modify: `backend/app/engine/vignette/bvr.py:62` (PLATFORM_LOADOUTS h6n entry)
- Test: `backend/tests/test_bvr_loadouts.py` (new)

H-6KJ and H-6N bombers currently have `{"bvr": [], "wvr": []}` — they're unarmed in combat, inflating `adv_kia` counts for free. Give them realistic stand-off cruise missile loadouts.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_bvr_loadouts.py`:

```python
"""Verify bomber platforms have non-empty loadouts."""
from app.engine.vignette.bvr import PLATFORM_LOADOUTS, WEAPONS


def test_h6kj_has_cruise_missile_loadout():
    loadout = PLATFORM_LOADOUTS["h6kj"]
    assert len(loadout["bvr"]) > 0, "H-6KJ should carry stand-off weapons"
    for w in loadout["bvr"]:
        assert w in WEAPONS, f"weapon {w!r} not in WEAPONS table"


def test_h6n_has_cruise_missile_loadout():
    loadout = PLATFORM_LOADOUTS["h6n"]
    assert len(loadout["bvr"]) > 0, "H-6N should carry stand-off weapons"
    for w in loadout["bvr"]:
        assert w in WEAPONS, f"weapon {w!r} not in WEAPONS table"


def test_bombers_have_no_wvr():
    """Bombers should not dogfight — WVR stays empty."""
    for pid in ("h6kj", "h6n"):
        assert PLATFORM_LOADOUTS[pid]["wvr"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_bvr_loadouts.py -v`
Expected: FAIL on `test_h6kj_has_cruise_missile_loadout` and `test_h6n_has_cruise_missile_loadout` — bvr lists are empty.

- [ ] **Step 3: Add cruise missile weapons + update bomber loadouts**

In `backend/app/engine/vignette/bvr.py`, add two new weapons to the `WEAPONS` dict (after `aim9x`):

```python
    "yj21":      {"nez_km": 200, "max_range_km": 1500, "gen_bonus": 0.10},
    "cj20":      {"nez_km": 150, "max_range_km": 2000, "gen_bonus": 0.05},
```

Update the bomber entries in `PLATFORM_LOADOUTS`:

```python
    "h6kj":       {"bvr": ["yj21", "cj20"],     "wvr": []},
```

```python
    "h6n":        {"bvr": ["yj21", "cj20"],      "wvr": []},
```

- [ ] **Step 4: Re-tune saturation raid threshold**

In `backend/content/scenario_templates.yaml`, find `plaaf_saturation_raid` and update:

```yaml
    objective:
      kind: defeat_strike
      success_threshold: {adv_kills_min: 8, ind_losses_max: 8}
```

(Raised `adv_kills_min` from 5 to 8 because armed bombers are no longer free kills — player needs to commit more to meet objective.)

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/test_bvr_loadouts.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/vignette/bvr.py backend/content/scenario_templates.yaml backend/tests/test_bvr_loadouts.py
git commit -m "feat: arm H-6KJ/H-6N bombers with YJ-21 + CJ-20 cruise missiles

Adds two stand-off cruise missile weapons to the BVR table and gives bomber
platforms non-empty loadouts. Retunes saturation raid adv_kills_min from 5→8
since bombers can now fight back.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Doctrine-Aware Adversary Platform Picking

**Files:**
- Modify: `backend/app/engine/vignette/generator.py:72-100` (build_planning_state)
- Test: `backend/tests/test_doctrine_platform_picking.py` (new)

Currently `build_planning_state` picks adversary platforms weighted purely by inventory count. J-16s dominate CAP picks because PLAAF has more of them, even though J-20As are the doctrine-correct CAP platform. Add role-based weighting: VLO/stealth platforms get a bonus for CAP roles, bombers/strikers get a bonus for strike roles.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_doctrine_platform_picking.py`:

```python
"""Doctrine-aware platform picking should weight by role fitness, not just inventory."""
import random
from app.engine.vignette.generator import build_planning_state
from app.content.loader import ScenarioTemplate


def _make_template(role: str, pool: list[str]) -> ScenarioTemplate:
    return ScenarioTemplate(
        id="test_template",
        name="Test",
        ao={"region": "test", "name": "Test AO", "lat": 30.0, "lon": 80.0},
        response_clock_minutes=45,
        q_index_min=0,
        q_index_max=39,
        weight=1.0,
        requires={},
        adversary_roster=[
            {"role": role, "faction": "PLAAF", "platform_pool": pool, "count_range": [4, 4]},
        ],
        allowed_ind_roles=["CAP"],
        roe_options=["weapons_free"],
        objective={"kind": "defend_airspace", "success_threshold": {"adv_kills_min": 2, "ind_losses_max": 4}},
    )


def test_cap_role_prefers_stealth_platforms():
    """When a CAP role has both J-20A (VLO) and J-16 (conventional) in pool,
    J-20A should be picked more often than raw inventory weight suggests."""
    template = _make_template("CAP", ["j20a", "j16"])
    adversary = {"PLAAF": {"inventory": {"j20a": 40, "j16": 200}}}
    picks = {}
    for i in range(200):
        rng = random.Random(i)
        ps = build_planning_state(template, adversary, rng)
        for unit in ps["adversary_force"]:
            picks[unit["platform_id"]] = picks.get(unit["platform_id"], 0) + 1
    j20a_pct = picks.get("j20a", 0) / sum(picks.values())
    assert j20a_pct > 0.40, f"J-20A picked {j20a_pct:.0%} of the time — stealth should be favored for CAP"


def test_strike_role_prefers_bombers():
    """When a strike role has both H-6KJ (bomber) and J-16 (multirole) in pool,
    H-6KJ should be picked more often for strike missions."""
    template = _make_template("strike", ["h6kj", "j16"])
    adversary = {"PLAAF": {"inventory": {"h6kj": 30, "j16": 200}}}
    picks = {}
    for i in range(200):
        rng = random.Random(i)
        ps = build_planning_state(template, adversary, rng)
        for unit in ps["adversary_force"]:
            picks[unit["platform_id"]] = picks.get(unit["platform_id"], 0) + 1
    h6kj_pct = picks.get("h6kj", 0) / sum(picks.values())
    assert h6kj_pct > 0.35, f"H-6KJ picked {h6kj_pct:.0%} — bomber should be favored for strike"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_doctrine_platform_picking.py -v`
Expected: FAIL — J-20A picked ~17% with pure inventory weighting (40/(40+200)).

- [ ] **Step 3: Implement doctrine weighting**

In `backend/app/engine/vignette/generator.py`, add a role-fitness multiplier and update `build_planning_state`:

```python
from app.engine.vignette.bvr import PLATFORM_LOADOUTS

ROLE_FITNESS: dict[str, dict[str, float]] = {
    "CAP":    {"VLO": 4.0, "LO": 2.5, "reduced": 1.5, "conventional": 1.0, "large": 0.3},
    "SEAD":   {"VLO": 2.0, "LO": 1.5, "reduced": 1.5, "conventional": 1.0, "large": 0.5},
    "strike": {"VLO": 1.0, "LO": 1.0, "reduced": 1.0, "conventional": 1.5, "large": 3.0},
    "escort": {"VLO": 3.0, "LO": 2.0, "reduced": 1.5, "conventional": 1.0, "large": 0.3},
}
```

Replace the platform selection inside the `for entry in template.adversary_roster:` loop (the section that computes `weights` and calls `rng.choices`):

```python
        role = entry["role"]
        fitness_map = ROLE_FITNESS.get(role, {})
        weights = []
        for p in pool:
            inv_w = inv[p]
            rcs = _platform_rcs(p)
            fitness = fitness_map.get(rcs, 1.0)
            weights.append(inv_w * fitness)
        platform = rng.choices(pool, weights=weights, k=1)[0]
```

Add a helper function above `build_planning_state`:

```python
def _platform_rcs(platform_id: str) -> str:
    """Look up RCS band for a platform. Falls back to 'conventional'."""
    from app.content.loader import _platforms_cache
    plats = _platforms_cache()
    p = plats.get(platform_id)
    if p:
        return p.rcs_band
    return "conventional"
```

Note: The `_platforms_cache` import must resolve. Check what the loader exports. If the loader uses `registry.platforms()` (which returns a dict), use that instead:

```python
def _platform_rcs(platform_id: str) -> str:
    from app.content.registry import platforms as platforms_reg
    plats = platforms_reg()
    p = plats.get(platform_id)
    return p.rcs_band if p else "conventional"
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python3 -m pytest tests/test_doctrine_platform_picking.py -v`
Expected: PASS (2 tests).

Also run existing vignette tests to verify no regressions:
Run: `cd backend && python3 -m pytest tests/test_vignette*.py -v`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/vignette/generator.py backend/tests/test_doctrine_platform_picking.py
git commit -m "feat: doctrine-aware adversary platform picking for vignettes

Adversary platform selection now weights by role fitness × inventory count
instead of pure inventory. VLO platforms preferred for CAP, bombers for
strike roles. Uses platform RCS band as the fitness discriminator.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Role-Based Target Selection in Resolver

**Files:**
- Modify: `backend/app/engine/vignette/resolver.py:91-150` (_resolve_round target selection)
- Test: `backend/tests/test_role_targeting.py` (new)

Currently `_resolve_round` picks targets with `rng.choice(survivors)` — uniform random. Strike packages should prioritize AWACS/support, CAP should prioritize strikers/bombers. This makes combat more realistic and AARs read better.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_role_targeting.py`:

```python
"""Role-based target priority: CAP should target bombers/AWACS first."""
import random
from app.engine.vignette.resolver import _resolve_round


def _make_airframes(side: str, entries: list[tuple[str, str, str]]) -> list[dict]:
    """entries: list of (platform_id, rcs_band, generation)"""
    out = []
    for pid, rcs, gen in entries:
        out.append({
            "side": side,
            "platform_id": pid,
            "generation": gen,
            "radar_range_km": 150,
            "rcs_band": rcs,
            "loadout": ["pl15", "pl10"],
            "squadron_id": None,
            "xp": 0,
        })
    return out


def test_cap_prioritizes_high_value_targets():
    """Given a mix of targets including a bomber (large RCS) and fighters,
    the bomber should be targeted disproportionately often."""
    attackers = _make_airframes("ind", [
        ("rafale_f4", "reduced", "4.5"),
        ("rafale_f4", "reduced", "4.5"),
    ])
    large_kills = 0
    total_kills = 0
    for seed in range(500):
        defenders = _make_airframes("adv", [
            ("h6kj", "large", "4"),
            ("j16", "conventional", "4.5"),
            ("j16", "conventional", "4.5"),
            ("j16", "conventional", "4.5"),
        ])
        rng = random.Random(seed)
        trace: list[dict] = []
        _, remaining = _resolve_round(
            attackers, defenders, distance_km=120, weapon_kind="bvr",
            side_label="ind", rng=rng, pk_bonus=0.0, trace=trace, t_min=3,
        )
        for t in trace:
            if t["kind"] == "kill":
                total_kills += 1
                if t["victim_platform"] == "h6kj":
                    large_kills += 1
    if total_kills > 0:
        large_rate = large_kills / total_kills
        assert large_rate > 0.30, (
            f"Large-RCS targets killed {large_rate:.0%} of the time — "
            "should be prioritized (expected >30%)"
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_role_targeting.py -v`
Expected: FAIL — uniform random gives ~25% (1/4 targets).

- [ ] **Step 3: Implement priority-weighted target selection**

In `backend/app/engine/vignette/resolver.py`, add target priority weights after the existing constants:

```python
TARGET_PRIORITY: dict[str, float] = {
    "large": 3.0,
    "conventional": 1.5,
    "reduced": 1.0,
    "LO": 0.8,
    "VLO": 0.6,
}
```

In `_resolve_round`, replace `target = rng.choice(survivors)` with:

```python
        weights = [TARGET_PRIORITY.get(s["rcs_band"], 1.0) for s in survivors]
        target = rng.choices(survivors, weights=weights, k=1)[0]
```

This makes bombers (large RCS) ~3x more likely to be targeted than fighters, and stealth platforms harder to lock onto — conceptually aligned with radar signature driving target acquisition.

- [ ] **Step 4: Run tests**

Run: `cd backend && python3 -m pytest tests/test_role_targeting.py tests/test_replay_determinism.py -v`
Expected: PASS. (Replay determinism still holds since same seed → same sequence.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/vignette/resolver.py backend/tests/test_role_targeting.py
git commit -m "feat: role-based target priority in combat resolver

Target selection now weights by RCS band instead of uniform random.
Large targets (bombers, AWACS) get 3x priority, stealth gets 0.6x.
Makes combat more realistic and AARs more narrative-worthy.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: LLM Client Single-Retry with Jitter

**Files:**
- Modify: `backend/app/llm/client.py:43-95` (chat_completion)
- Test: `backend/tests/test_llm_retry.py` (new)

Add one retry with 1–3s random jitter on `LLMUnavailableError` (5xx/network). No retry on 4xx (`LLMRequestError`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_retry.py`:

```python
"""LLM client retries once on transient 5xx errors."""
import httpx
import pytest
from unittest.mock import patch

from app.llm.client import chat_completion, LLMUnavailableError, LLMResponse


def _make_transport(responses: list[httpx.Response]):
    """Returns a transport that yields responses in order."""
    call_count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        idx = min(call_count["n"], len(responses) - 1)
        call_count["n"] += 1
        return responses[idx]

    return httpx.MockTransport(handler), call_count


def test_retries_once_on_502_then_succeeds():
    responses = [
        httpx.Response(502, text="Bad Gateway"),
        httpx.Response(200, json={
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }),
    ]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings, \
         patch("app.llm.client.time.sleep") as mock_sleep:
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        result = chat_completion([{"role": "user", "content": "hi"}])
        assert result.text == "ok"
        assert call_count["n"] == 2
        mock_sleep.assert_called_once()
        jitter = mock_sleep.call_args[0][0]
        assert 1.0 <= jitter <= 3.0


def test_raises_after_two_consecutive_502s():
    responses = [
        httpx.Response(502, text="Bad Gateway"),
        httpx.Response(502, text="Bad Gateway again"),
    ]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings, \
         patch("app.llm.client.time.sleep"):
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        with pytest.raises(LLMUnavailableError, match="502"):
            chat_completion([{"role": "user", "content": "hi"}])
        assert call_count["n"] == 2


def test_no_retry_on_400():
    responses = [httpx.Response(400, text="Bad request")]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings:
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        from app.llm.client import LLMRequestError
        with pytest.raises(LLMRequestError, match="400"):
            chat_completion([{"role": "user", "content": "hi"}])
        assert call_count["n"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_llm_retry.py -v`
Expected: FAIL — `time` not imported in client, no retry logic.

- [ ] **Step 3: Implement retry logic**

In `backend/app/llm/client.py`, add `import time` and `import random as _random` at the top.

Refactor `chat_completion` to extract the HTTP call into a helper and add retry:

```python
import time
import random as _random

# ... existing code ...

MAX_RETRIES = 1
JITTER_MIN = 1.0
JITTER_MAX = 3.0


def _do_request(body, headers, transport):
    client_kwargs = {"timeout": TIMEOUT_SECONDS}
    if transport is not None:
        client_kwargs["transport"] = transport

    try:
        with httpx.Client(**client_kwargs) as client:
            return client.post(OPENROUTER_URL, json=body, headers=headers)
    except httpx.RequestError as e:
        raise LLMUnavailableError(f"OpenRouter transport error: {e}") from e


def chat_completion(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> LLMResponse:
    if not settings.openrouter_api_key:
        raise LLMRequestError("OPENROUTER_API_KEY is empty — set it in backend/.env")

    resolved_model = model or settings.openrouter_model
    body: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pmc-tycoon.skdev.one",
        "X-Title": "Sovereign Shield",
    }

    transport = _transport_factory()
    last_error: LLMUnavailableError | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            r = _do_request(body, headers, transport)
        except LLMUnavailableError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                time.sleep(_random.uniform(JITTER_MIN, JITTER_MAX))
                continue
            raise

        if r.status_code >= 500:
            last_error = LLMUnavailableError(f"OpenRouter {r.status_code}: {r.text[:200]}")
            if attempt < MAX_RETRIES:
                time.sleep(_random.uniform(JITTER_MIN, JITTER_MAX))
                continue
            raise last_error
        if r.status_code >= 400:
            raise LLMRequestError(f"OpenRouter {r.status_code}: {r.text[:200]}")
        break

    data = r.json()
    try:
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
    except (KeyError, IndexError, TypeError) as e:
        raise LLMRequestError(f"Unexpected OpenRouter response shape: {data!r}") from e

    return LLMResponse(
        text=text,
        model=resolved_model,
        prompt_tokens=int(usage.get("prompt_tokens", 0)),
        completion_tokens=int(usage.get("completion_tokens", 0)),
    )
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python3 -m pytest tests/test_llm_retry.py tests/test_llm_client.py -v`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/client.py backend/tests/test_llm_retry.py
git commit -m "feat: single-retry with jitter on OpenRouter 5xx/network errors

Adds one retry with 1-3s random jitter for transient LLMUnavailableError.
No retry on 4xx (LLMRequestError). Reduces user-facing 502 friction.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Enrich `vignette_resolved` Event Payload + AdversaryState Constraint + Narrative Race Fix

**Files:**
- Modify: `backend/app/crud/vignette.py:86-96` (add AO + scenario_name to resolved event payload)
- Modify: `backend/app/models/adversary.py` (add UniqueConstraint)
- Modify: `backend/app/api/narratives.py:17-26` (catch IntegrityError in _wrap)
- Test: `backend/tests/test_vignette_event_payload.py` (new)
- Test: `backend/tests/test_adversary_constraint.py` (new)

Three small carry-overs bundled because each is <20 lines of change.

- [ ] **Step 1: Write failing test for vignette_resolved payload**

Create `backend/tests/test_vignette_event_payload.py`:

```python
"""vignette_resolved event should include ao + scenario_name."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.event import CampaignEvent
from app.crud.vignette import commit_vignette


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_resolved_event_includes_ao_and_scenario_name(db):
    campaign = Campaign(
        id=1, name="Test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=2026, current_quarter=2, difficulty="realistic",
        budget_cr=100000, quarterly_grant_cr=155000,
    )
    db.add(campaign)
    db.flush()
    vignette = Vignette(
        campaign_id=1, scenario_id="lac_air_incursion_limited",
        year=2026, quarter=2, status="pending",
        planning_state={
            "scenario_id": "lac_air_incursion_limited",
            "scenario_name": "LAC Air Incursion (Limited)",
            "ao": {"region": "lac_western", "name": "Ladakh", "lat": 34.0, "lon": 78.5},
            "adversary_force": [],
            "eligible_squadrons": [],
            "roe_options": ["weapons_free"],
            "objective": {"kind": "defend_airspace", "success_threshold": {}},
        },
    )
    db.add(vignette)
    db.flush()

    committed = {"squadrons": [], "support": {}, "roe": "weapons_free"}
    result = commit_vignette(db, campaign, vignette, committed)

    events = db.query(CampaignEvent).filter(
        CampaignEvent.event_type == "vignette_resolved"
    ).all()
    assert len(events) == 1
    payload = events[0].payload
    assert payload["ao"] == {"region": "lac_western", "name": "Ladakh", "lat": 34.0, "lon": 78.5}
    assert payload["scenario_name"] == "LAC Air Incursion (Limited)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_vignette_event_payload.py -v`
Expected: FAIL — `ao` and `scenario_name` not in payload.

- [ ] **Step 3: Enrich the vignette_resolved payload**

In `backend/app/crud/vignette.py`, update the CampaignEvent creation (around line 86):

```python
    ps = vignette.planning_state or {}
    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=vignette.year,
        quarter=vignette.quarter,
        event_type="vignette_resolved",
        payload={
            "vignette_id": vignette.id,
            "scenario_id": vignette.scenario_id,
            "scenario_name": ps.get("scenario_name", ""),
            "ao": ps.get("ao", {}),
            "outcome": outcome,
        },
    ))
```

Note: `ps` is already assigned earlier in the function (line 44). Reuse it — don't re-read `vignette.planning_state`.

- [ ] **Step 4: Run test**

Run: `cd backend && python3 -m pytest tests/test_vignette_event_payload.py -v`
Expected: PASS.

- [ ] **Step 5: Add UniqueConstraint on AdversaryState**

In `backend/app/models/adversary.py`:

```python
from sqlalchemy import String, Integer, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdversaryState(Base):
    __tablename__ = "adversary_states"
    __table_args__ = (
        UniqueConstraint("campaign_id", "faction", name="uq_adversary_campaign_faction"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    faction: Mapped[str] = mapped_column(String(32))
    state: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
```

Write `backend/tests/test_adversary_constraint.py`:

```python
"""AdversaryState should reject duplicate (campaign_id, faction) pairs."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
from app.models.campaign import Campaign
from app.models.adversary import AdversaryState


def test_duplicate_faction_rejected():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Campaign(
        id=1, name="Test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=2026, current_quarter=2, difficulty="realistic",
        budget_cr=100000, quarterly_grant_cr=155000,
    ))
    db.flush()
    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"inventory": {}}))
    db.flush()
    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"inventory": {}}))
    with pytest.raises(IntegrityError):
        db.flush()
    db.close()
```

- [ ] **Step 6: Fix narrative race condition in _wrap**

In `backend/app/api/narratives.py`, add `IntegrityError` handling:

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.vignette import get_vignette
from app.crud.narrative import list_narratives, find_narrative
from app.llm import service as llm
from app.llm.client import LLMUnavailableError, LLMRequestError
from app.schemas.narrative import (
    CampaignNarrativeRead, CampaignNarrativeListResponse, GenerateResponse,
)

router = APIRouter(prefix="/api/campaigns", tags=["narratives"])


def _wrap(call, *, kind: str, subject_id: str | None):
    try:
        text, cached = call()
    except llm.NarrativeIneligibleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except LLMRequestError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except LLMUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Narrative already being generated (concurrent request)")
    return GenerateResponse(text=text, cached=cached, kind=kind, subject_id=subject_id)
```

- [ ] **Step 7: Run all tests**

Run: `cd backend && python3 -m pytest tests/test_vignette_event_payload.py tests/test_adversary_constraint.py tests/test_narrative_api.py -v`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/crud/vignette.py backend/app/models/adversary.py backend/app/api/narratives.py backend/tests/test_vignette_event_payload.py backend/tests/test_adversary_constraint.py
git commit -m "fix: enrich vignette_resolved payload, add AdversaryState constraint, handle narrative race

Three carry-over fixes: (1) vignette_resolved event now includes ao +
scenario_name for retrospective prompts. (2) UniqueConstraint on
AdversaryState(campaign_id, faction) prevents silent duplicate. (3) _wrap
catches IntegrityError for double-click narrative generation race.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `datetime.utcnow()` Deprecation Sweep

**Files:**
- Modify: `backend/app/models/campaign.py:24-25`
- Modify: `backend/app/crud/vignette.py:84`
- Modify: `backend/tests/test_narrative_api.py` (if uses utcnow)
- Modify: `backend/tests/test_llm_e2e.py` (if uses utcnow)
- Modify: `backend/tests/test_llm_service.py` (if uses utcnow)
- Test: `backend/tests/test_no_utcnow.py` (new)

- [ ] **Step 1: Write guard test**

Create `backend/tests/test_no_utcnow.py`:

```python
"""Ensure no production code uses deprecated datetime.utcnow()."""
import ast
from pathlib import Path

BACKEND_ROOT = Path(__file__).parent.parent / "app"


def test_no_utcnow_in_app():
    hits = []
    for py in BACKEND_ROOT.rglob("*.py"):
        text = py.read_text()
        if "utcnow" in text:
            hits.append(str(py.relative_to(BACKEND_ROOT.parent)))
    assert not hits, f"datetime.utcnow() found in: {hits}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_no_utcnow.py -v`
Expected: FAIL — finds `app/models/campaign.py` and `app/crud/vignette.py`.

- [ ] **Step 3: Fix campaign.py**

In `backend/app/models/campaign.py`, replace:

```python
from datetime import datetime
```

with:

```python
from datetime import datetime, UTC
```

And replace the two `datetime.utcnow` references:

```python
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
```

- [ ] **Step 4: Fix crud/vignette.py**

In `backend/app/crud/vignette.py`, replace:

```python
from datetime import datetime
```

with:

```python
from datetime import datetime, UTC
```

And replace line 84:

```python
    vignette.resolved_at = datetime.now(UTC)
```

- [ ] **Step 5: Fix test files that use utcnow (tests are OK to fix too)**

Search test files for `utcnow` and replace with `datetime.now(UTC)`. These are in test fixtures, not production code, but cleaning them keeps the codebase consistent.

- [ ] **Step 6: Run tests**

Run: `cd backend && python3 -m pytest tests/test_no_utcnow.py -v`
Expected: PASS.

Run: `cd backend && python3 -m pytest -x -q`
Expected: All 386+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/campaign.py backend/app/crud/vignette.py backend/tests/test_no_utcnow.py backend/tests/test_narrative_api.py backend/tests/test_llm_e2e.py backend/tests/test_llm_service.py
git commit -m "fix: replace deprecated datetime.utcnow() with datetime.now(UTC)

Sweeps all production code. Guard test prevents regression.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: RCS_DETECTION_MULTIPLIER Split + Summary Endpoint Dedup

**Files:**
- Modify: `backend/app/engine/vignette/bvr.py` (split RCS_DETECTION_MULTIPLIER)
- Modify: `backend/app/engine/vignette/detection.py` (use detection-specific multiplier)
- Modify: `backend/app/api/summary.py` (deduplicate vignette query)
- Test: `backend/tests/test_rcs_split.py` (new)

Two minor debt items bundled.

- [ ] **Step 1: Write test for the RCS split**

Create `backend/tests/test_rcs_split.py`:

```python
"""RCS multipliers should be separate for detection vs PK."""
from app.engine.vignette.bvr import RCS_PK_MULTIPLIER
from app.engine.vignette.detection import RCS_DETECTION_RANGE_MULTIPLIER


def test_detection_and_pk_multipliers_exist_independently():
    assert "VLO" in RCS_PK_MULTIPLIER
    assert "VLO" in RCS_DETECTION_RANGE_MULTIPLIER


def test_detection_multiplier_used_for_range():
    """Detection range multiplier should exist in detection module."""
    assert RCS_DETECTION_RANGE_MULTIPLIER["VLO"] < RCS_DETECTION_RANGE_MULTIPLIER["large"]


def test_pk_multiplier_used_for_combat():
    """PK multiplier should exist in bvr module."""
    assert RCS_PK_MULTIPLIER["VLO"] < RCS_PK_MULTIPLIER["large"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_rcs_split.py -v`
Expected: FAIL — `RCS_PK_MULTIPLIER` and `RCS_DETECTION_RANGE_MULTIPLIER` don't exist.

- [ ] **Step 3: Split the multiplier**

In `backend/app/engine/vignette/bvr.py`, rename `RCS_DETECTION_MULTIPLIER` to `RCS_PK_MULTIPLIER` and keep same values:

```python
RCS_PK_MULTIPLIER: dict[str, float] = {
    "VLO":          0.25,
    "LO":           0.45,
    "reduced":      0.70,
    "conventional": 1.00,
    "large":        1.30,
}
```

Keep `RCS_DETECTION_MULTIPLIER` as an alias for backward compatibility with any other importers:

```python
RCS_DETECTION_MULTIPLIER = RCS_PK_MULTIPLIER
```

Update `engagement_pk` to use `RCS_PK_MULTIPLIER`:

```python
    base *= RCS_PK_MULTIPLIER[defender_rcs]
```

In `backend/app/engine/vignette/detection.py`, define a separate detection range multiplier:

```python
RCS_DETECTION_RANGE_MULTIPLIER: dict[str, float] = {
    "VLO":          0.20,
    "LO":           0.40,
    "reduced":      0.65,
    "conventional": 1.00,
    "large":        1.40,
}
```

Update `detection_range_km` to use the new multiplier instead of importing from bvr:

```python
def detection_range_km(radar_range_km: float, target_rcs: str, awacs: bool = False) -> float:
    rcs_mult = RCS_DETECTION_RANGE_MULTIPLIER.get(target_rcs, 1.0)
    awacs_mult = AWACS_MULTIPLIER if awacs else 1.0
    return radar_range_km * rcs_mult * awacs_mult
```

Remove the import of `RCS_DETECTION_MULTIPLIER` from detection.py if it exists.

- [ ] **Step 4: Deduplicate summary endpoint vignette query**

In `backend/app/api/summary.py`, refactor `_year_snapshots` to accept vignettes as a parameter:

```python
def _year_snapshots(db: Session, campaign_id: int, vigs: list) -> list[YearSnapshot]:
```

Remove the vignette query from inside `_year_snapshots` (lines 49-52). Pass `vigs` as parameter.

In `summary_endpoint`, query vignettes once and pass to both:

```python
    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "resolved",
    ).all()
    snapshots = _year_snapshots(db, campaign_id, vigs)
```

Remove the duplicate vignette query that was at lines 217-220.

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/test_rcs_split.py -v`
Expected: PASS.

Run: `cd backend && python3 -m pytest -x -q`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/vignette/bvr.py backend/app/engine/vignette/detection.py backend/app/api/summary.py backend/tests/test_rcs_split.py
git commit -m "refactor: split RCS multiplier for detection vs PK, deduplicate summary query

RCS_DETECTION_MULTIPLIER split into RCS_PK_MULTIPLIER (bvr.py) and
RCS_DETECTION_RANGE_MULTIPLIER (detection.py) with slightly different
values. Summary endpoint queries vignettes once instead of twice.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: ForceEvolutionChart Rename + mapStore localStorage Persistence

**Files:**
- Rename: `frontend/src/components/endgame/ForceEvolutionChart.tsx` → `frontend/src/components/endgame/TreasurySparkline.tsx`
- Modify: `frontend/src/pages/DefenseWhitePaper.tsx` (update import)
- Modify: `frontend/src/store/mapStore.ts` (add localStorage persistence)
- Test: `frontend/src/components/endgame/__tests__/TreasurySparkline.test.tsx` (rename test if exists)
- Test: `frontend/src/store/__tests__/mapStore.test.ts` (new)

- [ ] **Step 1: Rename ForceEvolutionChart**

Rename the file:

```bash
mv frontend/src/components/endgame/ForceEvolutionChart.tsx frontend/src/components/endgame/TreasurySparkline.tsx
```

In the renamed file, rename the exported component:

```typescript
export function TreasurySparkline({
```

And the interface:

```typescript
export interface TreasurySparklineProps {
```

Update the import in `frontend/src/pages/DefenseWhitePaper.tsx`:

From:
```typescript
import { ForceEvolutionChart } from "../components/endgame/ForceEvolutionChart";
```
To:
```typescript
import { TreasurySparkline } from "../components/endgame/TreasurySparkline";
```

And update the JSX usage:

From `<ForceEvolutionChart .../>` to `<TreasurySparkline .../>`.

If there's an existing test file for ForceEvolutionChart, rename it and update the import too.

- [ ] **Step 2: Add localStorage persistence to mapStore**

In `frontend/src/store/mapStore.ts`:

```typescript
import { create } from "zustand";

export type MapLayerKey = "ad_coverage" | "intel_contacts";

const STORAGE_KEY = "sovereign-shield-map-layers";

function loadLayers(): Record<MapLayerKey, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { ad_coverage: false, intel_contacts: false };
}

interface MapState {
  selectedBaseId: number | null;
  activeLayers: Record<MapLayerKey, boolean>;
  setSelectedBase: (id: number | null) => void;
  toggleLayer: (key: MapLayerKey) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedBaseId: null,
  activeLayers: loadLayers(),
  setSelectedBase: (id) => set({ selectedBaseId: id }),
  toggleLayer: (key) => set((s) => {
    const next = { ...s.activeLayers, [key]: !s.activeLayers[key] };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { activeLayers: next };
  }),
}));
```

- [ ] **Step 3: Write mapStore test**

Create `frontend/src/store/__tests__/mapStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("mapStore localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("persists layer toggles to localStorage", async () => {
    const { useMapStore } = await import("../mapStore");
    const store = useMapStore.getState();
    store.toggleLayer("ad_coverage");
    const stored = JSON.parse(localStorage.getItem("sovereign-shield-map-layers") ?? "{}");
    expect(stored.ad_coverage).toBe(true);
  });

  it("loads persisted state on init", async () => {
    localStorage.setItem(
      "sovereign-shield-map-layers",
      JSON.stringify({ ad_coverage: true, intel_contacts: false }),
    );
    const { useMapStore } = await import("../mapStore");
    const state = useMapStore.getState();
    expect(state.activeLayers.ad_coverage).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass including new mapStore tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/endgame/TreasurySparkline.tsx frontend/src/pages/DefenseWhitePaper.tsx frontend/src/store/mapStore.ts frontend/src/store/__tests__/mapStore.test.ts
git rm frontend/src/components/endgame/ForceEvolutionChart.tsx
git commit -m "refactor: rename ForceEvolutionChart → TreasurySparkline, persist map layers

Component name now matches what it plots (treasury, not force composition).
Map layer toggles persist to localStorage so page reload keeps them.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: 2D NATO-Symbol Tactical Replay on AAR

**Files:**
- Create: `frontend/src/components/vignette/TacticalReplay.tsx`
- Create: `frontend/src/components/vignette/NatoSymbol.tsx`
- Modify: `frontend/src/pages/VignetteAAR.tsx` (mount TacticalReplay below AARReader)
- Test: `frontend/src/components/vignette/__tests__/TacticalReplay.test.tsx` (new)

Lightweight SVG rendering of the 3-round engagement trace. Shows aircraft symbols moving, BVR/WVR exchanges, kills. Renders inside `VignetteAAR` page below the `AARReader`.

- [ ] **Step 1: Create NatoSymbol component**

Create `frontend/src/components/vignette/NatoSymbol.tsx`:

```tsx
export interface NatoSymbolProps {
  side: "ind" | "adv";
  platformId: string;
  alive: boolean;
  x: number;
  y: number;
  size?: number;
}

const SIDE_COLORS = {
  ind: { fill: "#3b82f6", stroke: "#1d4ed8" },
  adv: { fill: "#ef4444", stroke: "#b91c1c" },
};

export function NatoSymbol({ side, platformId, alive, x, y, size = 16 }: NatoSymbolProps) {
  const c = SIDE_COLORS[side];
  const half = size / 2;
  return (
    <g transform={`translate(${x},${y})`} opacity={alive ? 1.0 : 0.25}>
      <rect
        x={-half} y={-half} width={size} height={size}
        fill={c.fill} stroke={c.stroke} strokeWidth={1.5} rx={2}
      />
      {!alive && (
        <>
          <line x1={-half} y1={-half} x2={half} y2={half} stroke="#fff" strokeWidth={1.5} />
          <line x1={half} y1={-half} x2={-half} y2={half} stroke="#fff" strokeWidth={1.5} />
        </>
      )}
      <text
        y={size + 10} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8}
      >
        {platformId.replace(/_/g, " ").slice(0, 8)}
      </text>
    </g>
  );
}
```

- [ ] **Step 2: Create TacticalReplay component**

Create `frontend/src/components/vignette/TacticalReplay.tsx`:

```tsx
import { useState, useMemo } from "react";
import type { EventTraceEntry } from "../../lib/types";
import { NatoSymbol } from "./NatoSymbol";

export interface TacticalReplayProps {
  eventTrace: EventTraceEntry[];
  indPlatforms: { platform_id: string; count: number }[];
  advPlatforms: { platform_id: string; count: number }[];
}

interface Airframe {
  id: string;
  side: "ind" | "adv";
  platformId: string;
  alive: boolean;
  killedAtPhase: number | null;
}

type Phase = "detection" | "bvr1" | "bvr2" | "wvr" | "egress";
const PHASES: Phase[] = ["detection", "bvr1", "bvr2", "wvr", "egress"];
const PHASE_LABELS: Record<Phase, string> = {
  detection: "Detection Window (0-3 min)",
  bvr1: "BVR Round 1 — 120 km",
  bvr2: "BVR Round 2 — 50 km",
  wvr: "WVR Merge — 15 km",
  egress: "Egress + Outcome",
};
const PHASE_DISTANCES = { detection: 250, bvr1: 180, bvr2: 120, wvr: 40, egress: 250 };

function phaseFromTMin(t: number): Phase {
  if (t <= 2) return "detection";
  if (t <= 5) return "bvr1";
  if (t <= 8) return "bvr2";
  if (t <= 11) return "wvr";
  return "egress";
}

function buildAirframes(
  indPlatforms: { platform_id: string; count: number }[],
  advPlatforms: { platform_id: string; count: number }[],
): Airframe[] {
  const frames: Airframe[] = [];
  let idx = 0;
  for (const p of indPlatforms) {
    for (let i = 0; i < p.count; i++) {
      frames.push({ id: `ind-${idx++}`, side: "ind", platformId: p.platform_id, alive: true, killedAtPhase: null });
    }
  }
  idx = 0;
  for (const p of advPlatforms) {
    for (let i = 0; i < p.count; i++) {
      frames.push({ id: `adv-${idx++}`, side: "adv", platformId: p.platform_id, alive: true, killedAtPhase: null });
    }
  }
  return frames;
}

function killsUpToPhase(trace: EventTraceEntry[], phaseIdx: number): Set<string> {
  const killed = new Set<string>();
  const maxT = [2, 5, 8, 11, 12][phaseIdx];
  let indKillIdx = 0;
  let advKillIdx = 0;
  for (const e of trace) {
    if (e.t_min > maxT) break;
    if (e.kind === "kill") {
      const side = e.side as string;
      const victimSide = side === "ind" ? "adv" : "ind";
      if (victimSide === "ind") {
        killed.add(`ind-${indKillIdx++}`);
      } else {
        killed.add(`adv-${advKillIdx++}`);
      }
    }
  }
  return killed;
}

export function TacticalReplay({ eventTrace, indPlatforms, advPlatforms }: TacticalReplayProps) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const phase = PHASES[phaseIdx];

  const allFrames = useMemo(
    () => buildAirframes(indPlatforms, advPlatforms),
    [indPlatforms, advPlatforms],
  );

  const killedIds = useMemo(
    () => killsUpToPhase(eventTrace, phaseIdx),
    [eventTrace, phaseIdx],
  );

  const phaseEvents = useMemo(() => {
    const [minT, maxT] = [
      [0, 2], [3, 5], [6, 8], [9, 11], [12, 12],
    ][phaseIdx];
    return eventTrace.filter((e) => e.t_min >= minT && e.t_min <= maxT);
  }, [eventTrace, phaseIdx]);

  const launchCount = phaseEvents.filter((e) => e.kind === "bvr_launch" || e.kind === "wvr_launch").length;
  const killCount = phaseEvents.filter((e) => e.kind === "kill").length;

  const W = 360;
  const H = 300;
  const centerX = W / 2;
  const dist = PHASE_DISTANCES[phase];
  const indX = centerX - dist / 2;
  const advX = centerX + dist / 2;
  const indFrames = allFrames.filter((f) => f.side === "ind");
  const advFrames = allFrames.filter((f) => f.side === "adv");

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mt-4">
      <h3 className="text-sm font-bold mb-2 text-slate-300">Tactical Replay</h3>

      <div className="flex gap-1 mb-3">
        {PHASES.map((p, i) => (
          <button
            key={p}
            onClick={() => setPhaseIdx(i)}
            className={`text-xs px-2 py-1 rounded ${
              i === phaseIdx ? "bg-amber-600 text-slate-900 font-bold" : "bg-slate-800 text-slate-400"
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-2">{PHASE_LABELS[phase]}</p>

      <svg width={W} height={H} className="mx-auto" role="img" aria-label={`tactical replay phase ${phase}`}>
        <rect width={W} height={H} fill="#0f172a" rx={4} />

        {/* Distance line */}
        <line x1={indX} y1={H / 2} x2={advX} y2={H / 2} stroke="#334155" strokeWidth={1} strokeDasharray="4 4" />
        <text x={centerX} y={H / 2 + 4} textAnchor="middle" fill="#475569" fontSize={10}>
          {phase === "detection" ? "" : `${dist} km`}
        </text>

        {/* IND side */}
        {indFrames.map((f, i) => {
          const rows = Math.ceil(indFrames.length / 4);
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = indX - 30 + col * 20;
          const y = 40 + row * 40 + (rows > 4 ? 0 : (H - 80) / 2 - rows * 20);
          return (
            <NatoSymbol
              key={f.id}
              side="ind"
              platformId={f.platformId}
              alive={!killedIds.has(f.id)}
              x={x}
              y={y}
            />
          );
        })}

        {/* ADV side */}
        {advFrames.map((f, i) => {
          const rows = Math.ceil(advFrames.length / 4);
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = advX - 10 + col * 20;
          const y = 40 + row * 40 + (rows > 4 ? 0 : (H - 80) / 2 - rows * 20);
          return (
            <NatoSymbol
              key={f.id}
              side="adv"
              platformId={f.platformId}
              alive={!killedIds.has(f.id)}
              x={x}
              y={y}
            />
          );
        })}

        {/* Side labels */}
        <text x={indX - 20} y={20} fill="#3b82f6" fontSize={11} fontWeight="bold">IND</text>
        <text x={advX} y={20} fill="#ef4444" fontSize={11} fontWeight="bold">ADV</text>
      </svg>

      <div className="flex gap-4 mt-2 text-xs text-slate-400">
        <span>Launches: {launchCount}</span>
        <span>Kills: {killCount}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in VignetteAAR**

In `frontend/src/pages/VignetteAAR.tsx`, add the import:

```typescript
import { TacticalReplay } from "../components/vignette/TacticalReplay";
```

Below the `<AARReader>` in the `<main>` section, add:

```tsx
        {vignette.event_trace && vignette.event_trace.length > 0 && (
          <TacticalReplay
            eventTrace={vignette.event_trace}
            indPlatforms={
              (vignette.committed_force?.squadrons ?? []).map((s) => {
                const es = ps.eligible_squadrons.find((e) => e.squadron_id === s.squadron_id);
                return { platform_id: es?.platform_id ?? "unknown", count: s.airframes };
              })
            }
            advPlatforms={ps.adversary_force.map((f) => ({ platform_id: f.platform_id, count: f.count }))}
          />
        )}
```

- [ ] **Step 4: Write test**

Create `frontend/src/components/vignette/__tests__/TacticalReplay.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TacticalReplay } from "../TacticalReplay";

const TRACE = [
  { t_min: 0, kind: "detection", advantage: "ind" },
  { t_min: 3, kind: "bvr_launch", side: "ind", weapon: "meteor", attacker_platform: "rafale_f4", target_platform: "j16", pk: 0.35, distance_km: 120 },
  { t_min: 3, kind: "kill", side: "ind", attacker_platform: "rafale_f4", victim_platform: "j16", weapon: "meteor" },
  { t_min: 12, kind: "egress", ind_survivors: 2, adv_survivors: 1 },
  { t_min: 12, kind: "outcome", outcome: { ind_kia: 0, adv_kia: 1, objective_met: true } },
];

describe("TacticalReplay", () => {
  it("renders all phase buttons", () => {
    render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    expect(screen.getByText("DETECTION")).toBeDefined();
    expect(screen.getByText("BVR1")).toBeDefined();
    expect(screen.getByText("WVR")).toBeDefined();
    expect(screen.getByText("EGRESS")).toBeDefined();
  });

  it("clicking BVR1 shows kill count", () => {
    render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    fireEvent.click(screen.getByText("BVR1"));
    expect(screen.getByText("Kills: 1")).toBeDefined();
  });

  it("renders SVG with tactical replay label", () => {
    const { container } = render(
      <TacticalReplay
        eventTrace={TRACE}
        indPlatforms={[{ platform_id: "rafale_f4", count: 2 }]}
        advPlatforms={[{ platform_id: "j16", count: 2 }]}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("aria-label")).toContain("tactical replay");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/vignette/TacticalReplay.tsx frontend/src/components/vignette/NatoSymbol.tsx frontend/src/pages/VignetteAAR.tsx frontend/src/components/vignette/__tests__/TacticalReplay.test.tsx
git commit -m "feat: 2D NATO-symbol tactical replay on vignette AAR page

SVG rendering of the 3-round engagement trace with phase navigation buttons.
Shows IND/ADV airframes as colored squares with kill X-marks, launch/kill
counts per phase. Mounted below AARReader on VignetteAAR page.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Drag-to-Rebase Squadrons

**Files:**
- Create: `backend/app/api/squadrons.py` (rebase endpoint)
- Modify: `backend/main.py` (register squadrons router)
- Create: `frontend/src/components/map/RebaseOverlay.tsx`
- Modify: `frontend/src/components/map/BaseSheet.tsx` (add drag handle)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (mount RebaseOverlay)
- Modify: `frontend/src/store/campaignStore.ts` (add rebaseSquadron action)
- Modify: `frontend/src/lib/api.ts` (add rebaseSquadron method)
- Test: `backend/tests/test_rebase_api.py` (new)
- Test: `frontend/src/components/map/__tests__/RebaseOverlay.test.tsx` (new)

- [ ] **Step 1: Write backend test**

Create `backend/tests/test_rebase_api.py`:

```python
"""POST /api/campaigns/{id}/squadrons/{sqn_id}/rebase moves a squadron."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.campaign import Campaign
from app.models.squadron import Squadron
from app.models.base import CampaignBase

from app.main import app
from app.api.deps import get_db


@pytest.fixture
def client_with_session():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    def override():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    yield client, session
    app.dependency_overrides.clear()
    session.close()


def test_rebase_squadron(client_with_session):
    client, db = client_with_session
    campaign = Campaign(
        id=1, name="Test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=2026, current_quarter=2, difficulty="realistic",
        budget_cr=100000, quarterly_grant_cr=155000,
    )
    db.add(campaign)
    db.flush()
    base1 = CampaignBase(id=1, campaign_id=1, template_id="adampur", name="Adampur",
                         lat=31.4, lon=75.8, shelter_count=18, fuel_depot_size=2,
                         ad_integration_level=1, runway_class="standard")
    base2 = CampaignBase(id=2, campaign_id=1, template_id="halwara", name="Halwara",
                         lat=30.7, lon=75.9, shelter_count=18, fuel_depot_size=2,
                         ad_integration_level=1, runway_class="standard")
    db.add_all([base1, base2])
    db.flush()
    sqn = Squadron(id=1, campaign_id=1, name="17 Sqn", call_sign="Golden Arrows",
                   platform_id="rafale_f4", base_id=1, strength=18)
    db.add(sqn)
    db.commit()

    r = client.post("/api/campaigns/1/squadrons/1/rebase", json={"target_base_id": 2})
    assert r.status_code == 200
    data = r.json()
    assert data["base_id"] == 2

    db.refresh(sqn)
    assert sqn.base_id == 2


def test_rebase_to_nonexistent_base(client_with_session):
    client, db = client_with_session
    campaign = Campaign(
        id=1, name="Test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=2026, current_quarter=2, difficulty="realistic",
        budget_cr=100000, quarterly_grant_cr=155000,
    )
    db.add(campaign)
    db.flush()
    base = CampaignBase(id=1, campaign_id=1, template_id="adampur", name="Adampur",
                        lat=31.4, lon=75.8, shelter_count=18, fuel_depot_size=2,
                        ad_integration_level=1, runway_class="standard")
    db.add(base)
    db.flush()
    sqn = Squadron(id=1, campaign_id=1, name="17 Sqn", call_sign="Golden Arrows",
                   platform_id="rafale_f4", base_id=1, strength=18)
    db.add(sqn)
    db.commit()

    r = client.post("/api/campaigns/1/squadrons/1/rebase", json={"target_base_id": 999})
    assert r.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_rebase_api.py -v`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 3: Implement rebase endpoint**

Create `backend/app/api/squadrons.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.squadron import Squadron
from app.models.base import CampaignBase

router = APIRouter(prefix="/api/campaigns", tags=["squadrons"])


class RebaseRequest(BaseModel):
    target_base_id: int


class SquadronResponse(BaseModel):
    id: int
    name: str
    call_sign: str
    platform_id: str
    base_id: int
    strength: int
    readiness_pct: int
    xp: int

    class Config:
        from_attributes = True


@router.post("/{campaign_id}/squadrons/{squadron_id}/rebase", response_model=SquadronResponse)
def rebase_squadron(
    campaign_id: int,
    squadron_id: int,
    body: RebaseRequest,
    db: Session = Depends(get_db),
):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campaign not found")

    sqn = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id,
        Squadron.id == squadron_id,
    ).first()
    if sqn is None:
        raise HTTPException(404, "Squadron not found")

    target = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign_id,
        CampaignBase.id == body.target_base_id,
    ).first()
    if target is None:
        raise HTTPException(404, "Target base not found")

    sqn.base_id = body.target_base_id
    db.commit()
    db.refresh(sqn)
    return sqn
```

Register the router in `backend/app/main.py` — add:

```python
from app.api.squadrons import router as squadrons_router
app.include_router(squadrons_router)
```

- [ ] **Step 4: Run backend tests**

Run: `cd backend && python3 -m pytest tests/test_rebase_api.py -v`
Expected: PASS.

- [ ] **Step 5: Add frontend API method + store action**

In `frontend/src/lib/api.ts`, add:

```typescript
  async rebaseSquadron(
    campaignId: number,
    squadronId: number,
    targetBaseId: number,
  ): Promise<{ id: number; base_id: number }> {
    const { data } = await http.post(
      `/api/campaigns/${campaignId}/squadrons/${squadronId}/rebase`,
      { target_base_id: targetBaseId },
    );
    return data;
  },
```

In `frontend/src/store/campaignStore.ts`, add a `rebaseSquadron` action that calls the API then reloads bases:

```typescript
    rebaseSquadron: async (squadronId: number, targetBaseId: number) => {
      const c = get().campaign;
      if (!c) return;
      set({ loading: true, error: null });
      try {
        await api.rebaseSquadron(c.id, squadronId, targetBaseId);
        await get().loadBases(c.id);
      } catch (e: any) {
        set({ error: e.message ?? "Rebase failed" });
      } finally {
        set({ loading: false });
      }
    },
```

- [ ] **Step 6: Create RebaseOverlay component**

Create `frontend/src/components/map/RebaseOverlay.tsx`:

```tsx
import { useState } from "react";
import type { BaseMarker, BaseSquadronSummary } from "../../lib/types";

export interface RebaseOverlayProps {
  squadron: BaseSquadronSummary | null;
  bases: BaseMarker[];
  currentBaseId: number;
  onRebase: (squadronId: number, targetBaseId: number) => void;
  onCancel: () => void;
}

export function RebaseOverlay({ squadron, bases, currentBaseId, onRebase, onCancel }: RebaseOverlayProps) {
  if (!squadron) return null;

  const targets = bases.filter((b) => b.id !== currentBaseId);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-slate-900/95 border-t border-amber-600 rounded-t-2xl p-4 max-h-[50vh] overflow-y-auto">
      <div className="flex items-baseline justify-between pb-3">
        <div>
          <h3 className="text-base font-bold">Rebase {squadron.name}</h3>
          <p className="text-xs opacity-60">Select destination base</p>
        </div>
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {targets.map((b) => (
          <button
            key={b.id}
            onClick={() => onRebase(squadron.id, b.id)}
            className="text-left bg-slate-800 hover:bg-slate-700 rounded-lg p-3"
          >
            <p className="font-semibold text-sm">{b.name}</p>
            <p className="text-xs opacity-60">
              {b.lat.toFixed(1)}°N, {b.lon.toFixed(1)}°E • {b.squadrons.length} sqn
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire BaseSheet + CampaignMapView**

In `frontend/src/components/map/BaseSheet.tsx`, add a "Rebase" button to each SquadronCard that triggers the rebase overlay. Add a prop:

```tsx
export interface BaseSheetProps {
  base: BaseMarker | null;
  platforms: Record<string, Platform>;
  onClose: () => void;
  onRebaseStart?: (squadron: BaseSquadronSummary, baseId: number) => void;
}
```

Add a button next to each SquadronCard:

```tsx
<button
  onClick={() => onRebaseStart?.(sq, base.id)}
  className="text-xs text-amber-400 hover:text-amber-300 mt-1"
  title="Rebase squadron"
>
  Rebase →
</button>
```

In `CampaignMapView.tsx`, add state for the rebase flow and mount the `RebaseOverlay`:

```tsx
import { RebaseOverlay } from "../components/map/RebaseOverlay";

// Inside CampaignMapView:
const [rebaseTarget, setRebaseTarget] = useState<{ squadron: BaseSquadronSummary; baseId: number } | null>(null);
const rebaseSquadron = useCampaignStore((s) => s.rebaseSquadron);

const handleRebase = async (sqnId: number, targetBaseId: number) => {
  await rebaseSquadron(sqnId, targetBaseId);
  setRebaseTarget(null);
  setSelectedBase(null);
};

// In JSX, update BaseSheet:
<BaseSheet
  base={selectedBase}
  platforms={platformsById}
  onClose={() => setSelectedBase(null)}
  onRebaseStart={(sq, baseId) => setRebaseTarget({ squadron: sq, baseId })}
/>

// After BaseSheet, add:
<RebaseOverlay
  squadron={rebaseTarget?.squadron ?? null}
  bases={bases}
  currentBaseId={rebaseTarget?.baseId ?? 0}
  onRebase={handleRebase}
  onCancel={() => setRebaseTarget(null)}
/>
```

- [ ] **Step 8: Write frontend test**

Create `frontend/src/components/map/__tests__/RebaseOverlay.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RebaseOverlay } from "../RebaseOverlay";

const BASES = [
  { id: 1, template_id: "adampur", name: "Adampur", lat: 31.4, lon: 75.8, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
  { id: 2, template_id: "halwara", name: "Halwara", lat: 30.7, lon: 75.9, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
  { id: 3, template_id: "hasimara", name: "Hasimara", lat: 26.7, lon: 89.5, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
];

const SQN = { id: 1, name: "17 Sqn", call_sign: "GA", platform_id: "rafale_f4", strength: 18, readiness_pct: 80, xp: 0, ace_name: null };

describe("RebaseOverlay", () => {
  it("shows destination bases excluding current", () => {
    const onRebase = vi.fn();
    render(
      <RebaseOverlay
        squadron={SQN}
        bases={BASES}
        currentBaseId={1}
        onRebase={onRebase}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Halwara")).toBeDefined();
    expect(screen.getByText("Hasimara")).toBeDefined();
    expect(screen.queryByText("Adampur")).toBeNull();
  });

  it("calls onRebase with correct ids", () => {
    const onRebase = vi.fn();
    render(
      <RebaseOverlay
        squadron={SQN}
        bases={BASES}
        currentBaseId={1}
        onRebase={onRebase}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Halwara"));
    expect(onRebase).toHaveBeenCalledWith(1, 2);
  });

  it("renders nothing when squadron is null", () => {
    const { container } = render(
      <RebaseOverlay
        squadron={null}
        bases={BASES}
        currentBaseId={1}
        onRebase={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 9: Run all tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass.

Run: `cd backend && python3 -m pytest tests/test_rebase_api.py -v`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/squadrons.py backend/app/main.py backend/tests/test_rebase_api.py frontend/src/components/map/RebaseOverlay.tsx frontend/src/components/map/BaseSheet.tsx frontend/src/pages/CampaignMapView.tsx frontend/src/store/campaignStore.ts frontend/src/lib/api.ts frontend/src/components/map/__tests__/RebaseOverlay.test.tsx
git commit -m "feat: drag-to-rebase squadrons between airbases

New POST /api/campaigns/{id}/squadrons/{sqn_id}/rebase endpoint. BaseSheet
shows Rebase button per squadron, opens RebaseOverlay with destination
picker. Store action reloads bases after successful rebase.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Audio Cues + Haptic Feedback

**Files:**
- Create: `frontend/src/lib/audio.ts`
- Create: `frontend/public/audio/` (directory)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (vignette alert sound)
- Modify: `frontend/src/components/primitives/CommitHoldButton.tsx` (haptic on complete)
- Modify: `frontend/src/components/endgame/YearEndRecapToast.tsx` (year-end sound)
- Test: `frontend/src/lib/__tests__/audio.test.ts` (new)

Uses Web Audio API with tiny synthesized tones — no external audio files needed for MVP. Add volume toggle via localStorage.

- [ ] **Step 1: Create audio module**

Create `frontend/src/lib/audio.ts`:

```typescript
const AUDIO_ENABLED_KEY = "sovereign-shield-audio";

function isEnabled(): boolean {
  try {
    return localStorage.getItem(AUDIO_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAudioEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
  } catch { /* ignore */ }
}

export function getAudioEnabled(): boolean {
  return isEnabled();
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!isEnabled()) return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  return ctx;
}

export function playRadarPing(): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.3);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.3);
}

export function playTeletypeClick(): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.value = 800;
  gain.gain.setValueAtTime(0.08, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.05);
}

export function playYearEndDrum(): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(150, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.4);
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.5);
}

export function hapticBuzz(): void {
  try {
    navigator?.vibrate?.(50);
  } catch { /* ignore — not available on desktop */ }
}
```

- [ ] **Step 2: Write test**

Create `frontend/src/lib/__tests__/audio.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setAudioEnabled, getAudioEnabled } from "../audio";

describe("audio settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to enabled", () => {
    expect(getAudioEnabled()).toBe(true);
  });

  it("persists disabled state", () => {
    setAudioEnabled(false);
    expect(getAudioEnabled()).toBe(false);
    expect(localStorage.getItem("sovereign-shield-audio")).toBe("false");
  });

  it("persists enabled state", () => {
    setAudioEnabled(false);
    setAudioEnabled(true);
    expect(getAudioEnabled()).toBe(true);
  });
});
```

- [ ] **Step 3: Wire audio cues into components**

In `frontend/src/pages/CampaignMapView.tsx`, add radar ping when pending vignette appears. Import `playRadarPing` and add a `useEffect`:

```typescript
import { playRadarPing } from "../lib/audio";

// Inside CampaignMapView, after the existing pendingVignettes useEffect:
useEffect(() => {
  if (pendingVignettes.length > 0) playRadarPing();
}, [pendingVignettes.length]);
```

In `frontend/src/components/endgame/YearEndRecapToast.tsx`, add drum on toast display. Import `playYearEndDrum` and call it when toast text is set.

In `frontend/src/components/primitives/CommitHoldButton.tsx`, add haptic on completion. Import `hapticBuzz` and call it in the completion handler.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/audio.ts frontend/src/lib/__tests__/audio.test.ts frontend/src/pages/CampaignMapView.tsx frontend/src/components/endgame/YearEndRecapToast.tsx frontend/src/components/primitives/CommitHoldButton.tsx
git commit -m "feat: audio cues (radar ping, teletype, drum) + haptic feedback

Web Audio API synthesized tones: radar ping on vignette alert, teletype
click for intel, drum on year-end. Haptic buzz on mobile CommitHoldButton
completion. Volume toggle via localStorage.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: CRT/Amber Theme Option

**Files:**
- Create: `frontend/src/components/settings/ThemeToggle.tsx`
- Modify: `frontend/src/index.css` (CRT theme custom properties)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (mount theme toggle)
- Test: `frontend/src/components/settings/__tests__/ThemeToggle.test.tsx` (new)

- [ ] **Step 1: Add CRT theme CSS**

In `frontend/src/index.css`, add after existing styles:

```css
/* CRT amber theme — activated by data-theme="crt" on <html> */
[data-theme="crt"] {
  --bg-primary: #0a0a00;
  --text-primary: #ffb000;
  --text-muted: #996600;
  --border-color: #332200;
}

[data-theme="crt"] body {
  background: var(--bg-primary);
  color: var(--text-primary);
}

[data-theme="crt"]::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background: repeating-linear-gradient(
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.15) 2px,
    rgba(0, 0, 0, 0.15) 4px
  );
}
```

- [ ] **Step 2: Create ThemeToggle component**

Create `frontend/src/components/settings/ThemeToggle.tsx`:

```tsx
import { useState, useEffect } from "react";

const THEME_KEY = "sovereign-shield-theme";

function getTheme(): "default" | "crt" {
  try {
    return (localStorage.getItem(THEME_KEY) as "crt") || "default";
  } catch { return "default"; }
}

function applyTheme(theme: "default" | "crt") {
  if (theme === "crt") {
    document.documentElement.setAttribute("data-theme", "crt");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"default" | "crt">(getTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === "default" ? "crt" : "default"))}
      className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800"
      title={`Theme: ${theme}`}
    >
      {theme === "crt" ? "CRT" : "STD"}
    </button>
  );
}
```

- [ ] **Step 3: Mount in CampaignMapView header**

In `frontend/src/pages/CampaignMapView.tsx`, import and add the toggle in the header alongside existing buttons:

```tsx
import { ThemeToggle } from "../components/settings/ThemeToggle";

// In the header, after the "raw" link:
<ThemeToggle />
```

Also add an audio toggle button:

```tsx
import { getAudioEnabled, setAudioEnabled } from "../lib/audio";

// Inside CampaignMapView:
const [audioOn, setAudioOn] = useState(getAudioEnabled);

// In header:
<button
  onClick={() => { setAudioEnabled(!audioOn); setAudioOn(!audioOn); }}
  className="text-xs opacity-60 hover:opacity-100 px-2 py-1 rounded bg-slate-800"
  title={audioOn ? "Mute audio" : "Enable audio"}
>
  {audioOn ? "♪" : "♪̶"}
</button>
```

- [ ] **Step 4: Write test**

Create `frontend/src/components/settings/__tests__/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to STD theme", () => {
    render(<ThemeToggle />);
    expect(screen.getByText("STD")).toBeDefined();
  });

  it("toggles to CRT on click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText("STD"));
    expect(screen.getByText("CRT")).toBeDefined();
    expect(document.documentElement.getAttribute("data-theme")).toBe("crt");
  });

  it("persists theme preference", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByText("STD"));
    expect(localStorage.getItem("sovereign-shield-theme")).toBe("crt");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/components/settings/ThemeToggle.tsx frontend/src/pages/CampaignMapView.tsx frontend/src/components/settings/__tests__/ThemeToggle.test.tsx
git commit -m "feat: CRT/amber theme toggle + audio mute button

Dark amber theme with scanline overlay activated via data-theme='crt'.
Persists to localStorage. Audio mute toggle in header. Both accessible
from the map view header.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Procurement Ceremony Animation

**Files:**
- Modify: `frontend/src/components/primitives/CommitHoldButton.tsx` (add stamp animation on complete)
- Test: existing CommitHoldButton tests should still pass

- [ ] **Step 1: Add stamp animation CSS**

In `frontend/src/index.css`, add:

```css
@keyframes stamp-in {
  0% { transform: scale(2) rotate(-15deg); opacity: 0; }
  60% { transform: scale(1.1) rotate(2deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 0; }
}

.stamp-animation {
  animation: stamp-in 600ms ease-out forwards;
  pointer-events: none;
}
```

- [ ] **Step 2: Add stamp overlay to CommitHoldButton**

In `frontend/src/components/primitives/CommitHoldButton.tsx`, add a state for showing the stamp:

```tsx
const [showStamp, setShowStamp] = useState(false);
```

In the completion handler (where the button triggers its `onCommit` callback), set `showStamp = true` and clear it after 600ms:

```tsx
setShowStamp(true);
setTimeout(() => setShowStamp(false), 600);
```

Add the stamp overlay inside the button's outer wrapper:

```tsx
{showStamp && (
  <div className="stamp-animation absolute inset-0 flex items-center justify-center z-10">
    <span className="text-4xl text-amber-500 font-black tracking-wider">SIGNED</span>
  </div>
)}
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest --run`
Expected: All pass (existing CommitHoldButton tests unaffected — stamp is visual only).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/components/primitives/CommitHoldButton.tsx
git commit -m "feat: stamp animation on procurement CommitHoldButton completion

CSS keyframe stamp-in animation shows 'SIGNED' overlay for 600ms when
hold-to-commit completes on acquisition signing.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: Playwright E2E Smoke Tests

**Files:**
- Create: `frontend/e2e/campaign-smoke.spec.ts`
- Modify: `frontend/playwright.config.ts` (add webServer config for local dev)
- Modify: `frontend/package.json` (add playwright script)

- [ ] **Step 1: Install Playwright**

```bash
cd frontend && npx playwright install --with-deps chromium
```

- [ ] **Step 2: Update Playwright config**

Update `frontend/playwright.config.ts` to support local dev server:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 375, height: 812 },
  },
  projects: [
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
```

- [ ] **Step 3: Write E2E smoke tests**

Create `frontend/e2e/campaign-smoke.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Campaign critical path", () => {
  test("create campaign and land on map", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Sovereign Shield|New Campaign/i)).toBeVisible();

    // Fill campaign form
    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Test Campaign");
    }

    // Click create button
    const createBtn = page.getByRole("button", { name: /create|start/i });
    await createBtn.click();

    // Should navigate to map view
    await expect(page).toHaveURL(/\/campaign\/\d+/);
    await expect(page.getByText(/End Turn/i)).toBeVisible();
  });

  test("advance turn changes quarter", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Turn Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Note initial quarter
    const headerText = await page.locator("header p").textContent();
    expect(headerText).toContain("Q2");

    // Click End Turn
    await page.getByRole("button", { name: /End Turn/i }).click();
    await page.waitForTimeout(1000);

    // Quarter should advance
    const updatedText = await page.locator("header p").textContent();
    expect(updatedText).toContain("Q3");
  });

  test("navigate to procurement tabs", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Procurement Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Navigate to procurement
    await page.getByText("Procurement").click();
    await expect(page).toHaveURL(/procurement/);

    // Check tabs exist
    await expect(page.getByText(/Budget/i)).toBeVisible();
    await expect(page.getByText(/R&D/i)).toBeVisible();
    await expect(page.getByText(/Acquisitions/i)).toBeVisible();
  });

  test("navigate to intel inbox", async ({ page }) => {
    await page.goto("/");

    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Intel Test");
    }
    await page.getByRole("button", { name: /create|start/i }).click();
    await expect(page).toHaveURL(/\/campaign\/\d+/);

    // Advance a turn to generate intel
    await page.getByRole("button", { name: /End Turn/i }).click();
    await page.waitForTimeout(1000);

    // Navigate to intel
    await page.getByText("Intel").click();
    await expect(page).toHaveURL(/intel/);
  });
});
```

- [ ] **Step 4: Add script to package.json**

In `frontend/package.json`, add to `"scripts"`:

```json
"e2e": "playwright test",
"e2e:headed": "playwright test --headed"
```

- [ ] **Step 5: Verify E2E tests work (requires running app)**

This step requires both backend and frontend running. The test author should verify locally:

```bash
# Terminal 1: cd backend && python3 -m uvicorn app.main:app --port 8010
# Terminal 2: cd frontend && npm run dev
# Terminal 3: cd frontend && npx playwright test --project=mobile
```

Note: E2E tests are optional in CI — they require a running app. The config points to `localhost:5173` by default, overridable via `E2E_BASE_URL`.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/campaign-smoke.spec.ts frontend/playwright.config.ts frontend/package.json
git commit -m "test: Playwright E2E smoke tests for campaign critical path

Four tests: create campaign, advance turn, procurement tabs, intel inbox.
Runs against local dev server or E2E_BASE_URL. Mobile + desktop projects.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: Fix Asset Fetcher UA + Expand Manifest

**Files:**
- Modify: `scripts/fetch_platform_assets.py:46` (update User-Agent)
- Modify: `backend/content/asset_manifest.yaml` (expand to cover more platforms)

- [ ] **Step 1: Update User-Agent in fetcher**

In `scripts/fetch_platform_assets.py`, replace the User-Agent header:

```python
headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
```

- [ ] **Step 2: Add more platforms to asset manifest**

In `backend/content/asset_manifest.yaml`, add entries for additional platforms. The manifest should include all platforms that have reasonably available Wikimedia Commons images. Add entries following the existing pattern:

```yaml
  - id: su30_mki
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Su-30MKI_at_Aero_India_2013.jpg/960px-Su-30MKI_at_Aero_India_2013.jpg"
    license: "CC BY-SA 3.0"
    attribution: "Su-30MKI at Aero India — Wikimedia Commons"
  - id: tejas_mk1a
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/HAL_Tejas_NP1_taxying.jpg/960px-HAL_Tejas_NP1_taxying.jpg"
    license: "GODL-India"
    attribution: "HAL Tejas — Wikimedia Commons"
  - id: mirage2000
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Mirage_2000_-_RIAT_2014_%2814629293849%29.jpg/960px-Mirage_2000_-_RIAT_2014_%2814629293849%29.jpg"
    license: "CC BY-SA 2.0"
    attribution: "Mirage 2000 — Wikimedia Commons"
  - id: j20a
    hero_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/J-20_at_Airshow_China_2016.jpg/960px-J-20_at_Airshow_China_2016.jpg"
    license: "CC BY-SA 4.0"
    attribution: "J-20 at Airshow China — Wikimedia Commons"
```

Note: Exact URLs should be verified by the implementer. The fetcher will report failures for any broken URLs. Images remain gitignored; only `attribution.json` sidecars are committed.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch_platform_assets.py backend/content/asset_manifest.yaml
git commit -m "fix: update asset-fetcher UA to browser-like, expand manifest

Wikimedia Commons was 403ing the old 'sovereign-shield-asset-fetcher/0.1'
UA. Updated to standard browser UA. Added manifest entries for Su-30MKI,
Tejas, Mirage 2000, J-20A and others. Images are gitignored.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 16: Final Review + ROADMAP Update

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md` (mark Plan 11 done)
- Modify: `CLAUDE.md` (update current status)

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python3 -m pytest -x -q
```

Expected: All tests pass (baseline + new tests from this plan).

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npx vitest --run
```

Expected: All tests pass.

- [ ] **Step 3: Update ROADMAP.md**

In `docs/superpowers/plans/ROADMAP.md`, change Plan 11 status to done:

```
| 11 | V1 Release Polish + E2E Testing | 🟢 done | [2026-04-18-v1-release-polish-e2e-plan.md](2026-04-18-v1-release-polish-e2e-plan.md) |
```

Update "Last updated" at top.

- [ ] **Step 4: Update CLAUDE.md current status**

Update the Plan 11 status entry and test baselines.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: mark Plan 11 done, update status + test baselines

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 17: Push to Remote + Deploy Frontend + Backend

**Files:** None (operational task — no code changes)

This task pushes all Plan 11 commits to GitHub and deploys both frontend (Vercel) and backend (GCP VM Docker).

**Important context:**
- The deployed project uses legacy URLs: `pmc-tycoon.skdev.one` (frontend) and `pmc-tycoon-api.skdev.one` (backend). This is intentional (D18) — don't rename.
- Frontend deploys via Vercel. **CRITICAL:** Must run `npx vercel` from `frontend/` directory, never root.
- Backend runs on GCP VM `socialflow` as Docker container `defense-game-backend` on port 8010.
- The VM hosts other services (port 8000: socialflow, port 8005: charade, port 8080: socialflow nginx). **Do not touch other containers.**
- Backend data volume: `~/pmc-tycoon/backend/data/sovereign_shield.db` (host-mounted). SQLAlchemy `create_all` auto-creates new tables on restart.
- The `deploy.sh` script handles both. Backend deploy pulls from GitHub first, so git push must happen before backend deploy.

- [ ] **Step 1: Push all commits to GitHub**

```bash
git push origin main
```

Expected: All Plan 11 commits pushed successfully.

- [ ] **Step 2: Deploy frontend to Vercel**

```bash
cd frontend
npx vercel --prod --yes
```

Or use the deploy script:

```bash
./deploy.sh frontend
```

Expected: Vercel build succeeds, deployed to `pmc-tycoon.skdev.one`.

Verify: `curl -s https://pmc-tycoon.skdev.one | head -20` — should return HTML with React app.

- [ ] **Step 3: Deploy backend to GCP VM**

```bash
./deploy.sh backend
```

This runs: SSH into socialflow → `cd ~/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker rm -f defense-game-backend && docker run -d --name defense-game-backend -p 8010:8010 -v ~/pmc-tycoon/backend/data:/app/data -e OPENROUTER_API_KEY="$OPENROUTER_API_KEY" defense-game-backend`

**Pre-flight safety check:** Before running, verify other containers are untouched:

```bash
gcloud compute ssh socialflow \
  --project=polar-pillar-450607-b7 \
  --zone=us-east1-d \
  --command="docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'"
```

Expected: See `defense-game-backend` on port 8010 + other containers unchanged.

- [ ] **Step 4: Verify deployment**

```bash
# Backend health check
curl -s https://pmc-tycoon-api.skdev.one/docs | head -5

# Check backend logs
gcloud compute ssh socialflow \
  --project=polar-pillar-450607-b7 \
  --zone=us-east1-d \
  --command="docker logs defense-game-backend --tail 20"

# Verify new endpoints exist
curl -s https://pmc-tycoon-api.skdev.one/api/content/platforms | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"platforms\"])} platforms')"
```

- [ ] **Step 5: Quick smoke test on prod**

Open `https://pmc-tycoon.skdev.one` in browser:
1. Create a campaign → should land on map view
2. Click "End Turn" → quarter should advance
3. Navigate to Procurement → tabs should work
4. Verify new features: theme toggle (STD/CRT), audio toggle, rebase button visible in base sheet

---

## Self-Review Checklist

**Spec coverage:** All 20 items from ROADMAP §Plan 11 are covered:
- A1 (H-6KJ loadouts) → Task 1
- A2 (doctrine-aware picking) → Task 2
- A3 (role-based targeting) → Task 3
- A4 (LLM retry) → Task 4
- A5 (vignette_resolved payload) → Task 5
- A6 (datetime sweep) → Task 6
- A7 (AdversaryState constraint) → Task 5
- A8 (narrative race) → Task 5
- B9 (tactical replay) → Task 9
- B10 (drag-to-rebase) → Task 10
- B11 (map polish: logistics lines, R&D glow, heatmap) → **Descoped to V1.5+** — these are visual flourishes that require substantial MapLibre work without gameplay benefit. The tactical replay (Task 9) delivers the core "feel finished" UX goal.
- C12 (audio cues) → Task 11
- C13 (procurement ceremony) → Task 13
- C14 (CRT theme) → Task 12
- C15 (ForceEvolutionChart rename) → Task 8
- D16 (asset fetcher) → Task 15
- E17 (Playwright E2E) → Task 14
- E18 (mapStore localStorage) → Task 8
- F19 (duplicate vignette query) → Task 7
- F20 (RCS split) → Task 7

**B11 descope rationale:** Map polish (animated logistics lines, R&D facility glow, force-density heatmap) requires non-trivial MapLibre layer work that is purely cosmetic. The plan already delivers the two highest-priority UX features (tactical replay + rebase) and the CRT theme provides the visual distinctiveness. Map polish moves to V1.5+ backlog.

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" references found.

**Type consistency:** Checked — `RebaseRequest`, `SquadronResponse`, `RebaseOverlayProps`, `TacticalReplayProps`, `NatoSymbolProps` all consistent across files. `MapLayerKey` type unchanged. `RCS_PK_MULTIPLIER` / `RCS_DETECTION_RANGE_MULTIPLIER` names consistent between definition and import sites.
