#!/bin/bash
# PMC Tycoon — One-command deploy script
# Usage: ./deploy.sh [frontend|backend|both]

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
        --command="cd /home/rsumit123/pmc-tycoon && git pull && docker build -t defense-game-backend ./backend && docker stop defense-game-backend && docker rm defense-game-backend && docker run -d --name defense-game-backend -p 8010:8010 defense-game-backend"
    echo "✓ Backend deployed"
}

case "$TARGET" in
    frontend|fe|f)
        deploy_frontend
        ;;
    backend|be|b)
        deploy_backend
        ;;
    both|all)
        deploy_frontend
        deploy_backend
        ;;
    *)
        echo "Usage: ./deploy.sh [frontend|backend|both]"
        exit 1
        ;;
esac

echo "═══ Deploy complete ═══"
