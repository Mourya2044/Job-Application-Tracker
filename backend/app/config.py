import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from python root directory
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

IS_VERCEL = os.getenv("VERCEL") == "1"

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "tracking.db"

raw_db_url = os.getenv("DATABASE_URL")
if raw_db_url:
    # Some providers like Supabase or Heroku output postgres:// which SQLAlchemy deprecated in favor of postgresql://
    if raw_db_url.startswith("postgres://") or "postgresql" in raw_db_url:
        try:
            import psycopg2  # noqa: F401
            DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
        except ImportError:
            # Fallback to local SQLite if postgresql driver (psycopg2) is not installed on this system
            DATABASE_URL = f"sqlite:///{DB_PATH}"
    else:
        DATABASE_URL = raw_db_url
else:
    DATABASE_URL = f"sqlite:///{DB_PATH}"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Direct Google OAuth credentials from env (useful for serverless where files cannot be uploaded)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON", "")

GMAIL_PUBSUB_TOPIC = os.getenv("GMAIL_PUBSUB_TOPIC", "projects/gmail-summarise-503906/topics/gmail-event")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://track.mourya.tech").rstrip("/")


