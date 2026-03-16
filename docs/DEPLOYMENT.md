# PMC Tycoon - Deployment Guide

## Architecture

```
Browser → pmc-tycoon.skdev.one (Vercel) → pmc-tycoon-api.skdev.one (GCP VM)
                                            ↓
                                       nginx (SSL) → localhost:8010 → Docker
```

---

## Frontend (Vercel)

**URL:** https://pmc-tycoon.skdev.one
**Vercel project:** `pmc-tycoon` (project ID: `prj_Qg9mh7qqjwiyndYVBAu2oI8S0Hah`)
**DNS:** CNAME `pmc-tycoon` → `cname.vercel-dns.com` (Namecheap)

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
npx vercel domains add pmc-tycoon.skdev.one

# Deploy
npx vercel --prod --yes
```

### Troubleshooting

- **404 DEPLOYMENT_NOT_FOUND**: The domain alias was removed. Re-add with `npx vercel domains add pmc-tycoon.skdev.one`.
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
- **Location:** `~/pmc-tycoon/backend/data/pmc_tycoon.db` (host-mounted volume)
- **Init:** `init_data.py` runs automatically on container start (seeds aircraft, weapons, ships, missions)
- **Schema changes:** SQLAlchemy `create_all` adds new columns/tables on restart. Existing data is preserved.
- **Full reset:** Delete `backend/data/pmc_tycoon.db` on the VM, then restart the container.

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
