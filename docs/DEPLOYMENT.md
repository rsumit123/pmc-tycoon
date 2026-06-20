# Chakravyuh - Deployment Guide

> The game is **Chakravyuh** (formerly Sovereign Shield). The public frontend domain is moving to
> `chakravyuh.skdev.one`. The Vercel **project name** (`pmc-tycoon`), the backend host
> (`pmc-tycoon-api.skdev.one`), and the GCP container/paths are deliberately kept (Decision D18) —
> only the public frontend domain changes.

## Architecture

```
Browser → chakravyuh.skdev.one (Vercel) → pmc-tycoon-api.skdev.one (GCP VM)
                                            ↓
                                       nginx (SSL) → localhost:8010 → Docker
```

---

## Auth setup (Google OAuth)

1. Google Cloud Console -> APIs & Services -> Credentials -> Create Credentials -> OAuth client ID.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** (no redirect URI needed for the GIS button flow):
   - `http://localhost:5173`
   - `http://localhost:5174`
   - the production frontend URL: `https://chakravyuh.skdev.one` (and `https://pmc-tycoon.skdev.one` until the old domain is retired)
4. Copy the **Client ID**. Put it in BOTH:
   - `backend/.env` -> `GOOGLE_CLIENT_ID=<client-id>`
   - `frontend/.env` (and the Vercel project env) -> `VITE_GOOGLE_CLIENT_ID=<client-id>`
5. Generate a strong `JWT_SECRET_KEY` (e.g. `openssl rand -hex 32`) and set it in `backend/.env`. If this value changes, all existing sign-in sessions are invalidated.
6. The same Client ID is used as both the frontend button's client id and the backend verification audience -- they MUST match.

### New backend env vars
- `GOOGLE_CLIENT_ID` -- required for Google sign-in.
- `JWT_SECRET_KEY` -- required; sign-in tokens are invalid if this changes.
- Optional: `ACCESS_TOKEN_EXPIRE_MINUTES` (default 120), `REFRESH_TOKEN_EXPIRE_MINUTES` (default 43200),
  `LLM_DAILY_USER_CAP` (default 40), `LLM_DAILY_TOKEN_CEILING` (default 2000000), `OWNER_EMAIL` (default thetinkerer018@gmail.com).

### First-deploy migration note
On first startup after this release, the backend auto-runs an idempotent migration: it adds the
`campaigns.user_id` column to the existing SQLite DB (create_all cannot alter existing tables),
creates the owner user (`OWNER_EMAIL`), and assigns all pre-auth campaigns to that owner. No manual
step required; it is a no-op on subsequent boots. The owner's first Google sign-in (with the matching
email) links the Google identity to that pre-created owner account by email.

---

## Frontend (Vercel)

**URL:** https://chakravyuh.skdev.one (legacy `https://pmc-tycoon.skdev.one` still attached during cutover)
**Vercel project:** `pmc-tycoon` (project ID: `prj_Qg9mh7qqjwiyndYVBAu2oI8S0Hah`) — project name unchanged (D18); add the new domain to this same project
**DNS:** add CNAME `chakravyuh` → `cname.vercel-dns.com` (Namecheap), then attach `chakravyuh.skdev.one` as a domain in the Vercel project. Keep the `pmc-tycoon` CNAME until you retire the old domain.

