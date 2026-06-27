# Chakravyuh v2 Phase 3 — Tame the Heavy Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps. Commit directly to `main`.

**Goal:** Lower cognitive load on the three heaviest interactions — recommended force-package + plain odds in the vignette, one-tap "restock low depots", and a regrouped menu — all **frontend-only, no engine/route changes**.

**Architecture:** Two pure, unit-tested helpers (`forceRecommendation.ts`, `restock.ts`) drive advisory UI in `ForceCommitter` and `AcquisitionPipeline`; the side menu in `CampaignMapView` is reorganized into Force/Operations/Records/Settings. No backend changes.

**Tech Stack:** React 19 + TS + Zustand + Vitest. Capacitor Android target (tap not hover, `safe-pt`/`safe-pb`, ≥44px targets).

---

### Task 1: `forceRecommendation` pure helper (recommend package + odds)

**Files:**
- Create: `frontend/src/lib/forceRecommendation.ts`
- Test: `frontend/src/lib/__tests__/forceRecommendation.test.ts`

**Context:** Types in `frontend/src/lib/types.ts`: `PlanningState` has `eligible_squadrons: EligibleSquadron[]` (each `{squadron_id, readiness_pct, airframes_available, range_tier?: "A"|"B"|"C", ...}`), `adversary_force: AdversaryForceEntry[]` (`{role, count, ...}`), `adversary_force_observed?: AdversaryForceObserved[]` (`{role?, count?, count_range?: [number,number], probable_platforms}`), `allowed_ind_roles: string[]`, `roe_options: ROE[]`, `awacs_covering?: AwacsCovering[]`, `intel_quality?: { tier: "low"|"medium"|"high"|"perfect" }`, `allows_no_cap?: boolean`. `VignetteCommitPayload = { squadrons: {squadron_id, airframes}[], support: {awacs, tanker, sead_package}, roe: ROE }`. Confirm exact field names by reading types.ts before finalizing.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/forceRecommendation.test.ts
import { describe, it, expect } from "vitest";
import { recommendPackage, estimateOdds } from "../forceRecommendation";
import type { PlanningState } from "../types";

function planning(over: Partial<PlanningState> = {}): PlanningState {
  return {
    scenario_id: "s", scenario_name: "Test", ao: { lat: 0, lon: 0 } as never,
    response_clock_minutes: 45,
    adversary_force: [{ role: "fighter", faction: "PLAAF", platform_id: "j16", count: 6, loadout: [] } as never],
    eligible_squadrons: [
      { squadron_id: 1, name: "A", platform_id: "rafale_f4", base_id: 1, base_name: "X", distance_km: 100, in_range: true, range_tier: "A", airframes_available: 12, readiness_pct: 80, xp: 0, loadout: [] } as never,
      { squadron_id: 2, name: "B", platform_id: "su30mki", base_id: 1, base_name: "X", distance_km: 100, in_range: true, range_tier: "A", airframes_available: 10, readiness_pct: 40, xp: 0, loadout: [] } as never,
      { squadron_id: 3, name: "C", platform_id: "mig29", base_id: 2, base_name: "Y", distance_km: 600, in_range: false, range_tier: "C", airframes_available: 8, readiness_pct: 90, xp: 0, loadout: [] } as never,
    ],
    allowed_ind_roles: ["fighter"], roe_options: ["weapons_free", "weapons_tight"] as never,
    objective: {} as never,
    awacs_covering: [{ base_name: "X", distance_km: 200 } as never],
    ...over,
  } as PlanningState;
}

describe("recommendPackage", () => {
  it("picks A-tier ready squadrons, enables AWACS when covered, defaults weapons_free", () => {
    const rec = recommendPackage(planning());
    const ids = rec.squadrons.map((s) => s.squadron_id);
    expect(ids).toContain(1);          // A-tier, 80% ready
    expect(ids).not.toContain(3);      // C-tier (out of range) excluded
    expect(rec.support.awacs).toBe(true);
    expect(rec.support.tanker).toBe(false);
    expect(rec.roe).toBe("weapons_free");
  });

  it("sizes the package toward ~1.5x the adversary count", () => {
    const rec = recommendPackage(planning());
    const committed = rec.squadrons.reduce((s, x) => s + x.airframes, 0);
    expect(committed).toBeGreaterThanOrEqual(9); // 1.5 * 6
  });
});

