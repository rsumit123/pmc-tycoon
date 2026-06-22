# Platform Imagery (Visual Engagement Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real, optimized, attributed aircraft/platform imagery (committed in-repo, offline-ready) across the dossier, hangar, and acquisitions — replacing the all-silhouette look.

**Architecture:** Extend the existing Wikimedia fetcher to produce optimized committed WebP + attribution data; a shared `PlatformImage` component (lazy-load + silhouette fallback + dark treatment) renders them on key screens; an Image Credits screen satisfies CC-BY attribution. Backend runtime unchanged (manifest + script are content/dev-time only).

**Tech Stack:** Python (httpx + Pillow) for the fetcher, React 19 + Vite + TS + Tailwind v4 for the UI, vitest + pytest for tests.

**Spec:** `docs/superpowers/specs/2026-06-22-platform-imagery-design.md`

**Platform ids (47, from `backend/content/platforms.yaml`):** rafale_f4 rafale_f5 tejas_mk1a tejas_mk2 su30_mki mirage2000 amca_mk1 amca_mk2 tejas_mk1 mig29_upg jaguar_darin3 mig21_bison netra_aewc il78_tanker tedbf tapas_uav ghatak_ucav su35 f18e_super_hornet f15ex gripen_e eurofighter_typhoon mq9b_seaguardian heron_tp j20a j20s j35a j10c j16 j11b j36 j36_prototype kj500 h6kj h6n j35e j10ce jf17_blk3 f16_blk52 fujian type004_carrier type055_destroyer type093b_ssn yj21_missile cj20_missile babur_missile shahed_drone

---

## Conventions

- Frontend from `frontend/`: tests `npm test`, typecheck `npx tsc --noEmit`, build `npm run build`. Backend content test from `backend/`: `.venv/bin/python -m pytest`.
- Commit after each task, to `main`.
- Existing baselines: frontend **209** vitest tests, backend **663** pytest tests. Preserve/grow.

---

## Task 1: Extend the fetcher (resize → WebP → attribution + aggregate)

**Files:**
- Modify: `scripts/fetch_platform_assets.py`
- Create: `scripts/requirements.txt`
- Modify: `frontend/public/platforms/.gitignore`

- [ ] **Step 1: Add the script deps file**

Create `scripts/requirements.txt`:
```
httpx==0.27.2
pyyaml==6.0.2
Pillow==11.0.0
```
Install: `pip install -r scripts/requirements.txt` (dev/content tooling; not part of the backend Docker image).

- [ ] **Step 2: Rewrite the image-processing + write logic in `scripts/fetch_platform_assets.py`**

Add at the top (after existing imports):
```python
import io
from PIL import Image

MAX_WIDTH = 800
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
```

Add a helper:
```python
def _to_webp(raw: bytes, dest: Path) -> None:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width > MAX_WIDTH:
        h = round(img.height * MAX_WIDTH / img.width)
        img = img.resize((MAX_WIDTH, h), Image.LANCZOS)
    img.save(dest, "WEBP", quality=80, method=6)
```

Replace `fetch_one` so it writes `hero.webp` (not `.jpg`) and a richer `attribution.json`:
```python
def fetch_one(entry: dict) -> bool:
    pid = entry["id"]
    url = entry["hero_url"]
    dest = OUT_DIR / pid
    dest.mkdir(parents=True, exist_ok=True)
    hero = dest / "hero.webp"
    attr = dest / "attribution.json"

    print(f"[{pid}] {url}")
    try:
        with httpx.Client(follow_redirects=True, timeout=30.0, headers={"User-Agent": UA}) as client:
            r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  FAILED: {e}")
        return False
    try:
        _to_webp(r.content, hero)
    except Exception as e:  # noqa: BLE001
        print(f"  IMAGE ERROR: {e}")
        return False

    attr.write_text(json.dumps({
        "platform_id": pid,
        "attribution": entry.get("attribution", ""),
        "author": entry.get("author", ""),
        "license": entry.get("license", "unknown"),
        "source_url": entry.get("source_url", url),
    }, indent=2), encoding="utf-8")
    print(f"  saved {hero.relative_to(REPO_ROOT)} ({hero.stat().st_size:,} bytes)")
    return True
```

Add the aggregator + call it from `main` over the FULL manifest (so a partial/single-id run never shrinks the credits list):
```python
def write_aggregate() -> None:
    full = load_manifest()
    rows = [
        {k: e.get(k, "") for k in ("id", "attribution", "author", "license", "source_url")}
        for e in full
        if (OUT_DIR / e["id"] / "hero.webp").exists()
    ]
    (OUT_DIR / "attributions.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"wrote attributions.json ({len(rows)} images)")
```
In `main`, after the fetch loop and before `return`, add `write_aggregate()`.

