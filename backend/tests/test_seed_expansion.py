"""Tests for the expanded 15-base / 31-squadron / full-adversary-OOB seed."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(c):
    return c.post("/api/campaigns", json={
        "name": "Expansion test", "difficulty": "realistic", "objectives": [],
    }).json()


def test_base_count():
    """load_bases returns 15 bases."""
    from app.content.registry import bases as get_bases
    bases = get_bases()
    assert len(bases) == 15


def test_base_coordinates_valid():
    """All bases have lat 5.0–36.0, lon 68.0–98.0 (subcontinent range)."""
    from app.content.registry import bases as get_bases
    for base_id, base in get_bases().items():
        assert 5.0 <= base.lat <= 36.0, f"{base_id} lat={base.lat} out of range"
        assert 68.0 <= base.lon <= 98.0, f"{base_id} lon={base.lon} out of range"


def test_starting_squadron_count(client):
    """After seeding, 34 squadrons exist."""
    c, Session = client
    created = _create_campaign(c)
    from app.models.squadron import Squadron
    db = Session()
    sqs = db.query(Squadron).filter(Squadron.campaign_id == created["id"]).all()
    assert len(sqs) == 34


def test_starting_base_count(client):
    """After seeding, 15 campaign bases exist."""
    c, Session = client
    created = _create_campaign(c)
    from app.models.campaign_base import CampaignBase
    db = Session()
    bases = db.query(CampaignBase).filter(CampaignBase.campaign_id == created["id"]).all()
    assert len(bases) == 15


def test_platform_distribution(client):
    """Su-30 MKI has 13+ squadrons, Rafale F4 has 2, MiG-21 Bison has 2+."""
    c, Session = client
    created = _create_campaign(c)
    from app.models.squadron import Squadron
    db = Session()
    sqs = db.query(Squadron).filter(Squadron.campaign_id == created["id"]).all()
    by_platform: dict[str, int] = {}
    for sq in sqs:
        by_platform[sq.platform_id] = by_platform.get(sq.platform_id, 0) + 1
    assert by_platform.get("su30_mki", 0) >= 13, f"su30_mki count: {by_platform.get('su30_mki', 0)}"
    assert by_platform.get("rafale_f4", 0) == 2, f"rafale_f4 count: {by_platform.get('rafale_f4', 0)}"
    assert by_platform.get("mig21_bison", 0) >= 2, f"mig21_bison count: {by_platform.get('mig21_bison', 0)}"
