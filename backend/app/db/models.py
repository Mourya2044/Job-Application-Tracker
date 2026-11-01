import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LifecycleStage(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEWING = "interviewing"
    INTERVIEW = "interview"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class TriggerSource(str, Enum):
    MANUAL_USER_OVERRIDE = "manual_user_override"
    MAILBOX_AUTO = "mailbox_auto"
    UNDO_ACTION = "undo_action"
    INITIAL_INGEST = "initial_ingest"


class JobPosting(Base):
    __tablename__ = "job_postings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    external_job_id = Column(String(255), nullable=True, index=True)
    company_name = Column(String(255), nullable=False, index=True)
    company_domain = Column(String(255), nullable=True)
    role_title = Column(String(255), nullable=False, index=True)
    job_url = Column(String(1024), nullable=False)
    salary_range = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    description_snippet = Column(Text, nullable=True)
    source_type = Column(String(100), default="scraped", nullable=False)

    first_seen_at = Column(DateTime, default=utc_now, nullable=False)
    last_seen_at = Column(DateTime, default=utc_now, nullable=False)
    is_expired = Column(Boolean, default=False, nullable=False, index=True)
    expired_at = Column(DateTime, nullable=True)

    repost_detected = Column(Boolean, default=False, nullable=False)
    original_posting_id = Column(String(36), ForeignKey("job_postings.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class Application(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    company_name = Column(String(255), nullable=False, index=True)
    company_domain = Column(String(255), nullable=True)
    role_title = Column(String(255), nullable=False)
    job_url = Column(String(1024), nullable=True)
    location = Column(String(255), nullable=True)
    salary_range = Column(String(255), nullable=True)
    
    current_stage = Column(String(50), nullable=False, default=LifecycleStage.APPLIED.value, index=True)
    stage_locked = Column(Boolean, default=False, nullable=False)
    
    last_status_change_at = Column(DateTime, default=utc_now, nullable=False)
    last_status_change_source = Column(String(50), default=TriggerSource.INITIAL_INGEST.value, nullable=False)
    
    next_step = Column(String(255), nullable=True)
    next_step_deadline = Column(DateTime, nullable=True)
    interview_link = Column(String(1024), nullable=True)
    manual_notes = Column(Text, nullable=True)
    pending_suggestion = Column(Text, nullable=True)  # JSON string for proposed auto updates when locked

    applied_date = Column(DateTime, nullable=True, default=utc_now)
    tags = Column(Text, nullable=True)  # Comma-separated or JSON list of tags
    job_posting_id = Column(String(36), ForeignKey("job_postings.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    status_events = relationship(
        "ApplicationStatusEvent",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="desc(ApplicationStatusEvent.changed_at)",
    )
    job_posting = relationship("JobPosting", foreign_keys=[job_posting_id], backref="applications")


class ApplicationStatusEvent(Base):
    __tablename__ = "application_status_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    
    from_stage = Column(String(50), nullable=True)
    to_stage = Column(String(50), nullable=False)
    changed_at = Column(DateTime, default=utc_now, nullable=False)
    trigger_source = Column(String(50), nullable=False)
    
    user_note = Column(Text, nullable=True)
    confidence_score = Column(Float, nullable=True)
    change_summary = Column(Text, nullable=False)
    
    email_message_id = Column(String(255), nullable=True, index=True)
    email_subject = Column(String(512), nullable=True)
    email_snippet = Column(Text, nullable=True)
    extracted_metadata = Column(Text, nullable=True)  # JSON string
    decision_metadata = Column(Text, nullable=True)   # JSON string for decision provenance & explainability
    model_version = Column(String(100), nullable=True)

    application = relationship("Application", back_populates="status_events")


class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(255), unique=True, nullable=False, index=True)
    thread_id = Column(String(255), nullable=True)
    sender = Column(String(255), nullable=True)
    subject = Column(String(512), nullable=True)
    snippet = Column(Text, nullable=True)
    received_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, default=utc_now, nullable=False)
    
    detected_company = Column(String(255), nullable=True)
    detected_stage = Column(String(50), nullable=True)
    matched_application_id = Column(String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True)
    match_status = Column(String(50), default="unmatched", nullable=False)
    raw_classification = Column(Text, nullable=True)  # JSON string
    
    processing_status = Column(String(50), default="processed", nullable=False)
    processing_attempts = Column(Float, default=1.0, nullable=False)
    error_details = Column(Text, nullable=True)
    correlation_id = Column(String(100), nullable=True)


class UserMailboxConsent(Base):
    __tablename__ = "user_mailbox_consents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_email = Column(String(255), nullable=True)
    provider = Column(String(50), default="google", nullable=False)
    consent_given = Column(Boolean, default=False, nullable=False)
    consent_timestamp = Column(DateTime, nullable=True)
    scopes_granted = Column(Text, nullable=True)
    is_sync_enabled = Column(Boolean, default=False, nullable=False)
    auto_create_applications = Column(Boolean, default=True, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)
    last_history_id = Column(String(255), nullable=True)
    refresh_token = Column(Text, nullable=True)
    access_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    watch_expiration = Column(DateTime, nullable=True)
    pubsub_topic = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


class SavedJob(Base):
    __tablename__ = "saved_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=False, index=True)
    company_logo_color = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    job_type = Column(String(100), nullable=True)  # Full-time, Remote, etc.
    salary_range = Column(String(255), nullable=True)
    job_url = Column(String(1024), nullable=True)
    tags = Column(Text, nullable=True)  # JSON or comma-separated
    posted_date = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class CompanyCareerPage(Base):
    __tablename__ = "company_career_pages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, unique=True, index=True)
    slug = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False, default="greenhouse")  # greenhouse, lever, ashby, workable, json_ld
    domain = Column(String(255), nullable=True)
    career_url = Column(String(1024), nullable=True)
    logo_color = Column(String(50), nullable=True, default="#60a5fa")
    is_active = Column(Boolean, default=True, nullable=False)
    sync_frequency_hours = Column(Float, default=24.0, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(50), default="idle", nullable=False)
    last_error_message = Column(Text, nullable=True)
    total_jobs_found = Column(Float, default=0.0, nullable=False)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

