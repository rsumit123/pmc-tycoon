import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
import app.models  # noqa: F401  # register all models with Base.metadata
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

logger = logging.getLogger(__name__)

try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:  # noqa: BLE001
    logger.warning("create_all skipped at startup: %s", exc)

app = FastAPI(title="Sovereign Shield API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(campaigns_router)
app.include_router(budget_router)
app.include_router(rd_router)
app.include_router(acquisitions_router)
app.include_router(intel_router)
app.include_router(adversary_router)
app.include_router(vignettes_router)
app.include_router(narratives_router)
app.include_router(content_router)
app.include_router(bases_router)
app.include_router(summary_router)
app.include_router(base_upgrade_router)


@app.get("/")
def root():
    return {"message": "Sovereign Shield API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