describe("estimateOdds", () => {
  it("Strong favorite when heavily outnumbering with detection edge", () => {
    const p = planning();
    const odds = estimateOdds(p, { squadrons: [{ squadron_id: 1, airframes: 12 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Strong favorite");
  });
  it("Risky when outnumbered", () => {
    const p = planning();
    const odds = estimateOdds(p, { squadrons: [{ squadron_id: 1, airframes: 2 }], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Risky");
  });
  it("Risky with zero committed", () => {
    const odds = estimateOdds(planning(), { squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" } as never);
    expect(odds.label).toBe("Risky");
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- forceRecommendation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/lib/forceRecommendation.ts`**

```ts
import type { PlanningState, VignetteCommitPayload, ROE } from "./types";

function estimateAdversaryCount(planning: PlanningState): number {
  const obs = planning.adversary_force_observed;
  if (obs && obs.length) {
    return Math.round(
      obs.reduce((sum, o) => {
        if (o.count_range) return sum + (o.count_range[0] + o.count_range[1]) / 2;
        if (typeof o.count === "number") return sum + o.count;
        return sum;
      }, 0),
    );
  }
  return (planning.adversary_force || []).reduce((s, a) => s + (a.count || 0), 0);
}

function advHasAirDefense(planning: PlanningState): boolean {
  const obs = planning.adversary_force_observed;
  if (obs && obs.length) return obs.some((o) => o.role === "air_defense");
  return (planning.adversary_force || []).some((a) => a.role === "air_defense");
}

/** A sensible default force package the player can then tweak. Advisory only. */
export function recommendPackage(planning: PlanningState): VignetteCommitPayload {
  const target = Math.ceil(estimateAdversaryCount(planning) * 1.5);
  const candidates = (planning.eligible_squadrons || [])
    .filter((s) => s.range_tier === "A" && s.readiness_pct >= 50)
    .sort((a, b) => b.readiness_pct - a.readiness_pct || b.airframes_available - a.airframes_available);

  const squadrons: { squadron_id: number; airframes: number }[] = [];
  let committed = 0;
  for (const s of candidates) {
    if (committed >= target) break;
    squadrons.push({ squadron_id: s.squadron_id, airframes: s.airframes_available });
    committed += s.airframes_available;
  }

  const opts = planning.roe_options || [];
  const roe: ROE = (opts as string[]).includes("weapons_free")
    ? ("weapons_free" as ROE)
    : ((opts[0] as ROE) ?? ("weapons_free" as ROE));

  return {
    squadrons,
    support: {
      awacs: (planning.awacs_covering?.length ?? 0) > 0,
      tanker: false,
      sead_package: advHasAirDefense(planning),
    },
    roe,
  };
}

export interface OddsEstimate {
  label: "Strong favorite" | "Even" | "Risky";
  reason: string;
}

/** Transparent client-side odds estimate (force ratio + detection edge). Advisory. */
export function estimateOdds(planning: PlanningState, value: VignetteCommitPayload): OddsEstimate {
  const committed = (value.squadrons || []).reduce((s, x) => s + (x.airframes || 0), 0);
  if (committed === 0) return { label: "Risky", reason: "No fighters committed" };
  const adv = estimateAdversaryCount(planning);
  const ratio = committed / Math.max(1, adv);
  const tier = planning.intel_quality?.tier;
  const detectionEdge =
    (value.support.awacs && (planning.awacs_covering?.length ?? 0) > 0) ||
    tier === "high" || tier === "perfect";
  const ratioStr = `${committed} vs ~${adv}`;
  if (ratio >= 1.8 || (ratio >= 1.4 && detectionEdge)) {
    return { label: "Strong favorite", reason: detectionEdge ? `${ratioStr} + detection edge` : ratioStr };
  }
  if (ratio >= 0.9) return { label: "Even", reason: ratioStr };
  return { label: "Risky", reason: `Outnumbered (${ratioStr})` };
}
```

> If `types.ts` field names differ (e.g. `intel_quality` shape, `awacs_covering`), adjust the helper to the real types — keep the test intent. Do not weaken assertions.

- [ ] **Step 4: Run the test, verify PASS**

Run: `cd frontend && npm test -- forceRecommendation && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/forceRecommendation.ts frontend/src/lib/__tests__/forceRecommendation.test.ts
git commit -m "feat(v2): force-package recommendation + odds estimate helpers"
```

---

### Task 2: Wire Auto-fill + odds chip into ForceCommitter

**Files:**
- Modify: `frontend/src/components/vignette/ForceCommitter.tsx`
- Test: `frontend/src/components/vignette/__tests__/ForceCommitter.recommend.test.tsx`

**Context:** Read `ForceCommitter.tsx`. It takes `planning: PlanningState`, `value: VignetteCommitPayload`, `onChange(next: VignetteCommitPayload)`. The existing 6 tests use `getAllByRole("checkbox", { name: /sqn/i })`. Keep all existing behavior.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/vignette/__tests__/ForceCommitter.recommend.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceCommitter } from "../ForceCommitter";

// Build a minimal planning with one A-tier ready squadron (mirror the shape the
// existing ForceCommitter tests use — read that file and reuse its planning fixture).
const planning = {/* fill from the existing ForceCommitter test fixture, ensure ≥1 range_tier:"A", readiness_pct>=50 squadron */} as never;

describe("ForceCommitter recommend + odds", () => {
  it("Auto-fill button populates a package via onChange", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /auto-fill|recommend/i }));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg.squadrons.length).toBeGreaterThan(0);
  });

  it("renders an odds estimate chip", () => {
    render(<ForceCommitter planning={planning} value={{ squadrons: [{ squadron_id: 1, airframes: 12 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={vi.fn()} />);
    expect(screen.getByText(/strong favorite|even|risky/i)).toBeInTheDocument();
  });
});
```

> READ the existing `ForceCommitter.test.tsx` first and copy its `planning` fixture into this file (with at least one `range_tier: "A"`, `readiness_pct >= 50` eligible squadron) so the recommendation is non-empty.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- ForceCommitter.recommend`
Expected: FAIL — no auto-fill button / odds chip.

- [ ] **Step 3: Implement**

In `ForceCommitter.tsx`:
- Import `{ recommendPackage, estimateOdds }` from `../../lib/forceRecommendation`.
- Near the top of the rendered committer (above the squadron list), add an **"✨ Auto-fill recommended"** button (`min-h-[44px]`, tap) → `onClick={() => onChange(recommendPackage(planning))}`.
- Add an **odds chip** that calls `estimateOdds(planning, value)` and renders the `label` with a tone color (Strong favorite → emerald, Even → amber, Risky → rose) + the `reason` in small text. Place it where the player can see it while editing (e.g. near the commit summary or top of the committer). It recomputes on each render as `value` changes.
- Keep everything else (squadron checkboxes, support toggles, ROE) intact.

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- ForceCommitter && npx tsc --noEmit`
Expected: new recommend tests + existing 6 ForceCommitter tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/components/vignette/ForceCommitter.tsx frontend/src/components/vignette/__tests__/ForceCommitter.recommend.test.tsx
git commit -m "feat(v2): Auto-fill recommended package + odds chip in ForceCommitter"
```

---

### Task 3: `restock` pure helper (build orders from low-stock notifications)

**Files:**
- Create: `frontend/src/lib/restock.ts`
- Test: `frontend/src/lib/__tests__/restock.test.ts`

**Context:** Notifications (`frontend/src/lib/types.ts` `Notification`) have `kind` (`"low_stock"|"empty_stock"|...`), `action_url` like `/campaign/1/procurement?tab=acquisitions&view=offers&offer=missiles&missile={weapon_id}&base={base_id}&qty={topup}`. Acquisition create payload type (read the exact name in `types.ts`, likely `AcquisitionCreatePayload` or similar used by `api.createAcquisition`) has fields: `platform_id, quantity, first_delivery_year, first_delivery_quarter, foc_year, foc_quarter, total_cost_cr, preferred_base_id, kind, target_battery_id`. The weapons catalog type (read its name — likely `Weapon` with `unit_cost_cr`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/restock.test.ts
import { describe, it, expect } from "vitest";
import { buildRestockOrders } from "../restock";

const weaponsById = { meteor: { unit_cost_cr: 18 }, astra_mk1: { unit_cost_cr: 7 } } as never;

const lowStock = {
  id: "low_stock:3:meteor", kind: "low_stock", severity: "warning",
  title: "Meteor low at Ambala", body: "reorder",
  action_url: "/campaign/1/procurement?tab=acquisitions&view=offers&offer=missiles&missile=meteor&base=3&qty=40",
} as never;
const infoNote = { id: "x", kind: "rd_completed", severity: "info", title: "X", body: "", action_url: "/x" } as never;

describe("buildRestockOrders", () => {
  it("builds a missile_batch order per stock warning with correct qty/cost/base", () => {
    const orders = buildRestockOrders([lowStock, infoNote], weaponsById, 2027, 2);
    expect(orders).toHaveLength(1);
    const o = orders[0];
    expect(o.kind).toBe("missile_batch");
    expect(o.platform_id).toBe("meteor");
    expect(o.quantity).toBe(40);
    expect(o.preferred_base_id).toBe(3);
    expect(o.total_cost_cr).toBe(40 * 18);
    // first delivery = +2 quarters from 2027 Q2 → 2027 Q4; FOC = +4 → 2028 Q2
    expect([o.first_delivery_year, o.first_delivery_quarter]).toEqual([2027, 4]);
    expect([o.foc_year, o.foc_quarter]).toEqual([2028, 2]);
  });

  it("skips notifications whose action_url lacks missile/base/qty", () => {
    const bad = { id: "low_stock:bad", kind: "low_stock", severity: "warning", title: "t", body: "", action_url: "/campaign/1/procurement" } as never;
    expect(buildRestockOrders([bad], weaponsById, 2027, 2)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- restock`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/lib/restock.ts`**

```ts
import type { Notification, AcquisitionCreatePayload, Weapon } from "./types";

function addQuarters(year: number, quarter: number, n: number): [number, number] {
  const total = (quarter - 1) + n;            // quarter is 1..4
  return [year + Math.floor(total / 4), (total % 4) + 1];
}

function parseStockNotification(n: Notification): { weaponId: string; baseId: number; qty: number } | null {
  if (n.kind !== "low_stock" && n.kind !== "empty_stock") return null;
  const qs = n.action_url.split("?")[1];
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const weaponId = params.get("missile");
  const baseRaw = params.get("base");
  const qtyRaw = params.get("qty");
  if (!weaponId || !baseRaw || !qtyRaw) return null;
  const baseId = parseInt(baseRaw, 10);
  const qty = parseInt(qtyRaw, 10);
  if (!Number.isFinite(baseId) || !Number.isFinite(qty) || qty <= 0) return null;
  return { weaponId, baseId, qty };
}

/**
 * Turn low/empty-stock notifications into missile_batch acquisition orders.
 * Pure + deterministic — the UI signs each via the normal acquisition flow.
 */
export function buildRestockOrders(
  notifications: Notification[],
  weaponsById: Record<string, Weapon>,
  currentYear: number,
  currentQuarter: number,
): AcquisitionCreatePayload[] {
  const [fdY, fdQ] = addQuarters(currentYear, currentQuarter, 2);
  const [focY, focQ] = addQuarters(currentYear, currentQuarter, 4);
  const orders: AcquisitionCreatePayload[] = [];
  for (const n of notifications) {
    const p = parseStockNotification(n);
    if (!p) continue;
    const unit = weaponsById[p.weaponId]?.unit_cost_cr ?? 0;
    orders.push({
      platform_id: p.weaponId,
      quantity: p.qty,
      first_delivery_year: fdY,
      first_delivery_quarter: fdQ,
      foc_year: focY,
      foc_quarter: focQ,
      total_cost_cr: p.qty * unit,
      preferred_base_id: p.baseId,
      kind: "missile_batch",
      target_battery_id: null,
    });
  }
  return orders;
}
```

> Adjust the imported type names to the real ones in `types.ts` (e.g. if the payload type or `Weapon`/`unit_cost_cr` differ). Keep the test intent. If `AcquisitionCreatePayload` doesn't include `target_battery_id`, omit it.

- [ ] **Step 4: Run the test, verify PASS**

Run: `cd frontend && npm test -- restock && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/lib/restock.ts frontend/src/lib/__tests__/restock.test.ts
git commit -m "feat(v2): buildRestockOrders helper (low-stock notifications -> orders)"
```

---

### Task 4: "Restock all low depots" button in AcquisitionPipeline

**Files:**
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx` (and `ProcurementHub.tsx` if notifications aren't already available there)
- Test: `frontend/src/components/procurement/__tests__/AcquisitionPipeline.restock.test.tsx`

**Context:** Read `AcquisitionPipeline.tsx` — it has `weaponsById`, the bases list, current year/quarter (from campaign), an `onSign(payload)` (or directly `api.createAcquisition` / a store action) used by `MissileBatchOfferCard`. It needs the `notifications` (low/empty stock) — get them from the store (`useCampaignStore(s => s.notifications)` + `loadNotifications`) if not already passed in.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/procurement/__tests__/AcquisitionPipeline.restock.test.tsx
// Mirror how other AcquisitionPipeline tests render it (read existing tests for props/store-mock).
// Provide 2 low_stock notifications in the store mock + a weaponsById; assert a
// "Restock all low depots (2)" button appears and clicking it triggers 2 sign/createAcquisition calls.
```

> Read the existing AcquisitionPipeline test(s) + how the component is wired (props vs store). Write a test that: provides 2 low-stock notifications (with valid `action_url` missile/base/qty), renders the pipeline, finds a button matching `/restock all low/i` showing count 2, clicks it, and asserts the sign/create path is invoked twice (spy on the store action or `onSign`). Keep intent; match the component's real wiring.

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd frontend && npm test -- AcquisitionPipeline.restock`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `AcquisitionPipeline.tsx`:
- Import `{ buildRestockOrders }` from `../../lib/restock`.
- Source low/empty-stock `notifications` (from the store; load on mount if needed).
- Compute `const restockOrders = buildRestockOrders(notifications, weaponsById, currentYear, currentQuarter)`.
- When `restockOrders.length > 0`, render a prominent **"⚡ Restock all low depots ({n})"** button (`min-h-[44px]`) in the Missiles/Offers area. On tap, sign each order through the SAME path the missile cards use (`onSign(order)` per order, or call the create action per order). Show a brief toast/confirmation if that's the existing pattern. Disable while submitting.
- Do not change the per-card manual flow.

In `ProcurementHub.tsx`: if `AcquisitionPipeline` doesn't already receive notifications/loader, ensure they're loaded (the store already has `loadNotifications`).

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test -- AcquisitionPipeline && npx tsc --noEmit`
Expected: new restock test + existing AcquisitionPipeline tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/components/procurement/AcquisitionPipeline.tsx frontend/src/pages/ProcurementHub.tsx frontend/src/components/procurement/__tests__/AcquisitionPipeline.restock.test.tsx
git commit -m "feat(v2): one-tap Restock all low depots in AcquisitionPipeline"
```

---

### Task 5: Regroup the side menu (Force / Operations / Records / Settings)

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`
- Test: `frontend/src/pages/__tests__/CampaignMapView.menu.test.tsx` (only if a lightweight render test is feasible; otherwise rely on manual + existing coverage — see note)

**Context:** Read the menu section of `CampaignMapView.tsx`. Currently: **Force** (Hangar, Armory), **Operations** (Strike Command, Procurement, Intel, Objectives, Combat History, Performance, [White Paper]), **Settings** (…). Move **Combat History** + **Performance** out of Operations into a NEW **Records** section between Operations and Settings. No route/page/link-target changes — only which section header each Link sits under.

- [ ] **Step 1: Make the change**

In the menu JSX, add a `Records` section header (same styling as the other `font-tech text-[10px] uppercase ... text-amber-500/70` headers) and move the existing **Combat History** and **Performance** `<Link>`s under it. Operations keeps Strike Command, Procurement, Intel, Objectives (+ White Paper when complete). Leave every `to=` and `onClick` exactly as-is.

- [ ] **Step 2: Verify (build + existing suite)**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: tsc clean; full suite green (no existing CampaignMapView menu test exists per exploration, so nothing should break). If you add a small test, render the menu (open it) and assert a "Records" group exists with Combat History + Performance — but only if you can mount CampaignMapView cleanly in jsdom (it uses MapLibre; the exploration notes it has no unit test). If mounting is impractical, SKIP adding a test and note it; the change is a pure JSX regroup.

- [ ] **Step 3: Commit**

```bash
cd /Users/rsumit123/work/defense-game
git add frontend/src/pages/CampaignMapView.tsx frontend/src/pages/__tests__/ 2>/dev/null || git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(v2): regroup side menu into Force / Operations / Records / Settings"
```

---

### Task 6: Full suite, Android build, docs, debug APK

**Files:** `CLAUDE.md`, `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Suites + typecheck**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npx tsc --noEmit && npm test
```
Expected: frontend grows from 242; all green; tsc clean. (Backend unchanged — optional `cd backend && python3 -m pytest -q` should still be 675.)

- [ ] **Step 2: Android build**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build && npm run cap:sync
```

- [ ] **Step 3: Update docs** — add a CLAUDE.md "Current status" bullet for v2 Phase 3 (recommended package + odds chip; one-tap restock; menu regroup into Force/Operations/Records), note the new frontend test count + link spec/plan, note Phase 4 remains. Add a dated ROADMAP note + bump "Last updated".

- [ ] **Step 4: Commit + push**

```bash
cd /Users/rsumit123/work/defense-game
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(v2): mark Phase 3 heavy-screen taming done"
git push origin main
```

- [ ] **Step 5: Build the debug APK (controller, after the phase)**

```bash
cd /Users/rsumit123/work/defense-game/frontend && npm run build && npm run cap:sync
cd android && JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk  (send to user; note: uninstall the Play build first to avoid signature conflict)
```

---

## Self-Review

**Spec coverage:** Recommended package + odds (T1 helper, T2 wiring). One-tap restock (T3 helper, T4 wiring). Menu regroup (T5). Android + debug APK (T6). All frontend-only; no backend/route changes (matches the decided forks). ✓

**Placeholder scan:** Full code for the two pure helpers + their tests (T1, T3). Wiring tasks (T2, T4, T5) instruct read-first and give exact integration points + intent-fixed tests; T2/T4 tests say to copy the real fixture/wiring from existing tests (not weakenable). T5 explicitly allows skipping a test if CampaignMapView can't mount in jsdom (documented reason, not a silent gap). ✓

**Type consistency:** `recommendPackage`/`estimateOdds`/`OddsEstimate` (T1) consumed by ForceCommitter (T2). `buildRestockOrders` (T3) consumed by AcquisitionPipeline (T4). `VignetteCommitPayload`/`PlanningState`/`AcquisitionCreatePayload`/`Notification`/`Weapon` are existing types (verified during exploration; implementers confirm exact field names before finalizing). No new shared types introduced. ✓
