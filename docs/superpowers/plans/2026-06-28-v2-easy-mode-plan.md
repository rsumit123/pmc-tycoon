# Chakravyuh v2 Phase 4 — Easy/Story Mode + Stand-Down + Collapsible Drawer Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps. Commit directly to `main`. Frontend "green" = `npm run build` (tsc -b) passing, not just `npx tsc --noEmit`.

**Goal:** A forgiving Story difficulty (2× budget, 0.3× threat), a Story-only "Stand down" to decline a vignette with no losses, and a collapsible accordion side drawer — all determinism-safe (existing difficulties + seeded resolver untouched).

**Architecture:** Story tier = additive multipliers (`.get(difficulty, 1.0)` defaults keep existing tiers identical). Threat multiplier threads through the threat helpers before the seeded roll. Stand-down is a new branch in `commit_vignette` that skips the resolver. The drawer becomes localStorage-persisted accordions.

**Tech Stack:** Backend FastAPI + SQLAlchemy + Pydantic (pure-fn engine). Frontend React 19 + TS + Zustand + Vitest. Capacitor Android.

---

### Task 1: "Story" difficulty — grant + threat multipliers (backend)

**Files:**
- Modify: `backend/app/engine/budget.py`, `backend/app/engine/vignette/threat.py`, `backend/app/engine/turn.py`, `backend/app/crud/campaign.py`, `backend/app/schemas/campaign.py`
- Test: `backend/tests/test_story_difficulty.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_story_difficulty.py
import random
from app.engine.budget import compute_quarterly_grant
from app.engine.vignette.threat import (
    should_fire_vignette, DIFFICULTY_THREAT_MULTIPLIER,
)

def test_story_grant_is_double_base():
    assert compute_quarterly_grant("story", 2026) == 90000
    assert compute_quarterly_grant("realistic", 2026) == 45000  # unchanged

def test_threat_multiplier_table_defaults_to_one():
    assert DIFFICULTY_THREAT_MULTIPLIER.get("story") == 0.3
    assert DIFFICULTY_THREAT_MULTIPLIER.get("realistic", 1.0) == 1.0
    assert DIFFICULTY_THREAT_MULTIPLIER.get("hard_peer", 1.0) == 1.0

def test_story_threat_fires_less_often_than_default():
    # Over many independent seeds, a 0.3x multiplier fires strictly fewer times.
    base_fires = sum(should_fire_vignette(random.Random(s), 2031, 1) for s in range(400))
    story_fires = sum(should_fire_vignette(random.Random(s), 2031, 1, threat_multiplier=0.3) for s in range(400))
    assert story_fires < base_fires

def test_default_threat_multiplier_is_unchanged_behaviour():
    # threat_multiplier=1.0 must equal the no-arg call for the same rng seed sequence.
    for s in range(50):
        a = should_fire_vignette(random.Random(s), 2030, 3)
        b = should_fire_vignette(random.Random(s), 2030, 3, threat_multiplier=1.0)
        assert a == b
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd backend && python3 -m pytest tests/test_story_difficulty.py -q`
Expected: FAIL — `DIFFICULTY_THREAT_MULTIPLIER` / `threat_multiplier` not present; story grant missing.

- [ ] **Step 3: Implement**

(a) `backend/app/engine/budget.py` — add `"story"` to the grant multiplier dict:
```python
DIFFICULTY_GRANT_MULTIPLIER: dict[str, float] = {
    "story":      2.0,
    "relaxed":    1.5,
    "realistic":  1.0,
    "hard_peer":  0.7,
    "worst_case": 0.5,
}
```

(b) `backend/app/engine/vignette/threat.py` — add the threat multiplier table + thread `threat_multiplier` through (defaults 1.0):
```python
# Story mode fires vignettes less often; all other tiers unchanged (1.0).
DIFFICULTY_THREAT_MULTIPLIER: dict[str, float] = {
    "story": 0.3,
}


def should_fire_vignette_for_faction(
    rng: random.Random, faction: str, year: int, quarter: int,
    threat_multiplier: float = 1.0,
) -> bool:
    prob = threat_curve_prob_for_faction(faction, year, quarter) * threat_multiplier
    return rng.random() < prob


def any_faction_fires(
    rng: random.Random, year: int, quarter: int, threat_multiplier: float = 1.0,
) -> bool:
    """Roll independently per faction; return True if any fires."""
    for f in FACTIONS:
        if should_fire_vignette_for_faction(rng, f, year, quarter, threat_multiplier):
            return True
    return False


def should_fire_vignette(
    rng: random.Random, year: int, quarter: int, threat_multiplier: float = 1.0,
) -> bool:
    """Legacy helper — now delegates to any_faction_fires."""
    return any_faction_fires(rng, year, quarter, threat_multiplier)
```
(Keep the existing `threat_curve_prob_for_faction`, `_baseline_curve`, etc. unchanged. The multiplier is applied where the probability is consumed so the per-faction curve functions stay pure.)

