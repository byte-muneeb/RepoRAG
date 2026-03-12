from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    # Load backend/.env regardless of where uvicorn is started from.
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    environment: str = Field(default="development")
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    cors_origin_regex: str = Field(default="")

    database_url: str = Field(default="postgresql+asyncpg://postgres:postgres@localhost:5432/reporag")
    redis_url: str = Field(default="redis://localhost:6379/0")

    gemini_api_key: str = Field(default="")
    gemini_embedding_model: str = Field(default="models/embedding-001")
    groq_api_key: str = Field(default="")
    groq_model: str = Field(default="llama-3.3-70b-versatile")
    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    github_token: str = Field(default="")

    max_repo_size_mb: int = Field(default=1024)
    max_file_size_kb: int = Field(default=1024)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
