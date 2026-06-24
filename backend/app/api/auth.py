from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.auth import security, service
from app.auth.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    SignupRequest, LoginRequest, GoogleLoginRequest, RefreshRequest,
    TokenResponse, UserRead,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tokens_for(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=security.create_access_token(str(user.id)),
        refresh_token=security.create_refresh_token(str(user.id)),
        user=UserRead.model_validate(user),
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    try:
        user = service.signup_user(
            db, email=payload.email, password=payload.password,
            display_name=payload.display_name or "",
        )
    except service.EmailTakenError:
        raise HTTPException(status_code=409, detail="Email already registered")
    return _tokens_for(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = service.authenticate_user(db, payload.email, payload.password)
    if user is None:
        existing = service.get_user_by_email(db, payload.email)
        if existing and not existing.password_hash:
            raise HTTPException(status_code=401, detail="This account uses Google Sign-In")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _tokens_for(user)


@router.post("/google", response_model=TokenResponse)
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        claims = security.verify_google_id_token(payload.id_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    user = service.get_or_create_google_user(db, claims)
    return _tokens_for(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    decoded = security.decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = service.get_user_by_id(db, decoded.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return _tokens_for(user)


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return UserRead.model_validate(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete the authenticated user and ALL their data (Play Store requirement).

    Deletes ONLY the caller's own campaigns and their campaign-scoped dependent
    rows, then the user row. Dependent rows are cascade-deleted by introspecting
    every table carrying a ``campaign_id`` column (same pattern as
    ``delete_campaign_endpoint``) so new per-campaign tables are covered
    automatically. Once the user row is gone, any access token referencing that
    user id fails ``get_current_user`` (401).
    """
    import app.models  # noqa: F401  ensure every model is registered on Base.metadata
    from app.db.base import Base
    from app.models.campaign import Campaign

    camp_ids = [
        c.id for c in db.query(Campaign).filter(Campaign.user_id == user.id).all()
    ]
    if camp_ids:
        # Delete children first (reverse FK order); intent-clear even with
        # SQLite FK enforcement off.
        for table in reversed(Base.metadata.sorted_tables):
            if table.name in ("campaigns", "users"):
                continue
            if "campaign_id" in table.c:
                db.execute(table.delete().where(table.c.campaign_id.in_(camp_ids)))
        db.query(Campaign).filter(Campaign.id.in_(camp_ids)).delete(
            synchronize_session=False
        )

    db.delete(user)
    db.commit()
    return None