(c) `backend/app/engine/turn.py` — read where `should_fire_vignette(vignette_rng, year, quarter)` is called (~line 129) and pass the multiplier:
```python
        if should_fire_vignette(vignette_rng, year, quarter, ctx.get("threat_multiplier", 1.0)):
```

(d) `backend/app/crud/campaign.py::advance_turn` — read how `ctx` is assembled and add:
```python
    from app.engine.vignette.threat import DIFFICULTY_THREAT_MULTIPLIER
    ...
    ctx["threat_multiplier"] = DIFFICULTY_THREAT_MULTIPLIER.get(campaign.difficulty, 1.0)
```
(Place it alongside the other `ctx[...]` assignments before `engine_advance(ctx)`. If `ctx` is built as a dict literal, add the key there instead.)

(e) `backend/app/schemas/campaign.py` — extend the Difficulty Literal:
```python
Difficulty = Literal["story", "relaxed", "realistic", "hard_peer", "worst_case"]
```

- [ ] **Step 4: Run tests, verify PASS + replay still green**

Run: `cd backend && python3 -m pytest tests/test_story_difficulty.py tests/test_replay_determinism.py -q`
Expected: new tests PASS; replay determinism still PASS (defaults unchanged).

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/engine/budget.py backend/app/engine/vignette/threat.py backend/app/engine/turn.py backend/app/crud/campaign.py backend/app/schemas/campaign.py backend/tests/test_story_difficulty.py
git commit -m "feat(v2): Story difficulty — 2x grant + 0.3x threat (story-only, determinism-safe)"
```

---

### Task 2: "Stand down" decline path (backend)

**Files:**
- Modify: `backend/app/schemas/vignette.py`, `backend/app/crud/vignette.py`
- Test: `backend/tests/test_stand_down.py`

- [ ] **Step 1: Write the failing test** (mirror the fixture pattern of an existing vignette commit test, e.g. `tests/test_vignettes_api.py` — read it to set up a campaign + a pending vignette)

```python
# backend/tests/test_stand_down.py
# Use the existing vignette-commit test fixtures (read tests/test_vignettes_api.py).
# Set up: a campaign with difficulty="story" and a pending vignette, then commit with decline=true.

def test_stand_down_resolves_with_no_losses_on_story(story_campaign_with_pending_vignette):
    db, campaign, vignette = story_campaign_with_pending_vignette  # adapt to real fixture
    from app.crud.vignette import commit_vignette
    out = commit_vignette(db, campaign, vignette, {"squadrons": [], "support": {}, "roe": "weapons_free", "decline": True})
    assert out.status == "resolved"
    assert out.outcome["stand_down"] is True
    assert out.outcome["ind_kia"] == 0 and out.outcome["adv_kia"] == 0
    assert out.outcome["objective_met"] is False

def test_stand_down_rejected_when_not_story(realistic_campaign_with_pending_vignette):
    db, campaign, vignette = realistic_campaign_with_pending_vignette
    from app.crud.vignette import commit_vignette, CommitValidationError
    import pytest
    with pytest.raises(CommitValidationError):
        commit_vignette(db, campaign, vignette, {"squadrons": [], "support": {}, "roe": "weapons_free", "decline": True})
```

> Adapt to the real test harness: read `tests/test_vignettes_api.py` for how a campaign + pending vignette are created (it may go through the API). If a unit-level `commit_vignette` call is awkward, write it as an API test hitting the commit endpoint with `{"decline": true, ...}` and asserting the resolved outcome / a 400 for non-story. Keep the two assertions: story decline → resolved zero-loss `stand_down`, non-story decline → rejected.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd backend && python3 -m pytest tests/test_stand_down.py -q`
Expected: FAIL — decline not handled.

- [ ] **Step 3: Implement**

(a) `backend/app/schemas/vignette.py` — add the field:
```python
class VignetteCommitPayload(BaseModel):
    squadrons: list[VignetteCommitSquadron] = Field(default_factory=list)
    support: VignetteCommitSupport = Field(default_factory=VignetteCommitSupport)
    roe: str = "weapons_free"
    decline: bool = False
```

