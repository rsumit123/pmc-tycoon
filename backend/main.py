import logging

from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.deps import require_owned_campaign
from app.auth.bootstrap import ensure_owner_and_backfill, ensure_user_id_column
from app.core.checks import assert_production_secrets, verify_user_id_migration
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine, SessionLocal
import app.models  # noqa: F401  # register all models with Base.metadata
from app.api.auth import router as auth_router
from app.api.campaigns import router as campaigns_router
from app.api.budget import router as budget_router
from app.api.rd import router as rd_router
from app.api.acquisitions import router as acquisitions_router
from app.api.intel import router as intel_router
from app.api.adversary import router as adversary_router
from app.api.vignettes import router as vignettes_router
from app.api.narratives import router as narratives_router
from app.api.content import router as content_router
from app.api.bases import router as bases_router
from app.api.summary import router as summary_router
from app.api.base_upgrade import router as base_upgrade_router
from app.api.campaign_export import router as campaign_export_router
from app.api.squadrons import router as squadrons_router
from app.api.armory import router as armory_router, hangar_router
from app.api.performance import router as performance_router
from app.api.missile_stocks import router as missile_stocks_router
from app.api.notifications import router as notifications_router
from app.api.adversary_bases import router as adversary_bases_router
from app.api.offensive_ops import router as offensive_router
from app.api.diplomacy import router as diplomacy_router
from app.api.posture import router as posture_router

logger = logging.getLogger(__name__)

# Refuse to boot a prod-like deployment with the insecure default JWT secret.
assert_production_secrets(settings)

try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:  # noqa: BLE001
    logger.warning("create_all skipped at startup: %s", exc)

try:
    ensure_user_id_column(engine)
    _db = SessionLocal()
    ensure_owner_and_backfill(_db, settings.owner_email)
    _db.close()
except Exception as exc:  # noqa: BLE001
    logger.warning("owner backfill skipped at startup: %s", exc)

# Fail loud (ERROR, not silent) if the migration left the DB unusable.
verify_user_id_migration(engine)

app = FastAPI(title="Chakravyuh API", version="0.1.0")


# Catch-all for unhandled exceptions. Added BEFORE CORS so it sits *inside* the
# CORS middleware — its 500 response then flows back out through CORS and gets
# the Access-Control-Allow-Origin header. Without this, an unhandled error
# returns a 500 with no CORS headers, which a browser/WebView surfaces as an
# opaque "Network error" instead of the real status.
@app.middleware("http")
async def _catch_unhandled_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:  # noqa: BLE001
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(campaigns_router)          # protected per-route (Task 8)
app.include_router(campaign_export_router)    # protected per-route (Task 8)
app.include_router(content_router)            # public catalogs - intentionally unguarded

_guard = [Depends(require_owned_campaign)]
app.include_router(budget_router, dependencies=_guard)
app.include_router(rd_router, dependencies=_guard)
app.include_router(acquisitions_router, dependencies=_guard)
app.include_router(intel_router, dependencies=_guard)
app.include_router(adversary_router, dependencies=_guard)
app.include_router(vignettes_router, dependencies=_guard)
app.include_router(narratives_router, dependencies=_guard)
app.include_router(bases_router, dependencies=_guard)
app.include_router(summary_router, dependencies=_guard)
app.include_router(base_upgrade_router, dependencies=_guard)
app.include_router(squadrons_router, dependencies=_guard)
app.include_router(armory_router, dependencies=_guard)
app.include_router(hangar_router, dependencies=_guard)
app.include_router(performance_router, dependencies=_guard)
app.include_router(missile_stocks_router, dependencies=_guard)
app.include_router(notifications_router, dependencies=_guard)
app.include_router(adversary_bases_router, dependencies=_guard)
app.include_router(offensive_router, dependencies=_guard)
app.include_router(diplomacy_router, dependencies=_guard)
app.include_router(posture_router, dependencies=_guard)


@app.get("/")
def root():
    return {"message": "Chakravyuh API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
