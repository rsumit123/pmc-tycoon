# Chakravyuh v2 Phase 1 — Onboarding & Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit directly to `main` (repo convention — no branches/worktrees).

**Goal:** Make Chakravyuh learnable for non-defense-enthusiasts via an inline tap-to-define glossary, coach-marks over the real UI, clearer campaign setup, and a rewritten How-to-Play guide — frontend + content only, no game-engine changes.

**Architecture:** A new glossary term registry + `<Term>` popover primitive wires plain-language definitions onto jargon across high-traffic screens, plus a browsable Glossary page. A `<CoachMarks>` overlay primitive drives a first-run guided tour on the map (and a one-time Ops Room overlay), gated by `localStorage` flags and replayable from the menu. The Landing page gains real difficulty grant figures, a one-tap Quick Start, and per-objective cost/time hints.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind v4 + Zustand + react-router-dom 7; Vitest + @testing-library/react. Capacitor 8 Android (WebView) is a first-class target — every overlay is tap-driven, safe-area-aware, and dismissible via the hardware back button using the existing `useBackButtonClose` hook (`frontend/src/lib/useBackButtonClose.ts`).

**Platform rule (all tasks):** tap not hover; use `safe-pt`/`safe-pb`; intercept the Capacitor back button on overlays; touch targets ≥44px; popovers must clamp on-screen for <360px widths. Final task verifies on an Android build.

---

### Task 1: Glossary term registry

**Files:**
- Create: `frontend/src/lib/glossary.ts`
- Test: `frontend/src/lib/__tests__/glossary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/glossary.test.ts
import { describe, it, expect } from "vitest";
import { GLOSSARY, lookupTerm, type GlossaryEntry } from "../glossary";

describe("glossary", () => {
  it("contains core jargon keys with non-empty definitions", () => {
    const required = ["bvr", "wvr", "roe", "rcs", "vlo", "awacs", "foc", "readiness"];
    for (const key of required) {
      const e: GlossaryEntry | undefined = GLOSSARY[key];
      expect(e, `missing term: ${key}`).toBeTruthy();
      expect(e!.short.length).toBeGreaterThan(0);
    }
  });

  it("lookupTerm is case-insensitive and trims", () => {
    expect(lookupTerm("BVR")?.term).toBe(GLOSSARY["bvr"].term);
    expect(lookupTerm(" roe ")?.term).toBe(GLOSSARY["roe"].term);
  });

  it("lookupTerm returns undefined for unknown keys", () => {
    expect(lookupTerm("definitely-not-a-term")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- glossary`
Expected: FAIL — cannot resolve `../glossary`.

- [ ] **Step 3: Implement the registry**