(b) `backend/app/crud/vignette.py::commit_vignette` — add a branch immediately AFTER the `if vignette.status != "pending":` guard and BEFORE the validation/resolver logic. Read the END of the function to match exactly how it persists (`resolved_at`, `db.commit()`, `db.refresh(vignette)`), and mirror that:
```python
    if committed_force.get("decline"):
        if campaign.difficulty != "story":
            raise CommitValidationError("Stand down is only available in Story mode")
        vignette.committed_force = committed_force
        vignette.outcome = {
            "ind_kia": 0, "adv_kia": 0,
            "ind_airframes_lost": 0, "adv_airframes_lost": 0,
            "objective_met": False, "stand_down": True,
            "roe": committed_force.get("roe", "weapons_free"),
            "support": committed_force.get("support", {}),
            "munitions_expended": [], "munitions_cost_total_cr": 0,
        }
        vignette.event_trace = [{"t_min": 0, "kind": "stand_down"}]
        vignette.aar_text = "Stand-down ordered — the engagement was declined; no forces were committed and no losses were taken."
        vignette.status = "resolved"
        # ↓ match the exact persistence the rest of commit_vignette uses (resolved_at + commit/refresh)
        <set resolved_at the same way the normal path does, then db.commit(); db.refresh(vignette)>
        return vignette
```
Use the SAME `resolved_at` assignment + commit/refresh the normal resolution tail uses (read lines ~185–228). Do not touch the resolver, readiness, or loss logic — the branch returns before them.

- [ ] **Step 4: Run tests, verify PASS**

Run: `cd backend && python3 -m pytest tests/test_stand_down.py tests/test_vignettes_api.py -q`
Expected: PASS (new + existing vignette tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add backend/app/schemas/vignette.py backend/app/crud/vignette.py backend/tests/test_stand_down.py
git commit -m "feat(v2): Story-only Stand down — decline a vignette, no losses, resolver untouched"
```

---

### Task 3: Story difficulty on the frontend (types, economy, Landing)

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/economy.ts`, `frontend/src/lib/__tests__/economy.test.ts`, `frontend/src/pages/Landing.tsx`

- [ ] **Step 1: Extend the economy test**

Add to `frontend/src/lib/__tests__/economy.test.ts` inside the existing describe:
```ts
  it("computes the Story starting grant (2x base)", () => {
    expect(startingGrantCr("story")).toBe(90000);
  });
  it("has a Story blurb", () => {
    expect(DIFFICULTY_BLURB.story.length).toBeGreaterThan(0);
  });
```
Run `cd frontend && npm test -- economy` → FAIL.

- [ ] **Step 2: Implement**
- `frontend/src/lib/types.ts`: `export type Difficulty = "story" | "relaxed" | "realistic" | "hard_peer" | "worst_case";`
- `frontend/src/lib/economy.ts`: add `story: 2.0` to `DIFFICULTY_MULT` and `story: "Most forgiving — generous budget, calm skies. Best for your first campaign."` to `DIFFICULTY_BLURB`.
- `frontend/src/pages/Landing.tsx`: add `{ value: "story", label: "Story" }` as the FIRST entry of `DIFFICULTIES`. (The grant figure + blurb display added in Phase 2 will render automatically.)

- [ ] **Step 3: Verify**

Run: `cd frontend && npm test -- economy Landing && npx tsc --noEmit`
Expected: PASS; tsc clean. (`DIFFICULTY_MULT` is typed `Record<Difficulty, number>`, so adding `story` to the type forces adding it to the map — good.)

- [ ] **Step 4: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/types.ts frontend/src/lib/economy.ts frontend/src/lib/__tests__/economy.test.ts frontend/src/pages/Landing.tsx
git commit -m "feat(v2): Story difficulty option on Landing (2x grant)"
```

---

### Task 4: "Stand down" button (Story-only) + commit-with-decline plumbing

**Files:**
- Modify: `frontend/src/lib/types.ts` (commit payload), `frontend/src/lib/api.ts` + `frontend/src/store/campaignStore.ts` (pass decline), `frontend/src/pages/OpsRoom.tsx`
- Test: `frontend/src/pages/__tests__/OpsRoom.standdown.test.tsx` (or extend an OpsRoom test) + a store/api test if practical

**Context:** Read `OpsRoom.tsx` for how it currently commits (the `commitVignette` store action + the payload it sends + how it reads the campaign/difficulty). The commit payload type is in `types.ts` (`VignetteCommitPayload`). Read `api.ts` `commitVignette` + the store action.

- [ ] **Step 1: Write the failing test**

Write a test that renders OpsRoom (mock the store like other page tests) with `campaign.difficulty === "story"` and a pending vignette planning state, asserts a **"Stand down"** button is present, clicking it calls the commit action with a payload where `decline === true`; AND a second case where `campaign.difficulty === "realistic"` asserts NO stand-down button. Read an existing OpsRoom/page test for the mock shape; keep the intent.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- OpsRoom.standdown`
Expected: FAIL.

- [ ] **Step 3: Implement**
- `types.ts`: add `decline?: boolean` to the vignette commit payload interface.
- `api.ts` / store `commitVignette`: ensure the `decline` flag is included in the POST body (if the action already forwards the whole payload object, just include `decline` in the object OpsRoom passes).
- `OpsRoom.tsx`: when `campaign.difficulty === "story"`, render a **"🏳 Stand down"** button (≥44px) near the commit control. On tap (a confirm or hold is fine), call the commit action with `{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: <first roe_option or "weapons_free">, decline: true }`, then follow the same post-commit navigation the normal commit uses (to the AAR/map). Do NOT show the button for other difficulties.
- (Optional, nice-to-have) In the AAR view, if `outcome.stand_down`, show a "Stood down — engagement declined" note instead of combat stats.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- OpsRoom && npx tsc --noEmit`
Expected: new + existing OpsRoom tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/store/campaignStore.ts frontend/src/pages/OpsRoom.tsx frontend/src/pages/__tests__/
git commit -m "feat(v2): Story-only Stand down button + commit-with-decline plumbing"
```

---

### Task 5: Collapsible accordion side drawer

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`
- Test: skip a render test if CampaignMapView can't mount in jsdom (MapLibre) — note it; the change is a localized menu refactor. If a small extraction is natural, you may extract the menu into a testable `DrawerNav` component, but that's optional.

**Context:** Read the side-menu JSX in `CampaignMapView.tsx` — four sections each with a `font-tech ... text-amber-500/70` header `<div>` followed by `<Link>`/`<button>` items: **Force**, **Operations**, **Records**, **Settings**.

- [ ] **Step 1: Implement the accordion**
- Add state: `const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("drawer_sections_v1") || "") ?? defaults; } catch { return defaults; } });` where `defaults = { Force: false, Operations: true, Records: false, Settings: false }`.
- Persist on change: an effect `useEffect(() => { try { localStorage.setItem("drawer_sections_v1", JSON.stringify(openSections)); } catch {} }, [openSections]);`
- Convert each section header `<div>` into a `<button>` (full-width, `min-h-[44px]`, same amber `font-tech` styling) that toggles `openSections[name]`, with a chevron (▸ collapsed / ▾ open). Wrap each section's items in `{openSections[name] && ( ... )}`.
- Leave every item's `to=`/`onClick` and the outer drawer + backdrop + back-button behavior unchanged.

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: tsc clean; full suite green (no existing menu test to break).

- [ ] **Step 3: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(v2): collapsible accordion side drawer (localStorage-persisted)"
```

