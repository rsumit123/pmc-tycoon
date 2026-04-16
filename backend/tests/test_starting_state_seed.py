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
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
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


def _create(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def test_create_campaign_seeds_three_bases(client):
    c, Session = client
    created = _create(c)
    from app.models.campaign_base import CampaignBase
    db = Session()
    bases = db.query(CampaignBase).filter(CampaignBase.campaign_id == created["id"]).all()
    template_ids = {b.template_id for b in bases}
    assert template_ids == {"ambala", "hasimara", "jodhpur"}


def test_create_campaign_seeds_named_squadrons(client):
    c, Session = client
    created = _create(c)
    from app.models.squadron import Squadron
    db = Session()
    sqs = db.query(Squadron).filter(Squadron.campaign_id == created["id"]).all()
    assert len(sqs) >= 3
    names = {s.name for s in sqs}
    assert "17 Sqn Golden Arrows" in names


def test_create_campaign_seeds_mrfa_rafale_acquisition(client):
    c, Session = client
    created = _create(c)
    from app.models.acquisition import AcquisitionOrder
    db = Session()
    orders = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == created["id"]).all()
    rafale = next((o for o in orders if o.platform_id == "rafale_f4"), None)
    assert rafale is not None
    assert rafale.quantity == 114
    assert rafale.first_delivery_year == 2027
    assert rafale.first_delivery_quarter == 4
    assert rafale.foc_year == 2032
    assert rafale.foc_quarter == 1


def test_create_campaign_seeds_tejas_mk1a_acquisition(client):
    c, Session = client
    created = _create(c)
    from app.models.acquisition import AcquisitionOrder
    db = Session()
    orders = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == created["id"]).all()
    tejas = next((o for o in orders if o.platform_id == "tejas_mk1a"), None)
    assert tejas is not None
    assert tejas.quantity == 97


def test_create_campaign_seeds_amca_rd(client):
    c, Session = client
    created = _create(c)
    from app.models.rd_program import RDProgramState
    db = Session()
    progs = db.query(RDProgramState).filter(RDProgramState.campaign_id == created["id"]).all()
    program_ids = {p.program_id for p in progs}
    assert "amca_mk1" in program_ids
    assert "amca_mk1_engine" in program_ids
    assert "astra_mk2" in program_ids
    assert "tejas_mk2" in program_ids


def test_create_campaign_astra_mk2_starts_near_completion(client):
    c, Session = client
    created = _create(c)
    from app.models.rd_program import RDProgramState
    db = Session()
    astra = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == created["id"],
        RDProgramState.program_id == "astra_mk2",
    ).first()
    assert astra is not None
    assert astra.progress_pct >= 70  # series production is one quarter out
