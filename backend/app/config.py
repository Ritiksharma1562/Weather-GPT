import json
import secrets
from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    frontend_origins: str =  "http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:8000"

    database_url: str = "sqlite+aiosqlite:///./weathergpt.db"
    redis_url: str = ""
    jwt_secret_key: str = ""

    gemini_api_key: str = "AIzaSyXXXXXXXXXXXXXXXX"
    gemini_model: str = "gemini-3.5-flash-lites"
    gemini_tts_voice: str = "Kore"

    gemini_tts_model: str = "gpt-4o-mini-tts"
    google_client_id: str = "Kore"
    firebase_service_account_json: str = ""
    firebase_web_config_json: str = ""
    firebase_vapid_key: str = ""
    open_meteo_api_key: str = ""
    openrouteservice_api_key: str = ""
    osrm_base_url: str = "https://router.project-osrm.org"
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    provider_user_agent: str = "WeatherGPT/1.0"
    layer_config_path: str = ""
    wrf_forecast_url: str = ""
    imd_alerts_url: str | None = None
    alert_poll_seconds: int = 300

    @model_validator(mode="after")
    def validate_production(self):
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        if self.environment == "production":
            if len(self.jwt_secret_key) < 40:
                raise ValueError(
                    "Production requires JWT_SECRET_KEY of at least 40 characters"
                )
            if (
                not self.database_url.startswith("postgresql+asyncpg://")
                or not self.redis_url
            ):
                raise ValueError("Production requires PostgreSQL and Redis")
            if any(not origin.startswith("https://") for origin in self.origins):
                raise ValueError("Production frontend origins must use HTTPS")
        if not self.jwt_secret_key:
            self.jwt_secret_key = secrets.token_urlsafe(48)
        return self

    @property
    def origins(self) -> list[str]:
        return [
            s.strip().rstrip("/") for s in self.frontend_origins.split(",") if s.strip()
        ]

    @property
    def firebase_web_config(self) -> dict:
        return (
            json.loads(self.firebase_web_config_json)
            if self.firebase_web_config_json
            else {}
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