- [ ] **Step 3: Allow the optimized images to be committed**

Replace `frontend/public/platforms/.gitignore` with:
```
# Source images are never committed. Only the optimized hero.webp + attribution
# JSON are committed (small, bundled into the web build AND the offline APK).
*.jpg
*.jpeg
*.png
```
(Removing the blanket `*.webp` ignore so `hero.webp` / `attributions.json` commit; `attribution.json` is already non-ignored.)

- [ ] **Step 4: Smoke-test the script imports + helper**

Run: `python -c "import sys; sys.path.insert(0,'scripts'); import fetch_platform_assets as f; print('ok', f.MAX_WIDTH)"`
Expected: `ok 800`. (Full fetch happens in Task 7.)

- [ ] **Step 5: Commit**
```bash
git add scripts/fetch_platform_assets.py scripts/requirements.txt frontend/public/platforms/.gitignore
git commit -m "feat(assets): fetcher resizes+converts to WebP, richer attribution + aggregate"
```

---

## Task 2: Expand + enrich the asset manifest

**Files:**
- Modify: `backend/content/asset_manifest.yaml`

This is content curation (needs web lookups). Best-effort coverage; partial is acceptable (silhouette fallback covers gaps).

- [ ] **Step 1: Add `author` + `source_url` to EVERY existing entry**

Each manifest entry must have: `id`, `hero_url`, `license`, `author`, `source_url`, `attribution`. For the existing ~18 entries, add the missing `author` (the Wikimedia uploader/photographer credit required by the license) and `source_url` (the Wikimedia Commons **file page**, e.g. `https://commons.wikimedia.org/wiki/File:...`). Use WebFetch/WebSearch on commons.wikimedia.org to confirm each image's license + author from its file page.

- [ ] **Step 2: Add entries for additional platforms — prioritize air platforms**

Add manifest entries (same field shape) for as many of the remaining ids as have a **confirmable CC-BY / CC-BY-SA / public-domain** image on Wikimedia Commons. Priority order:
1. Fighters/AEW/tanker/drones the player sees most: rafale_f5 tejas_mk2 amca_mk1 amca_mk2 tejas_mk1 mig29_upg jaguar_darin3 mig21_bison netra_aewc il78_tanker tedbf tapas_uav ghatak_ucav su35 f18e_super_hornet f15ex gripen_e eurofighter_typhoon mq9b_seaguardian heron_tp j20s j10c j16 j11b kj500 h6kj h6n j35e j10ce jf17_blk3 f16_blk52
2. Naval (only if dossiers surface them): fujian type004_carrier type055_destroyer type093b_ssn
3. Munitions/drones (likely no clean image — SKIP, leave silhouette): yj21_missile cj20_missile babur_missile shahed_drone

For prototypes without real images (j36, j36_prototype, j20s if no photo), SKIP — silhouette fallback is correct. **Only add an entry if you can confirm the license on the Commons file page.** Do NOT guess URLs.

- [ ] **Step 3: Sanity-check YAML parses**

Run from `backend/`: `.venv/bin/python -c "import yaml; d=yaml.safe_load(open('content/asset_manifest.yaml')); print(len(d['platforms']), 'entries')"`
Expected: prints the new count (no YAML error).

- [ ] **Step 4: Commit**
```bash
git add backend/content/asset_manifest.yaml
git commit -m "content(assets): enrich manifest with author/source_url + expand platform coverage"
```

Report which ids you added vs. skipped and why.

---

## Task 3: Manifest validation test (no network)

**Files:**
- Test: `backend/tests/test_asset_manifest.py`

- [ ] **Step 1: Write the test**