```ts
// frontend/src/lib/glossary.ts
export interface GlossaryEntry {
  /** Canonical display term, e.g. "BVR (Beyond Visual Range)". */
  term: string;
  /** One-line plain-language definition. */
  short: string;
  /** Optional "why it matters" for the player. */
  why?: string;
}

// Keys are lowercase lookup tokens. Keep definitions jargon-free and short.
export const GLOSSARY: Record<string, GlossaryEntry> = {
  bvr: { term: "BVR (Beyond Visual Range)", short: "Long-range air combat — firing radar-guided missiles from tens of km away, before you can see the enemy.", why: "Whoever detects and shoots first usually wins. Good radar + AWACS gives you the BVR edge." },
  wvr: { term: "WVR (Within Visual Range)", short: "Close-in dogfighting with short-range missiles when jets merge within ~30 km." },
  roe: { term: "ROE (Rules of Engagement)", short: "How aggressively you let pilots shoot.", why: "“Weapons Free” fires earliest for the best hit chance; tighter rules trade hits for caution." },
  rcs: { term: "RCS (Radar Cross-Section)", short: "How big an aircraft looks on radar. Lower = harder to detect and hit." },
  vlo: { term: "VLO / Stealth", short: "Very Low Observable — stealth jets (e.g. AMCA, J-20) that radar struggles to see.", why: "Stealth aircraft are hard to kill; you need numbers or your own stealth to counter them." },
  lo: { term: "LO (Low Observable)", short: "Reduced-radar-signature aircraft — stealthier than normal but not full stealth." },
  awacs: { term: "AWACS", short: "A flying radar command plane (e.g. Netra) that extends your detection range.", why: "Adds detection reach and a small missile-accuracy bonus to the fight." },
  tanker: { term: "Tanker", short: "An aerial refuelling aircraft (IL-78) that extends how far your fighters can reach." },
  sead: { term: "SEAD", short: "Suppression of Enemy Air Defenses — strikes that hunt and kill enemy radars/SAMs." },
  nez: { term: "NEZ (No-Escape Zone)", short: "The range band inside which a missile is very hard to dodge — closer is deadlier." },
  foc: { term: "FOC (Full Operational Capability)", short: "The quarter when every aircraft in an order has finally been delivered." },
  first_delivery: { term: "First delivery", short: "The quarter the first units of an order start arriving (deliveries spread out until FOC)." },
  interceptor_stock: { term: "Interceptor stock", short: "How many missiles an air-defense battery has left to fire. Reload via Acquisitions." },
  missile_stock: { term: "Missile stock", short: "Air-to-air missiles stored at a base. Squadrons there draw from it in combat; buy more via Acquisitions." },
  readiness: { term: "Readiness", short: "A squadron’s combat fitness (0–100%). Maintained by your O&M and Spares budget." },
  om: { term: "O&M (Operations & Maintenance)", short: "Budget that keeps squadrons flying and readiness up." },
  spares: { term: "Spares", short: "Budget for parts that raises the readiness ceiling of your fleet." },
  rd: { term: "R&D", short: "Multi-year programs that unlock new fighters, missiles, sensors and air-defense systems." },
  acquisition: { term: "Acquisition", short: "Buying aircraft, missiles or air-defense — delivered over several quarters." },
  vignette: { term: "Vignette", short: "A combat event that fires periodically. You commit a force and it resolves automatically." },
  ao: { term: "AO (Area of Operations)", short: "The region a vignette or strike takes place in." },
  posture: { term: "Posture", short: "A snapshot of your force readiness, defenses and threat level." },
  doctrine: { term: "Doctrine", short: "How an air force fights — its mix of aircraft, tactics and modernization." },
  generation: { term: "Generation (4 / 4.5 / 5th-gen)", short: "Aircraft era. Higher gen = better radar, weapons and (for 5th-gen) stealth.", why: "A generation gap can beat raw numbers in a fight." },
  multirole: { term: "Multirole", short: "A fighter that can do both air-to-air and ground strike." },
  air_superiority: { term: "Air superiority", short: "A fighter optimized for winning air-to-air combat." },
  isr: { term: "ISR", short: "Intelligence, Surveillance & Reconnaissance — drones that watch enemy bases." },
  ucav: { term: "UCAV", short: "An armed combat drone (e.g. Ghatak)." },
  arm: { term: "ARM (Anti-Radiation Missile)", short: "A missile that homes on enemy radar emissions — used for SEAD." },
  anti_ship: { term: "Anti-ship missile", short: "A missile designed to strike warships (e.g. BrahMos)." },
  sortie: { term: "Sortie", short: "One operational flight by one aircraft." },
  ace: { term: "Ace", short: "A standout squadron that has racked up kills and experience." },
  xp: { term: "XP (Experience)", short: "Combat experience a squadron earns; veterans shoot a little better." },
  squadron: { term: "Squadron", short: "A unit of aircraft of one type, based at one airbase." },
  airframe: { term: "Airframe", short: "A single aircraft. A squadron is made of several airframes." },
  grant: { term: "Quarterly grant", short: "The budget you receive each quarter to spend across R&D, acquisitions and upkeep." },
  treasury: { term: "Treasury", short: "Your accumulated funds, in crore (cr)." },
  runway_class: { term: "Runway class", short: "How capable a base’s runway is — limits which aircraft can be based there." },
  ad_battery: { term: "AD battery", short: "A surface-to-air missile site (e.g. S-400) that shoots down aircraft over a base." },
  coverage: { term: "Coverage", short: "The radius around an air-defense battery within which it can engage aircraft." },
  blowback: { term: "Blowback", short: "Diplomatic fallout from an offensive strike — souring relations with a rival." },
  intel_quality: { term: "Intel quality", short: "How reliable your picture of the enemy is — low quality means fuzzy force estimates." },
  confidence: { term: "Confidence", short: "How sure an intelligence report is, as a percentage." },
};

/** Case-insensitive, trimmed lookup. Returns undefined for unknown tokens. */
export function lookupTerm(key: string): GlossaryEntry | undefined {
  return GLOSSARY[key.trim().toLowerCase()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- glossary`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/glossary.ts frontend/src/lib/__tests__/glossary.test.ts
git commit -m "feat(v2): glossary term registry + lookup"
```

---

### Task 2: `<Term>` tap-to-define primitive

**Files:**
- Create: `frontend/src/components/primitives/Term.tsx`
- Test: `frontend/src/components/primitives/__tests__/Term.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/primitives/__tests__/Term.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Term } from "../Term";

