"""User find-or-create + credential authentication."""
from sqlalchemy.orm import Session

from app.models.user import User
from app.auth.security import hash_password, verify_password


class EmailTakenError(Exception):
    pass


def get_user_by_id(db: Session, user_id: int | str) -> User | None:
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == uid).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def signup_user(db: Session, *, email: str, password: str, display_name: str = "") -> User:
    if get_user_by_email(db, email):
        raise EmailTakenError(email)
    user = User(
        email=email,
        password_hash=hash_password(password),
        auth_provider="password",
        display_name=display_name or email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_or_create_google_user(db: Session, claims: dict) -> User:
    sub = claims.get("sub")
    email = claims["email"]
    user = db.query(User).filter(User.google_id == sub).first()
    if user is None:
        user = get_user_by_email(db, email)
    if user is None:
        user = User(
            email=email,
            google_id=sub,
            auth_provider="google",
            display_name=claims.get("name") or email.split("@")[0],
            avatar_url=claims.get("picture"),
        )
        db.add(user)
    else:
        user.google_id = sub
        if claims.get("name"):
            user.display_name = claims["name"]
        if claims.get("picture"):
            user.avatar_url = claims["picture"]
    db.commit()
    db.refresh(user)
    return user
