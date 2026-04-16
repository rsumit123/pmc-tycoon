from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


def _make_client():
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
    return TestClient(app), engine


def _run_scenario(client, seed: int) -> dict:
    """Create a campaign with a fixed seed, take the same actions, advance 10 turns."""
    created = client.post("/api/campaigns", json={
        "name": "Det", "difficulty": "realistic", "objectives": [],
        "seed": seed,
    }).json()
    campaign_id = created["id"]

    # Action 1: lock in an allocation
    client.post(f"/api/campaigns/{campaign_id}/budget", json={"allocation": {
        "rd": 80000, "acquisition": 40000, "om": 20000, "spares": 10000, "infrastructure": 5000,
    }})

    # Action 2: start an extra R&D program
    client.post(f"/api/campaigns/{campaign_id}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "accelerated",
    })

    # Advance 10 quarters
    for _ in range(10):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    final = client.get(f"/api/campaigns/{campaign_id}").json()
    return final


def test_replay_via_two_independent_runs():
    client_a, eng_a = _make_client()
    final_a = _run_scenario(client_a, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_a)

    client_b, eng_b = _make_client()
    final_b = _run_scenario(client_b, seed=20260415)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng_b)

    fields = ["current_year", "current_quarter", "budget_cr", "current_allocation_json"]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}: {final_a[f]} vs {final_b[f]}"
