"""Tests for GET /api/campaigns/{id}/summary endpoint."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.vignette import Vignette
from app.models.squadron import Squadron


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app), Session
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _seed_campaign(session, *, current_year=2030, current_quarter=1):
    c = Campaign(
        name="test", seed=42, starting_year=2026, starting_quarter=2,
        current_year=current_year, current_quarter=current_quarter,
        difficulty="realistic", objectives_json=["amca_operational_by_2035"],
        budget_cr=500000,
    )
    session.add(c)
    session.commit()
    return c


def test_summary_returns_year_snapshots(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    for y in (2026, 2027):
        for q in range(2 if y == 2026 else 1, 5):
            db.add(CampaignEvent(
                campaign_id=c.id, year=y, quarter=q,
                event_type="turn_advanced",
                payload={"treasury_after_cr": 400000 + y * 10 + q,
                         "from_year": y, "from_quarter": q,
                         "to_year": y if q < 4 else y + 1,
                         "to_quarter": q + 1 if q < 4 else 1,
                         "grant_cr": 155000, "allocation": {}},
            ))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "year_snapshots" in data
    assert len(data["year_snapshots"]) >= 2


def test_summary_includes_force_structure(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Squadron(campaign_id=c.id, name="17 Sqn", call_sign="17A",
                    platform_id="rafale_f4", base_id=1, strength=16))
    db.add(Squadron(campaign_id=c.id, name="45 Sqn", call_sign="45B",
                    platform_id="tejas_mk1a", base_id=1, strength=18))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["force_structure"]["squadrons_end"] == 2
    assert data["force_structure"]["total_airframes"] == 34


def test_summary_counts_vignettes(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Vignette(campaign_id=c.id, year=2028, quarter=2,
                    scenario_id="s1", status="resolved",
                    outcome={"objective_met": True}))
    db.add(Vignette(campaign_id=c.id, year=2029, quarter=1,
                    scenario_id="s2", status="resolved",
                    outcome={"objective_met": False}))
    db.add(Vignette(campaign_id=c.id, year=2029, quarter=3,
                    scenario_id="s3", status="pending"))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["vignettes_won"] == 1
    assert data["vignettes_lost"] == 1


def test_summary_404_for_missing_campaign(client):
    http, _ = client
    resp = http.get("/api/campaigns/9999/summary")
    assert resp.status_code == 404


def test_summary_counts_aces(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    db.add(Squadron(campaign_id=c.id, name="17 Sqn", call_sign="17A",
                    platform_id="rafale_f4", base_id=1, strength=16,
                    ace_name="Sqn Ldr Rao 'Vajra'", ace_awarded_year=2029,
                    ace_awarded_quarter=3))
    db.add(Squadron(campaign_id=c.id, name="45 Sqn", call_sign="45B",
                    platform_id="tejas_mk1a", base_id=1, strength=18))
    db.commit()
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert data["ace_count"] == 1
    assert len(data["aces"]) == 1
    assert data["aces"][0]["squadron_name"] == "17 Sqn"


def test_summary_evaluates_objectives(client):
    http, Session = client
    db = Session()
    c = _seed_campaign(db)
    # No AMCA squadron → amca_operational_by_2035 should be "fail"
    resp = http.get(f"/api/campaigns/{c.id}/summary")
    data = resp.json()
    assert len(data["objectives"]) == 1
    assert data["objectives"][0]["id"] == "amca_operational_by_2035"
    assert data["objectives"][0]["status"] == "fail"

    # Add AMCA squadron → should flip to "pass"
    db.add(Squadron(campaign_id=c.id, name="AMCA Sqn", call_sign="AMCA1",
                    platform_id="amca_mk1", base_id=1, strength=6))
    db.commit()
    resp2 = http.get(f"/api/campaigns/{c.id}/summary")
    data2 = resp2.json()
    assert data2["objectives"][0]["status"] == "pass"
