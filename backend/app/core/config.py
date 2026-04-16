from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:////app/data/sovereign_shield.db"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-haiku-4.5"
    content_dir: str = str(Path(__file__).resolve().parent.parent.parent / "content")

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://pmc-tycoon.skdev.one",
        "https://pmc-tycoon.vercel.app",
    ]


settings = Settings()
