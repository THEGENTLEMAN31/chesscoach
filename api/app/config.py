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

    # Worker d'analyse de fond : lot de parties par itération + pause
    analysis_batch_size: int = 25
    analysis_batch_sleep: float = 3.0

    # Sync automatique : récupération périodique des dernières parties
    sync_auto_initial_delay: float = 20.0
    sync_auto_interval_h: int = 6
    sync_months: int = 1

    # Profil : décalage horaire du joueur (pour l'analyse "soirée")
    profile_tz_offset_h: int = 2

    # ------------------------------------------------------------- auth (V2)
    jwt_secret: str = "dev-secret-change-me"   # à surcharger via env en prod
    session_lifetime_s: int = 60 * 60 * 24 * 14  # 14 jours
    cookie_name: str = "chesscoach"
    cookie_secure: bool = False  # True derrière TLS en prod
    base_url: str = "http://localhost:8080"   # liens de vérification email
    verify_email: bool = False  # vérification email (Resend) — à activer
    resend_key: str | None = None

    # Seed admin : compte d'accès à la data historique (data réelle thegentleman31).
    seed_admin_password: str | None = None
    seed_admin_email: str = "admin@chesscoach.io"
    seed_admin_chesscom: str = "thegentleman31"

    # Inscription publique (pseudo chess.com vérifié). True en dev ; à passer
    # False en prod pour rester mono-pseudo (thegentleman31).
    allow_registration: bool = True

    @property
    def db_dir(self) -> Path:
        return Path(self.db_path).parent


settings = Settings()
