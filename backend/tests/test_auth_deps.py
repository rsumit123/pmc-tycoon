import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign
from app.api.deps import get_db
from app.auth.deps import get_current_user, require_owned_campaign
from app.auth.security import create_access_token, create_refresh_token


@pytest.fixture
def app_client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    u = User(email="a@b.com", auth_provider="password", password_hash="x", display_name="A")
    db.add(u)
    db.commit()
    c = Campaign(name="T", seed=1, starting_year=2026, starting_quarter=1, current_year=2026,
                 current_quarter=1, difficulty="realistic", objectives_json=[], budget_cr=45000, user_id=u.id)
    db.add(c)
    db.commit()
    user_id, camp_id = u.id, c.id
    db.close()

    app = FastAPI()

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db

    @app.get("/me")
    def me(user: User = Depends(get_current_user)):
        return {"id": user.id}

    @app.get("/c/{campaign_id}")
    def owned(campaign_id: int, camp: Campaign = Depends(require_owned_campaign)):
        return {"id": camp.id}

    return TestClient(app), user_id, camp_id


def test_no_token_401(app_client):
    client, _, camp_id = app_client
    assert client.get("/me").status_code == 401
    assert client.get(f"/c/{camp_id}").status_code == 401


def test_valid_token_ok(app_client):
    client, user_id, camp_id = app_client
    h = {"Authorization": f"Bearer {create_access_token(str(user_id))}"}
    assert client.get("/me", headers=h).json() == {"id": user_id}
    assert client.get(f"/c/{camp_id}", headers=h).status_code == 200


def test_refresh_token_rejected_as_access(app_client):
    client, user_id, _ = app_client
    h = {"Authorization": f"Bearer {create_refresh_token(str(user_id))}"}
    assert client.get("/me", headers=h).status_code == 401


def test_other_users_campaign_404(app_client):
    client, user_id, camp_id = app_client
    h = {"Authorization": f"Bearer {create_access_token(str(user_id + 999))}"}
    assert client.get(f"/c/{camp_id}", headers=h).status_code == 401


def test_owned_campaign_missing_404(app_client):
    client, user_id, _ = app_client
    h = {"Authorization": f"Bearer {create_access_token(str(user_id))}"}
    assert client.get("/c/999999", headers=h).status_code == 404
