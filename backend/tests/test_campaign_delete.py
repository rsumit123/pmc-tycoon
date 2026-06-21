import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client_and_engine():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app), engine
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _campaign_id_tables(engine):
    insp = inspect(engine)
    return [t for t in insp.get_table_names()
            if any(col["name"] == "campaign_id" for col in insp.get_columns(t))]


def test_delete_removes_all_campaign_scoped_rows(client_and_engine):
    """Deleting a campaign must leave ZERO rows in any table with a campaign_id
    column — guards against the stale-delete-list bug that orphaned
    missile_stocks and broke creation via SQLite id reuse."""
    client, engine = client_and_engine
    r = client.post("/api/campaigns", json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"],
    })
    assert r.status_code == 201
    cid = r.json()["id"]

    tables = _campaign_id_tables(engine)
    with engine.connect() as c:
        # sanity: seeding populated representative tables
        assert c.execute(text("SELECT COUNT(*) FROM missile_stocks WHERE campaign_id=:i"), {"i": cid}).scalar() > 0
        assert c.execute(text("SELECT COUNT(*) FROM squadrons WHERE campaign_id=:i"), {"i": cid}).scalar() > 0

    assert client.delete(f"/api/campaigns/{cid}").status_code == 204

    with engine.connect() as c:
        leftover = {}
        for t in tables:
            n = c.execute(text(f"SELECT COUNT(*) FROM {t} WHERE campaign_id=:i"), {"i": cid}).scalar()
            if n:
                leftover[t] = n
        camp_left = c.execute(text("SELECT COUNT(*) FROM campaigns WHERE id=:i"), {"i": cid}).scalar()

    assert camp_left == 0
    assert leftover == {}, f"orphaned rows after delete: {leftover}"
