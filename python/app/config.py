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
        DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
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

BACKGROUND_SYNC_INTERVAL_SECONDS = int(os.getenv("BACKGROUND_SYNC_INTERVAL_SECONDS", "120"))
# On Vercel serverless, background worker loops must be disabled; Vercel Cron will trigger sync instead
default_sync_enabled = "false" if IS_VERCEL else "true"
BACKGROUND_SYNC_ENABLED = os.getenv("BACKGROUND_SYNC_ENABLED", default_sync_enabled).lower() == "true"
GMAIL_PUBSUB_TOPIC = os.getenv("GMAIL_PUBSUB_TOPIC", "")

