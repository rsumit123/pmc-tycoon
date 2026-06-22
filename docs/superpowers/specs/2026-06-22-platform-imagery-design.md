# Platform Imagery (Visual Engagement — Phase 1) — Design Spec

**Date:** 2026-06-22
**Status:** Approved (pending user review of this doc)
**Author:** brainstormed with Claude

## Why

Chakravyuh is engaging mechanically but entirely text/data-driven — no aircraft imagery. For a defense-enthusiast audience, *seeing* the Rafale, J-20, S-400, etc. is the single biggest "this is cool" upgrade before opening to closed testers / Play Store. The image pipeline is already half-built (manifest + fetcher + dossier hero-slot with silhouette fallback) but ships **no images**: they're gitignored and never reach the Vercel build or the offline APK, so every platform renders the generic silhouette.

This is **Phase 1 of three** (user chose "all three, phased"): (1) real platform imagery [this spec], (2) game-feel "juice" animations, (3) ambient/identity art. Phases 2–3 get their own spec→plan cycles later.

## Decisions (locked)

- **Delivery:** commit optimized **WebP** images in-repo (un-gitignore). They bundle into both the Vercel web build and the Capacitor APK → images work **offline**, no runtime/CDN dependency. ~47 images × ~30–60KB ≈ 2–3MB of committed binaries (acceptable at this scale).
- **Sourcing:** Wikimedia Commons only, **strictly CC-BY / CC-BY-SA / public-domain** (Play Store safe). Each manifest entry records `author` + `license` + `source_url`.
- **Coverage:** aim for all ~47 platforms with a clean free image; any without keep the existing silhouette fallback (no blocker).
- **Attribution:** a visible in-app **Image Credits** screen is REQUIRED (CC-BY attribution compliance), plus a small per-image caption.
- **Surfaces:** PlatformDossier (hero), Hangar by-platform cards (thumb), Acquisition offer cards (thumb). Force-exchange keeps silhouettes.

## Existing pieces (reuse, don't rebuild)

- `backend/content/asset_manifest.yaml` — per-platform `id`, `hero_url`, `license`, `attribution` (currently ~18 entries).
- `scripts/fetch_platform_assets.py` — downloads `hero.jpg` + writes `attribution.json` to `frontend/public/platforms/{id}/`. Browser-like UA (Plan 11 fixed the Wikimedia 403).
- `frontend/public/platforms/.gitignore` — ignores `*.jpg/png/webp`, commits `attribution.json`.
- `frontend/src/components/primitives/PlatformDossier.tsx` — modal with hero-image slot + `PlatformSilhouette` SVG fallback.
- `frontend/src/components/...PlatformSilhouette` — generic SVG used when no image.

## Architecture

### 1. Manifest expansion (`backend/content/asset_manifest.yaml`)

Extend to cover all ~47 platforms in `backend/content/platforms.yaml`. Each entry:
```yaml
- id: <platform_id>            # must match platforms.yaml id
  hero_url: <Wikimedia Commons image URL>
  license: <e.g. "CC BY-SA 4.0" | "CC BY 2.0" | "Public domain">
  author: <attribution name as required by the license>
  source_url: <Wikimedia Commons FILE PAGE url (not the raw image)>
  attribution: <short display string, e.g. "Chengdu J-20 — Wikimedia Commons">
```
`author` + `source_url` are NEW required fields (current manifest lacks them) — needed for lawful CC-BY attribution. Platforms with no clean free image are simply omitted (silhouette fallback).

### 2. Fetch + optimize pipeline (`scripts/fetch_platform_assets.py`)

Extend the script to, per entry:
1. Download the source image (existing).
2. **Resize** to max 800px wide + **convert to WebP** (quality ~80, strip metadata) using `Pillow` → write `frontend/public/platforms/{id}/hero.webp` (replaces `hero.jpg`).
3. Write `attribution.json` `{ id, author, license, source_url, attribution }`.
4. Print a summary: fetched / failed / skipped, so missing coverage is visible (no silent gaps).

After running, **commit the `hero.webp` files**. Update `frontend/public/platforms/.gitignore` to allow `hero.webp` (e.g. add `!hero.webp`) while still ignoring large source `*.jpg/png`.

New dev dependency: `Pillow` (add to a `scripts/requirements.txt` or document the one-off install; the fetcher is a dev/content tool, not part of the backend runtime image).