---

### Task 6: Full suites, Android build, docs, debug APK

**Files:** `CLAUDE.md`, `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Suites + build**

```bash
cd /Users/rsumit123/work/defense-game/backend && python3 -m pytest -q
cd /Users/rsumit123/work/defense-game/frontend && npm run build   # tsc -b + vite (catches test-file type errors)
cd /Users/rsumit123/work/defense-game/frontend && npm test
```
Expected: backend grows from 675; frontend grows from 253; build + all tests green.

- [ ] **Step 2: cap:sync + docs**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run cap:sync
```
Add a CLAUDE.md "Current status" bullet for v2 Phase 4 (Story difficulty 2×/0.3×; Story-only Stand down; collapsible drawer), note test counts + link spec/plan, and mark v2 complete (Phases 1–4 done). Add a dated ROADMAP note + bump "Last updated".

- [ ] **Step 3: Commit + push**

```bash
cd /Users/rsumit123/work/defense-game
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(v2): mark Phase 4 (easy/story mode) done — v2 complete"
git push origin main
```

- [ ] **Step 4: Build the debug APK (controller, after the phase)**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build && npm run cap:sync
cd android && JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk (send; remind to uninstall the Play build first)
```

---

## Self-Review

**Spec coverage:** Story tier grant+threat (T1), Difficulty type/economy/Landing (T3); Stand-down backend (T2) + frontend (T4); collapsible drawer (T5); suites/Android/APK + v2-complete docs (T6). ✓

**Placeholder scan:** Full code for T1 (budget/threat/turn/schema) and the T2 decline branch + T3/T5. T2 persistence tail + T4 OpsRoom wiring + advance_turn ctx say read-first and match existing patterns (not weakenable). T5 explicitly allows skipping a jsdom render test with a documented reason. ✓

**Type consistency:** `DIFFICULTY_THREAT_MULTIPLIER` + `threat_multiplier` param (T1) consumed by turn.py + advance_turn ctx (T1). `Difficulty` adds `"story"` in backend Literal (T1) + frontend union (T3); `DIFFICULTY_MULT` typed `Record<Difficulty, number>` forces the story entry (T3). `decline` added to backend payload (T2) + frontend payload type (T4); `stand_down`/`objective_met:false` outcome (T2) read by existing consumers + optional AAR note (T4). Determinism: defaults 1.0 + resolver-skip keep `test_replay_determinism` green (verified in T1/T2 steps). ✓