Create `backend/tests/test_asset_manifest.py`:
```python
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST = ROOT / "backend" / "content" / "asset_manifest.yaml"
PLATFORMS = ROOT / "backend" / "content" / "platforms.yaml"

REQUIRED = {"id", "hero_url", "license", "author", "source_url", "attribution"}
ALLOWED_LICENSE_TOKENS = ("CC BY", "CC0", "Public domain", "public domain")


def _platform_ids() -> set[str]:
    data = yaml.safe_load(PLATFORMS.read_text())
    return {p["id"] for p in data["platforms"]}


def test_manifest_entries_well_formed():
    entries = yaml.safe_load(MANIFEST.read_text())["platforms"]
    ids = _platform_ids()
    seen = set()
    for e in entries:
        missing = REQUIRED - e.keys()
        assert not missing, f"{e.get('id','?')} missing fields: {missing}"
        assert e["id"] in ids, f"manifest id not in platforms.yaml: {e['id']}"
        assert e["id"] not in seen, f"duplicate manifest id: {e['id']}"
        seen.add(e["id"])
        assert any(tok in e["license"] for tok in ALLOWED_LICENSE_TOKENS), \
            f"{e['id']} has non-permissive license: {e['license']}"
        assert str(e["hero_url"]).startswith("http")
        assert str(e["source_url"]).startswith("http")
```

- [ ] **Step 2: Run it**

Run from `backend/`: `.venv/bin/python -m pytest tests/test_asset_manifest.py -v`
Expected: PASS. If it fails, fix the manifest entries it flags (missing fields / bad license / unknown id), don't weaken the test.

- [ ] **Step 3: Commit**
```bash
git add backend/tests/test_asset_manifest.py
git commit -m "test(assets): validate manifest fields, license, and platform ids"
```

---

## Task 4: `PlatformImage` shared component

**Files:**
- Create: `frontend/src/components/primitives/PlatformImage.tsx`
- Test: `frontend/src/components/primitives/__tests__/PlatformImage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/primitives/__tests__/PlatformImage.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformImage } from "../PlatformImage";

describe("PlatformImage", () => {
  it("renders an image whose src points at the platform hero webp", () => {
    render(<PlatformImage platformId="rafale_f4" name="Rafale" />);
    const img = screen.getByAltText("Rafale") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("platforms/rafale_f4/hero.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to the silhouette when the image errors", () => {
    render(<PlatformImage platformId="missing_x" name="Missing" />);
    fireEvent.error(screen.getByAltText("Missing"));
    expect(screen.queryByAltText("Missing")).toBeNull();
    expect(screen.getByTestId("platform-image-fallback")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it (red)**

Run: `npm test -- PlatformImage` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/components/primitives/PlatformImage.tsx`:
```typescript
import { useState } from "react";
import { PlatformSilhouette } from "./PlatformSilhouette";

interface Props {
  platformId: string;
  name: string;
  variant?: "hero" | "thumb";
  /** Optional attribution caption (hero only). */
  author?: string | null;
  license?: string | null;
  className?: string;
}

export function PlatformImage({ platformId, name, variant = "hero", author, license, className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = `${import.meta.env.BASE_URL}platforms/${platformId}/hero.webp`;

  if (broken) {
    return (
      <div
        data-testid="platform-image-fallback"
        className={`flex items-center justify-center bg-slate-900/60 ${className ?? ""}`}
      >
        <PlatformSilhouette size={variant === "hero" ? 150 : 56} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className ?? ""}`}>
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-contain saturate-[0.9] contrast-[1.05]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
      {variant === "hero" && author && (
        <div className="font-tech absolute bottom-1 right-2 text-[9px] text-slate-400/80">
          © {author}{license ? ` · ${license}` : ""}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it (green)**

Run: `npm test -- PlatformImage` → PASS (2 tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/primitives/PlatformImage.tsx frontend/src/components/primitives/__tests__/PlatformImage.test.tsx
git commit -m "feat(ui): PlatformImage component (lazy webp + silhouette fallback + dark treatment)"
```

---

## Task 5: Surface imagery in dossier, hangar, acquisitions

**Files:**
- Modify: `frontend/src/components/primitives/PlatformDossier.tsx`
- Modify: `frontend/src/pages/HangarPage.tsx` (or its by-platform card component — read to find it)
- Modify: `frontend/src/components/procurement/AcquisitionPipeline.tsx`

- [ ] **Step 1: PlatformDossier — use PlatformImage for the hero**

In `PlatformDossier.tsx`: import `PlatformImage`; remove the local `imgBroken` state + the `<img onError>`/`<PlatformSilhouette>` conditional block (PlatformImage owns that now) and the direct `PlatformSilhouette` import. Replace the hero block with:
```tsx
<PlatformImage platformId={platform.id} name={platform.name} variant="hero"
               className="w-full aspect-video rounded-lg" />
```
Keep the rest of the dossier (RadarChart, stats) unchanged.

- [ ] **Step 2: Hangar — thumbnail on by-platform summary cards**

Read `HangarPage.tsx` to find the "by platform" summary card (it iterates `summary_by_platform`, each has a platform id like `platform_id`). Add at the top of each card:
```tsx
<PlatformImage platformId={p.platform_id} name={p.platform_name ?? p.platform_id} variant="thumb"
               className="w-full aspect-video rounded mb-2" />
```
(Use the actual field names present on the summary object — read the type first.)

- [ ] **Step 3: Acquisitions — thumbnail on aircraft offer cards**

In `AcquisitionPipeline.tsx`, find the aircraft `OfferCard` (the `kind === "platform"` offers; each offer references a platform id like `offer.platform_id`). Add a thumbnail near the top of the card:
```tsx
<PlatformImage platformId={offer.platform_id} name={offer.name ?? offer.platform_id} variant="thumb"
               className="w-full aspect-video rounded mb-2" />
```
(Confirm the field names on the offer object. Do NOT add images to missile-batch / AD-battery / reload offer kinds — aircraft only.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npm test` → all pass (209 + the 2 PlatformImage tests = 211; fix any dossier test that referenced the old `imgBroken`/`hero.jpg` markup and report it).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/primitives/PlatformDossier.tsx frontend/src/pages/HangarPage.tsx frontend/src/components/procurement/AcquisitionPipeline.tsx
git commit -m "feat(ui): platform imagery in dossier, hangar, acquisition offers"
```

---

## Task 6: Image Credits screen

**Files:**
- Create: `frontend/src/pages/ImageCredits.tsx`
- Test: `frontend/src/pages/__tests__/ImageCredits.test.tsx`
- Modify: `frontend/src/App.tsx` (add `/credits` route, public)
- Modify: `frontend/src/pages/CampaignMapView.tsx` (menu link), `frontend/src/pages/Landing.tsx` (footer link)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/__tests__/ImageCredits.test.tsx`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ImageCredits } from "../ImageCredits";

const SAMPLE = [
  { id: "rafale_f4", attribution: "Dassault Rafale — Wikimedia Commons", author: "Tim Felce", license: "CC BY-SA 2.0", source_url: "https://commons.wikimedia.org/wiki/File:Rafale.jpg" },
];

describe("ImageCredits", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) })) as never);
  });

  it("lists each image's attribution, author, license, and a source link", async () => {
    render(<MemoryRouter><ImageCredits /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Dassault Rafale/)).toBeInTheDocument());
    expect(screen.getByText(/Tim Felce/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 2\.0/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /source/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("commons.wikimedia.org");
  });
});
```

- [ ] **Step 2: Run it (red)**

Run: `npm test -- ImageCredits` → FAIL (module not found).

- [ ] **Step 3: Implement the page**

Create `frontend/src/pages/ImageCredits.tsx`:
```typescript
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Credit {
  id: string;
  attribution: string;
  author: string;
  license: string;
  source_url: string;
}

