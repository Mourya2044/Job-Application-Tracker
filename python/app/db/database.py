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

    # Safe auto-migration for sqlite local dev if columns are added
    if DATABASE_URL.startswith("sqlite"):
        new_cols = [
            ("auto_create_applications", "BOOLEAN DEFAULT 1"),
            ("refresh_token", "TEXT"),
            ("access_token", "TEXT"),
            ("token_expiry", "DATETIME"),
            ("watch_expiration", "DATETIME"),
            ("pubsub_topic", "VARCHAR(255)"),
        ]
        with engine.connect() as conn:
            for col_name, col_type in new_cols:
                try:
                    conn.execute(text(f"ALTER TABLE user_mailbox_consents ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    pass
