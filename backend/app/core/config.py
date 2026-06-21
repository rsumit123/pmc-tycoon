from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:////app/data/sovereign_shield.db"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-haiku-4.5"
    content_dir: str = str(Path(__file__).resolve().parent.parent.parent / "content")

    # Auth
    google_client_id: str = ""
    jwt_secret_key: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    refresh_token_expire_minutes: int = 43200  # 30 days

    # LLM cost guardrails
    llm_daily_user_cap: int = 40
    llm_daily_token_ceiling: int = 2_000_000

    owner_email: str = "thetinkerer018@gmail.com"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://chakravyuh.skdev.one",
        "https://chakravyuh.vercel.app",
        # Capacitor native WebView origins (Android serves from https://localhost;
        # http/capacitor variants cover other schemes/iOS). Required for the
        # mobile app's API + Google sign-in calls to pass CORS.
        "https://localhost",
        "http://localhost",
        "capacitor://localhost",
        # Legacy origins kept during the pmc-tycoon -> chakravyuh domain cutover; remove once DNS/Vercel fully migrated.
        "https://pmc-tycoon.skdev.one",
        "https://pmc-tycoon.vercel.app",
    ]


settings = Settings()
