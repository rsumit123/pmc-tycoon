"""MissileStock ORM tests + end-to-end seeding test."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
import app.models  # noqa: F401
from app.models.missile_stock import MissileStock


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    s = SessionLocal()
    yield s
    s.close()


def test_missile_stock_unique_constraint(session):
    """One row per (campaign_id, base_id, weapon_id)."""
    from app.models.campaign import Campaign
    from app.models.campaign_base import CampaignBase

    c = Campaign(
        name="T", seed=1,
        starting_year=2026, starting_quarter=2,
        current_year=2026, current_quarter=2,
        difficulty="realistic",
        objectives_json=[],
        budget_cr=45000,
        quarterly_grant_cr=45000,
        current_allocation_json=None,
        reputation=50,
    )
    session.add(c); session.flush()
    b = CampaignBase(
        campaign_id=c.id, template_id="test_base",
        shelter_count=10, fuel_depot_size=2,
        ad_integration_level=1, runway_class="long",
    )
    session.add(b); session.flush()

    session.add(MissileStock(
        campaign_id=c.id, base_id=b.id, weapon_id="meteor", stock=50,
    ))
    session.commit()

    # Duplicate raises
    session.add(MissileStock(
        campaign_id=c.id, base_id=b.id, weapon_id="meteor", stock=20,
    ))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    # Different weapon is fine
    session.add(MissileStock(
        campaign_id=c.id, base_id=b.id, weapon_id="r77", stock=30,
    ))
    session.commit()

    rows = session.query(MissileStock).filter_by(campaign_id=c.id).all()
    assert len(rows) == 2


def test_seed_populates_missile_stock_and_interceptor_stock():
    """Fresh campaign should have MissileStock rows per base/weapon + AD interceptor stock > 0."""
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker, Session
    from sqlalchemy.pool import StaticPool
    from app.db.base import Base
    import app.models  # noqa: F401
    from app.api.deps import get_db
    from main import app as fastapi_app
    from app.models.missile_stock import MissileStock
    from app.models.ad_battery import ADBattery

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(fastapi_app)
        r = client.post("/api/campaigns", json={
            "name": "seed-stockpile",
            "difficulty": "realistic",
            "objectives": ["amca_operational_by_2035"],
        })
        assert r.status_code == 201, r.text
        cid = r.json()["id"]

        with Session(engine) as s:
            missiles = s.query(MissileStock).filter_by(campaign_id=cid).all()
            assert len(missiles) > 0
            # Every row must have positive stock
            assert all(m.stock > 0 for m in missiles)
            # At least meteor + r77 + r73 should appear (rafale + su30)
            weapons = {m.weapon_id for m in missiles}
            assert {"meteor", "r77", "r73"}.issubset(weapons), weapons

            batteries = s.query(ADBattery).filter_by(campaign_id=cid).all()
            assert len(batteries) > 0
            for b in batteries:
                assert b.interceptor_stock > 0, (
                    f"battery {b.id} ({b.system_id}) has 0 stock"
                )
    finally:
        fastapi_app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
