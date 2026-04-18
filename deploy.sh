#!/bin/bash
# Sovereign Shield — One-command deploy script
# Usage: ./deploy.sh [frontend|backend|both]
#
# Required env vars on the deployment VM (GCP socialflow):
#   OPENROUTER_API_KEY  — OpenRouter API key for LLM narratives (AARs, intel briefs, recaps).
#                         If empty, all narrative features fall back to placeholder text.
#                         Set via: export OPENROUTER_API_KEY="sk-or-..." in ~/.bashrc on the VM.

set -e

TARGET=${1:-both}
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

deploy_frontend() {
    echo "═══ Deploying Frontend to Vercel ═══"
    cd "$REPO_ROOT/frontend"
    npx vercel --prod --yes
    echo "✓ Frontend deployed"
}

deploy_backend() {
    echo "═══ Deploying Backend to GCP ═══"
    gcloud compute ssh socialflow \
        --project=polar-pillar-450607-b7 \
        --zone=us-east1-d \
        --command="cd /home/rsumit123/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker rm -f defense-game-backend 2>/dev/null; docker run -d --name defense-game-backend -p 8010:8010 -v /home/rsumit123/pmc-tycoon/backend/data:/app/data -e OPENROUTER_API_KEY=\"\$OPENROUTER_API_KEY\" defense-game-backend"
    echo "✓ Backend deployed"
}

case "$TARGET" in
    frontend|fe|f) deploy_frontend ;;
    backend|be|b) deploy_backend ;;
    both|all) deploy_frontend; deploy_backend ;;
    *) echo "Usage: ./deploy.sh [frontend|backend|both]"; exit 1 ;;
esac

echo "═══ Deploy complete ═══"
