import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

try:
    engine = create_engine(DATABASE_URL, **engine_kwargs)
except Exception as _engine_err:
    logger.error("Failed to initialize database engine for '%s': %s. Falling back to local SQLite.", DATABASE_URL, _engine_err)
    from app.config import DB_PATH
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    global engine, SessionLocal
    from app.db import models  # noqa: F401
    
    # Verify primary connection; fall back to local SQLite if remote host is unreachable
    try:
        with engine.connect() as conn:
            pass
    except Exception as _conn_err:
        from app.config import DB_PATH
        logger.warning(
            "Primary database connection failed (%s). Falling back to local SQLite at %s",
            _conn_err,
            DB_PATH,
        )
        engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
        SessionLocal.configure(bind=engine)

    Base.metadata.create_all(bind=engine)

    is_sqlite = str(engine.url).startswith("sqlite")

    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        if "applications" in existing_tables:
            existing_cols = {c["name"] for c in inspector.get_columns("applications")}
            app_cols = [
                ("applied_date", "DATETIME" if is_sqlite else "TIMESTAMP"),
                ("tags", "TEXT"),
                ("job_posting_id", "VARCHAR(36)"),
            ]
            for col_name, col_type in app_cols:
                if col_name not in existing_cols:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}"))
                        logger.info("Migrated column applications.%s (%s)", col_name, col_type)
                    except Exception as col_err:
                        logger.warning("Could not add column %s to applications: %s", col_name, col_err)

        if "application_status_events" in existing_tables:
            existing_cols = {c["name"] for c in inspector.get_columns("application_status_events")}
            event_cols = [
                ("decision_metadata", "TEXT"),
                ("model_version", "VARCHAR(100)"),
            ]
            for col_name, col_type in event_cols:
                if col_name not in existing_cols:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE application_status_events ADD COLUMN {col_name} {col_type}"))
                        logger.info("Migrated column application_status_events.%s (%s)", col_name, col_type)
                    except Exception as col_err:
                        logger.warning("Could not add column %s to application_status_events: %s", col_name, col_err)

        if "email_logs" in existing_tables:
            existing_cols = {c["name"] for c in inspector.get_columns("email_logs")}
            log_cols = [
                ("processing_status", "VARCHAR(50) DEFAULT 'processed'"),
                ("processing_attempts", "FLOAT DEFAULT 1.0"),
                ("error_details", "TEXT"),
                ("correlation_id", "VARCHAR(100)"),
            ]
            for col_name, col_type in log_cols:
                if col_name not in existing_cols:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE email_logs ADD COLUMN {col_name} {col_type}"))
                        logger.info("Migrated column email_logs.%s (%s)", col_name, col_type)
                    except Exception as col_err:
                        logger.warning("Could not add column %s to email_logs: %s", col_name, col_err)

        if "user_mailbox_consents" in existing_tables:
            existing_cols = {c["name"] for c in inspector.get_columns("user_mailbox_consents")}
            consent_cols = [
                ("auto_create_applications", "BOOLEAN DEFAULT 1" if is_sqlite else "BOOLEAN DEFAULT TRUE"),
                ("refresh_token", "TEXT"),
                ("access_token", "TEXT"),
                ("token_expiry", "DATETIME" if is_sqlite else "TIMESTAMP"),
                ("watch_expiration", "DATETIME" if is_sqlite else "TIMESTAMP"),
                ("pubsub_topic", "VARCHAR(255)"),
            ]
            for col_name, col_type in consent_cols:
                if col_name not in existing_cols:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE user_mailbox_consents ADD COLUMN {col_name} {col_type}"))
                        logger.info("Migrated column user_mailbox_consents.%s (%s)", col_name, col_type)
                    except Exception as col_err:
                        logger.warning("Could not add column %s to user_mailbox_consents: %s", col_name, col_err)

    except Exception as e:
        logger.error("Auto-migration inspector encountered an error: %s", e)

    # Seed default curated companies if company_career_pages table is empty
    try:
        from app.db.models import CompanyCareerPage
        db = SessionLocal()
        try:
            count = db.query(CompanyCareerPage).count()
            if count == 0:
                default_companies = [
                    {"name": "Stripe", "slug": "stripe", "provider": "greenhouse", "domain": "stripe.com", "career_url": "https://stripe.com/jobs", "logo_color": "#60a5fa"},
                    {"name": "Figma", "slug": "figma", "provider": "lever", "domain": "figma.com", "career_url": "https://jobs.lever.co/figma", "logo_color": "#d4a853"},
                    {"name": "Airbnb", "slug": "airbnb", "provider": "greenhouse", "domain": "airbnb.com", "career_url": "https://careers.airbnb.com", "logo_color": "#fb7185"},
                    {"name": "Vercel", "slug": "vercel", "provider": "greenhouse", "domain": "vercel.com", "career_url": "https://vercel.com/careers", "logo_color": "#e8e4dc"},
                    {"name": "Cloudflare", "slug": "cloudflare", "provider": "greenhouse", "domain": "cloudflare.com", "career_url": "https://cloudflare.com/careers", "logo_color": "#fbbf24"},
                    {"name": "Linear", "slug": "linear", "provider": "ashby", "domain": "linear.app", "career_url": "https://linear.app/careers", "logo_color": "#a78bfa"},
                    {"name": "OpenAI", "slug": "openai", "provider": "greenhouse", "domain": "openai.com", "career_url": "https://openai.com/careers", "logo_color": "#10b981"},
                    {"name": "Datadog", "slug": "datadog", "provider": "greenhouse", "domain": "datadoghq.com", "career_url": "https://careers.datadoghq.com", "logo_color": "#8b5cf6"},
                    {"name": "GitHub", "slug": "github", "provider": "greenhouse", "domain": "github.com", "career_url": "https://github.com/about/careers", "logo_color": "#f43f5e"},
                    {"name": "Twitch", "slug": "twitch", "provider": "greenhouse", "domain": "twitch.tv", "career_url": "https://twitch.tv/jobs", "logo_color": "#9333ea"},
                ]
                for comp_data in default_companies:
                    db.add(CompanyCareerPage(**comp_data))
                db.commit()
                logger.info("Successfully seeded %d initial curated company career pages.", len(default_companies))
        finally:
            db.close()
    except Exception as seed_err:
        logger.warning("Could not auto-seed company career pages: %s", seed_err)


# Run auto-initialization immediately upon module load
try:
    init_db()
except Exception as _e:
    logger.warning("Initial DB schema check on module load: %s", _e)