describe("Term", () => {
  it("renders its children", () => {
    render(<Term k="bvr">BVR</Term>);
    expect(screen.getByText("BVR")).toBeInTheDocument();
  });

  it("opens a definition popover on tap and closes on second tap", () => {
    render(<Term k="roe">ROE</Term>);
    const trigger = screen.getByRole("button", { name: /define ROE/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText(/how aggressively/i)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders plain text (no trigger) for an unknown key", () => {
    render(<Term k="nope">Nope</Term>);
    expect(screen.getByText("Nope")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Term`
Expected: FAIL — cannot resolve `../Term`.

- [ ] **Step 3: Implement the primitive**

```tsx
// frontend/src/components/primitives/Term.tsx
import { useState, useRef, useEffect, type ReactNode } from "react";
import { lookupTerm } from "../../lib/glossary";
import { useBackButtonClose } from "../../lib/useBackButtonClose";

export interface TermProps {
  /** Glossary key. Defaults to the lowercased text of `children`. */
  k?: string;
  children: ReactNode;
}

/**
 * Inline jargon term. Tap to reveal a plain-language definition popover.
 * If the key isn't in the glossary it renders the children as plain text.
 * Tap-driven + back-button aware for the Capacitor Android WebView.
 */
export function Term({ k, children }: TermProps) {
  const key = k ?? (typeof children === "string" ? children : "");
  const entry = lookupTerm(key);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useBackButtonClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`Define ${key}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="underline decoration-dotted decoration-amber-500/60 underline-offset-2 cursor-help"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-[min(16rem,80vw)] rounded-lg border border-slate-700 bg-slate-900 p-3 text-left shadow-xl"
        >
          <span className="block text-xs font-semibold text-amber-400">{entry.term}</span>
          <span className="mt-1 block text-xs text-slate-200 leading-relaxed">{entry.short}</span>
          {entry.why && (
            <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">{entry.why}</span>
          )}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Term`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives/Term.tsx frontend/src/components/primitives/__tests__/Term.test.tsx
git commit -m "feat(v2): Term tap-to-define primitive"
```

---

### Task 3: Glossary screen + route + menu links

**Files:**
- Create: `frontend/src/pages/Glossary.tsx`
- Test: `frontend/src/pages/__tests__/Glossary.test.tsx`
- Modify: `frontend/src/App.tsx` (add public `/glossary` route)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (Settings menu link, ~line 343)
- Modify: `frontend/src/pages/Landing.tsx` (header link, ~line 93)

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/__tests__/Glossary.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Glossary } from "../Glossary";

describe("Glossary page", () => {
  it("lists glossary terms and filters by search", () => {
    render(<MemoryRouter><Glossary /></MemoryRouter>);
    expect(screen.getByText(/BVR \(Beyond Visual Range\)/)).toBeInTheDocument();
    expect(screen.getByText(/AWACS/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "stealth" } });
    expect(screen.getByText(/VLO \/ Stealth/)).toBeInTheDocument();
    expect(screen.queryByText(/BVR \(Beyond Visual Range\)/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Glossary`
Expected: FAIL — cannot resolve `../Glossary`.

- [ ] **Step 3: Implement the page**

```tsx
// frontend/src/pages/Glossary.tsx
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { GLOSSARY } from "../lib/glossary";

export function Glossary() {
  const [q, setQ] = useState("");
  const entries = useMemo(() => {
    const all = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (e) => e.term.toLowerCase().includes(needle) || e.short.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="min-h-screen p-4 safe-pt safe-pb">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display uppercase tracking-wider">Glossary</h1>
          <Link to="/" className="text-xs text-slate-400 underline">Home</Link>
        </div>
        <p className="text-sm opacity-70">Plain-language definitions for the terms used across Chakravyuh.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.term} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="text-sm font-semibold text-amber-400">{e.term}</div>
              <div className="mt-1 text-sm text-slate-200">{e.short}</div>
              {e.why && <div className="mt-1 text-xs text-slate-400">{e.why}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the route + menu links**

In `frontend/src/App.tsx`, add the import near the other page imports:
```tsx
import { Glossary } from "./pages/Glossary";
```
And add this public route alongside `/credits` (after line 30):
```tsx
        <Route path="/glossary" element={<Glossary />} />
```

In `frontend/src/pages/CampaignMapView.tsx`, in the Settings section of the menu (right after the `🖼 Image Credits` Link, ~line 333), add:
```tsx
              <Link
                onClick={() => setShowMenu(false)}
                to="/glossary"
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >📖 Glossary</Link>
```

In `frontend/src/pages/Landing.tsx`, add a glossary link in the header link column (after the `Image credits` Link, ~line 93):
```tsx
            <Link to="/glossary" className="text-xs text-slate-500 underline">Glossary</Link>
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `cd frontend && npm test -- Glossary && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Glossary.tsx frontend/src/pages/__tests__/Glossary.test.tsx frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx frontend/src/pages/Landing.tsx
git commit -m "feat(v2): Glossary screen + route + menu/landing links"
```

---

### Task 4: Rewrite How-to-Play (fix J-20/J-35 bug, link glossary, add casual path)

**Files:**
- Modify: `frontend/src/components/guide/HowToPlayGuide.tsx`
- Test: `frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx`

**Context:** The current guide (see file) wrongly implies J-20/J-35 are player-procurable; they are **adversary-only**. Reword, add a "casual path" note, and add a Glossary link. Keep the existing `{ open, onClose }` props and modal structure.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HowToPlayGuide } from "../HowToPlayGuide";

describe("HowToPlayGuide", () => {
  it("renders the casual-path note and does NOT call J-20/J-35 player-procurable", () => {
    render(<MemoryRouter><HowToPlayGuide open onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/you can win/i)).toBeInTheDocument();
    // J-20/J-35 must be described as adversary aircraft.
    expect(screen.getByText(/adversary stealth fighters \(J-20\/J-35\)/i)).toBeInTheDocument();
    // Glossary link present.
    expect(screen.getByRole("link", { name: /glossary/i })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<MemoryRouter><HowToPlayGuide open={false} onClose={vi.fn()} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- HowToPlayGuide`
Expected: FAIL — casual-path text + corrected J-20/J-35 wording + Glossary link absent.

- [ ] **Step 3: Update the guide**

In `frontend/src/components/guide/HowToPlayGuide.tsx`:

(a) Add at the top of the file:
```tsx
import { Link } from "react-router-dom";
```

(b) Add a new first section to the `SECTIONS` array (before "Your Role"):
```tsx
  {
    title: "The Casual Path",
    text: "New here? You can win by doing three things: allocate your budget sensibly, buy a few modern jets, and fight the combat events when they appear. Diplomacy, strikes, drones and logistics are optional depth you can grow into.",
  },
```

(c) Replace the "Key Tips" section's `text` with (fixes the J-20/J-35 bug):
```tsx
    text: "• Invest in R&D early — programs take years to complete.\n• Don't neglect maintenance budget — low readiness reduces combat effectiveness.\n• AWACS support gives +5% missile hit probability.\n• The adversary stealth fighters (J-20/J-35) are very hard to kill — you need numbers or your own 5th-gen (AMCA).",
```

(d) Add a Glossary link just above the "Got it" button (inside the `p-6 space-y-4` container, after the sections `<div>`):
```tsx
          <Link
            to="/glossary"
            onClick={onClose}
            className="block text-xs text-amber-400 underline"
          >
            📖 Open the full glossary
          </Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- HowToPlayGuide`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/guide/HowToPlayGuide.tsx frontend/src/components/guide/__tests__/HowToPlayGuide.test.tsx
git commit -m "feat(v2): rewrite How-to-Play (casual path, fix J-20/J-35, glossary link)"
```

---

### Task 5: Wire `<Term>` into combat surfaces (ForceCommitter + StrikeBuilder)

**Files:**
- Modify: `frontend/src/pages/OpsRoom.tsx` and/or `frontend/src/components/vignette/ForceCommitter.tsx` (whichever renders the Support/ROE labels)
- Modify: `frontend/src/components/ops/StrikeBuilder.tsx`
- Test: `frontend/src/lib/__tests__/term-keys.test.ts` (registry-coverage guard)

**Context:** Read the two components first. Wrap the **first/most prominent occurrence** of each jargon label in a `<Term>` so a player can tap to learn it. Do NOT wrap every occurrence — one per screen is enough and keeps the UI clean. Use these keys: in ForceCommitter — `awacs`, `tanker`, `sead`, `roe`, `readiness`; in StrikeBuilder — `sead`, `roe`, `blowback`. Example pattern (apply where the label text appears):

```tsx
import { Term } from "../primitives/Term"; // adjust relative path per file location

// e.g. a section header or toggle label:
<Term k="awacs">AWACS</Term>
// or wrapping inline text:
Rules of Engagement (<Term k="roe">ROE</Term>)
```

The registry-coverage test guards that any key you use exists (so a typo fails CI rather than silently rendering plain text).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/term-keys.test.ts
import { describe, it, expect } from "vitest";
import { GLOSSARY } from "../glossary";

// Keys that Task 5 wires into combat surfaces. Keep this list in sync with the
// `<Term k="...">` usages added to ForceCommitter/StrikeBuilder.
const USED_KEYS = ["awacs", "tanker", "sead", "roe", "readiness", "blowback"];

describe("term keys used in combat UI", () => {
  it("every wired key exists in the glossary", () => {
    for (const k of USED_KEYS) {
      expect(GLOSSARY[k], `glossary missing key: ${k}`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes (keys already exist) — this guard is intentional-green**

Run: `cd frontend && npm test -- term-keys`
Expected: PASS — all keys exist from Task 1. (This test is a regression guard for the wiring.)

- [ ] **Step 3: Wire `<Term>` into the two components**

Read `frontend/src/components/vignette/ForceCommitter.tsx` and `frontend/src/components/ops/StrikeBuilder.tsx`. For each jargon label listed above, wrap its first prominent occurrence in `<Term k="...">…</Term>` (import `Term` with the correct relative path). Keep changes minimal and visual-only.

- [ ] **Step 4: Verify build + existing tests still pass**

Run: `cd frontend && npx tsc --noEmit && npm test -- ForceCommitter StrikeBuilder term-keys`
Expected: tsc clean; existing component tests still pass; term-keys passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/vignette/ForceCommitter.tsx frontend/src/components/ops/StrikeBuilder.tsx frontend/src/pages/OpsRoom.tsx frontend/src/lib/__tests__/term-keys.test.ts
git commit -m "feat(v2): tap-to-define terms in ForceCommitter + StrikeBuilder"
```

---

### Task 6: CoachMarks overlay primitive

**Files:**
- Create: `frontend/src/components/onboarding/CoachMarks.tsx`
- Test: `frontend/src/components/onboarding/__tests__/CoachMarks.test.tsx`

**Context:** A spotlight overlay that walks the user through real on-screen elements. Targets are looked up by a `data-tour="<id>"` attribute. If a target is missing, the step still shows its card (centered) — never crash. Tap-driven; back button = Back/dismiss.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/onboarding/__tests__/CoachMarks.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoachMarks, type CoachStep } from "../CoachMarks";

const STEPS: CoachStep[] = [
  { targetId: "a", title: "Step A", body: "First" },
  { targetId: "missing", title: "Step B", body: "Second" },
];

describe("CoachMarks", () => {
  it("shows the first step, advances on Next, finishes on the last step", () => {
    const onDone = vi.fn();
    render(<CoachMarks steps={STEPS} onDone={onDone} />);
    expect(screen.getByText("Step A")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Step B")).toBeInTheDocument(); // resilient to missing target
    fireEvent.click(screen.getByRole("button", { name: /done|finish/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("Skip calls onDone immediately", () => {
    const onDone = vi.fn();
    render(<CoachMarks steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- CoachMarks`
Expected: FAIL — cannot resolve `../CoachMarks`.

- [ ] **Step 3: Implement the primitive**

```tsx
// frontend/src/components/onboarding/CoachMarks.tsx
import { useState, useLayoutEffect, useCallback } from "react";
import { useBackButtonClose } from "../../lib/useBackButtonClose";

export interface CoachStep {
  /** data-tour attribute value of the element to spotlight. */
  targetId: string;
  title: string;
  body: string;
}

export interface CoachMarksProps {
  steps: CoachStep[];
  onDone: () => void;
}

interface Rect { top: number; left: number; width: number; height: number; }

/**
 * Guided tour overlay. Dims the screen, spotlights the current step's target
 * element (by data-tour), and shows a card with Back/Next/Skip. Resilient to
 * missing targets (card centers). Tap + back-button driven for Android.
 */
export function CoachMarks({ steps, onDone }: CoachMarksProps) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  useBackButtonClose(true, () => (i > 0 ? setI(i - 1) : onDone()));

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
  }, [step]);

  const next = useCallback(() => {
    if (i + 1 >= steps.length) onDone();
    else setI(i + 1);
  }, [i, steps.length, onDone]);

  if (!step) return null;
  const isLast = i + 1 >= steps.length;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 safe-pt safe-pb" role="dialog" aria-label="Tutorial">
      {rect && (
        <div
          className="absolute rounded-lg ring-2 ring-amber-400 pointer-events-none transition-all"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[min(22rem,90vw)] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="text-xs text-amber-500/80 font-tech">{i + 1} of {steps.length}</div>
        <div className="mt-1 text-base font-semibold">{step.title}</div>
        <div className="mt-1 text-sm text-slate-300 leading-relaxed">{step.body}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onDone} className="text-xs text-slate-400 underline min-h-[44px] px-2">Skip</button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="rounded-lg border border-slate-600 px-4 min-h-[44px] text-sm">Back</button>
            )}
            <button type="button" onClick={next} className="rounded-lg bg-amber-600 text-slate-900 font-semibold px-4 min-h-[44px] text-sm">
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- CoachMarks`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/onboarding/CoachMarks.tsx frontend/src/components/onboarding/__tests__/CoachMarks.test.tsx
git commit -m "feat(v2): CoachMarks guided-tour overlay primitive"
```

---

### Task 7: First-run tour on the map + replay menu entry

**Files:**
- Create: `frontend/src/lib/tour.ts` (localStorage helpers + step definitions)
- Test: `frontend/src/lib/__tests__/tour.test.ts`
- Modify: `frontend/src/pages/CampaignMapView.tsx` (mount CoachMarks, add `data-tour` attrs, add "Replay tutorial" menu item)

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/tour.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { MAP_TOUR_STEPS, isTourSeen, markTourSeen, resetTour } from "../tour";

describe("tour helpers", () => {
  beforeEach(() => localStorage.clear());

  it("defines ordered map tour steps with required fields", () => {
    expect(MAP_TOUR_STEPS.length).toBeGreaterThanOrEqual(3);
    for (const s of MAP_TOUR_STEPS) {
      expect(s.targetId).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.body).toBeTruthy();
    }
  });

  it("tracks seen state in localStorage", () => {
    expect(isTourSeen()).toBe(false);
    markTourSeen();
    expect(isTourSeen()).toBe(true);
    resetTour();
    expect(isTourSeen()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tour`
Expected: FAIL — cannot resolve `../tour`.

- [ ] **Step 3: Implement tour helpers**

```ts
// frontend/src/lib/tour.ts
import type { CoachStep } from "../components/onboarding/CoachMarks";

const KEY = "tutorial_seen_v1";

export const MAP_TOUR_STEPS: CoachStep[] = [
  { targetId: "map-statusbar", title: "Your command status", body: "Treasury, your net budget per quarter, and outstanding orders live up here. Tap any underlined term anywhere to learn what it means." },
  { targetId: "map-menu", title: "Everything lives here", body: "Open this menu for Procurement (budget, R&D, buying jets), your Hangar, Intel, and more." },
  { targetId: "map-endturn", title: "Advance the quarter", body: "When you're done planning, End Turn moves time forward. Sometimes a combat event will fire — you'll be guided through it." },
];

export function isTourSeen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function markTourSeen(): void {
  try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}
export function resetTour(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Wire into CampaignMapView**

Read `frontend/src/pages/CampaignMapView.tsx`. Make these edits:

(a) Imports:
```tsx
import { CoachMarks } from "../components/onboarding/CoachMarks";
import { MAP_TOUR_STEPS, isTourSeen, markTourSeen, resetTour } from "../lib/tour";
```

(b) State + auto-launch (near the other `useState` calls, ~line 91). Launch only on the player's first turn (year 2026, quarter 2 — the seeded start) and only if unseen:
```tsx
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    if (!isTourSeen() && campaign && campaign.current_year === 2026 && campaign.current_quarter === 2) {
      setShowTour(true);
    }
  }, [campaign]);
```

(c) Add `data-tour` attributes to the three targets:
- The top status-bar container → `data-tour="map-statusbar"`
- The hamburger menu open button (`onClick={() => setShowMenu(true)}`, ~line 207) → `data-tour="map-menu"`
- The End Turn button → `data-tour="map-endturn"`

(d) Add a "Replay tutorial" item in the Settings menu section (right after the "❓ How to play" button, ~line 328):
```tsx
              <button
                type="button"
                onClick={() => { resetTour(); setShowTour(true); setShowMenu(false); }}
                className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >🧭 Replay tutorial</button>
```

(e) Mount the overlay near the bottom of the returned JSX (next to `<HowToPlayGuide .../>`, ~line 440):
```tsx
      {showTour && (
        <CoachMarks steps={MAP_TOUR_STEPS} onDone={() => { markTourSeen(); setShowTour(false); }} />
      )}
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npm test -- tour && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/tour.ts frontend/src/lib/__tests__/tour.test.ts frontend/src/pages/CampaignMapView.tsx
git commit -m "feat(v2): first-run map tour + replay tutorial menu entry"
```

---

### Task 8: First-vignette Ops Room coach-mark

**Files:**
- Modify: `frontend/src/lib/tour.ts` (add `OPS_TOUR_STEPS` + `ops` seen helpers)
- Modify: `frontend/src/pages/OpsRoom.tsx` (mount CoachMarks once, add `data-tour` attrs)
- Test: extend `frontend/src/lib/__tests__/tour.test.ts`

- [ ] **Step 1: Extend the failing test**

Add to `frontend/src/lib/__tests__/tour.test.ts`:
```ts
import { OPS_TOUR_STEPS, isOpsTourSeen, markOpsTourSeen } from "../tour";

describe("ops tour helpers", () => {
  beforeEach(() => localStorage.clear());
  it("defines ops tour steps", () => {
    expect(OPS_TOUR_STEPS.length).toBeGreaterThanOrEqual(2);
  });
  it("tracks ops seen state", () => {
    expect(isOpsTourSeen()).toBe(false);
    markOpsTourSeen();
    expect(isOpsTourSeen()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tour`
Expected: FAIL — `OPS_TOUR_STEPS`/`isOpsTourSeen`/`markOpsTourSeen` not exported.

- [ ] **Step 3: Add ops tour to `frontend/src/lib/tour.ts`**

```ts
const OPS_KEY = "ops_coach_seen_v1";

export const OPS_TOUR_STEPS: CoachStep[] = [
  { targetId: "ops-adversary", title: "Read the threat", body: "This is the enemy force you're facing — fuzzy if your intel is poor. The objective tells you what counts as a win." },
  { targetId: "ops-force", title: "Commit your force", body: "Pick squadrons and how many jets, add support (AWACS/tanker/SEAD), and set the rules of engagement. Tap any underlined term to learn it." },
  { targetId: "ops-commit", title: "Hold to commit", body: "When ready, hold the commit button. Combat resolves automatically and you'll get an after-action report." },
];

export function isOpsTourSeen(): boolean {
  try { return localStorage.getItem(OPS_KEY) === "1"; } catch { return false; }
}
export function markOpsTourSeen(): void {
  try { localStorage.setItem(OPS_KEY, "1"); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Wire into OpsRoom**

Read `frontend/src/pages/OpsRoom.tsx`. Add:
```tsx
import { CoachMarks } from "../components/onboarding/CoachMarks";
import { OPS_TOUR_STEPS, isOpsTourSeen, markOpsTourSeen } from "../lib/tour";
```
State + auto-launch once the planning state is loaded:
```tsx
  const [showOpsTour, setShowOpsTour] = useState(false);
  useEffect(() => {
    if (!isOpsTourSeen()) setShowOpsTour(true);
  }, []);
```
Add `data-tour` attributes: the adversary force panel → `data-tour="ops-adversary"`; the ForceCommitter wrapper → `data-tour="ops-force"`; the commit button → `data-tour="ops-commit"`. Mount near the end of the JSX:
```tsx
      {showOpsTour && (
        <CoachMarks steps={OPS_TOUR_STEPS} onDone={() => { markOpsTourSeen(); setShowOpsTour(false); }} />
      )}
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npm test -- tour && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/tour.ts frontend/src/lib/__tests__/tour.test.ts frontend/src/pages/OpsRoom.tsx
git commit -m "feat(v2): first-vignette Ops Room coach-mark"
```

---

### Task 9: Difficulty grant figures on Landing

**Files:**
- Create: `frontend/src/lib/economy.ts` (mirror backend grant constants)
- Test: `frontend/src/lib/__tests__/economy.test.ts`
- Modify: `frontend/src/pages/Landing.tsx` (show grant + "what changes")

**Context:** Backend constants (authoritative — `backend/app/engine/budget.py`): `BASE_QUARTERLY_GRANT_CR = 45000`; multipliers relaxed 1.5, realistic 1.0, hard_peer 0.7, worst_case 0.5; grant rounded to nearest 500. Mirror them on the frontend with a test that pins the expected 2026 values so drift is caught.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/economy.test.ts
import { describe, it, expect } from "vitest";
import { startingGrantCr, DIFFICULTY_BLURB } from "../economy";

describe("economy", () => {
  it("computes the 2026 starting quarterly grant per difficulty (matches backend)", () => {
    expect(startingGrantCr("relaxed")).toBe(67500);
    expect(startingGrantCr("realistic")).toBe(45000);
    expect(startingGrantCr("hard_peer")).toBe(31500);
    expect(startingGrantCr("worst_case")).toBe(22500);
  });
  it("has a one-line blurb per difficulty", () => {
    (["relaxed", "realistic", "hard_peer", "worst_case"] as const).forEach((d) => {
      expect(DIFFICULTY_BLURB[d].length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- economy`
Expected: FAIL — cannot resolve `../economy`.

- [ ] **Step 3: Implement**

```ts
// frontend/src/lib/economy.ts
import type { Difficulty } from "./types";

// Mirror of backend/app/engine/budget.py. Guarded by economy.test.ts.
const BASE_QUARTERLY_GRANT_CR = 45000;
const DIFFICULTY_MULT: Record<Difficulty, number> = {
  relaxed: 1.5, realistic: 1.0, hard_peer: 0.7, worst_case: 0.5,
};

/** Starting (2026) quarterly grant, rounded to nearest 500 — matches backend. */
export function startingGrantCr(d: Difficulty): number {
  return Math.round((BASE_QUARTERLY_GRANT_CR * DIFFICULTY_MULT[d]) / 500) * 500;
}

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  relaxed: "Generous budget — best for learning the game.",
  realistic: "Balanced budget, true-to-life pace.",
  hard_peer: "Tighter budget — tougher trade-offs.",
  worst_case: "Severe budget pressure — for veterans.",
};
```

- [ ] **Step 4: Show grant + blurb on Landing**

In `frontend/src/pages/Landing.tsx`, add the import:
```tsx
import { startingGrantCr, DIFFICULTY_BLURB } from "../lib/economy";
```
Replace the difficulty button label content (the `{d.label}` inside the button, ~line 195) with a stacked label showing the grant; and below the difficulty grid add the blurb for the selected difficulty:
```tsx
                    <span className="block">{d.label}</span>
                    <span className="block text-[10px] font-normal opacity-70">
                      ₹{startingGrantCr(d.value).toLocaleString("en-US")} cr/q
                    </span>
```
And immediately after the closing `</div>` of the difficulty grid (before the Objective selector), add:
```tsx
              <p className="text-xs opacity-60">{DIFFICULTY_BLURB[difficulty]}</p>
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npm test -- economy && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/economy.ts frontend/src/lib/__tests__/economy.test.ts frontend/src/pages/Landing.tsx
git commit -m "feat(v2): show real grant + what-changes per difficulty on Landing"
```

---

### Task 10: Objective cost/time hints + beginner tag

**Files:**
- Create: `frontend/src/lib/objectiveHints.ts`
- Test: `frontend/src/lib/__tests__/objectiveHints.test.ts`
- Modify: `frontend/src/pages/Landing.tsx` (render hint + beginner tag on objective cards)

**Context:** Frontend-only lookup keyed by objective id (avoids a backend schema change in this low-risk phase). Objective ids (from `backend/content/objectives.yaml`): `amca_operational_by_2035`, `maintain_42_squadrons`, `no_territorial_loss`, `modernize_fleet`, `indigenous_backbone`, `missile_sovereignty`, `maritime_reach`, plus the rest of the 12 (read the YAML for the remaining ids: fiscal discipline, combat excellence, stealth capability, emerging aces, comprehensive deterrence). Provide a hint for every id; mark the gentle ones beginner-friendly.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/__tests__/objectiveHints.test.ts
import { describe, it, expect } from "vitest";
import { OBJECTIVE_HINTS, BEGINNER_OBJECTIVE_IDS } from "../objectiveHints";

describe("objectiveHints", () => {
  it("has hints for the core objective ids", () => {
    ["amca_operational_by_2035", "maintain_42_squadrons", "modernize_fleet"].forEach((id) => {
      expect(OBJECTIVE_HINTS[id], `missing hint: ${id}`).toBeTruthy();
    });
  });
  it("beginner set has exactly 3 gentle objectives, all with hints", () => {
    expect(BEGINNER_OBJECTIVE_IDS).toHaveLength(3);
    BEGINNER_OBJECTIVE_IDS.forEach((id) => expect(OBJECTIVE_HINTS[id]).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- objectiveHints`
Expected: FAIL — cannot resolve `../objectiveHints`.

- [ ] **Step 3: Implement (read objectives.yaml for the full id list first)**

```ts
// frontend/src/lib/objectiveHints.ts
// Short cost/time hints per objective id. Source of truth for ids:
// backend/content/objectives.yaml. Missing ids simply render no hint.
export const OBJECTIVE_HINTS: Record<string, string> = {
  amca_operational_by_2035: "Hard — needs ~9 yrs of AMCA R&D + production.",
  maintain_42_squadrons: "Steady buying; beginner-friendly.",
  no_territorial_loss: "Defensive — win the combat events that matter.",
  modernize_fleet: "Buy/retire toward 4.5-gen majority; beginner-friendly.",
  indigenous_backbone: "Field 5+ Tejas/AMCA squadrons over the campaign.",
  missile_sovereignty: "Finish Astra Mk3 + BrahMos-NG R&D (multi-year).",
  maritime_reach: "Complete the TEDBF naval-fighter R&D program.",
  fiscal_discipline: "End in the black; beginner-friendly.",
  combat_excellence: "Win >65% of combat events.",
  stealth_capability: "Field 2+ stealth (VLO) platforms by 2035 — expensive.",
  emerging_aces: "Grow 3+ veteran 'ace' squadrons through combat.",
  comprehensive_deterrence: "Complete 4+ missile/EW/sensor R&D programs.",
};

// Gentle, mutually-compatible starters for the Quick Start bundle (Task 11).
export const BEGINNER_OBJECTIVE_IDS = [
  "maintain_42_squadrons",
  "modernize_fleet",
  "fiscal_discipline",
] as const;
```

> Note: confirm the exact ids for `fiscal_discipline`, `combat_excellence`, `stealth_capability`, `emerging_aces`, `comprehensive_deterrence` against `backend/content/objectives.yaml` and correct the keys if they differ. Hints for unknown ids are harmless (just not shown), but the beginner ids MUST match real ids.

- [ ] **Step 4: Render hint + beginner tag on Landing**

In `frontend/src/pages/Landing.tsx`, add the import:
```tsx
import { OBJECTIVE_HINTS, BEGINNER_OBJECTIVE_IDS } from "../lib/objectiveHints";
```
Inside the objective card button (after the `description` div, ~line 230), add:
```tsx
                      {OBJECTIVE_HINTS[obj.id] && (
                        <div className="text-[11px] text-amber-300/80 mt-1">{OBJECTIVE_HINTS[obj.id]}</div>
                      )}
                      {(BEGINNER_OBJECTIVE_IDS as readonly string[]).includes(obj.id) && (
                        <span className="inline-block mt-1 text-[10px] rounded bg-emerald-700/40 text-emerald-200 px-1.5 py-0.5">Beginner-friendly</span>
                      )}
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd frontend && npm test -- objectiveHints && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/objectiveHints.ts frontend/src/lib/__tests__/objectiveHints.test.ts frontend/src/pages/Landing.tsx
git commit -m "feat(v2): objective cost/time hints + beginner tags on Landing"
```

---

### Task 11: Quick Start button

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`
- Test: `frontend/src/pages/__tests__/Landing.test.tsx` (extend existing)

**Context:** One tap fills a beginner-friendly setup (relaxed difficulty + `BEGINNER_OBJECTIVE_IDS` + a default name) and starts the campaign. Reuse the existing `handleStart` flow but allow passing an explicit config so we don't depend on async state batching.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/pages/__tests__/Landing.test.tsx`:
```tsx
  it("Quick Start creates a campaign with relaxed difficulty + 3 beginner objectives", async () => {
    const createCampaign = vi.fn().mockResolvedValue(undefined);
    setup(makeStore({ campaignList: [], createCampaign }));
    const quick = await screen.findByRole("button", { name: /quick start/i });
    fireEvent.click(quick);
    expect(createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: "relaxed", objectives: expect.arrayContaining(["maintain_42_squadrons", "modernize_fleet", "fiscal_discipline"]) }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Landing`
Expected: FAIL — no "Quick Start" button.

- [ ] **Step 3: Implement**

In `frontend/src/pages/Landing.tsx`, refactor `handleStart` to accept an optional explicit config and add a `handleQuickStart`:
```tsx
  async function handleStart(cfg?: { name: string; difficulty: Difficulty; objectives: string[] }) {
    const payload = cfg ?? { name, difficulty, objectives: selectedObjectives };
    await createCampaign(payload);
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
  }

  function handleQuickStart() {
    void handleStart({
      name: "First Command",
      difficulty: "relaxed",
      objectives: [...BEGINNER_OBJECTIVE_IDS],
    });
  }
```
Update the existing submit button's onClick to `onClick={() => handleStart()}`. Add a Quick Start button at the top of the form (just inside `formVisible`, above the name field):
```tsx
            <button
              onClick={handleQuickStart}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-4 py-3 text-sm"
            >
              ⚡ Quick Start (recommended for new players)
            </button>
            <div className="text-center text-[11px] opacity-50">— or customize below —</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Landing && npx tsc --noEmit`
Expected: PASS (existing Landing tests + new one); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Landing.tsx frontend/src/pages/__tests__/Landing.test.tsx
git commit -m "feat(v2): one-tap Quick Start on Landing"
```

---

### Task 12: Full suite, Android verification, docs

**Files:**
- Modify: `CLAUDE.md` (status block), `docs/superpowers/plans/ROADMAP.md` (note)

- [ ] **Step 1: Run the full frontend suite + typecheck**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: all tests green; the suite count has grown from the ~216 baseline by the new tests. Fix any regressions before proceeding.

- [ ] **Step 2: Build for Android (Capacitor) and verify it compiles**

Run: `cd frontend && npm run build && npm run cap:sync`
Expected: Vite build succeeds; Capacitor sync copies `dist/` into `android/`. (A full device/emulator pass is a manual owner step — note it in the report.)

- [ ] **Step 3: Manual Android checklist (document in the task report; owner runs on device/emulator)**

Verify on an Android build:
- Tap an underlined `<Term>` → popover opens, stays on-screen, closes on outside-tap and on the hardware back button.
- First-run coach-marks appear on a new campaign's first turn; spotlight clears the status bar/notch; Back button steps back / dismisses; "Replay tutorial" relaunches it.
- Quick Start launches straight into a campaign.

- [ ] **Step 4: Update docs**

Add a "Current status" bullet in `CLAUDE.md` summarizing v2 Phase 1 (glossary + Term tap-to-define, Glossary screen, CoachMarks first-run map tour + Ops Room coach-mark + replay, Landing grant figures + objective hints + Quick Start, How-to-Play rewrite/J-20-J-35 fix), note the new frontend test count, and link the spec + this plan. Add a dated note in `ROADMAP.md` and bump "Last updated".

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(v2): mark Phase 1 onboarding & legibility done"
```

---

## Self-Review

**Spec coverage:** Glossary registry (T1) + `<Term>` (T2) + Glossary screen (T3) + combat wiring (T5) cover the glossary requirement. Coach-marks primitive (T6) + map first-run tour (T7) + Ops Room overlay (T8) cover the coach-marks requirement (scripted-winnable-first-fight correctly deferred to Phase 4 — not in this plan). Setup clarity = difficulty grant figures (T9) + objective hints/beginner tags (T10) + Quick Start (T11). How-to-Play rewrite + J-20/J-35 fix (T4). Android constraint addressed per-task (tap, safe-area, back-button via `useBackButtonClose`) and verified in T12. ✓

**Placeholder scan:** Every code step shows complete code or an exact edit with location. T5 and T10 intentionally instruct reading the target file/YAML first (large existing components / source-of-truth ids) but specify exact keys/terms + the guard test — no vague "handle edge cases." ✓

**Type consistency:** `GlossaryEntry`/`lookupTerm`/`GLOSSARY` (T1) used by `Term` (T2), Glossary page (T3); `CoachStep`/`CoachMarks` (T6) used by `tour.ts` (T7/T8); `Difficulty` (existing type) used by `economy.ts` (T9); `BEGINNER_OBJECTIVE_IDS`/`OBJECTIVE_HINTS` (T10) used by Quick Start (T11). Names consistent across tasks. ✓
