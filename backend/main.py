import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
import app.models  # noqa: F401  # register all models with Base.metadata
from app.api.campaigns import router as campaigns_router

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


@app.get("/")
def root():
    return {"message": "Sovereign Shield API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
