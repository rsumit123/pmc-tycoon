# AD-Focused Scenario Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 18 wired `MissileStock` + `ADBattery.interceptor_stock` + resolver stock decrement, but existing vignette AOs are almost all 200-800 km from IAF airbases — outside S-400's 150 km bubble. AD batteries fire maybe once every 10 engagements today. This plan adds 4 scenario archetypes where AOs sit at/near IAF bases so the AD system you just paid for actually earns its keep.

**Architecture:** Zero resolver changes — cruise missiles + drones represented as adversary "platforms" with low RCS + empty loadout (existing resolver treats them as valid AD targets but they don't BVR back). New scenario fields `ao_base_candidates` (generator picks random friendly base + jitter so scenarios are replayable) and `allows_no_cap` (commit validator skips min-squadron check when true, enabling AD-only defense). AAR gets a per-battery contribution panel from existing `ad_engagement` trace events.

**Tech Stack:** FastAPI / SQLAlchemy / YAML content / React 19 + Zustand / pytest + Vitest.

---

## Data shape locked up front

### New content in `platforms.yaml`

Four non-procurable "attack-munition" platforms used only as adversary targets:

```yaml
  - id: yj21_missile
    name: YJ-21 Cruise Missile
    origin: CHN
    role: anti_ship_cruise
    generation: "4"
    combat_radius_km: 9999   # one-way munition
    payload_kg: 500
    rcs_band: LO
    radar_range_km: 0        # not a radar platform
    cost_cr: 60              # matches weapon unit cost from bvr.py
    intro_year: 2020
    procurable_by: []
    default_first_delivery_quarters: 0
    default_foc_quarters: 0
    runway_class: short

  - id: cj20_missile
    name: CJ-20 Land-Attack Cruise Missile
    origin: CHN
    role: land_attack_cruise
    generation: "4"
    combat_radius_km: 9999
    payload_kg: 500
    rcs_band: LO
    radar_range_km: 0
    cost_cr: 15
    intro_year: 2015
    procurable_by: []
    default_first_delivery_quarters: 0
    default_foc_quarters: 0
    runway_class: short

  - id: babur_missile
    name: Babur / Ra'ad Cruise Missile
    origin: PAK
    role: land_attack_cruise
    generation: "4"
    combat_radius_km: 9999
    payload_kg: 450
    rcs_band: LO
    radar_range_km: 0
    cost_cr: 10
    intro_year: 2010
    procurable_by: []
    default_first_delivery_quarters: 0
    default_foc_quarters: 0
    runway_class: short

  - id: shahed_drone
    name: Shahed-136-class Loitering Munition
    origin: PAK
    role: loitering_munition
    generation: "3"
    combat_radius_km: 9999
    payload_kg: 50
    rcs_band: VLO     # tiny radar signature, not stealth-coated
    radar_range_km: 0
    cost_cr: 1
    intro_year: 2022
    procurable_by: []
    default_first_delivery_quarters: 0
    default_foc_quarters: 0
    runway_class: short
```

### 4 new scenario templates (append to `scenario_templates.yaml`)

Each with new fields `ao_base_candidates` (list of base template_ids) and `allows_no_cap: true|false`:

```yaml
  - id: plan_cruise_coastal
    faction: PLAN
    weight: 1.0
    min_quarter_index: 8    # unlocks after year 2
    objective:
      kind: defend_airspace
      success_threshold:
        adv_kills_min: 10     # intercept ≥10 of 12 cruise missiles
        ind_losses_max: 4
    adversary_force:
      - {role: strike, faction: PLAN, platform_id: yj21_missile, count: 12, loadout: []}
    ao_base_candidates: [thanjavur, car_nicobar]
    allows_no_cap: true
    intel_tier_range: [medium, high]
    roe_options: [weapons_free, weapons_tight]
    response_clock_minutes: 20

  - id: paf_cruise_raid_nw
    faction: PAF
    weight: 1.0
    min_quarter_index: 4
    objective:
      kind: defend_airspace
      success_threshold:
        adv_kills_min: 8
        ind_losses_max: 3
    adversary_force:
      - {role: strike, faction: PAF, platform_id: babur_missile, count: 10, loadout: []}
    ao_base_candidates: [pathankot, halwara, adampur]
    allows_no_cap: true
    intel_tier_range: [medium, high]
    roe_options: [weapons_free, weapons_tight]
    response_clock_minutes: 25

  - id: drone_swarm_forward
    faction: PAF
    weight: 0.9
    min_quarter_index: 6
    objective:
      kind: defend_airspace
      success_threshold:
        adv_kills_min: 16      # intercept ≥16 of 20 drones
        ind_losses_max: 2
    adversary_force:
      - {role: strike, faction: PAF, platform_id: shahed_drone, count: 20, loadout: []}
    ao_base_candidates: [srinagar, tezpur, jodhpur]
    allows_no_cap: true
    intel_tier_range: [medium, high]
    roe_options: [weapons_free, weapons_tight]
    response_clock_minutes: 30

  - id: paf_f16_strike_pkg
    faction: PAF
    weight: 0.9
    min_quarter_index: 8
    objective:
      kind: defend_airspace
      success_threshold:
        adv_kills_min: 6
        ind_losses_max: 3
    adversary_force:
      - {role: strike, faction: PAF, platform_id: f16_blk52, count: 6, loadout: [pl15, pl10]}
      - {role: standoff, faction: PAF, platform_id: babur_missile, count: 4, loadout: []}
    ao_base_candidates: [pathankot, adampur]
    allows_no_cap: false   # need CAP to deal with F-16s
    intel_tier_range: [medium, high]
    roe_options: [weapons_free, weapons_tight, visual_id_required]
    response_clock_minutes: 20
```

**Adapt field names** to whatever `scenario_templates.yaml` currently uses (check the first existing entry). Do NOT rename existing fields.

### New `ADContribution` entry in outcome

Resolver already emits per-shot `ad_engagement` events with `battery_system`, `base_name`, `target_platform`, `pk`. At end of `resolve()`, aggregate into:

```python
outcome["ad_contributions"] = [
    {
        "battery_id": int,   # derived from battery dict `battery["id"]`
        "system": str,
        "base_name": str,
        "interceptors_fired": int,
        "kills": int,
    },
    ...
]
```

---

## File Structure

**Backend — modified:**
- `backend/content/platforms.yaml` — 4 new munition "platforms".
- `backend/content/scenario_templates.yaml` — 4 new scenario templates.
- `backend/app/engine/vignette/generator.py` — resolve `ao_base_candidates` to concrete AO at planning time (pick random base from list, add ±5 km lat/lon jitter).
- `backend/app/engine/vignette/resolver.py` — append `ad_contributions` summary to `outcome`.
- `backend/app/crud/vignette.py` — respect `planning_state.allows_no_cap` (skip min-squadron validation when true).
- `backend/tests/test_ad_engagement.py` — add stock-bounded + contribution-summary tests.
- `backend/tests/test_scenario_templates.py` — verify new scenarios load + `ao_base_candidates` resolves correctly.
- `backend/tests/test_vignette_commit.py` — verify zero-squadron commit allowed when `allows_no_cap`.

**Frontend — modified:**
- `frontend/src/lib/types.ts` — extend `PlanningState` with `allows_no_cap?: boolean`; extend `VignetteOutcome` with `ad_contributions?: ADContribution[]`.
- `frontend/src/components/vignette/ForceCommitter.tsx` — when `planning.allows_no_cap`, promote "🛡 AD Defense" section at top showing in-coverage batteries + stock; allow commit with zero squadrons.
- `frontend/src/components/vignette/ADContribution.tsx` (new) — per-battery kills + interceptors fired panel.
- `frontend/src/pages/VignetteAAR.tsx` — mount `ADContribution` panel between `ForceExchangeViz` and `MunitionsExpended`.

**Docs:**
- `CLAUDE.md` — strike "AD/SAM-focused vignettes" carry-over if present; add Plan 19 status line.

---

## Task 1: Add 4 munition "platforms" to platforms.yaml

- [ ] **Step 1: Append entries** from the data-shape block above to `backend/content/platforms.yaml`. Put them in a cleanly-commented block at the end with a header like `# --- Cruise munitions / loitering drones (adversary-only, not procurable) ---`.

- [ ] **Step 2: Verify registry loads**

```bash
cd backend && python3 -c "
from app.content.registry import platforms
p = platforms()
for pid in ['yj21_missile', 'cj20_missile', 'babur_missile', 'shahed_drone']:
    assert pid in p, f'missing: {pid}'
    print(f'{pid}: rcs={p[pid].rcs_band}, procurable_by={p[pid].procurable_by}')
"
```
Expected: all 4 print with empty procurable_by.

- [ ] **Step 3: Commit**

```bash
git add backend/content/platforms.yaml
git commit -m "feat(scenarios): 4 adversary munition platforms (YJ-21 / CJ-20 / Babur / Shahed)"
```

---

## Task 2: Support `ao_base_candidates` in generator

**Files:**
- Modify: `backend/app/engine/vignette/generator.py`

- [ ] **Step 1: Read the existing scenario-generation flow**

Open `backend/app/engine/vignette/generator.py::build_planning_state`. Find where `ao` is read from the scenario spec. Most likely it's `scenario.ao` direct copy.

- [ ] **Step 2: Add base-candidate resolver**

Add helper:

```python
def _resolve_ao(
    scenario: "ScenarioTemplate",
    bases_registry: dict[int, dict],
    rng: random.Random,
) -> dict:
    """If scenario has ao_base_candidates, pick one base's coords with jitter.
    Otherwise return scenario.ao as-is."""
    candidates = getattr(scenario, "ao_base_candidates", None) or []
    if not candidates:
        return dict(scenario.ao)
    # Find a base whose template_id matches one of the candidates
    by_tpl = {b.get("template_id"): b for b in bases_registry.values()}
    picks = [by_tpl[t] for t in candidates if t in by_tpl]
    if not picks:
        # Fallback if none of the candidates exist in this campaign
        return dict(scenario.ao) if getattr(scenario, "ao", None) else {
            "region": "unknown", "name": "unknown",
            "lat": 28.0, "lon": 77.0,
        }
    picked = rng.choice(picks)
    # ±5 km jitter in degrees — ~0.045°
    lat_jitter = (rng.random() - 0.5) * 0.09
    lon_jitter = (rng.random() - 0.5) * 0.09
    return {
        "region": picked.get("region", "airbase"),
        "name": f"{picked.get('name', picked.get('template_id', ''))} vicinity",
        "lat": round(picked["lat"] + lat_jitter, 4),
        "lon": round(picked["lon"] + lon_jitter, 4),
    }
```

Replace the current `ao = scenario.ao` assignment with `ao = _resolve_ao(scenario, bases_registry, rng)`.

- [ ] **Step 3: Add `ao_base_candidates` + `allows_no_cap` to `ScenarioTemplate` dataclass**

In `backend/app/content/loaders.py` (or wherever ScenarioTemplate lives — grep `class ScenarioTemplate`), add:

```python
ao_base_candidates: list[str] = field(default_factory=list)
allows_no_cap: bool = False
```

(Use `list` + `field(default_factory=list)` if it's a `@dataclass`.)

- [ ] **Step 4: Expose both on `planning_state`**

In `build_planning_state`, after assembling the state dict, add:

```python
state["allows_no_cap"] = bool(getattr(scenario, "allows_no_cap", False))
```

(ao_base_candidates doesn't need to reach planning_state — resolving to coords is enough.)

- [ ] **Step 5: Test**

Append to `backend/tests/test_scenario_templates.py`:

```python
def test_ao_base_candidates_resolves_to_real_base():
    """A scenario with ao_base_candidates must resolve AO to one of the candidate
    bases (with optional jitter)."""
    # Load a scenario that has ao_base_candidates (plan_cruise_coastal) and
    # pass through build_planning_state with a bases registry containing
    # Thanjavur + Car Nicobar. Assert the AO lat/lon is within ~0.1° of one
    # of them.
    # ... (adapt to existing test fixtures)
```

Use the existing fixture pattern in this file.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(scenarios): ao_base_candidates generator — AOs land near friendly bases with jitter"
```

---

## Task 3: 4 new scenario templates in scenario_templates.yaml

- [ ] **Step 1: Append to `backend/content/scenario_templates.yaml`**

Append the 4 scenarios from the data-shape block at the top of this plan. Match the indentation / field ordering of existing entries in that file — read the first existing scenario (`lac_air_incursion_limited`) and follow its shape exactly.

- [ ] **Step 2: Registry + weight validation**

```bash
cd backend && python3 -c "
from app.content.registry import scenario_templates
s = scenario_templates()
for sid in ['plan_cruise_coastal','paf_cruise_raid_nw','drone_swarm_forward','paf_f16_strike_pkg']:
    assert sid in s, f'missing {sid}'
    print(f'{sid}: weight={s[sid].weight} ao_base_candidates={getattr(s[sid], \"ao_base_candidates\", None)} allows_no_cap={getattr(s[sid], \"allows_no_cap\", False)}')
"
```
All 4 print with correct metadata.

- [ ] **Step 3: Commit**

```bash
git add backend/content/scenario_templates.yaml
git commit -m "feat(scenarios): 4 AD-focused templates — cruise / drone-swarm / F-16 strike-pkg"
```

---

## Task 4: Commit validator respects `allows_no_cap`

**Files:**
- Modify: `backend/app/crud/vignette.py`

- [ ] **Step 1: Find the existing min-squadron check**

Open `backend/app/crud/vignette.py::commit_vignette`. Find the validation block that iterates `committed_force.get("squadrons", [])`. Currently it errors if no squadrons are listed (check the exact error path).

- [ ] **Step 2: Skip min-squadron requirement when planning_state.allows_no_cap is true**

```python
ps = vignette.planning_state or {}
squadrons = committed_force.get("squadrons", [])
if not squadrons and not ps.get("allows_no_cap", False):
    raise CommitValidationError("at least one squadron must be committed")
```

(If the current validator doesn't already error on zero squadrons, that's fine — just ensure this branch doesn't add such a check. The real goal: allow empty squadrons list to flow through without error when `allows_no_cap=true`.)

- [ ] **Step 3: Test**

Add to `backend/tests/test_vignette_commit.py` (or similar):

```python
def test_allows_no_cap_permits_zero_squadron_commit():
    """When scenario has allows_no_cap=true, commit_vignette accepts an empty
    squadrons list — AD defends alone."""
    # Build a vignette with planning_state.allows_no_cap=True. Commit with
    # squadrons=[]. Expect no CommitValidationError.
    # ... (use existing fixture)
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat(scenarios): commit_vignette respects allows_no_cap (AD-only defense)"
```

---

## Task 5: Resolver writes `ad_contributions` summary

**Files:**
- Modify: `backend/app/engine/vignette/resolver.py`

- [ ] **Step 1: Aggregate battery kills from trace**

At the end of `resolve()`, after all rounds complete and before building `outcome`, add:

```python
# Per-battery contribution tally for AAR display.
# ad_engagement events have: kind="ad_engagement", battery_system, base_name,
# target_platform, pk. Each event = 1 interceptor fired. Kill = pk roll
# succeeded; need to detect from the following adv-force decrement in the
# trace, OR from a paired "ad_kill" event if the caller emits one.
contribs: dict[str, dict] = {}
for ev in trace:
    if ev.get("kind") != "ad_engagement":
        continue
    key = f"{ev.get('battery_system')}|{ev.get('base_name')}"
    c = contribs.setdefault(key, {
        "battery_id": ev.get("battery_id"),   # may be None if not threaded
        "system": ev.get("battery_system", "?"),
        "base_name": ev.get("base_name", "?"),
        "interceptors_fired": 0,
        "kills": 0,
    })
    c["interceptors_fired"] += 1
    # If the ad_engagement event has a "hit": True field, count kill. Check
    # the actual shape in ad_engagement.py — update accordingly. If not
    # tracked today, add it now: in ad_engagement.py where `if rng.random()
    # < pk:` fires, write "hit": True on the event before append.
    if ev.get("hit"):
        c["kills"] += 1

outcome["ad_contributions"] = list(contribs.values())
```

- [ ] **Step 2: Thread `hit` + `battery_id` into ad_engagement events**

Open `backend/app/engine/vignette/ad_engagement.py`. Find the block that emits the `ad_engagement` trace event. Currently it likely has:

```python
trace.append({
    "t_min": -5, "kind": "ad_engagement",
    "battery_system": ..., "base_name": ...,
    "target_platform": ..., "pk": ...,
})
```

Extend to include `"battery_id": bat_info["battery"].get("id")` and `"hit": <bool result of the pk roll>` — you'll need to move the PK roll above the trace append so you know the hit outcome, or add a separate "ad_kill" event on hit. Either works; simpler is to include `hit` directly.

- [ ] **Step 3: Test**

In `backend/tests/test_ad_engagement.py` (it exists), add:

```python
def test_ad_contributions_summary_groups_per_battery():
    """resolve() should write an ad_contributions list summarizing per-battery
    interceptors fired + kills."""
    # Set up a scenario with 2 batteries covering the AO, 8 attackers, fixed
    # seed. Assert outcome["ad_contributions"] has 2 entries with nonzero
    # interceptors_fired.
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat(scenarios): per-battery ad_contributions summary on outcome"
```

---

## Task 6: ForceCommitter promotes AD Defense for allows_no_cap scenarios

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/vignette/ForceCommitter.tsx`

- [ ] **Step 1: Extend PlanningState type**

```ts
export interface PlanningState {
  // ... existing fields ...
  allows_no_cap?: boolean;
}
```

- [ ] **Step 2: Add AD Defense section that renders at top when applicable**

In ForceCommitter, after `planning` is available but before the Squadrons section:

```tsx
{planning.allows_no_cap && (
  <section className="bg-slate-900 border border-amber-700/50 rounded-lg p-3">
    <h3 className="text-sm font-bold mb-2 flex items-baseline gap-2">
      🛡 AD Defense <span className="text-[10px] opacity-70 font-normal">(primary defender)</span>
    </h3>
    {/* show adBatteries-in-coverage of planning.ao with current stock */}
    {/* pull adBatteries from store + filter by coverage of planning.ao */}
    {/* simple list — each row: system name, base, stock, in-range ✓/✗ */}
  </section>
)}
```

Minimum viable: show adBatteries covering this AO (haversine filter vs coverage_km). Each row shows `system @ base_short_name · stock/capacity · coverage_km km`. Use the existing `shortBaseName` helper if it's available to the component; otherwise inline it.

- [ ] **Step 3: Allow zero-squadron commit**

Find the commit-button disabled state in ForceCommitter (or in OpsRoom if that's where the button lives). It probably disables when `value.squadrons.length === 0`. Change to:

```ts
const canCommit = planning.allows_no_cap || value.squadrons.length > 0;
```

Button label: if `allows_no_cap && squadrons.length === 0`, show "Commit (AD only)". Else if squadrons > 0, show "Commit (AD + N airframes)". Else default.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm run build 2>&1 | tail -3
cd frontend && npm run test -- --run 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(scenarios): ForceCommitter promotes AD Defense + allows zero-squadron commit"
```

---

## Task 7: AAR ADContribution panel

**Files:**
- Create: `frontend/src/components/vignette/ADContribution.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/pages/VignetteAAR.tsx`

- [ ] **Step 1: Extend VignetteOutcome type**

```ts
export interface ADContribution {
  battery_id?: number;
  system: string;
  base_name: string;
  interceptors_fired: number;
  kills: number;
}

// inside VignetteOutcome interface:
ad_contributions?: ADContribution[];
```

- [ ] **Step 2: Create the panel**

```tsx
// frontend/src/components/vignette/ADContribution.tsx
import type { VignetteOutcome } from "../../lib/types";

export function ADContributionPanel({ outcome }: { outcome: VignetteOutcome }) {
  const rows = outcome.ad_contributions ?? [];
  if (rows.length === 0) return null;
  const totalKills = rows.reduce((a, r) => a + r.kills, 0);
  const totalFired = rows.reduce((a, r) => a + r.interceptors_fired, 0);
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-sm font-bold mb-2 flex items-baseline justify-between">
        <span>🛡 AD Performance</span>
        <span className="text-xs opacity-60 font-normal">
          {totalKills} intercepts / {totalFired} interceptors fired
        </span>
      </h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left opacity-60 border-b border-slate-800">
            <th className="py-1 pr-2 font-medium">System</th>
            <th className="py-1 px-2 font-medium">Base</th>
            <th className="py-1 px-2 font-medium text-right">Fired</th>
            <th className="py-1 pl-2 font-medium text-right">Kills</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.battery_id ?? i} className="border-b border-slate-900/60">
              <td className="py-1 pr-2 font-semibold">{r.system}</td>
              <td className="py-1 px-2 opacity-80">{r.base_name}</td>
              <td className="py-1 px-2 text-right">{r.interceptors_fired}</td>
              <td className="py-1 pl-2 text-right text-emerald-300">{r.kills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Mount in VignetteAAR.tsx**

After the `ForceExchangeViz` component, before `MunitionsExpended`:

```tsx
import { ADContributionPanel } from "../components/vignette/ADContribution";
// ...
{outcome && <ADContributionPanel outcome={outcome} />}
```

- [ ] **Step 4: Test**

Add minimal test at `frontend/src/components/vignette/__tests__/ADContribution.test.tsx`: render with 2 entries, assert table rows + total computed.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(scenarios): AAR AD Performance panel — per-battery kills + interceptors fired"
```

---

## Task 8: Final tests + CLAUDE.md + deploy

- [ ] **Step 1: Full backend sweep**

```bash
cd backend && python3 -m pytest -q
```
Expected: all tests pass. Count should be 520 + new ones from tasks 2/4/5.

- [ ] **Step 2: Full frontend sweep**

```bash
cd frontend && npm run test -- --run && npm run build
```

- [ ] **Step 3: CLAUDE.md updates**

If the carry-over list has a "AD/SAM-focused vignettes" entry, strike it as RESOLVED in Plan 19. Add a status line after Plan 18:

```markdown
- **Plan 19 (AD-Focused Scenario Pack)** — ✅ done. 5XX backend tests + 18X frontend vitest tests. Four new scenario archetypes (`plan_cruise_coastal`, `paf_cruise_raid_nw`, `drone_swarm_forward`, `paf_f16_strike_pkg`) that place AOs at/near friendly airbases so SAM coverage actually matters. New scenario fields `ao_base_candidates` (generator picks random base + ±5 km jitter) and `allows_no_cap` (commit validator skips min-squadron check for AD-only defense). 4 non-procurable adversary munition platforms (YJ-21, CJ-20, Babur, Shahed-class) represented as low-RCS airframes with empty loadouts so the existing resolver treats them as AD targets with no BVR return fire. Resolver writes `ad_contributions` summary to outcome; AAR shows per-battery kills + interceptors fired. ForceCommitter promotes "🛡 AD Defense" section and allows zero-squadron commit on AD-only scenarios. Plan file: `docs/superpowers/plans/2026-04-21-ad-focused-scenarios-plan.md`.
```

Bump last-updated date.

- [ ] **Step 4: Commit + push + deploy**

```bash
git add CLAUDE.md
git commit -m "docs: Plan 19 done — AD-focused scenario pack"
git push
./deploy.sh
```

Frontend auto-deploys via Vercel.

- [ ] **Step 5: Prod smoke**

```bash
curl -s "https://pmc-tycoon-api.skdev.one/api/content/platforms" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ids = {p['id'] for p in d['platforms']}
for mid in ['yj21_missile', 'cj20_missile', 'babur_missile', 'shahed_drone']:
    print(f'{mid}: {\"✓\" if mid in ids else \"MISSING\"}')
"
```
All 4 must show ✓.

---

## Self-Review

**1. Spec coverage.**

| Design decision | Task |
|---|---|
| Cruise/drone as airframes with empty loadout | Task 1 |
| `ao_base_candidates` generator picker | Task 2 |
| `allows_no_cap` commit-validator flag | Task 4 |
| 4 scenario archetypes | Task 3 |
| ForceCommitter AD Defense promotion + zero-squadron commit | Task 6 |
| AAR per-battery contribution panel | Task 7 |

All covered.

**2. Placeholder scan.** Tasks 2, 4, and 6 have "adapt to existing code" notes where variable names depend on current file shape — necessary because the target files have evolved across Plans 3/4/17/18. All other tasks have concrete code.

**3. Type consistency.**
- `ADContribution` shape identical backend-to-frontend.
- `allows_no_cap: bool` default false everywhere.
- `ao_base_candidates: list[str]` defaults to empty list.
- Cruise/drone platform schema matches existing PlatformSpec fields.

No inconsistencies.

---

## Execution

Committed directly to `main` per user preference. Backend tasks 1-5 via one batched subagent; frontend tasks 6-7 via a second subagent; controller handles Task 8 (docs + deploy).
