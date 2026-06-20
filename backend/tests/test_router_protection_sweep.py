import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app

SAMPLE_PATHS = [
    # NOTE: /budget is POST-only (a GET returns 405 before the guard runs), so
    # the GET-based sweep below would not exercise its protection. Substitute a
    # GET route on the same guarded set: combat-history (vignettes_router).
    "/api/campaigns/{cid}/combat-history",
    "/api/campaigns/{cid}/rd",
    "/api/campaigns/{cid}/acquisitions",
    "/api/campaigns/{cid}/intel",
    "/api/campaigns/{cid}/adversary",
    "/api/campaigns/{cid}/vignettes/pending",
    "/api/campaigns/{cid}/bases",
    "/api/campaigns/{cid}/summary",
    "/api/campaigns/{cid}/hangar",
    "/api/campaigns/{cid}/armory/unlocks",
    "/api/campaigns/{cid}/performance",
    "/api/campaigns/{cid}/missile-stocks",
    "/api/campaigns/{cid}/notifications",
    "/api/campaigns/{cid}/adversary-bases",
    "/api/campaigns/{cid}/diplomacy",
    "/api/campaigns/{cid}/posture",
]


@pytest.fixture
def client():
    app.dependency_overrides.pop(get_current_user, None)  # exercise real auth
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
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.mark.parametrize("path", SAMPLE_PATHS)
def test_unauthenticated_is_401(client, path):
    assert client.get(path.format(cid=1)).status_code == 401


@pytest.mark.parametrize("path", SAMPLE_PATHS)
def test_cross_user_is_404(client, path):
    ha = {"Authorization": f"Bearer {client.post('/api/auth/signup', json={'email':'a@b.com','password':'pw123456'}).json()['access_token']}"}
    hb = {"Authorization": f"Bearer {client.post('/api/auth/signup', json={'email':'b@b.com','password':'pw123456'}).json()['access_token']}"}
    cid = client.post("/api/campaigns", headers=ha, json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"]}).json()["id"]
    assert client.get(path.format(cid=cid), headers=hb).status_code == 404
