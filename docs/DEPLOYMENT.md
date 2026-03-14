# PMC Tycoon - Deployment Guide

## Frontend (Vercel)

**URL:** https://pmc-tycoon.skdev.one
**DNS:** CNAME `pmc-tycoon` → `cname.vercel-dns.com` (Namecheap)

### Deploy
```bash
cd frontend
npx vercel --prod
```

### Environment Variables (set on Vercel dashboard or CLI)
```
VITE_API_URL=https://pmc-tycoon-api.skdev.one
```

### First-time setup
```bash
cd frontend
npx vercel --yes --prod
npx vercel env add VITE_API_URL production  # enter: https://pmc-tycoon-api.skdev.one
npx vercel domains add pmc-tycoon.skdev.one
npx vercel --prod  # redeploy with env var baked in
```

---

## Backend (GCP VM via Docker)

**URL:** https://pmc-tycoon-api.skdev.one
**VM:** `gcloud compute ssh socialflow --project=polar-pillar-450607-b7 --zone=us-east1-d`
**Alias:** `ssh-social`
**Port:** 8010 (internal), proxied via nginx + Let's Encrypt SSL
**DNS:** A record `pmc-tycoon-api` → `34.23.158.39` (Namecheap)

### Deploy / Redeploy
```bash
# 1. Push code to GitHub
git push origin main

# 2. SSH into VM
ssh-social

# 3. Pull latest code (or clone first time)
cd ~/pmc-tycoon
git pull origin main

# 4. Rebuild and restart container
cd backend
docker compose down
docker compose up -d --build

# 5. Verify
curl http://localhost:8010/health
```

### First-time VM setup
```bash
# Clone repo
cd ~
git clone https://github.com/rsumit123/pmc-tycoon.git
cd pmc-tycoon/backend

# Build and start
docker compose up -d --build

# Nginx reverse proxy
sudo tee /etc/nginx/sites-available/pmc-tycoon-api.skdev.one > /dev/null << 'EOF'
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
EOF

sudo ln -sf /etc/nginx/sites-available/pmc-tycoon-api.skdev.one /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL via Let's Encrypt
sudo certbot --nginx -d pmc-tycoon-api.skdev.one --non-interactive --agree-tos --redirect
```

### Ports in use on VM (avoid conflicts)
| Port | Service |
|------|---------|
| 8000 | recursing_booth (socialflow) |
| 8005 | charade-backend |
| 8010 | **pmc-tycoon-backend** |
| 8080 | socialflow-django-nginx |

### Database
- SQLite stored in Docker volume `pmc-data` at `/app/data/pmc_tycoon.db`
- To reset: `docker compose down -v && docker compose up -d --build`
