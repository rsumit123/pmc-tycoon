# Sovereign Shield — Frontend MVP Part 3: Vignettes + Intel Screens (Plan 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the end-of-turn gameplay loop in the UI. Each quarter the player reviews intel + reads an LLM intel brief, clicks "End Turn," and if a vignette fires they enter an **Ops Room** to commit squadrons / support / ROE. After commit, the backend resolver fires and the **AAR Reader** displays the LLM narrative alongside the outcome summary.

**Architecture:**
- Three new pages routed from `CampaignMapView`: `/campaign/:id/intel`, `/campaign/:id/vignette/:vid` (Ops Room), `/campaign/:id/vignette/:vid/aar`. A header badge on the map view surfaces a **pending vignette** so the player is pulled into the Ops Room before normal play resumes.
- The vignette flow is **planning-state-driven**: the backend owns geography/readiness eligibility (`planning_state.eligible_squadrons`) and the UI is a thin renderer plus commit form. ROE + support toggles are taken verbatim from `planning_state.roe_options` and the fixed support triad.
- Narrative content (AAR + intel brief) is fetched from the Plan 5 endpoints on mount of the relevant screen. The `campaignStore` caches by `subject_id` so a revisit is free. If the backend returns 409 (ineligible) we surface a friendly inline message; 502 (OpenRouter down) falls back to the stubbed `aar_text` field already on the vignette row.
- Reuses Plan 6 primitives: `SwipeStack` (intel card reader), `CommitHoldButton` (vignette commit), `RadarChart` (adversary vs friendly force-composition display), `PlatformDossier` (tap any squadron in the Ops Room to see the platform card). No new primitives shipped in this plan.
- No backend changes — all wiring uses existing endpoints. Plan 3/4/5 shipped every API this plan consumes.

**Tech Stack:** React 19, TS 5.9, Zustand 5, React Router 7, Tailwind v4 (all existing). No new dependencies.

---

## Scope reminder

**In scope:**
- API client methods + store slices for vignettes, intel, narratives
- `IntelCard` + `IntelSwipeStack` component (reuses `SwipeStack`)
- `IntelBriefReader` component (generates LLM intel brief on demand)
- `AARReader` component (generates LLM AAR on demand, renders outcome summary)
- `ForceCommitter` component (squadron multi-select with airframes stepper + support toggles + ROE dropdown)
- `OpsRoom` page (planning state display + ForceCommitter + hold-to-commit)
- `VignetteAAR` page (outcome + AARReader)
- `IntelInbox` page (intel brief at top + swipe-stack of quarter's intel cards)
- Pending-vignette badge on `CampaignMapView` header + Intel link
- Three new routes in `App.tsx`
- Docs + ROADMAP flip to done

**Out of scope (explicit deferrals):**
- 2D NATO-symbol tactical replay of the event trace — V1.1 per ROADMAP (risk addressed by ROADMAP §V1.5+ backlog line "2D NATO-symbol tactical replay")
- Drag-strike-route gesture on the map — V1.5+
- Intel-card long-press action menu (pin / share / archive) — no mechanical effect, parked
- `IntelContactsLayer` hydration on the map — flagged as carry-over for Plan 10; `CampaignMapView` still passes `contacts={[]}` after this plan
- Year-recap toast on Q4 rollover — Plan 9 (Campaign End + Polish)
- Ace-name surfacing after notable wins — Plan 9
- Editing / re-committing a vignette after submission — the backend resolves immediately and returns 409 on second commit; UI treats resolved vignettes as read-only
- Auto-invoking `generateIntelBrief` during `advanceTurn` — kept user-triggered per Plan 5's deliberate design (replay determinism)

---

## File Structure

**Frontend (create):**
- `frontend/src/components/intel/IntelCard.tsx`
- `frontend/src/components/intel/IntelSwipeStack.tsx`
- `frontend/src/components/intel/IntelBriefReader.tsx`
- `frontend/src/components/intel/__tests__/IntelCard.test.tsx`
- `frontend/src/components/intel/__tests__/IntelSwipeStack.test.tsx`
- `frontend/src/components/intel/__tests__/IntelBriefReader.test.tsx`
- `frontend/src/components/vignette/AARReader.tsx`
- `frontend/src/components/vignette/ForceCommitter.tsx`
- `frontend/src/components/vignette/__tests__/AARReader.test.tsx`
- `frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx`
- `frontend/src/pages/OpsRoom.tsx`
- `frontend/src/pages/VignetteAAR.tsx`
- `frontend/src/pages/IntelInbox.tsx`
- `frontend/src/lib/__tests__/vignettes_api.test.ts`

**Frontend (modify):**
- `frontend/src/lib/api.ts` — add `getVignettesPending`, `getVignette`, `commitVignette`, `getIntel`, `listNarratives`, `generateAAR`, `generateIntelBrief`
- `frontend/src/lib/types.ts` — already has `Vignette`, `IntelCard`, `CampaignNarrative`, `GenerateNarrativeResponse`; only add `VignetteLookup` helper type if needed (probably not)
- `frontend/src/store/campaignStore.ts` — add `pendingVignettes`, `currentVignette`, `intelCards`, `narrativesByKey` state + actions
- `frontend/src/pages/CampaignMapView.tsx` — add Intel nav button; show pending-vignette alert when `pendingVignettes.length > 0`
- `frontend/src/App.tsx` — add 3 new routes

**Docs (modify):**
- `docs/superpowers/plans/ROADMAP.md` — flip Plan 8 to 🟢
- `CLAUDE.md` — update current status block + carry-overs list

**No backend changes.**

---

## Task List (12 tasks)

### Task 1: API client methods + vitest coverage

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/__tests__/vignettes_api.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/src/lib/__tests__/vignettes_api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, http } from "../api";