### 3. Aggregated attribution data

A small step (in the fetcher, or a tiny separate script run after) writes `frontend/public/platforms/attributions.json` — an array of every committed image's `{ id, displayName, author, license, source_url }`. The frontend reads this for the Image Credits screen. (Aggregating at content-time avoids the frontend having to fetch N per-platform json files.)

### 4. `PlatformImage` component (`frontend/src/components/primitives/PlatformImage.tsx`)

One shared, focused component:
- Props: `platformId: string`, `name: string`, `variant: "hero" | "thumb"`, optional `className`.
- Resolves `import.meta.env.BASE_URL + "platforms/" + platformId + "/hero.webp"`.
- `loading="lazy"`, fixed aspect ratio (16:9), `object-contain` on a navy panel, a subtle bottom gradient scrim, and slight desaturation/contrast (`saturate-[0.9] contrast-[1.05]` or similar) for cohesion with the dark UI.
- On load error OR known-missing, renders the existing `PlatformSilhouette` fallback (reuse it; do not duplicate).
- `hero` variant also renders a small attribution caption ("© {author} · {license}") when available; `thumb` omits it.
- Decoupled: knows nothing about game state — just an id + name in, image-or-fallback out.

### 5. Surfaces

- **PlatformDossier** (`primitives/PlatformDossier.tsx`): replace its ad-hoc hero slot with `<PlatformImage variant="hero" />`.
- **Hangar** by-platform summary cards (`pages/HangarPage.tsx` / its card component): add `<PlatformImage variant="thumb" />`.
- **Acquisition offer cards** (`components/procurement/AcquisitionPipeline.tsx` aircraft `OfferCard`): add `<PlatformImage variant="thumb" />` so the player sees what they're buying.
- Force-exchange (`ForceExchangeViz`) unchanged (silhouettes stay — clearer for loss tallies).

### 6. Image Credits screen

- New route `/credits` (and/or a modal) — `frontend/src/pages/ImageCredits.tsx` (or a `components/about/ImageCredits.tsx` modal). Reads `attributions.json` and lists: platform name, author, license, "View source" link to the Commons file page.
- Linked from the hamburger menu's Settings section (near How-to-Play) and/or the landing page. Plain, readable list — not heavily themed.
- Satisfies CC-BY: visible credit + license + link to source, in the shipped app.

### 7. Testing

- **Frontend (vitest):**
  - `PlatformImage`: renders an `<img>` with the expected `src` for a given id; on `error` event, falls back to the `PlatformSilhouette` (assert the fallback renders); `thumb` variant omits the caption.
  - Image Credits screen: given a small `attributions.json` (mocked), renders one row per entry with author + license + a source link.
  - Existing 209 tests stay green.
- **Fetcher / content:** the fetcher is a manual dev script (network) — not unit-tested. Optionally a tiny content test asserting every `asset_manifest.yaml` entry has the required fields (`id, hero_url, license, author, source_url`) and that ids exist in `platforms.yaml`.
- No backend runtime changes (manifest + script are content/dev-time only).

## Explicitly out of scope (this phase)

- Game-feel juice animations (Phase 2) and ambient/identity art — faction roundels, screen backdrops, hero art (Phase 3).
- 3-view silhouettes, cockpit art, video, parallax.
- AI-generated aircraft (accuracy risk for real platforms; real photos used instead).
- Per-variant/loadout imagery — one hero image per platform id.

## Risks / notes

- **Licensing is load-bearing for the store.** Only CC-BY/BY-SA/PD images, with author + license + source recorded and surfaced in the Credits screen. Skip any image whose license can't be confirmed — silhouette fallback is fine.
- **Coverage will be partial.** Some adversary platforms / munitions lack good free images; those stay on silhouettes. The fetcher's summary makes gaps explicit; not a blocker.
- **Repo size:** ~2–3MB of committed WebP. Acceptable; keeps the APK self-contained/offline. Keep source JPEGs out of git (only the optimized `hero.webp` is committed).
- **Dark-theme treatment** is a design dial — start with a subtle scrim + mild desaturation; tune after seeing it on device.
- **Capacitor BASE_URL:** images are referenced via `import.meta.env.BASE_URL` so paths resolve correctly under the WebView's `https://localhost` origin and the web origin alike.
