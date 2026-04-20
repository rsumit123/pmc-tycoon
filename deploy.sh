#!/bin/bash
# Sovereign Shield — Backend deploy script
#
# Frontend auto-deploys via Vercel's GitHub integration on push to main
# (project: pmc-tycoon, rootDirectory: frontend). Do not re-add CLI-based
# frontend deploys here — they bypass the edge-cache invalidation that
# git-driven deploys handle cleanly.
#
# This script only ships the backend container to the GCP VM.
#
# Prerequisite on the VM: /home/rsumit123/pmc-tycoon/.env must contain
#   OPENROUTER_API_KEY=sk-or-...
# Docker reads it via --env-file. If missing, LLM narratives fall back
# to placeholder text.

set -e

case "${1:-}" in
    frontend|fe|f)
        echo "Frontend now auto-deploys via Vercel GitHub integration — just 'git push' to main."
        exit 0
        ;;
    both|all)
        echo "Frontend now auto-deploys on git push. Running backend only."
        ;;
    backend|be|b|"")
        ;;
    *)
        echo "Usage: ./deploy.sh [backend]  (frontend auto-deploys on git push)"
        exit 1
        ;;
esac

echo "═══ Deploying Backend to GCP ═══"
gcloud compute ssh socialflow \
    --project=polar-pillar-450607-b7 \
    --zone=us-east1-d \
    --command="cd /home/rsumit123/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker rm -f defense-game-backend 2>/dev/null; docker run -d --name defense-game-backend -p 8010:8010 -v /home/rsumit123/pmc-tycoon/backend/data:/app/data --env-file .env defense-game-backend"
echo "✓ Backend deployed"
echo "═══ Deploy complete ═══"
