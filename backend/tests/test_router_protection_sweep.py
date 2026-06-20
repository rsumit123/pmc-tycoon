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


from fastapi.routing import APIRoute
from app.auth.deps import require_owned_campaign


def _all_dependency_calls(dependant):
    calls = []
    for dep in dependant.dependencies:
        if dep.call is not None:
            calls.append(dep.call)
        calls.extend(_all_dependency_calls(dep))
    return calls


def test_every_campaign_scoped_route_has_ownership_guard():
    """Regression guard: any route with {campaign_id} in its path MUST have
    require_owned_campaign in its dependency chain. Fails loudly if a new
    router is added without the guard."""
    unguarded = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if "{campaign_id}" not in route.path:
            continue
        calls = _all_dependency_calls(route.dependant)
        if require_owned_campaign not in calls:
            unguarded.append(f"{sorted(route.methods)} {route.path}")
    assert not unguarded, "Campaign-scoped routes missing require_owned_campaign:\n" + "\n".join(unguarded)
