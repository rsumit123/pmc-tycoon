# Capacitor Android Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Chakravyuh React/Vite frontend as an Android app via Capacitor 8, with native Google Sign-In, without changing the web app or backend.

**Architecture:** Capacitor wraps the existing Vite `dist/` in an Android WebView. The web app is unchanged (still deploys to Vercel). The only logic change is adding a native Google Sign-In path (`@codetrix-studio/capacitor-google-auth`) that runs when `Capacitor.isNativePlatform()` is true; the web path keeps using the existing Google Identity Services button. Both feed the same `api.loginGoogle(idToken)`. Backend untouched (the native ID token's audience is the web client ID).

**Tech Stack:** Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor/status-bar`), `@codetrix-studio/capacitor-google-auth`, React 19 + Vite + TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-capacitor-android-design.md`

**Public values used in this plan (not secrets — OAuth client IDs are embedded in the shipped bundle):**
- Web OAuth Client ID: `929006071236-k0rm595b6mi2g67pu6f008qdpnipb5aq.apps.googleusercontent.com`
- Prod backend: `https://pmc-tycoon-api.skdev.one`
- App id / name: `com.skdev.chakravyuh` / `Chakravyuh`

---

## Conventions for this plan

- All work is in `frontend/`. Run from `frontend/`: tests `npm test`, typecheck `npx tsc --noEmit`, build `npm run build`.
- Commit after each task. Commit to `main` (repo owner preference — no branches/worktrees).
- Reference template: `/Users/rsumit123/work/chillbill/apps/web/src/components/GoogleSignInButton.jsx` (native path) and `chillbill/apps/web/capacitor.config.ts`.
- **Environment note:** Tasks 1–6, 8–10 are pure JS/TS/docs and run anywhere. **Task 7** (`npx cap add android`) generates the native project from the `@capacitor/android` package (offline — it copies from `node_modules`, no network). If the execution sandbox cannot run it, mark Task 7 BLOCKED and it becomes a one-command step the repo owner runs locally (they already have Android Studio for their other apps). **Building the APK/AAB itself is always the owner's local task** (needs Android SDK + keystore) and is documented in Task 9, not executed here.

---

## Task 1: Add Capacitor dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install the Capacitor packages**

Run from `frontend/`:
```bash
npm install @capacitor/core@^8 @capacitor/app@^8 @capacitor/status-bar@^8 @codetrix-studio/capacitor-google-auth@^3.4.0-rc.4
npm install -D @capacitor/cli@^8 @capacitor/android@^8
```

- [ ] **Step 2: Verify they're in package.json**

Run: `grep -E '@capacitor|capacitor-google-auth' package.json`
Expected: shows `@capacitor/core`, `@capacitor/app`, `@capacitor/status-bar`, `@codetrix-studio/capacitor-google-auth`, `@capacitor/cli`, `@capacitor/android`.

- [ ] **Step 3: Confirm the web build + tests still pass (deps shouldn't change runtime yet)**

Run: `npm run build` → Expected: succeeds.
Run: `npm test` → Expected: 202 passed (unchanged baseline).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(android): add Capacitor 8 + google-auth deps"
```

---

## Task 2: Capacitor config + production env

**Files:**
- Create: `frontend/capacitor.config.ts`
- Create: `frontend/.env.production`

- [ ] **Step 1: Create `frontend/capacitor.config.ts`**

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.skdev.chakravyuh",
  appName: "Chakravyuh",
  webDir: "dist",
  server: {
    // For local dev against the Vite server, uncomment and set your LAN IP:
    // url: "http://192.168.x.x:5173",
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email"],
      // Web OAuth client ID (NOT the Android client ID) — public value.
      serverClientId: "929006071236-k0rm595b6mi2g67pu6f008qdpnipb5aq.apps.googleusercontent.com",
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
```

- [ ] **Step 2: Create `frontend/.env.production`**

(These are public values; committing them makes both the Vercel build and the local Capacitor build self-contained. Vercel's own env vars still take precedence for the web build.)

```
VITE_API_URL=https://pmc-tycoon-api.skdev.one
VITE_GOOGLE_CLIENT_ID=929006071236-k0rm595b6mi2g67pu6f008qdpnipb5aq.apps.googleusercontent.com
```

- [ ] **Step 3: Verify a production build picks up the prod API URL**

Run: `npm run build` → Expected: succeeds. (Vite loads `.env.production` for `build`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/capacitor.config.ts frontend/.env.production
git commit -m "feat(android): capacitor.config + production env (prod API + client id)"
```

---

## Task 3: NativeGoogleButton component

**Files:**
- Create: `frontend/src/components/auth/NativeGoogleButton.tsx`
- Test: `frontend/src/components/auth/__tests__/NativeGoogleButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/auth/__tests__/NativeGoogleButton.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signIn = vi.fn();
const initialize = vi.fn();
vi.mock("@codetrix-studio/capacitor-google-auth", () => ({
  GoogleAuth: { initialize: (...a: unknown[]) => initialize(...a), signIn: () => signIn() },
}));

import { NativeGoogleButton } from "../NativeGoogleButton";

describe("NativeGoogleButton", () => {
  beforeEach(() => { signIn.mockReset(); initialize.mockReset(); });

  it("calls onCredential with the idToken from GoogleAuth.signIn", async () => {
    signIn.mockResolvedValueOnce({ authentication: { idToken: "tok-123" } });
    const onCredential = vi.fn();
    render(<NativeGoogleButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith("tok-123"));
  });

  it("shows an error and does not call onCredential when sign-in throws", async () => {
    signIn.mockRejectedValueOnce(new Error("cancelled"));
    const onCredential = vi.fn();
    render(<NativeGoogleButton onCredential={onCredential} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument());
    expect(onCredential).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NativeGoogleButton`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/auth/NativeGoogleButton.tsx`:

```typescript
import { useEffect, useState } from "react";

interface Props {
  onCredential: (idToken: string) => void;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Native (Capacitor) Google Sign-In. Mirrors the chillbill app pattern:
// initialize once, then GoogleAuth.signIn() yields an ID token whose audience
// is the web client id — the same /api/auth/google endpoint verifies it.
export function NativeGoogleButton({ onCredential }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    import("@codetrix-studio/capacitor-google-auth").then(({ GoogleAuth }) => {
      GoogleAuth.initialize({ clientId: CLIENT_ID, scopes: ["profile", "email"], grantOfflineAccess: false });
    });
  }, []);

  async function handle() {
    setBusy(true);
    setError(null);
    try {
      const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
      const result = await GoogleAuth.signIn();
      const idToken = (result as { authentication?: { idToken?: string } })?.authentication?.idToken;
      if (!idToken) throw new Error("No ID token from Google");
      onCredential(idToken);
    } catch {
      setError("Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={handle} disabled={busy}
              className="w-full rounded bg-white py-2 font-semibold text-slate-900 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- NativeGoogleButton`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/NativeGoogleButton.tsx frontend/src/components/auth/__tests__/NativeGoogleButton.test.tsx
git commit -m "feat(android): native Google Sign-In button (capacitor-google-auth)"
```

---

## Task 4: Branch Login between native and web sign-in

**Files:**
- Modify: `frontend/src/pages/Login.tsx`
- Test: `frontend/src/pages/__tests__/Login.test.tsx`

- [ ] **Step 1: Add the failing test (native branch renders the native button)**

Append to `frontend/src/pages/__tests__/Login.test.tsx` (keep the existing tests). Add this mock at the TOP of the file (with the other imports) and a new test. The mock makes `Capacitor.isNativePlatform()` controllable:

```typescript
import { vi } from "vitest";
const isNativePlatform = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
// Stub the native plugin so importing NativeGoogleButton never touches native code:
vi.mock("@codetrix-studio/capacitor-google-auth", () => ({
  GoogleAuth: { initialize: vi.fn(), signIn: vi.fn() },
}));
```

Add this test inside the `describe`:

```typescript
  it("renders the native Google button on a native platform", async () => {
    isNativePlatform.mockReturnValue(true);
    const { Login } = await import("../Login");
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    isNativePlatform.mockReturnValue(false);
  });
```

> Note: the existing web-path tests assert `Capacitor.isNativePlatform()` is false (default `isNativePlatform` mock returns false), so they keep rendering the GIS `GoogleSignInButton` and still pass.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- Login`
Expected: FAIL — Login doesn't render a native button yet (no platform branch).

- [ ] **Step 3: Add the platform branch to Login.tsx**

In `frontend/src/pages/Login.tsx`, add imports:

```typescript
import { Capacitor } from "@capacitor/core";
import { NativeGoogleButton } from "../components/auth/NativeGoogleButton";
```

Replace the single `<GoogleSignInButton onCredential={onGoogle} />` line with the branch:

```typescript
        {Capacitor.isNativePlatform()
          ? <NativeGoogleButton onCredential={onGoogle} />
          : <GoogleSignInButton onCredential={onGoogle} />}
```

(Everything else in `Login.tsx` — the `onGoogle` handler, heading, error display — stays as is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Login`
Expected: PASS (existing web tests + the new native test).

Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/pages/__tests__/Login.test.tsx
git commit -m "feat(android): Login renders native Google button on native platforms"
```

---

## Task 5: Capacitor app init (back button + status bar)

**Files:**
- Create: `frontend/src/lib/capacitorInit.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/lib/__tests__/capacitorInit.test.ts`

- [ ] **Step 1: Write the failing test (no-op + no throw on web)**

Create `frontend/src/lib/__tests__/capacitorInit.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
import { initCapacitor } from "../capacitorInit";

describe("initCapacitor", () => {
  it("is a no-op on web and does not throw", () => {
    expect(() => initCapacitor()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capacitorInit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `frontend/src/lib/capacitorInit.ts`**

```typescript
import { Capacitor } from "@capacitor/core";

// Native-only setup: Android hardware back button + status bar styling.
// No-op on web so it's safe to call unconditionally at app start.
export function initCapacitor(): void {
  if (!Capacitor.isNativePlatform()) return;

  import("@capacitor/app").then(({ App }) => {
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  });

  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  });
}
```

- [ ] **Step 4: Call it in `main.tsx`**

In `frontend/src/main.tsx`, add the import and call it next to the existing `loadFromStorage()` call:

```typescript
import { initCapacitor } from "./lib/capacitorInit";
// ... after useAuthStore.getState().loadFromStorage();
initCapacitor();
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- capacitorInit` → Expected: PASS.
Run: `npm test` → Expected: full suite green (existing 202 + the new tests from Tasks 3–5).
Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/capacitorInit.ts frontend/src/main.tsx frontend/src/lib/__tests__/capacitorInit.test.ts
git commit -m "feat(android): native back-button + status-bar init (no-op on web)"
```

---

## Task 6: package.json scripts

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add Capacitor scripts**

In `frontend/package.json` `"scripts"`, add:

```json
    "cap:sync": "vite build && cap sync",
    "cap:android": "cap open android"
```

- [ ] **Step 2: Verify**

Run: `grep -E 'cap:sync|cap:android' package.json`
Expected: both present.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json
git commit -m "chore(android): add cap:sync + cap:android npm scripts"
```

---

## Task 7: Generate the Android native project

**Files:**
- Create: `frontend/android/` (generated by Capacitor CLI)

> **Environment caveat:** this runs the Capacitor CLI, which copies the Android template from the installed `@capacitor/android` package (offline). If the sandbox cannot run it, report **BLOCKED**; it becomes a one-time local command for the repo owner (documented in Task 9). Do NOT hand-author the `android/` tree.

- [ ] **Step 1: Build web assets (cap add android runs a sync that needs `dist/`)**

Run from `frontend/`: `npm run build`
Expected: `dist/` produced.

- [ ] **Step 2: Add the Android platform**

Run from `frontend/`: `npx cap add android`
Expected: creates `frontend/android/` with a Gradle project; prints "create android" / "sync" success. (`@capacitor/app`, `@capacitor/status-bar`, and the google-auth plugin are auto-registered.)

- [ ] **Step 3: Sync**

Run: `npx cap sync android`
Expected: "Sync finished" — copies web assets + plugins into the native project.

- [ ] **Step 4: Confirm the generated `.gitignore` excludes build artifacts**

Run: `cat android/.gitignore`
Expected: includes `/build`, `/app/build`, `.gradle`, `/capacitor-cordova-android-plugins`, `local.properties` (Capacitor generates this). If `local.properties` is not listed, add it (it contains the machine's SDK path).

- [ ] **Step 5: Commit the native project (build artifacts excluded by the generated .gitignore)**

```bash
git add frontend/android frontend/.gitignore
git commit -m "feat(android): generate Capacitor Android project"
```

---

## Task 8: Wire the web-client-id into the Android Google Auth setup

> The `@codetrix-studio/capacitor-google-auth` plugin's Android side reads the **server client id** from an Android string resource `server_client_id`. Confirm/insert it so native sign-in resolves the right OAuth audience.

**Files:**
- Modify (if missing): `frontend/android/app/src/main/res/values/strings.xml`

- [ ] **Step 1: Check whether the resource exists**

Run: `grep -r "server_client_id" frontend/android/app/src/main/res/ || echo MISSING`
Expected: either it's already present (plugin injected it from `capacitor.config.ts` `serverClientId`) or `MISSING`.

- [ ] **Step 2: If MISSING, add it**

Add to `frontend/android/app/src/main/res/values/strings.xml`, inside `<resources>`:

```xml
    <string name="server_client_id">929006071236-k0rm595b6mi2g67pu6f008qdpnipb5aq.apps.googleusercontent.com</string>
```

(If it already exists with the correct value from the config's `serverClientId`, skip — no change needed.)

- [ ] **Step 3: Re-sync so the value is in the native project**

Run from `frontend/`: `npx cap sync android`
Expected: "Sync finished".

- [ ] **Step 4: Commit (only if a file changed)**

```bash
git add frontend/android/app/src/main/res/values/strings.xml
git commit -m "feat(android): set server_client_id for native Google Sign-In"
```

If nothing changed, skip the commit and note "plugin already injected server_client_id".

---

## Task 9: Android build + distribution runbook (docs)

**Files:**
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Append an Android section to `docs/DEPLOYMENT.md`**

Add (match the file's existing heading style):

```markdown
## Android app (Capacitor)

The Android app wraps the same Vite build. Web deploys are unaffected.

### One-time native project (if `frontend/android/` is absent)
From `frontend/`: `npm run build && npx cap add android && npx cap sync android`, then commit `frontend/android/`.

### Build a signed APK (Phase 1 — sideload)
1. Create a release keystore (once):
   `keytool -genkey -v -keystore chakravyuh-release.keystore -alias chakravyuh -keyalg RSA -keysize 2048 -validity 10000`
   (Keep this file + passwords OUT of git.)
2. Get its SHA-1: `keytool -list -v -keystore chakravyuh-release.keystore -alias chakravyuh` → copy the `SHA1:` line.
3. From `frontend/`: `npm run cap:sync` then `npx cap open android` (opens Android Studio). Build → Generate Signed Bundle/APK → APK → select the keystore → release → finish. (Or via Gradle: `cd android && ./gradlew assembleRelease`.)
4. The APK is in `android/app/build/outputs/apk/release/`. Transfer to the device, enable "install from unknown sources", install.

### Google OAuth — Android client (REQUIRED for sign-in)
- Google Cloud Console → Credentials → Create OAuth client ID → **Android**.
- Package name: `com.skdev.chakravyuh`. SHA-1: the **release keystore SHA-1** from above.
- The existing **Web client ID stays** as `serverClientId` + backend audience — do not change it.

### Phase 2 — Play Store closed testing
1. Build an **AAB** (Android Studio → Generate Signed Bundle → Android App Bundle, or `./gradlew bundleRelease`).
2. Play Console → create the app → Testing → **Closed testing** → create a track → upload the AAB → add testers by email/list → share the opt-in link.
3. **Play App Signing SHA-1 (the gotcha):** Play re-signs the app with Google's key. Copy the **App signing key SHA-1** from Play Console → Setup → App integrity / App signing, and add a **second Android OAuth client** (same package `com.skdev.chakravyuh`, this new SHA-1). Without it, sign-in works on the sideloaded APK but silently fails on the Play build.

### Updating the app after code changes
From `frontend/`: `npm run cap:sync`, then rebuild in Android Studio / Gradle and re-upload (bump `versionCode`/`versionName` in `android/app/build.gradle`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs(android): build, keystore, OAuth Android client, sideload + Play closed-testing runbook"
```

---

## Task 10: Status updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Add a status bullet to CLAUDE.md**

In the "Current status" section, add a bullet (match the format of the Plan 23 bullet) summarizing: Capacitor 8 Android packaging; native Google Sign-In via `@codetrix-studio/capacitor-google-auth` behind a `Capacitor.isNativePlatform()` branch in `Login` (web GIS path unchanged, backend unchanged); `capacitor.config.ts` (`com.skdev.chakravyuh`); `.env.production` bakes prod API URL + client id; `@capacitor/app` back button + `@capacitor/status-bar`; `frontend/android/` committed; distribution sideload APK → Play closed testing with the dual SHA-1 (release keystore + Play App Signing) requirement. Note the build itself + Google Cloud Android client + Play upload are owner tasks (see DEPLOYMENT.md). New frontend test count after `npm test`.

Also bump the "last updated" date line to today (2026-06-20) and add the spec + plan file refs:
`docs/superpowers/specs/2026-06-20-capacitor-android-design.md`, `docs/superpowers/plans/2026-06-20-capacitor-android-plan.md`.

- [ ] **Step 2: Add a ROADMAP row**

In `docs/superpowers/plans/ROADMAP.md` Current Status Summary table add:
`| 24 | Capacitor Android Packaging | 🟢 done | 2026-06-20-capacitor-android-plan.md |`
and bump "Last updated" to `2026-06-20 (Plan 24 done)`.

- [ ] **Step 3: Final verification**

Run from `frontend/`: `npm test` → Expected: green (202 + new tests from Tasks 3–5).
Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(android): Plan 24 status (Capacitor Android packaging)"
```

---

## Final review checklist (controller runs after all tasks)

- [ ] Full frontend suite green (`npm test`); note count vs prior 202 baseline.
- [ ] `npx tsc --noEmit` clean.
- [ ] Web build unaffected: `npm run build` succeeds; `Login` still renders the GIS button on web (existing tests prove it).
- [ ] If Task 7 ran: `frontend/android/` committed, build artifacts gitignored, no keystore/secret committed.
- [ ] If Task 7 was BLOCKED in-sandbox: confirm the Task 9 runbook covers the local `cap add android` step so the owner can generate it.

## Spec coverage self-check

- Capacitor Android wrapper, web unchanged → Tasks 1, 2, 7 ✓
- Native Google Sign-In dual path → Tasks 3, 4 (component + branch); backend unchanged (no task needed) ✓
- localStorage tokens (no change) → unchanged authStore, intentionally no task ✓
- `capacitor.config.ts` (appId/name/GoogleAuth) + prod API URL via `.env.production` → Task 2 ✓
- `@capacitor/app` back button + `@capacitor/status-bar`; haptics skipped → Task 5 ✓
- Android `server_client_id` wiring → Task 8 ✓
- Build/keystore/SHA-1, Android OAuth client, sideload + Play closed testing + Play App Signing SHA-1 → Task 9 ✓
- `useGoogleSignIn` unit test → realized as `NativeGoogleButton` test (Task 3) + Login branch test (Task 4) ✓
- 202 existing tests stay green → verified Tasks 1, 4, 5, 10 ✓
- Out of scope (iOS, Play public, push, deep links, Preferences) → not built ✓
