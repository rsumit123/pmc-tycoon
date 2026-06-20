# Auth + Multi-User Release Readiness — Design Spec

**Date:** 2026-06-20
**Status:** Approved (pending user review of this doc)
**Author:** brainstormed with Claude

## Why

Sovereign Shield was built as a solo hobby project with **zero multi-tenancy**. Before opening it to external testers, a pre-release audit surfaced three critical gaps that make a shared deployment unsafe:

1. **No auth / no user isolation** — `Campaign` has no owner column; `GET /api/campaigns` returns *everyone's* campaigns, and every campaign-scoped endpoint takes a raw integer `campaign_id` with no ownership check. Sequential IDs mean any tester can read, advance, and **delete** any other tester's campaign. (Hard blocker.)
2. **Unbounded LLM spend** — the 5 narrative-generation endpoints have no rate limiting and no global cap; each tester's unique campaigns miss the input-hash cache, so spend on the owner's BYOK OpenRouter key is unbounded. (Financial blocker — worse now that signup is open self-service.)
3. **SQLite not concurrency-hardened** — no WAL mode, no `busy_timeout`; concurrent turn-advances from multiple users will throw `database is locked` → 500s.

This spec covers all three as one "Release Readiness" plan. It deliberately matches the auth pattern already used in the owner's other apps (`chillbill`, `charade-chat`) so there's one auth idiom to maintain.

**Out of scope (and why):** email verification and password reset — both require standing up email-sending infra (SMTP/provider). Skipped for v1; a stuck tester is a manual fix. Flagged as future hardening. Also out of scope: the non-critical UX/onboarding polish from the audit (error boundary, keyboard fallback on commit, stale how-to-play guide, glossary) — those are tracked separately and don't block a safe multi-user release.

## Decisions (locked)

- **Auth methods:** Google Sign-In (primary) + email/password (secondary).
- **Signup access:** open self-service — anyone with the URL can register. (Makes the LLM cap mandatory.)
- **Existing prod campaigns:** assigned on migration to the owner account (Google email `thetinkerer018@gmail.com`).
- **Plan scope:** auth + isolation + SQLite WAL + LLM guardrails, shipped together.
- **Session model:** access + refresh token pair (the `chillbill` pattern), app-issued JWTs, bearer in localStorage.

## Reference pattern (from owner's other apps)

Primary reference: **`chillbill`** (`/Users/rsumit123/work/chillbill`), with the Google web-button approach from **`charade-chat`**.

- Frontend renders the raw Google Identity Services button (`window.google.accounts.id`), gets a Google **ID token**, POSTs it in a JSON body to the backend. (No `@react-oauth/google`, no Capacitor native path — defense-game is web-only.)
- Backend verifies the ID token with `google-auth` `verify_oauth2_token` (audience = `GOOGLE_CLIENT_ID`), finds-or-creates the user, issues an app **access + refresh** JWT pair (`type` claim distinguishes them).
- Email/password uses **argon2 via passlib**, returning the same `{user, tokens}` shape.
- Protected routes depend on an `HTTPBearer` `get_current_user` that validates the access token and loads the user.

**Adapted to defense-game's own conventions** (local consistency wins over copying verbatim):
- Auth state lives in a **Zustand `authStore`** (defense-game uses Zustand everywhere), mirroring chillbill's `AuthContext` shape.
- The existing **axios `http` instance** gets request/response interceptors (attach bearer; 401 → refresh → retry once) instead of a hand-rolled fetch wrapper.
- Config is read through the existing pydantic `Settings` class, not raw `os.getenv`.

## Architecture

### 1. Data model

New `User` table (`backend/app/models/user.py`):

| column | type | notes |
|---|---|---|
| `id` | int PK | matches defense-game's int-PK convention |
| `email` | str, unique, indexed | |
| `google_id` | str, unique, nullable | Google `sub` — link by this, fall back to email |
| `password_hash` | str, nullable | argon2; null = OAuth-only account |
| `auth_provider` | str | `google` \| `password` (first provider seen) |
| `display_name` | str | from Google profile or email local-part |
| `avatar_url` | str, nullable | from Google profile |
| `created_at` | datetime | `datetime.now(UTC)` |

`Campaign` gains `user_id: Mapped[int]` FK → `users.id`, **indexed**, non-nullable after migration.

### 2. Backend auth module (`backend/app/auth/`)

