# Capacitor Android Packaging — Design Spec

**Date:** 2026-06-20
**Status:** Approved (pending user review of this doc)
**Author:** brainstormed with Claude

## Why

Chakravyuh is a React + Vite SPA. The owner's other apps (`chillbill`, `charade-chat`) ship as Capacitor Android apps from the same kind of codebase. Packaging Chakravyuh the same way gives a native Android app (installable, home-screen icon, full-screen) for testers, reusing a proven template, without forking the web app — the web build keeps deploying to Vercel unchanged.

## Decisions (locked)

- **Platforms:** Android only. (iOS deferred — needs Mac + Apple Developer account + separate OAuth client.)
- **Token storage:** keep `localStorage` (works in the WebView; matches the web app + the other apps; zero change to `authStore`).
- **Distribution: two-phase.**
  - **Phase 1 — sideload** a release APK to the owner's device to confirm everything works.
  - **Phase 2 — Play Store closed testing** (owner already has a Play Console account): upload an AAB to a closed track, invite testers.
- **App identity:** `appId: com.skdev.chakravyuh`, `appName: Chakravyuh` (matches the `com.skdev.<name>` convention of the other apps).
- **Template:** copy `chillbill` (Capacitor 8, `@codetrix-studio/capacitor-google-auth`, the `GoogleAuth` plugin config block).

## Reference pattern (owner's other apps)

`chillbill/apps/web/capacitor.config.ts` and `charade-chat/frontend/capacitor.config.ts`: Capacitor 8, `webDir: dist`, Android-only, `appId: com.skdev.*`. chillbill carries the fuller `GoogleAuth` plugin config (`serverClientId`, `scopes: ['profile','email']`) and the native sign-in path — that is the template.

## Architecture

The web app is unchanged. Capacitor wraps the existing Vite `dist/` into an Android WebView. All new artifacts live under `frontend/`.

### 1. Native Google Sign-In (the only real logic change)

Today `Login.tsx` uses **only** the web Google Identity Services button (`window.google.accounts.id`), which does not work inside a Capacitor WebView. Add a platform-branching sign-in:

- New dep: `@codetrix-studio/capacitor-google-auth`.
- New hook `frontend/src/components/auth/useGoogleSignIn.ts` exposing `signIn(): Promise<string /*idToken*/>`:
  - **Native** (`Capacitor.isNativePlatform()` true): `GoogleAuth.signIn()` → `result.authentication.idToken`. (`GoogleAuth.initialize({ clientId: <WEB_CLIENT_ID>, scopes: ['profile','email'] })` is called once at app start.)
  - **Web**: the existing GIS button flow (unchanged).
- `Login.tsx` (currently Google-only) calls the hook; on native it renders a plain "Sign in with Google" button that triggers `GoogleAuth.signIn()`; on web it renders the existing `GoogleSignInButton` (GIS). Both end at `api.loginGoogle(idToken)`.

**Backend: zero changes.** The native ID token's audience is the **web client ID** (because it is passed as `serverClientId`), so the existing `verify_oauth2_token(token, request, audience=settings.google_client_id)` validates both web and native tokens. This is exactly how chillbill's backend works.

### 2. Capacitor config + build

- `frontend/capacitor.config.ts`:
  ```ts
  appId: 'com.skdev.chakravyuh', appName: 'Chakravyuh', webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { GoogleAuth: { scopes: ['profile','email'], serverClientId: '<web-client-id>', forceCodeForRefreshToken: false } }
  ```
- **API base URL:** the native bundle cannot use `localhost`. The production Android build is built with `VITE_API_URL=https://pmc-tycoon-api.skdev.one`. Add `frontend/.env.production` (committed; the URL is public) so `vite build` bakes the prod API URL into both the Vercel web build and the Capacitor build automatically — no manual flag.
- **package.json scripts (frontend):** `cap:sync` (`vite build && cap sync`), `cap:android` (`cap open android`), plus a documented release-build path (`cap sync` → build signed APK/AAB via Android Studio or Gradle).
- **Plugins:** `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (core); `@capacitor/app` (Android hardware **back button** → router back / exit on root); `@capacitor/status-bar` (status-bar style + safe-area). **Skip** `@capacitor/haptics` — the app already uses `navigator.vibrate`, which works in the WebView (YAGNI).

### 3. Android project

`npx cap add android` generates `frontend/android/` (committed). The `GoogleAuth` Android dependency + the web client id wiring follow the plugin's standard Android setup (string resource / manifest meta-data as the plugin docs require). App icon + splash: a basic generated icon for now (no custom-art polish in scope).

### 4. Google Cloud setup (owner task, documented in the plan)

Google Sign-In keys off the signing cert's SHA-1, and **Play App Signing re-signs the app**, so two SHA-1s are needed across the two phases:

- **Phase 1 (sideload):** create an **Android OAuth client** — package `com.skdev.chakravyuh` + the **release keystore's SHA-1** (`keytool -list -v -keystore <release.keystore>`).
- **Phase 2 (closed testing):** after the first AAB upload, copy the **App signing key SHA-1** from Play Console (Setup → App integrity / App signing) and register it too (a second Android OAuth client, same package, different SHA-1). Google allows multiple — sideload and Play builds then both authenticate.
- The existing **Web Client ID is unchanged** and remains the `serverClientId` + backend verification audience.

Skipping the Phase-2 SHA-1 is the classic "login works on sideload but silently fails on the Play build" trap — called out explicitly in the plan.

### 5. On-device verification (manual checklist — not unit-testable)

The WebView can differ from a desktop browser. The plan ships a checklist:
- MapLibre map renders + OSM raster tiles load over the network.
- Pointer gestures: long-press dossier, swipe-stack, hold-to-commit.
- Android hardware **back button** behaves (navigates back / exits at root, doesn't kill the WebView unexpectedly).
- Status bar + safe-area insets look right (notch/gesture-nav).
- **Google Sign-In round-trip** on a real device (the core acceptance test).
- Token persists across app restart (localStorage in WebView).

## Testing

- **New unit test** for `useGoogleSignIn`: mock `Capacitor.isNativePlatform()` + the `GoogleAuth` plugin; assert the native branch calls `GoogleAuth.signIn()` and returns its `idToken`, and that the result flows to `api.loginGoogle`. Mock the plugin module so no native code is needed under vitest.
- **Existing 202 frontend tests must stay green** — the web sign-in path is unchanged; `Login.tsx` keeps rendering the GIS button on web.
- `frontend/android/` is generated native code — covered by the manual checklist, not unit tests.
- No backend test changes (backend untouched).

## Explicitly out of scope (YAGNI)

iOS; Play Store public (production) track; push notifications; deep links / app links; Capacitor Preferences (localStorage stays); custom splash/icon artwork beyond a basic icon; offline/PWA caching; live-reload dev server config (documented as a commented option only).

## Risks / notes

- **WebView gesture/WebGL parity** is the main unknown; the manual checklist is the mitigation. MapLibre + the Pointer-event primitives are standard and expected to work on modern Android System WebView, but must be verified on a device.
- **`frontend/android/` is committed** (like the other apps) so the native project is reproducible; it adds generated files to the repo. Acceptable and consistent with `chillbill`.
- **Keystore handling:** the release keystore + its password are secrets the owner holds outside the repo (never committed). The plan documents generating it and where the SHA-1 comes from, but does not store it.
- **Web app is unaffected** — Vercel keeps building from the same `frontend/`; Capacitor artifacts (`android/`, `capacitor.config.ts`) are ignored by the web deploy.
