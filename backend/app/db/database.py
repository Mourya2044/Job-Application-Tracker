from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

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

    # Safe auto-migration for sqlite and postgresql if columns are added to existing tables
    is_sqlite = DATABASE_URL.startswith("sqlite")
    consent_cols = [
        ("auto_create_applications", "BOOLEAN DEFAULT 1" if is_sqlite else "BOOLEAN DEFAULT TRUE"),
        ("refresh_token", "TEXT"),
        ("access_token", "TEXT"),
        ("token_expiry", "DATETIME" if is_sqlite else "TIMESTAMP"),
        ("watch_expiration", "DATETIME" if is_sqlite else "TIMESTAMP"),
        ("pubsub_topic", "VARCHAR(255)"),
    ]
    app_cols = [
        ("applied_date", "DATETIME" if is_sqlite else "TIMESTAMP"),
        ("tags", "TEXT"),
    ]
    with engine.connect() as conn:
        for col_name, col_type in consent_cols:
            try:
                if is_sqlite:
                    conn.execute(text(f"ALTER TABLE user_mailbox_consents ADD COLUMN {col_name} {col_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE user_mailbox_consents ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass

        for col_name, col_type in app_cols:
            try:
                if is_sqlite:
                    conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}"))
                else:
                    conn.execute(text(f"ALTER TABLE applications ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                conn.commit()
            except Exception:
                pass