- `security.py` — `create_access_token` / `create_refresh_token` (PyJWT, HS256, `type` claim), `decode_token`, `hash_password` / `verify_password` (passlib argon2), `verify_google_id_token` (google-auth).
- `service.py` — `get_or_create_google_user`, `signup_user`, `authenticate_user`, `get_user_by_id`.
- `deps.py` (or extend `app/api/deps.py`) — `get_current_user` (`HTTPBearer`, `auto_error=False`, rejects non-`access` tokens), and `require_owned_campaign`.
- `app/api/auth.py` router:
  - `POST /api/auth/google` — body `{ id_token }` → verify, find-or-create, return `{ user, access_token, refresh_token, token_type }`.
  - `POST /api/auth/signup` — body `{ email, password, display_name? }` → create argon2 user → tokens. 409 if email exists.
  - `POST /api/auth/login` — body `{ email, password }` → verify → tokens. 401 on bad creds; if `password_hash` is null, message "use Google Sign-In".
  - `POST /api/auth/refresh` — body `{ refresh_token }` → validate `type=="refresh"` → new access (+ rotated refresh). 401 if invalid/expired.
  - `GET /api/auth/me` — current user.

Token lifetimes: access ~120 min, refresh ~30 days (configurable).

### 3. Endpoint protection (the bulk of the work)