describe("vignettes + intel + narratives api", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("getVignettesPending GETs pending endpoint", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { vignettes: [] } });
    const r = await api.getVignettesPending(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/pending");
    expect(r.vignettes).toEqual([]);
  });

  it("getVignette GETs single vignette", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { id: 3 } });
    await api.getVignette(7, 3);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3");
  });

  it("commitVignette POSTs payload", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { id: 3, status: "resolved" } });
    const payload = { squadrons: [{ squadron_id: 1, airframes: 8 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" as const };
    await api.commitVignette(7, 3, payload);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3/commit", payload);
  });

  it("getIntel GETs with year+quarter filter", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { total: 0, cards: [] } });
    await api.getIntel(7, { year: 2027, quarter: 2 });
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/intel", { params: { year: 2027, quarter: 2 } });
  });

  it("generateAAR POSTs aar endpoint", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { text: "…", cached: false, kind: "aar", subject_id: "vig-3" } });
    await api.generateAAR(7, 3);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3/aar");
  });

  it("generateIntelBrief POSTs brief endpoint", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { text: "…", cached: false, kind: "intel_brief", subject_id: "2027-Q2" } });
    await api.generateIntelBrief(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/intel-briefs/generate");
  });

  it("listNarratives GETs with kind filter", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { narratives: [] } });
    await api.listNarratives(7, "intel_brief");
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/narratives", { params: { kind: "intel_brief" } });
  });
});
```

- [ ] **Step 2: Run — expect FAIL (methods missing)**

Run: `cd frontend && npm test -- --run src/lib/__tests__/vignettes_api.test.ts`
Expected: failures referencing `getVignettesPending is not a function` etc.

- [ ] **Step 3: Implement the methods**

Append to `frontend/src/lib/api.ts`, extending the `api` object and the import list:

```typescript
// add imports to the existing type import block:
//   VignetteListResponse, Vignette, VignetteCommitPayload,
//   IntelListResponse, IntelCard,
//   CampaignNarrativeListResponse, GenerateNarrativeResponse, NarrativeKind,

// inside the `api` object, after createAcquisition:

  async getVignettesPending(campaignId: number): Promise<VignetteListResponse> {
    const { data } = await http.get<VignetteListResponse>(
      `/api/campaigns/${campaignId}/vignettes/pending`,
    );
    return data;
  },

  async getVignette(campaignId: number, vignetteId: number): Promise<Vignette> {
    const { data } = await http.get<Vignette>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}`,
    );
    return data;
  },

  async commitVignette(
    campaignId: number,
    vignetteId: number,
    payload: VignetteCommitPayload,
  ): Promise<Vignette> {
    const { data } = await http.post<Vignette>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}/commit`,
      payload,
    );
    return data;
  },

  async getIntel(
    campaignId: number,
    filter: { year?: number; quarter?: number } = {},
  ): Promise<IntelListResponse> {
    const params: Record<string, number> = {};
    if (filter.year != null) params.year = filter.year;
    if (filter.quarter != null) params.quarter = filter.quarter;
    const { data } = await http.get<IntelListResponse>(
      `/api/campaigns/${campaignId}/intel`,
      { params },
    );
    return data;
  },

  async listNarratives(
    campaignId: number,
    kind?: NarrativeKind,
  ): Promise<CampaignNarrativeListResponse> {
    const params = kind ? { kind } : {};
    const { data } = await http.get<CampaignNarrativeListResponse>(
      `/api/campaigns/${campaignId}/narratives`,
      { params },
    );
    return data;
  },

  async generateAAR(campaignId: number, vignetteId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}/aar`,
    );
    return data;
  },

  async generateIntelBrief(campaignId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/intel-briefs/generate`,
    );
    return data;
  },
```

- [ ] **Step 4: Re-run — expect PASS**

Run: `cd frontend && npm test -- --run src/lib/__tests__/vignettes_api.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/__tests__/vignettes_api.test.ts
git commit -m "feat(frontend): api client for vignettes + intel + narratives"
```

---

### Task 2: Campaign store extensions

**Files:**
- Modify: `frontend/src/store/campaignStore.ts`

No dedicated test — this is thin plumbing; component tests exercise the store indirectly.

- [ ] **Step 1: Extend state + actions**

In `frontend/src/store/campaignStore.ts`:

1. Extend the type imports from `../lib/types`:

```typescript
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
  RDProgramSpec, RDProgramState, AcquisitionOrder,
  BudgetAllocation, RDFundingLevel, RDUpdatePayload, AcquisitionCreatePayload,
  Vignette, VignetteCommitPayload,
  IntelCard,
  GenerateNarrativeResponse,
} from "../lib/types";
```

2. Extend `CampaignState` (add after `acquisitions`):

```typescript
  pendingVignettes: Vignette[];
  vignetteById: Record<number, Vignette>;
  intelCards: IntelCard[];
  intelFilter: { year: number; quarter: number } | null;
  narrativeCache: Record<string, GenerateNarrativeResponse>; // keyed by `${kind}:${subject_id}`

  loadPendingVignettes: (campaignId: number) => Promise<void>;
  loadVignette: (campaignId: number, vignetteId: number) => Promise<Vignette | null>;
  commitVignette: (campaignId: number, vignetteId: number, payload: VignetteCommitPayload) => Promise<Vignette>;
  loadIntel: (campaignId: number, filter?: { year: number; quarter: number }) => Promise<void>;
  generateAAR: (campaignId: number, vignetteId: number) => Promise<GenerateNarrativeResponse>;
  generateIntelBrief: (campaignId: number) => Promise<GenerateNarrativeResponse>;
