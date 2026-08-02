from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent  # /app


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Utilisateur analysé par défaut (compte actif vérifié)
    coach_username: str = "thegentleman31"

    # Service moteur
    analyzer_url: str = "http://analyzer:8002"

    # Base de données
    db_path: str = "/app/data/chesscoach.db"
    cache_dir: Path = Path("/app/data/cache")

    # Formats analysés
    time_classes: str = "rapid,blitz"

    # LLM (facultatif — tout fonctionne sans)
    openrouter_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = ""
    llm_enabled: bool = False

    # Analyse moteur
    analysis_depth_rapid: int = 18
    analysis_depth_blitz: int = 16
    analysis_movetime: int = 2000

    @property
    def db_dir(self) -> Path:
        return Path(self.db_path).parent


settings = Settings()