export function ImageCredits() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}platforms/attributions.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCredits(Array.isArray(data) ? data : []))
      .catch(() => setCredits([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.1em]">Image Credits</h1>
        <Link to="/" className="text-sm text-amber-400 underline">← Back</Link>
      </div>
      <p className="font-tech mb-6 text-xs uppercase tracking-wider text-slate-500">
        Platform imagery via Wikimedia Commons, used under each image's license.
      </p>
      {loaded && credits.length === 0 && (
        <p className="text-sm text-slate-400">No image credits available.</p>
      )}
      <ul className="space-y-3">
        {credits.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm">
            <div className="font-medium text-slate-100">{c.attribution || c.id}</div>
            <div className="mt-1 text-xs text-slate-400">
              {c.author && <span>© {c.author} · </span>}
              <span>{c.license}</span>
            </div>
            {c.source_url && (
              <a href={c.source_url} target="_blank" rel="noreferrer"
                 className="font-tech mt-1 inline-block text-[11px] uppercase tracking-wider text-amber-400 underline">
                View source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Wire the route (public) + links**

In `frontend/src/App.tsx`: import `ImageCredits` and add a route OUTSIDE the `ProtectedRoute` group (publicly reachable, like `/login`):
```tsx
<Route path="/credits" element={<ImageCredits />} />
```
In `frontend/src/pages/CampaignMapView.tsx`: in the menu's Settings section, add a link `<Link to="/credits" ...>Image Credits</Link>` (match the existing menu-item styling).
In `frontend/src/pages/Landing.tsx`: add a small footer link near "How to play": `<Link to="/credits" className="text-xs text-slate-500 underline">Image credits</Link>`.

- [ ] **Step 5: Verify**

Run: `npm test -- ImageCredits` → PASS. Then `npm test` (full) → green, and `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/pages/ImageCredits.tsx frontend/src/pages/__tests__/ImageCredits.test.tsx frontend/src/App.tsx frontend/src/pages/CampaignMapView.tsx frontend/src/pages/Landing.tsx
git commit -m "feat(ui): Image Credits screen (CC attribution) + menu/landing links"
```

---

## Task 7: Run the fetcher + commit the images

**Files:**
- Create (generated, committed): `frontend/public/platforms/<id>/hero.webp`, `.../attribution.json`, `frontend/public/platforms/attributions.json`

> **Environment caveat:** this needs network (Wikimedia) + Pillow. If the sandbox lacks outbound network, mark **BLOCKED** and report — the repo owner runs `pip install -r scripts/requirements.txt && python scripts/fetch_platform_assets.py` locally and commits the output. Do NOT hand-fabricate images.

- [ ] **Step 1: Fetch all**

Run from repo root: `python scripts/fetch_platform_assets.py`
Expected: per-platform "saved …/hero.webp (N bytes)" lines, a final "M/N fetched successfully", and "wrote attributions.json (M images)". Note any FAILED entries (bad URL) and fix those manifest URLs or drop them.

- [ ] **Step 2: Verify the output**

Run: `ls frontend/public/platforms/*/hero.webp | wc -l` (should be ≥ the number of working manifest entries) and `python -c "import json; print(len(json.load(open('frontend/public/platforms/attributions.json'))))"`.
Spot-check total committed size is reasonable (a few MB): `du -sh frontend/public/platforms`.

- [ ] **Step 3: Confirm a production build includes the images + the app builds**

From `frontend/`: `npm run build` → succeeds. Confirm `dist/platforms/<some-id>/hero.webp` exists in the build output (`ls frontend/dist/platforms/*/hero.webp | head`).

- [ ] **Step 4: Commit the assets**
```bash
git add frontend/public/platforms
git commit -m "assets: fetch + commit optimized platform hero images + attributions"
```

---

## Task 8: Docs + status

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Update CLAUDE.md**

Add a status bullet: platform imagery phase 1 — fetcher now resizes→WebP + records author/license/source_url + aggregates `attributions.json`; committed WebP (offline-ready, bundled into web + APK); shared `PlatformImage` (lazy + silhouette fallback + dark treatment) in dossier/hangar/acquisitions; public `/credits` Image Credits screen for CC attribution. Note coverage (X of 47 platforms have images; rest fall back to silhouette), new frontend/backend test counts, and that **Phase 2 (juice animations) + Phase 3 (ambient/identity art) remain**. Bump the "last updated" date to 2026-06-22. Add the spec + plan file refs.

- [ ] **Step 2: Update ROADMAP.md**

Add a row: `| 25 | Platform Imagery (Visual Engagement P1) | 🟢 done | 2026-06-22-platform-imagery-plan.md |` and bump "Last updated".

- [ ] **Step 3: Final verification**

From `frontend/`: `npm test` (green) + `npx tsc --noEmit` (clean). From `backend/`: `.venv/bin/python -m pytest -q` (green).

- [ ] **Step 4: Commit**
```bash
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs: platform imagery phase 1 status"
```

---

## Final review checklist (controller, after all tasks)

- [ ] Frontend suite green (note count vs 209); backend green (note vs 663).
- [ ] `npm run build` includes `dist/platforms/**/hero.webp`.
- [ ] No source `*.jpg/png` committed under `frontend/public/platforms` (only `hero.webp` + `*.json`).
- [ ] Every committed image is CC-BY/BY-SA/PD and appears in the `/credits` screen with author + license + source (attribution compliance).
- [ ] Dossier/hangar/acquisition show images where available, silhouettes elsewhere — no broken-image icons.
- [ ] Coverage reported (which ids have images vs silhouette).

## Spec coverage self-check

- WebP-in-repo delivery → Tasks 1, 7 ✓
- Manifest expansion + author/source_url + CC-only → Tasks 2, 3 ✓
- Fetcher resize→WebP + attribution + aggregate → Task 1 ✓
- `PlatformImage` (lazy, fallback, dark treatment) → Task 4 ✓
- Surfaces (dossier/hangar/acquisitions) → Task 5 ✓
- Image Credits screen (CC attribution) → Task 6 ✓
- Testing (PlatformImage, credits, manifest validation, suites green) → Tasks 3, 4, 6, 8 ✓
- Out of scope (juice, ambient art) → not built ✓