- `require_owned_campaign(campaign_id, user=Depends(get_current_user), db=Depends(get_db)) -> Campaign` — loads the campaign, raises **404** (not 403, so IDs don't leak existence) if it doesn't exist or `campaign.user_id != user.id`. Returns the campaign so handlers can reuse it.
- Apply across **all campaign-scoped routers** (~25): campaigns, budget, rd, acquisitions, intel, adversary, vignettes, narratives, bases, summary, base_upgrade, campaign_export, squadrons, armory, hangar, performance, missile_stocks, notifications, adversary_bases, offensive_ops, diplomacy, posture.
- `POST /api/campaigns` stamps `user_id = current_user.id`. `GET /api/campaigns` filters to `current_user.id`.
- **Stay public** (no auth): `/api/content/*` (static catalogs), `GET /`, `GET /health`, and the `/api/auth/*` endpoints themselves.

Mechanism: prefer adding `dependencies=[Depends(...)]` or a `Depends(require_owned_campaign)` parameter per route. Routers whose prefix already carries `{campaign_id}` can use a router-level dependency.

### 4. Existing-data migration

No Alembic in this repo (schema is `Base.metadata.create_all`). Migration is an **idempotent startup helper** (`backend/app/auth/bootstrap.py`, called from `main.py` after `create_all`):

1. Ensure the owner `User` exists (Google `thetinkerer018@gmail.com`, `auth_provider="google"`, no password). Created with a placeholder `google_id` that gets reconciled on the owner's first real Google login (link-by-email fallback handles this).
2. If any `Campaign.user_id` is NULL, backfill all to the owner's id.
3. Guarded so it's a no-op once owners are set.

`user_id` is added as nullable at the ORM level to let `create_all` add the column on the existing SQLite file, then backfilled; new campaigns always set it. (SQLite can't easily add a NOT NULL column to an existing table without a default, so enforcement is at the application layer.)

### 5. SQLite hardening

In `backend/app/db/session.py`, add a SQLAlchemy `connect` event (only when `database_url` starts with `sqlite`) that runs:
```
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```
Eliminates `database is locked` 500s under concurrent writers.

### 6. LLM cost guardrails

In the narrative generation path (`app/llm/service.py` / `app/api/narratives.py`):

- **Per-user daily cap** — max N narrative generations per user per UTC day (default N=40; configurable). Counted from `CampaignNarrative` rows joined to the user's campaigns, or a lightweight counter table. Over-cap → **429** with a friendly "daily narrative limit reached" message.
- **Global daily token ceiling** — before each OpenRouter call, sum `LLMCache` tokens logged for the current UTC day; if over the configured ceiling (default e.g. 2M tokens/day), short-circuit → **429** "narrative generation paused for today." The existing input-hash cache continues to kill duplicate spend.
- Both limits are config-driven so they can be tuned without a redeploy of logic.

### 7. Frontend

- `authStore` (Zustand, `frontend/src/store/authStore.ts`) — `{ user, accessToken, refreshToken, isAuthenticated, setAuth, logout, refresh }`, persisted to localStorage (keys e.g. `ss_user`, `ss_tokens`).
- `http` axios instance gets:
  - **request interceptor** — attach `Authorization: Bearer <accessToken>` when present.
  - **response interceptor** — on 401, attempt `POST /api/auth/refresh` once; on success retry the original request; on failure call `logout()` and redirect to `/login`.
- New **`Login` page** (`frontend/src/pages/Login.tsx`) — Google GIS button (init with `VITE_GOOGLE_CLIENT_ID`) + email/password form with a sign-in/sign-up toggle. Friendly error states.
- **`ProtectedRoute`** wrapper in `App.tsx` — unauthenticated users redirect to `/login`; authenticated users hitting `/login` redirect to `/`.
- Landing/campaign-list (`pages/Landing.tsx`) now shows only the caller's campaigns (backend already filters; frontend just renders) and shows the signed-in user + **logout** in the header menu (`CampaignMapView`).
- New api methods: `loginGoogle(idToken)`, `signup(...)`, `login(...)`, `refresh(...)`, `getMe()`.

### 8. Config / env

Backend `Settings` (pydantic) gains: `google_client_id`, `jwt_secret_key`, `jwt_algorithm` (default `HS256`), `access_token_expire_minutes` (default 120), `refresh_token_expire_minutes` (default 43200), `llm_daily_user_cap` (default 40), `llm_daily_token_ceiling` (default 2_000_000). Frontend `.env`: `VITE_GOOGLE_CLIENT_ID`. The **same** `GOOGLE_CLIENT_ID` is the frontend client id and the backend verification audience — they must match.

New backend deps (`requirements.txt`): `pyjwt`, `passlib[argon2]` (pulls `argon2-cffi`), `google-auth`.

### 9. CORS tightening (folded in, low-cost)

`main.py` CORS: drop `allow_methods=["*"]` to the explicit set used (`GET, POST, DELETE, OPTIONS`); keep the explicit origin allow-list. Reconsider the broad `*.vercel.app` origin. `allow_credentials` can stay (bearer tokens don't need it, but it's harmless with an explicit origin list).

## Manual prerequisite (owner action, not automatable)

Create a **Google OAuth 2.0 Client ID** in Google Cloud Console (APIs & Services → Credentials → OAuth client ID → "Web application"). Add **Authorized JavaScript origins**: `http://localhost:5173`, `http://localhost:5174`, and the production frontend URL (current `https://pmc-tycoon.skdev.one`, or the new branded URL when the rename lands). No redirect URI needed (GIS button flow). Put the resulting client id in both `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env` (`VITE_GOOGLE_CLIENT_ID`). The implementation plan will include exact click-path steps.

## Testing

- **Backend (pytest, in-memory SQLite + StaticPool fixture):**
  - security: token create/decode round-trip, `type` claim enforcement, expiry rejection, argon2 hash/verify, Google verify mocked (monkeypatch `verify_oauth2_token`).
  - auth endpoints: signup/login/refresh/me happy + error paths (409 dup, 401 bad creds, 401 bad refresh, "use Google" on null hash).
  - **isolation:** user A cannot GET/advance/delete user B's campaign (404); `GET /api/campaigns` returns only the caller's; unauthenticated → 401.
  - migration helper: idempotent owner creation + null backfill.
  - LLM guardrails: per-user cap → 429; global ceiling → 429; cache still hits.
  - Extend replay-determinism fingerprint only if user scoping changes persisted state (it shouldn't — `user_id` is owner metadata, not game state).
- **Frontend (vitest):** authStore set/logout/persist; interceptor attaches bearer; 401→refresh→retry path (mocked); Login page renders both methods; ProtectedRoute redirects. Preserve the existing test baseline (no regressions).
- **No network in CI:** Google verification and OpenRouter are always mocked/monkeypatched.

## Risks / notes

- **JWT in localStorage is XSS-stealable.** Accepted for a hobby game (matches owner's other apps); HttpOnly cookies are the future-hardening path.
- **App-layer (not DB-level) `user_id` enforcement** because SQLite + `create_all` can't cleanly add a NOT NULL column to the existing table. The backfill + always-set-on-create keeps it consistent; a future Alembic migration could add the NOT NULL constraint.
- **Touching ~25 routers** is the largest surface; the shared `require_owned_campaign` dependency keeps each edit small and uniform. This is where to be most careful (an unprotected router = a hole).
- Open self-service + a public URL means the LLM caps and CORS tightening are load-bearing, not optional.
