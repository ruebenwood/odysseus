from __future__ import annotations
import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    api_host: str = os.getenv("ODYSSEUS_API_HOST", "127.0.0.1")
    api_port: int = int(os.getenv("ODYSSEUS_API_PORT", "8787"))
    db_url: str = os.getenv("ODYSSEUS_DB", "./odysseus.db")
    console_password: str = os.getenv("ODYSSEUS_CONSOLE_PASSWORD", "changeme")
    codex_url: str = os.getenv("ODYSSEUS_CODEX_URL", "http://localhost:3000/api/codex")
    max_steps: int = int(os.getenv("ODYSSEUS_MAX_STEPS", "8"))
    temperature: float = float(os.getenv("ODYSSEUS_TEMPERATURE", "0.2"))
    email_provider: str = os.getenv("EMAIL_PROVIDER", "mock")
    calendar_provider: str = os.getenv("CALENDAR_PROVIDER", "mock")

settings = Settings()
