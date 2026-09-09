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

engine = create_engine(DATABASE_URL, **engine_kwargs)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    is_sqlite = DATABASE_URL.startswith("sqlite")

    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        if "applications" in existing_tables:
            existing_cols = {c["name"] for c in inspector.get_columns("applications")}
            app_cols = [
                ("applied_date", "DATETIME" if is_sqlite else "TIMESTAMP"),
                ("tags", "TEXT"),
            ]
            for col_name, col_type in app_cols:
                if col_name not in existing_cols:
                    try:
                        with engine.begin() as conn:
                            conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}"))
                        logger.info("Migrated column applications.%s (%s)", col_name, col_type)
                    except Exception as col_err:
                        logger.warning("Could not add column %s to applications: %s", col_name, col_err)

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


# Run auto-initialization immediately upon module load
try:
    init_db()
except Exception as _e:
    logger.warning("Initial DB schema check on module load: %s", _e)