> **CRITICAL:** This is a dedicated Vercel project. Do NOT deploy to the `frontend` project (that's rasoi).
>
> **CRITICAL:** You MUST run `npx vercel` from the `frontend/` directory, NOT from the project root. Deploying from the root will deploy an empty directory and cause a 404.

### Deploy

**Recommended: Use the deploy script (from any directory):**
```bash
./deploy.sh frontend    # Deploy frontend only
./deploy.sh backend     # Deploy backend only
./deploy.sh both        # Deploy both
```

**Manual (must be in frontend/ directory):**
```bash
cd frontend
npx vercel --prod --yes
```

### Environment Variables

Set on Vercel (already configured):
```
VITE_API_URL=https://pmc-tycoon-api.skdev.one
```

### First-time setup

```bash
cd frontend

# Create project and link
npx vercel project add pmc-tycoon
npx vercel link --project pmc-tycoon --yes

# Set API URL
echo "https://pmc-tycoon-api.skdev.one" | npx vercel env add VITE_API_URL production --yes

# Add custom domain
npx vercel domains add chakravyuh.skdev.one

# Deploy
npx vercel --prod --yes
```

### Troubleshooting

- **404 DEPLOYMENT_NOT_FOUND**: The domain alias was removed. Re-add with `npx vercel domains add chakravyuh.skdev.one`.
- **Wrong project linked**: Check `frontend/.vercel/project.json` — `projectName` should be `pmc-tycoon`.
- **Stale env vars**: Env vars are baked in at build time. Redeploy after changing them.

---

## Backend (GCP VM + Docker)

**URL:** https://pmc-tycoon-api.skdev.one
**VM:** GCP Compute Engine instance `socialflow`
**DNS:** A record `pmc-tycoon-api` → `34.23.158.39` (Namecheap)
**Port:** 8010 (proxied via nginx + Let's Encrypt SSL)

### SSH into VM

```bash
gcloud compute ssh socialflow --project=polar-pillar-450607-b7 --zone=us-east1-d
```

### Deploy / Redeploy

```bash
# 1. Push code to GitHub (from local machine)
git push origin main

# 2. SSH into VM
gcloud compute ssh socialflow --project=polar-pillar-450607-b7 --zone=us-east1-d

# 3. Pull and rebuild
cd ~/pmc-tycoon
git pull origin main
docker build -t defense-game-backend ./backend

# 4. Restart container
docker rm -f defense-game-backend
docker run -d \
  --name defense-game-backend \
  -p 8010:8010 \
  -v ~/pmc-tycoon/backend/data:/app/data \
  defense-game-backend

# 5. Verify
curl http://localhost:8010/docs
docker logs defense-game-backend --tail 20
```

### One-liner deploy (from local machine)

```bash
gcloud compute ssh socialflow \
  --project=polar-pillar-450607-b7 \
  --zone=us-east1-d \
  --command="cd /home/rsumit123/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker rm -f defense-game-backend; docker run -d --name defense-game-backend -p 8010:8010 -v /home/rsumit123/pmc-tycoon/backend/data:/app/data defense-game-backend"
```

### Database

- **Engine:** SQLite
- **Location:** `~/pmc-tycoon/backend/data/sovereign_shield.db` (host-mounted volume)
- **Init:** `Base.metadata.create_all` creates missing tables on container start; content is loaded from YAML files in `backend/content/` at request time.
- **Schema changes:** SQLAlchemy `create_all` adds new columns/tables on restart. Existing data is preserved.
- **Full reset:** Delete `backend/data/sovereign_shield.db` on the VM, then restart the container.

### First-time VM setup

```bash
# Clone repo
cd ~
git clone https://github.com/rsumit123/pmc-tycoon.git
cd pmc-tycoon

# Create data directory
mkdir -p backend/data

# Build and start
docker build -t defense-game-backend ./backend
docker run -d \
  --name defense-game-backend \
  -p 8010:8010 \
  -v ~/pmc-tycoon/backend/data:/app/data \
  defense-game-backend

# Nginx reverse proxy
sudo tee /etc/nginx/sites-available/pmc-tycoon-api.skdev.one > /dev/null << 'NGINX'
server {
    listen 80;
    server_name pmc-tycoon-api.skdev.one;
    location / {
        proxy_pass http://localhost:8010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/pmc-tycoon-api.skdev.one /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL via Let's Encrypt
sudo certbot --nginx -d pmc-tycoon-api.skdev.one --non-interactive --agree-tos --redirect
```

---

## DNS (Namecheap — skdev.one)

| Record | Type  | Value                  |
|--------|-------|------------------------|
| `pmc-tycoon` | CNAME | `cname.vercel-dns.com` |
| `pmc-tycoon-api` | A | `34.23.158.39` |

---

## Other services on the same VM (do not touch)

| Port | Container | Service |
|------|-----------|---------|
| 8000 | recursing_booth | socialflow |
| 8005 | charade-backend | charade |
| 8010 | **defense-game-backend** | **PMC Tycoon** |
| 8080 | socialflow-django-nginx | socialflow nginx |

---

## Android app (Capacitor)

The Android app wraps the same Vite build. Web deploys are unaffected.

### One-time native project (if `frontend/android/` is absent)
From `frontend/`: `npm run build && npx cap add android && npx cap sync android`, then commit `frontend/android/`. (Already generated and committed as of Plan 24.)

### Build a signed APK (Phase 1 — sideload)
1. Create a release keystore (once), kept OUT of git:
   `keytool -genkey -v -keystore chakravyuh-release.keystore -alias chakravyuh -keyalg RSA -keysize 2048 -validity 10000`
2. Get its SHA-1: `keytool -list -v -keystore chakravyuh-release.keystore -alias chakravyuh` → copy the `SHA1:` line.
3. From `frontend/`: `npm run cap:sync`, then `npx cap open android` (opens Android Studio). Build > Generate Signed Bundle/APK > APK > select keystore > release > finish. (Or via Gradle: `cd android && ./gradlew assembleRelease`.)
4. APK is in `android/app/build/outputs/apk/release/`. Transfer to device, enable "install from unknown sources", install.

### Google OAuth — Android client (REQUIRED for sign-in)
- Google Cloud Console > Credentials > Create OAuth client ID > **Android**.
- Package name: `com.skdev.chakravyuh`. SHA-1: the **release keystore SHA-1** from above.
- The existing **Web client ID stays** as `serverClientId` + backend audience — do not change it.

### Phase 2 — Play Store closed testing
1. Build an **AAB** (Android Studio > Generate Signed Bundle > Android App Bundle, or `./gradlew bundleRelease`).
2. Play Console > create the app > Testing > **Closed testing** > create a track > upload the AAB > add testers by email > share the opt-in link.
3. **Play App Signing SHA-1 (the gotcha):** Play re-signs the app with Google's key. Copy the **App signing key SHA-1** from Play Console > Setup > App integrity / App signing, and add a **second Android OAuth client** (same package `com.skdev.chakravyuh`, this new SHA-1). Without it, sign-in works on the sideloaded APK but silently fails on the Play build.

### Updating the app after code changes
From `frontend/`: `npm run cap:sync`, then rebuild in Android Studio / Gradle and re-upload (bump `versionCode`/`versionName` in `android/app/build.gradle`).