```

3. Extend the initial state object with the new default values (empty arrays / `{}` / `null`).

4. Append the new action implementations inside the `create` body (before `reset`):

```typescript
  loadPendingVignettes: async (campaignId) => {
    try {
      const { vignettes } = await api.getVignettesPending(campaignId);
      set({ pendingVignettes: vignettes });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadVignette: async (campaignId, vignetteId) => {
    try {
      const v = await api.getVignette(campaignId, vignetteId);
      set((s) => ({ vignetteById: { ...s.vignetteById, [v.id]: v } }));
      return v;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  commitVignette: async (campaignId, vignetteId, payload) => {
    set({ loading: true, error: null });
    const v = await api.commitVignette(campaignId, vignetteId, payload);
    set((s) => ({
      vignetteById: { ...s.vignetteById, [v.id]: v },
      pendingVignettes: s.pendingVignettes.filter((pv) => pv.id !== v.id),
      loading: false,
    }));
    return v;
  },

  loadIntel: async (campaignId, filter) => {
    try {
      const { cards } = await api.getIntel(campaignId, filter ?? {});
      set({ intelCards: cards, intelFilter: filter ?? null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  generateAAR: async (campaignId, vignetteId) => {
    const key = `aar:vig-${vignetteId}`;
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateAAR(campaignId, vignetteId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  generateIntelBrief: async (campaignId) => {
    const c = get().campaign;
    const key = c ? `intel_brief:${c.current_year}-Q${c.current_quarter}` : "intel_brief:current";
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateIntelBrief(campaignId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },
```

5. Extend `reset` to clear the new slices:

```typescript
  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    rdCatalog: [], rdActive: [], acquisitions: [],
    pendingVignettes: [], vignetteById: {},
    intelCards: [], intelFilter: null, narrativeCache: {},
    loading: false, error: null,
  }),
```

6. Extend `advanceTurn` side-effects to refresh pending vignettes + intel:

```typescript
  advanceTurn: async () => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const campaign = await api.advanceTurn(current.id);
      set({ campaign, loading: false });
      const cid = campaign.id;
      void get().loadBases(cid);
      void get().loadRdActive(cid);
      void get().loadAcquisitions(cid);
      void get().loadPendingVignettes(cid);
      void get().loadIntel(cid, { year: campaign.current_year, quarter: campaign.current_quarter });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
```

- [ ] **Step 2: Run full frontend test suite — expect GREEN**

Run: `cd frontend && npm test -- --run`
Expected: all existing 52+7 tests pass (no regressions from store changes).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/campaignStore.ts
git commit -m "feat(frontend): campaignStore slices for vignettes + intel + narratives"
```

---

### Task 3: IntelCard + IntelSwipeStack components

**Files:**
- Create: `frontend/src/components/intel/IntelCard.tsx`
- Create: `frontend/src/components/intel/IntelSwipeStack.tsx`
- Create: `frontend/src/components/intel/__tests__/IntelCard.test.tsx`
- Create: `frontend/src/components/intel/__tests__/IntelSwipeStack.test.tsx`

- [ ] **Step 1: Write IntelCard test**

```tsx
// frontend/src/components/intel/__tests__/IntelCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntelCard } from "../IntelCard";
import type { IntelCard as IntelCardType } from "../../../lib/types";

const fixture: IntelCardType = {
  id: 42,
  appeared_year: 2027,
  appeared_quarter: 2,
  source_type: "HUMINT",
  confidence: 0.62,
  truth_value: true,
  payload: {
    headline: "PLAAF rotates J-20 squadron to Hotan",
    template_id: "base_rotation_j20",
    subject_faction: "PLAAF",
    subject_type: "base_rotation",
    observed: { base: "Hotan", squadron_size: 12 },
    ground_truth: { base: "Hotan", squadron_size: 12 },
  },
};

describe("IntelCard", () => {
  it("renders headline + source + faction + confidence", () => {
    render(<IntelCard card={fixture} />);
    expect(screen.getByText(/PLAAF rotates J-20 squadron to Hotan/)).toBeTruthy();
    expect(screen.getByText(/HUMINT/)).toBeTruthy();
    expect(screen.getByText(/62%/)).toBeTruthy();
  });

  it("does NOT surface truth_value to the player", () => {
    render(<IntelCard card={fixture} />);
    // truth_value is fog-of-war; never rendered
    expect(screen.queryByText(/truth/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Write IntelSwipeStack test**

```tsx
// frontend/src/components/intel/__tests__/IntelSwipeStack.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntelSwipeStack } from "../IntelSwipeStack";
import type { IntelCard as IntelCardType } from "../../../lib/types";

const make = (id: number, headline: string): IntelCardType => ({
  id, appeared_year: 2027, appeared_quarter: 2,
  source_type: "SIGINT", confidence: 0.5, truth_value: true,
  payload: { headline, template_id: "t", subject_faction: "PAF", subject_type: "force_count", observed: {}, ground_truth: {} },
});

describe("IntelSwipeStack", () => {
  it("renders the first card on top", () => {
    const cards = [make(1, "first"), make(2, "second")];
    render(<IntelSwipeStack cards={cards} />);
    expect(screen.getAllByText(/first/).length).toBeGreaterThan(0);
  });

  it("renders empty state when no cards", () => {
    render(<IntelSwipeStack cards={[]} />);
    expect(screen.getByText(/No intel/i)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run — expect FAIL (files don't exist)**

Run: `cd frontend && npm test -- --run src/components/intel`
Expected: FAIL "Cannot find module".

- [ ] **Step 4: Implement IntelCard.tsx**

```tsx
// frontend/src/components/intel/IntelCard.tsx
import type { IntelCard as IntelCardType } from "../../lib/types";

export interface IntelCardProps {
  card: IntelCardType;
  className?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  HUMINT: "bg-amber-600 text-slate-900",
  SIGINT: "bg-cyan-600 text-slate-900",
  IMINT: "bg-purple-600 text-slate-100",
  OSINT: "bg-slate-500 text-slate-100",
  ELINT: "bg-emerald-600 text-slate-900",
};

const FACTION_FLAG: Record<string, string> = {
  PLAAF: "🇨🇳 PLAAF",
  PAF: "🇵🇰 PAF",
  PLAN: "🇨🇳 PLAN",
};

export function IntelCard({ card, className = "" }: IntelCardProps) {
  const confPct = Math.round(card.confidence * 100);
  return (
    <div
      className={[
        "bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg",
        "min-h-[10rem] flex flex-col gap-3",
        className,
      ].join(" ")}
    >
      <div className="flex items-center justify-between text-xs">
        <span className={["px-2 py-0.5 rounded font-semibold", SOURCE_COLORS[card.source_type] ?? "bg-slate-700"].join(" ")}>
          {card.source_type}
        </span>
        <span className="opacity-70">{FACTION_FLAG[card.payload.subject_faction] ?? card.payload.subject_faction}</span>
      </div>
      <p className="text-sm leading-snug text-slate-100 flex-1">{card.payload.headline}</p>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Q{card.appeared_quarter} {card.appeared_year}</span>
        <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${confPct}%` }} />
        </div>
        <span>{confPct}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement IntelSwipeStack.tsx**

```tsx
// frontend/src/components/intel/IntelSwipeStack.tsx
import { useState, useEffect } from "react";
import { SwipeStack } from "../primitives/SwipeStack";
import { IntelCard } from "./IntelCard";
import type { IntelCard as IntelCardType } from "../../lib/types";

export interface IntelSwipeStackProps {
  cards: IntelCardType[];
  className?: string;
}

export function IntelSwipeStack({ cards, className = "" }: IntelSwipeStackProps) {
  const [remaining, setRemaining] = useState<IntelCardType[]>(cards);

  useEffect(() => { setRemaining(cards); }, [cards]);

  if (cards.length === 0) {
    return (
      <div className={["text-sm opacity-60 text-center p-6 border border-dashed border-slate-700 rounded-lg", className].join(" ")}>
        No intel this quarter.
      </div>
    );
  }

  return (
    <div className={["max-w-sm mx-auto", className].join(" ")}>
      <SwipeStack
        items={remaining}
        renderCard={(c) => <IntelCard card={c} />}
        onDismiss={(item) => setRemaining((r) => r.filter((x) => x.id !== item.id))}
      />
      <p className="mt-3 text-center text-xs opacity-60">
        Swipe to dismiss • {remaining.length} remaining
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run — expect PASS**

Run: `cd frontend && npm test -- --run src/components/intel`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/intel
git commit -m "feat(frontend): IntelCard + IntelSwipeStack with source + confidence"
```

---

### Task 4: IntelBriefReader (LLM-backed)

**Files:**
- Create: `frontend/src/components/intel/IntelBriefReader.tsx`
- Create: `frontend/src/components/intel/__tests__/IntelBriefReader.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// frontend/src/components/intel/__tests__/IntelBriefReader.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IntelBriefReader } from "../IntelBriefReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";

const seedCampaign = () => {
  useCampaignStore.setState({
    campaign: {
      id: 7, name: "c", seed: 1, starting_year: 2026, starting_quarter: 1,
      current_year: 2027, current_quarter: 2, difficulty: "realistic",
      objectives_json: [], budget_cr: 1000, quarterly_grant_cr: 100,
      current_allocation_json: null, reputation: 0,
      created_at: "", updated_at: "",
    },
  });
};

describe("IntelBriefReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
    seedCampaign();
  });

  it("renders LLM text after generate succeeds", async () => {
    vi.spyOn(http, "post").mockResolvedValue({ data: { text: "PLAAF is shifting J-20s.", cached: false, kind: "intel_brief", subject_id: "2027-Q2" } });
    render(<IntelBriefReader campaignId={7} />);
    await waitFor(() => expect(screen.getByText(/PLAAF is shifting J-20s/)).toBeTruthy());
  });

  it("shows friendly message on 409 ineligible", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 409, data: { detail: "no intel this quarter" } } });
    render(<IntelBriefReader campaignId={7} />);
    await waitFor(() => expect(screen.getByText(/not available/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run src/components/intel/__tests__/IntelBriefReader.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/intel/IntelBriefReader.tsx
import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";

export interface IntelBriefReaderProps {
  campaignId: number;
  className?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; text: string; cached: boolean }
  | { kind: "ineligible"; message: string }
  | { kind: "error"; message: string };

export function IntelBriefReader({ campaignId, className = "" }: IntelBriefReaderProps) {
  const generateIntelBrief = useCampaignStore((s) => s.generateIntelBrief);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateIntelBrief(campaignId)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text, cached: resp.cached }); })
      .catch((e: { response?: { status?: number; data?: { detail?: string } } }) => {
        if (cancelled) return;
        const status = e?.response?.status;
        const detail = e?.response?.data?.detail ?? "Brief unavailable.";
        if (status === 409) setState({ kind: "ineligible", message: "Intel brief not available this quarter." });
        else setState({ kind: "error", message: detail });
      });
    return () => { cancelled = true; };
  }, [campaignId, generateIntelBrief]);

  if (state.kind === "loading" || state.kind === "idle") {
    return <div className={["text-sm opacity-60 p-4", className].join(" ")}>Generating intel brief…</div>;
  }
  if (state.kind === "ineligible") {
    return <div className={["text-sm opacity-60 p-4 italic", className].join(" ")}>{state.message}</div>;
  }
  if (state.kind === "error") {
    return <div className={["text-sm text-red-300 p-4", className].join(" ")}>Error: {state.message}</div>;
  }
  return (
    <article className={["prose prose-invert max-w-none prose-sm", className].join(" ")}>
      {state.text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
      ))}
    </article>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd frontend && npm test -- --run src/components/intel/__tests__/IntelBriefReader.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/intel/IntelBriefReader.tsx frontend/src/components/intel/__tests__/IntelBriefReader.test.tsx
git commit -m "feat(frontend): IntelBriefReader auto-fetches LLM brief"
```

---

### Task 5: AARReader (LLM-backed)

**Files:**
- Create: `frontend/src/components/vignette/AARReader.tsx`
- Create: `frontend/src/components/vignette/__tests__/AARReader.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// frontend/src/components/vignette/__tests__/AARReader.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AARReader } from "../AARReader";
import { http } from "../../../lib/api";
import { useCampaignStore } from "../../../store/campaignStore";
import type { Vignette } from "../../../lib/types";

const baseVig: Vignette = {
  id: 3, year: 2027, quarter: 2, scenario_id: "saturation_raid",
  status: "resolved",
  planning_state: { scenario_id: "saturation_raid", scenario_name: "Saturation Raid", ao: { region: "LAC", name: "sector-A", lat: 34, lon: 78 }, response_clock_minutes: 15, adversary_force: [], eligible_squadrons: [], allowed_ind_roles: [], roe_options: ["weapons_free"], objective: { kind: "defend_airspace", success_threshold: {} } },
  committed_force: null,
  event_trace: [],
  aar_text: "fallback stub",
  outcome: { ind_kia: 2, adv_kia: 11, ind_airframes_lost: 1, adv_airframes_lost: 4, objective_met: true, roe: "weapons_free", support: { awacs: true, tanker: false, sead_package: false } },
  resolved_at: "2027-06-01T00:00:00Z",
};

describe("AARReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCampaignStore.getState().reset();
  });

  it("renders LLM narrative + outcome stats", async () => {
    vi.spyOn(http, "post").mockResolvedValue({ data: { text: "The mission began at dawn.\n\nSquadron 17 engaged first.", cached: false, kind: "aar", subject_id: "vig-3" } });
    render(<AARReader campaignId={7} vignette={baseVig} />);
    await waitFor(() => expect(screen.getByText(/The mission began at dawn/)).toBeTruthy());
    expect(screen.getByText(/Objective met/i)).toBeTruthy();
    expect(screen.getByText(/11/)).toBeTruthy();
  });

  it("falls back to stub aar_text on 502", async () => {
    vi.spyOn(http, "post").mockRejectedValue({ response: { status: 502 } });
    render(<AARReader campaignId={7} vignette={baseVig} />);
    await waitFor(() => expect(screen.getByText(/fallback stub/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run src/components/vignette/__tests__/AARReader.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/vignette/AARReader.tsx
import { useEffect, useState } from "react";
import { useCampaignStore } from "../../store/campaignStore";
import type { Vignette, VignetteOutcome } from "../../lib/types";

export interface AARReaderProps {
  campaignId: number;
  vignette: Vignette;
  className?: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  | { kind: "fallback"; text: string };

function hasOutcome(v: Vignette): v is Vignette & { outcome: VignetteOutcome } {
  return v.outcome != null && "objective_met" in v.outcome;
}

export function AARReader({ campaignId, vignette, className = "" }: AARReaderProps) {
  const generateAAR = useCampaignStore((s) => s.generateAAR);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    generateAAR(campaignId, vignette.id)
      .then((resp) => { if (!cancelled) setState({ kind: "ready", text: resp.text }); })
      .catch(() => {
        if (!cancelled) setState({ kind: "fallback", text: vignette.aar_text || "No AAR available." });
      });
    return () => { cancelled = true; };
  }, [campaignId, vignette.id, vignette.aar_text, generateAAR]);

  const outcome = hasOutcome(vignette) ? vignette.outcome : null;

  return (
    <div className={["flex flex-col gap-4", className].join(" ")}>
      {outcome && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
          <div className={outcome.objective_met ? "text-emerald-400 font-semibold col-span-2" : "text-red-400 font-semibold col-span-2"}>
            {outcome.objective_met ? "✓ Objective met" : "✗ Objective failed"}
          </div>
          <div>IAF KIA: <span className="font-mono">{outcome.ind_kia}</span></div>
          <div>Adv KIA: <span className="font-mono">{outcome.adv_kia}</span></div>
          <div>IAF airframes lost: <span className="font-mono">{outcome.ind_airframes_lost}</span></div>
          <div>Adv airframes lost: <span className="font-mono">{outcome.adv_airframes_lost}</span></div>
        </div>
      )}
      {state.kind === "loading" && (
        <div className="text-sm opacity-60 p-4">Generating AAR…</div>
      )}
      {(state.kind === "ready" || state.kind === "fallback") && (
        <article className="prose prose-invert max-w-none prose-sm">
          {state.text.split(/\n\n+/).map((para, i) => (
            <p key={i} className="mb-3 text-slate-200 leading-relaxed">{para}</p>
          ))}
          {state.kind === "fallback" && (
            <p className="text-xs opacity-50 italic">(narrative service unavailable — fallback summary)</p>
          )}
        </article>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd frontend && npm test -- --run src/components/vignette/__tests__/AARReader.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/vignette/AARReader.tsx frontend/src/components/vignette/__tests__/AARReader.test.tsx
git commit -m "feat(frontend): AARReader with outcome stats + 502 fallback"
```

---

### Task 6: ForceCommitter component

**Files:**
- Create: `frontend/src/components/vignette/ForceCommitter.tsx`
- Create: `frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx`

**Behavior:**
- Renders one row per eligible squadron: checkbox (disabled when `!in_range`), name + base + distance, airframes `Stepper` (1 to `airframes_available`, default = `airframes_available`).
- Support section: 3 checkboxes (AWACS / Tanker / SEAD package).
- ROE `<select>` sourced from `roe_options`.
- Calls `onChange(payload)` whenever any control changes.
- Exposes `currentPayload()` shape for the parent to read on commit (or: controlled by parent passing `value` + `onChange`).

- [ ] **Step 1: Write test**

```tsx
// frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceCommitter } from "../ForceCommitter";
import type { PlanningState, VignetteCommitPayload } from "../../../lib/types";

const planning: PlanningState = {
  scenario_id: "saturation_raid",
  scenario_name: "Saturation Raid",
  ao: { region: "LAC", name: "s", lat: 34, lon: 78 },
  response_clock_minutes: 15,
  adversary_force: [],
  eligible_squadrons: [
    { squadron_id: 1, name: "17 Sqn", platform_id: "rafale_f4", base_id: 10, base_name: "Ambala", distance_km: 320, in_range: true, airframes_available: 12, readiness_pct: 85, xp: 2, loadout: ["meteor"] },
    { squadron_id: 2, name: "45 Sqn", platform_id: "tejas_mk1a", base_id: 11, base_name: "Sulur", distance_km: 1800, in_range: false, airframes_available: 8, readiness_pct: 70, xp: 1, loadout: [] },
  ],
  allowed_ind_roles: ["interceptor"],
  roe_options: ["weapons_free", "weapons_tight"],
  objective: { kind: "defend_airspace", success_threshold: {} },
};

describe("ForceCommitter", () => {
  it("disables out-of-range squadron", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    const checkboxes = screen.getAllByRole("checkbox", { name: /sqn/i });
    expect(checkboxes[0]).not.toBeDisabled();
    expect(checkboxes[1]).toBeDisabled();
  });

  it("emits payload when squadron checked", () => {
    const onChange = vi.fn();
    const initial: VignetteCommitPayload = { squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" };
    render(<ForceCommitter planning={planning} value={initial} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /17 Sqn/i })[0]);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as VignetteCommitPayload;
    expect(last.squadrons[0]).toEqual({ squadron_id: 1, airframes: 12 });
  });

  it("offers only the roe_options from planning state", () => {
    const onChange = vi.fn();
    render(<ForceCommitter planning={planning} value={{ squadrons: [], support: { awacs: false, tanker: false, sead_package: false }, roe: "weapons_free" }} onChange={onChange} />);
    const opts = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(["weapons_free", "weapons_tight"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- --run src/components/vignette/__tests__/ForceCommitter.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/vignette/ForceCommitter.tsx
import type { PlanningState, VignetteCommitPayload, ROE } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";

export interface ForceCommitterProps {
  planning: PlanningState;
  value: VignetteCommitPayload;
  onChange: (next: VignetteCommitPayload) => void;
}

export function ForceCommitter({ planning, value, onChange }: ForceCommitterProps) {
  const toggleSquadron = (sqid: number, available: number, checked: boolean) => {
    const rest = value.squadrons.filter((s) => s.squadron_id !== sqid);
    const next = checked ? [...rest, { squadron_id: sqid, airframes: available }] : rest;
    onChange({ ...value, squadrons: next });
  };

  const setAirframes = (sqid: number, n: number) => {
    const next = value.squadrons.map((s) => s.squadron_id === sqid ? { ...s, airframes: n } : s);
    onChange({ ...value, squadrons: next });
  };

  const setSupport = (k: "awacs" | "tanker" | "sead_package", v: boolean) => {
    onChange({ ...value, support: { ...value.support, [k]: v } });
  };

  const setROE = (roe: ROE) => onChange({ ...value, roe });

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Squadrons</h3>
        <ul className="flex flex-col gap-2">
          {planning.eligible_squadrons.map((sq) => {
            const checked = value.squadrons.some((s) => s.squadron_id === sq.squadron_id);
            const picked = value.squadrons.find((s) => s.squadron_id === sq.squadron_id);
            return (
              <li
                key={sq.squadron_id}
                className={[
                  "border rounded-lg p-3 flex items-center gap-3",
                  sq.in_range ? "border-slate-700 bg-slate-900" : "border-slate-800 bg-slate-950 opacity-50",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  aria-label={sq.name}
                  checked={checked}
                  disabled={!sq.in_range}
                  onChange={(e) => toggleSquadron(sq.squadron_id, sq.airframes_available, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{sq.name}</div>
                  <div className="text-xs opacity-70 truncate">
                    {sq.base_name} • {sq.distance_km} km • {sq.readiness_pct}% ready • {sq.airframes_available} airframes
                    {!sq.in_range && <span className="ml-2 text-red-400">out of range</span>}
                  </div>
                </div>
                {checked && picked && (
                  <Stepper
                    value={picked.airframes}
                    min={1}
                    max={sq.airframes_available}
                    step={1}
                    onChange={(n) => setAirframes(sq.squadron_id, n)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Support</h3>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.awacs} onChange={(e) => setSupport("awacs", e.target.checked)} />
            AWACS
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.tanker} onChange={(e) => setSupport("tanker", e.target.checked)} />
            Tanker
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.support.sead_package} onChange={(e) => setSupport("sead_package", e.target.checked)} />
            SEAD package
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 text-slate-300">Rules of Engagement</h3>
        <select
          aria-label="ROE"
          value={value.roe}
          onChange={(e) => setROE(e.target.value as ROE)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        >
          {planning.roe_options.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd frontend && npm test -- --run src/components/vignette/__tests__/ForceCommitter.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/vignette/ForceCommitter.tsx frontend/src/components/vignette/__tests__/ForceCommitter.test.tsx
git commit -m "feat(frontend): ForceCommitter with squadron+support+ROE controls"
```

---

### Task 7: OpsRoom page

**Files:**
- Create: `frontend/src/pages/OpsRoom.tsx`

No dedicated unit test — the page is a composition of components that are all individually tested. It will be exercised by manual QA in Task 12.

- [ ] **Step 1: Implement**

```tsx
// frontend/src/pages/OpsRoom.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { ForceCommitter } from "../components/vignette/ForceCommitter";
import { CommitHoldButton } from "../components/primitives/CommitHoldButton";
import type { Vignette, VignetteCommitPayload } from "../lib/types";

export function OpsRoom() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const campaignId = Number(id);
  const vignetteId = Number(vid);
  const navigate = useNavigate();

  const campaign = useCampaignStore((s) => s.campaign);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadVignette = useCampaignStore((s) => s.loadVignette);
  const commitVignette = useCampaignStore((s) => s.commitVignette);
  const vignetteById = useCampaignStore((s) => s.vignetteById);
  const loading = useCampaignStore((s) => s.loading);

  const [vignette, setVignette] = useState<Vignette | null>(null);
  const [payload, setPayload] = useState<VignetteCommitPayload>({
    squadrons: [],
    support: { awacs: false, tanker: false, sead_package: false },
    roe: "weapons_free",
  });
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (!Number.isFinite(vignetteId)) return;
    const cached = vignetteById[vignetteId];
    if (cached) {
      setVignette(cached);
      setPayload((p) => ({ ...p, roe: cached.planning_state.roe_options[0] ?? p.roe }));
    } else {
      loadVignette(campaignId, vignetteId).then((v) => {
        if (v) {
          setVignette(v);
          setPayload((p) => ({ ...p, roe: v.planning_state.roe_options[0] ?? p.roe }));
        }
      });
    }
  }, [campaignId, vignetteId, vignetteById, loadVignette]);

  const onCommit = async () => {
    if (!vignette) return;
    setCommitError(null);
    try {
      const resolved = await commitVignette(campaignId, vignette.id, payload);
      navigate(`/campaign/${campaignId}/vignette/${resolved.id}/aar`);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setCommitError(err?.response?.data?.detail ?? err?.message ?? "Commit failed");
    }
  };

  if (!vignette) return <div className="p-6">Loading vignette…</div>;
  if (vignette.status === "resolved") {
    return (
      <div className="p-6 space-y-3">
        <p>This vignette has already been resolved.</p>
        <Link to={`/campaign/${campaignId}/vignette/${vignette.id}/aar`} className="underline text-amber-400">View AAR →</Link>
      </div>
    );
  }

  const ps = vignette.planning_state;
  const totalAirframes = payload.squadrons.reduce((a, b) => a + b.airframes, 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">Ops Room — {ps.scenario_name}</h1>
          <p className="text-xs opacity-70">
            {ps.ao.region} • {ps.ao.name} • T-{ps.response_clock_minutes} min
          </p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs opacity-60 hover:opacity-100 underline">
          Abort → Map
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full">
        <section className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2 text-slate-300">Adversary Force</h2>
          {ps.adversary_force.length === 0 ? (
            <p className="text-xs opacity-60">Unknown.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {ps.adversary_force.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="opacity-70">[{e.faction}]</span>
                  <span className="font-semibold">{e.count}× {e.platform_id}</span>
                  <span className="opacity-60">({e.role})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2 text-slate-300">Objective</h2>
          <p className="text-xs">{ps.objective.kind.replace(/_/g, " ")}</p>
        </section>

        <ForceCommitter planning={ps} value={payload} onChange={setPayload} />

        {commitError && (
          <p className="text-sm text-red-300">{commitError}</p>
        )}

        <div className="sticky bottom-0 bg-slate-950 pt-3 pb-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs opacity-70">
            Committing <span className="font-mono">{totalAirframes}</span> airframes across{" "}
            <span className="font-mono">{payload.squadrons.length}</span> squadrons
          </p>
          <CommitHoldButton
            onCommit={onCommit}
            disabled={loading || payload.squadrons.length === 0}
            label="Hold to commit"
          />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run build -- --mode production` *(only if `build` exists; otherwise use `tsc -p tsconfig.app.json --noEmit`)*

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OpsRoom.tsx
git commit -m "feat(frontend): OpsRoom page with ForceCommitter + hold-to-commit"
```

---

### Task 8: VignetteAAR page

**Files:**
- Create: `frontend/src/pages/VignetteAAR.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/src/pages/VignetteAAR.tsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { AARReader } from "../components/vignette/AARReader";
import type { Vignette } from "../lib/types";

export function VignetteAAR() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const campaignId = Number(id);
  const vignetteId = Number(vid);

  const vignetteById = useCampaignStore((s) => s.vignetteById);
  const loadVignette = useCampaignStore((s) => s.loadVignette);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const campaign = useCampaignStore((s) => s.campaign);

  const [vignette, setVignette] = useState<Vignette | null>(null);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    const cached = vignetteById[vignetteId];
    if (cached) setVignette(cached);
    else loadVignette(campaignId, vignetteId).then((v) => v && setVignette(v));
  }, [campaignId, vignetteId, vignetteById, loadVignette]);

  if (!vignette) return <div className="p-6">Loading AAR…</div>;
  const ps = vignette.planning_state;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">AAR — {ps.scenario_name}</h1>
          <p className="text-xs opacity-70">Q{vignette.quarter} {vignette.year} • {ps.ao.region}</p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>
      <main className="p-4 max-w-3xl mx-auto">
        <AARReader campaignId={campaignId} vignette={vignette} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/VignetteAAR.tsx
git commit -m "feat(frontend): VignetteAAR page composes AARReader"
```

---

### Task 9: IntelInbox page

**Files:**
- Create: `frontend/src/pages/IntelInbox.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/src/pages/IntelInbox.tsx
import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { IntelSwipeStack } from "../components/intel/IntelSwipeStack";
import { IntelBriefReader } from "../components/intel/IntelBriefReader";

export function IntelInbox() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);

  const campaign = useCampaignStore((s) => s.campaign);
  const intelCards = useCampaignStore((s) => s.intelCards);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadIntel = useCampaignStore((s) => s.loadIntel);

  useEffect(() => {
    if (!campaign || campaign.id !== campaignId) loadCampaign(campaignId);
  }, [campaign, campaignId, loadCampaign]);

  useEffect(() => {
    if (campaign && campaign.id === campaignId) {
      loadIntel(campaignId, { year: campaign.current_year, quarter: campaign.current_quarter });
    }
  }, [campaign, campaignId, loadIntel]);

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold">Intel Desk</h1>
          <p className="text-xs opacity-70">Q{campaign.current_quarter} {campaign.current_year}</p>
        </div>
        <Link to={`/campaign/${campaignId}`} className="text-xs underline opacity-80 hover:opacity-100">
          Back to map
        </Link>
      </header>
      <main className="p-4 max-w-3xl mx-auto space-y-6">
        <section>
          <h2 className="text-sm font-semibold mb-2 text-slate-300">Quarterly intel brief</h2>
          <IntelBriefReader campaignId={campaignId} />
        </section>
        <section>
          <h2 className="text-sm font-semibold mb-2 text-slate-300">
            Intel reports ({intelCards.length})
          </h2>
          <IntelSwipeStack cards={intelCards} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/IntelInbox.tsx
git commit -m "feat(frontend): IntelInbox page — brief + swipe-stack"
```

---

### Task 10: CampaignMapView wiring — Intel link + pending-vignette alert

**Files:**
- Modify: `frontend/src/pages/CampaignMapView.tsx`

- [ ] **Step 1: Load pending vignettes on mount + render badge**

Apply these changes to `CampaignMapView.tsx`:

1. Add imports and store reads:

```tsx
// with existing store reads:
const pendingVignettes = useCampaignStore((s) => s.pendingVignettes);
const loadPendingVignettes = useCampaignStore((s) => s.loadPendingVignettes);
```

2. Add an effect to load pending vignettes whenever the campaign loads:

```tsx
useEffect(() => {
  if (campaign) {
    loadPendingVignettes(campaign.id);
  }
}, [campaign, loadPendingVignettes]);
```

3. Extend the header's control cluster (the `<div className="flex items-center gap-2">` block) to include an Intel link and a pending-vignette alert. Place the alert FIRST so it grabs attention:

```tsx
{pendingVignettes.length > 0 && (
  <Link
    to={`/campaign/${campaign.id}/vignette/${pendingVignettes[0].id}`}
    className="bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5 animate-pulse"
  >
    ⚠ Pending vignette
  </Link>
)}
<Link
  to={`/campaign/${campaign.id}/intel`}
  className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5"
>
  Intel
</Link>
```

(The existing "Procurement" link, "raw" link, and "End Turn" button stay.)

- [ ] **Step 2: Visual check + run full test suite**

Run: `cd frontend && npm test -- --run`
Expected: all tests still pass (no map-view tests exist; change is additive).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(frontend): pending-vignette alert + Intel link on map header"
```

---

### Task 11: App routes

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add 3 routes**

```tsx
// frontend/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { CampaignMapView } from "./pages/CampaignMapView";
import { CampaignConsoleRaw } from "./pages/CampaignConsoleRaw";
import { ProcurementHub } from "./pages/ProcurementHub";
import { IntelInbox } from "./pages/IntelInbox";
import { OpsRoom } from "./pages/OpsRoom";
import { VignetteAAR } from "./pages/VignetteAAR";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/campaign/:id" element={<CampaignMapView />} />
      <Route path="/campaign/:id/procurement" element={<ProcurementHub />} />
      <Route path="/campaign/:id/intel" element={<IntelInbox />} />
      <Route path="/campaign/:id/vignette/:vid" element={<OpsRoom />} />
      <Route path="/campaign/:id/vignette/:vid/aar" element={<VignetteAAR />} />
      <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Run full test suite + build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all tests pass, build succeeds with no TS errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): wire intel + vignette + aar routes"
```

---

### Task 12: End-to-end manual QA + ROADMAP + CLAUDE.md update

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Manual QA against a live backend**

Start the backend (`cd backend && uvicorn app.main:app --reload --port 8010`) and frontend (`cd frontend && npm run dev`). Exercise:

1. Create a new campaign.
2. Click "End Turn" until a pending vignette appears (threat curve is low early-campaign — may take 4-8 turns; the red "Pending vignette" badge is the signal).
3. Click the badge → enter Ops Room. Verify: scenario name + AO shown; adversary force listed; eligible squadrons rendered; out-of-range squadrons disabled; ROE dropdown shows only the backend-provided options.
4. Select 1-2 in-range squadrons, toggle AWACS on, hold the commit button for 2s.
5. Land on AAR page. Verify: outcome tile shows objective + kill counts; LLM narrative renders (if `OPENROUTER_API_KEY` is configured, ~5-10s delay on first load; else fallback text shows).
6. Click "Back to map" → header no longer shows pending-vignette badge.
7. Click "Intel" → brief generates (cache-hit on re-visit is instant). Swipe a card; remaining counter ticks.
8. Reload the AAR URL — narrative loads from cache (no second LLM call).
9. Check the raw JSON view (`/campaign/:id/raw`) — verify the vignette has `status: "resolved"`, `committed_force: {...}`, and `outcome.objective_met` populated.

Fix any bugs surfaced inline; commit fixes with specific messages (e.g., `fix(frontend): …`).

- [ ] **Step 2: Flip Plan 8 in ROADMAP**

In `docs/superpowers/plans/ROADMAP.md`:

1. Bump "Last updated" line: `**Last updated:** 2026-04-17 (Plan 8 done)`.
2. Change the Plan 8 status cell from `🔴 not started` to `🟢 done`, replacing the `*to be written*` link text with `[2026-04-17-frontend-vignettes-intel-plan.md](2026-04-17-frontend-vignettes-intel-plan.md)`.

- [ ] **Step 3: Update CLAUDE.md current-status block**

In `CLAUDE.md`:

1. Mark Plan 8 as done and insert a status paragraph analogous to Plans 6/7, summarizing: 3 new pages (IntelInbox, OpsRoom, VignetteAAR), 5 new components (IntelCard, IntelSwipeStack, IntelBriefReader, AARReader, ForceCommitter), 7 new api.ts methods, store slices (pendingVignettes, intelCards, narrativeCache), pending-vignette badge on map, end-to-end turn→vignette→AAR loop now closed. Note updated test baseline (52+N frontend tests, 308 backend unchanged).
2. Update "Next up" to Plan 9 (Campaign End + Polish).
3. Under "Known carry-overs / tuning backlog", append any new items surfaced during QA (e.g., "IntelContactsLayer still fed empty array — wire in Plan 10"; "AAR fallback UX needs retry button" if observed; etc).

- [ ] **Step 4: Final commits**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 8 done — vignettes + intel + AAR screens"
```

---

## Self-Review Notes

- **Spec coverage:** Ops Room (Task 7), Intel swipe stack (Task 3), AAR reader (Task 5), Intel brief reader (Task 4), Force committer subject to geography/readiness (Task 6 — handled by backend-provided `in_range` + `airframes_available`). Full end-of-turn loop: intel → advance → vignette → Ops Room → commit → AAR (Tasks 7-11 + badge in Task 10). Covered.
- **Placeholder scan:** every task has code shown in full; no "TBD" / "similar to X" / "handle edge cases" references.
- **Type consistency:** `VignetteCommitPayload`, `PlanningState`, `ROE`, `Vignette`, `IntelCard` match what's already exported from `types.ts` (verified against Plan 6 commit). Store keys (`pendingVignettes`, `vignetteById`, `intelCards`, `narrativeCache`) used consistently across Tasks 2, 7, 8, 9, 10.
- **Test baseline:** +N new vitest tests (2 api tests batched into 7 assertions in Task 1 file; 2 IntelCard + 2 IntelSwipeStack + 2 IntelBriefReader + 2 AARReader + 3 ForceCommitter = 11 new component tests + 7 api assertions in 1 new file). Approx ~63 frontend tests total end of Plan 8 (was 52).
- **Fallback paths:** AAR falls back to `vignette.aar_text` on 502 (tested). IntelBrief shows friendly "not available" on 409 (tested). OpsRoom surfaces commit 4xx inline.
- **No backend changes:** verified every endpoint consumed (`GET /vignettes/pending`, `GET /vignettes/{id}`, `POST /vignettes/{id}/commit`, `GET /intel`, `POST /vignettes/{id}/aar`, `POST /intel-briefs/generate`, `GET /narratives`) is already shipped per Plans 3/4/5.
