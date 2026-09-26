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
    if raw_db_url.startswith("postgres://"):
        raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

    if "postgresql" in raw_db_url:
        has_psycopg = False
        has_psycopg2 = False
        try:
            import psycopg  # noqa: F401
            has_psycopg = True
        except ImportError:
            pass
        try:
            import psycopg2  # noqa: F401
            has_psycopg2 = True
        except ImportError:
            pass

        if not has_psycopg and not has_psycopg2:
            DATABASE_URL = f"sqlite:///{DB_PATH}"
        elif "+psycopg://" in raw_db_url:
            if has_psycopg:
                DATABASE_URL = raw_db_url
            elif has_psycopg2:
                DATABASE_URL = raw_db_url.replace("+psycopg://", "+psycopg2://", 1)
            else:
                DATABASE_URL = f"sqlite:///{DB_PATH}"
        elif "+psycopg2://" in raw_db_url:
            if has_psycopg2:
                DATABASE_URL = raw_db_url
            elif has_psycopg:
                DATABASE_URL = raw_db_url.replace("+psycopg2://", "+psycopg://", 1)
            else:
                DATABASE_URL = f"sqlite:///{DB_PATH}"
        elif raw_db_url.startswith("postgresql://"):
            # Explicitly choose installed dialect so SQLAlchemy doesn't guess a missing driver
            if has_psycopg2:
                DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
            elif has_psycopg:
                DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
            else:
                DATABASE_URL = raw_db_url
        else:
            DATABASE_URL = raw_db_url
    else:
        DATABASE_URL = raw_db_url
else:
    DATABASE_URL = f"sqlite:///{DB_PATH}"

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


