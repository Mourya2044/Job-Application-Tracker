import json
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.config import TOKEN_FILE
from app.db.database import get_db
from app.db.models import Application, ApplicationStatusEvent, EmailLog, UserMailboxConsent, utc_now
from app.schemas.consent import MailboxConsentRead, MailboxConsentUpdate
from app.schemas.application import ApplicationRead
from app.services.change_tracker import apply_auto_stage_change
from app.services.consent_manager import (
    get_or_create_consent,
    grant_consent,
    is_sync_authorized,
    perform_google_login,
    revoke_consent,
)
from app.services.mailbox_sync import sync_mailbox_events
from app.services.resolver import resolve_application_match
from app.services.status_extractor import extract_email_status_event

router = APIRouter(prefix="/api/mailbox", tags=["mailbox"])


class SimulateEmailPayload(BaseModel):
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body text")
    sender: str = Field("recruiter@company.com", description="Sender email address")


@router.get("/status")
def get_mailbox_status(db: Session = Depends(get_db)):
    """Check mailbox connection status, OAuth permissions, and live sync statistics."""
    consent = get_or_create_consent(db)
    has_token = os.path.exists(TOKEN_FILE)
    consent.consent_given = has_token
    consent.is_sync_enabled = has_token
    db.commit()

    total_logs = db.query(EmailLog).count()
    matched_logs = db.query(EmailLog).filter(EmailLog.match_status.in_(["matched_auto", "suggested"])).count()
    pending_discoveries_count = db.query(EmailLog).filter(EmailLog.match_status == "untracked_candidate").count()

    return {
        "id": consent.id,
        "user_email": consent.user_email,
        "provider": consent.provider,
        "consent_given": consent.consent_given,
        "is_sync_enabled": consent.is_sync_enabled,
        "auto_create_applications": consent.auto_create_applications,
        "scopes_granted": consent.scopes_granted,
        "last_synced_at": consent.last_synced_at.isoformat() if consent.last_synced_at else None,
        "has_token_file": has_token,
        "stats": {
            "total_processed_emails": total_logs,
            "total_matched_updates": matched_logs,
            "pending_discoveries_count": pending_discoveries_count,
        },
    }


@router.get("/pending-discoveries")
def get_pending_discoveries(db: Session = Depends(get_db)):
    """Get all untracked applications discovered in emails awaiting user confirmation."""
    logs = db.query(EmailLog).filter(EmailLog.match_status == "untracked_candidate").order_by(desc(EmailLog.processed_at)).all()
    results = []
    for log in logs:
        raw_info = json.loads(log.raw_classification) if log.raw_classification else {}
        results.append({
            "log_id": log.id,
            "message_id": log.message_id,
            "sender": log.sender,
            "subject": log.subject,
            "snippet": log.snippet,
            "received_at": log.received_at.isoformat() if log.received_at else None,
            "company_name": log.detected_company or raw_info.get("company_name", "Unknown Company"),
            "company_domain": raw_info.get("company_domain"),
            "role_title": raw_info.get("role_title", "Software Engineer"),
            "suggested_stage": log.detected_stage or raw_info.get("target_lifecycle_stage", "applied"),
            "summary_sentence": raw_info.get("summary_sentence"),
            "action_deadline": raw_info.get("action_deadline"),
            "interview_date_time": raw_info.get("interview_date_time"),
            "meeting_link": raw_info.get("meeting_link"),
            "confidence": raw_info.get("confidence", 0.9),
        })
    return results


@router.post("/accept-discovery/{log_id}", response_model=ApplicationRead)
def accept_discovered_application(log_id: str, db: Session = Depends(get_db)):
    """Confirm tracking a discovered application from email."""
    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Email log not found")

    raw_info = json.loads(log.raw_classification) if log.raw_classification else {}
    company_name = log.detected_company or raw_info.get("company_name")
    if not company_name:
        raise HTTPException(status_code=400, detail="Cannot track application without company name")

    target_stage = log.detected_stage or raw_info.get("target_lifecycle_stage", "applied")
    role_title = raw_info.get("role_title") or "Software Engineer"
    
    # Create the application
    app = Application(
        company_name=company_name,
        company_domain=raw_info.get("company_domain"),
        role_title=role_title,
        current_stage=target_stage,
        last_status_change_at=utc_now(),
        last_status_change_source="mailbox_auto",
        next_step=raw_info.get("summary_sentence") or (f"Interview on {raw_info.get('interview_date_time')}" if raw_info.get('interview_date_time') else None) or (f"Deadline: {raw_info.get('action_deadline')}" if raw_info.get('action_deadline') else None),
        interview_link=raw_info.get("meeting_link"),
    )
    db.add(app)
    db.flush()

    # Log initial status change event
    event = ApplicationStatusEvent(
        application_id=app.id,
        from_stage=None,
        to_stage=target_stage,
        changed_at=utc_now(),
        trigger_source="mailbox_auto",
        confidence_score=raw_info.get("confidence", 1.0),
        change_summary=f"Discovered and confirmed from email: {log.subject}",
        email_message_id=log.message_id,
        email_subject=log.subject,
        email_snippet=log.snippet,
        extracted_metadata=log.raw_classification,
    )
    db.add(event)

    # Update email log match status
    log.matched_application_id = app.id
    log.match_status = "matched_auto"
    db.commit()
    db.refresh(app)
    return app


@router.post("/dismiss-discovery/{log_id}")
def dismiss_discovered_application(log_id: str, db: Session = Depends(get_db)):
    """Dismiss a discovered email candidate so it is not tracked."""
    log = db.query(EmailLog).filter(EmailLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Email log not found")

    log.match_status = "ignored"
    db.commit()
    return {"message": "Discovery dismissed."}


@router.get("/activity")
def get_sync_activity(limit: int = 25, db: Session = Depends(get_db)):
    """Get the recent stream of processed emails and status capture events."""
    logs = db.query(EmailLog).order_by(desc(EmailLog.processed_at)).limit(limit).all()
    results = []
    for log in logs:
        matched_app_name = None
        if log.matched_application_id:
            app = db.query(Application).filter(Application.id == log.matched_application_id).first()
            if app:
                matched_app_name = app.company_name

        raw_info = json.loads(log.raw_classification) if log.raw_classification else {}
        results.append({
            "id": log.id,
            "message_id": log.message_id,
            "sender": log.sender,
            "subject": log.subject,
            "snippet": log.snippet,
            "processed_at": log.processed_at.isoformat(),
            "detected_company": log.detected_company,
            "detected_stage": log.detected_stage,
            "matched_application_id": log.matched_application_id,
            "matched_company_name": matched_app_name,
            "match_status": log.match_status,
            "classification": raw_info,
        })
    return results


@router.post("/consent", response_model=MailboxConsentRead)
def update_consent(payload: MailboxConsentUpdate, db: Session = Depends(get_db)):
    """Grant or revoke user consent for mailbox reading, launching OAuth if needed."""
    if payload.consent_given:
        if os.path.exists(TOKEN_FILE):
            return grant_consent(db)
        else:
            return perform_google_login(db)
    else:
        return revoke_consent(db)


@router.post("/connect-google", response_model=MailboxConsentRead)
def connect_google_mailbox(db: Session = Depends(get_db)):
    """Launch Google OAuth flow in user's browser, login, and obtain Gmail tokens."""
    return perform_google_login(db)


@router.post("/sync")
def trigger_sync(db: Session = Depends(get_db)):
    """Trigger on-demand mailbox status capture sync from Gmail."""
    result = sync_mailbox_events(db)
    return result


@router.post("/disconnect", response_model=MailboxConsentRead)
def disconnect_mailbox(db: Session = Depends(get_db)):
    """Disconnect mailbox, revoke token online, and delete local credentials."""
    return revoke_consent(db)


@router.post("/simulate-email")
def simulate_incoming_email(payload: SimulateEmailPayload, db: Session = Depends(get_db)):
    """
    Simulate an incoming ATS / employer email (e.g. Interview invitation, OA link, Rejection, Offer)
    to test and demonstrate automated status capture and entity resolution.
    """
    msg_id = f"sim-{uuid.uuid4().hex[:10]}"
    
    # Extract event
    event = extract_email_status_event(
        subject=payload.subject,
        raw_body=payload.body,
        sender=payload.sender,
    )

    if not event.is_job_related:
        return {
            "status": "ignored",
            "message": "Email classified as not job-related.",
            "event": event.model_dump(),
        }

    # Resolve match
    matched_app = resolve_application_match(db, event, sender=payload.sender, subject=payload.subject)
    match_status = "unmatched"
    matched_app_id = None
    applied_change = None

    if matched_app:
        matched_app_id = matched_app.id
        old_stage = matched_app.current_stage
        
        apply_auto_stage_change(
            db=db,
            application=matched_app,
            event_data=event,
            email_message_id=msg_id,
            email_subject=payload.subject,
            email_snippet=payload.body[:200],
        )

        match_status = "matched_auto" if not matched_app.stage_locked else "suggested"
        applied_change = {
            "application_id": matched_app.id,
            "company_name": matched_app.company_name,
            "old_stage": old_stage,
            "new_stage": matched_app.current_stage,
            "locked": matched_app.stage_locked,
            "pending_suggestion": json.loads(matched_app.pending_suggestion) if matched_app.pending_suggestion else None,
            "is_new": False,
        }
    elif event.company_name and event.is_job_related:
        # Untracked application found -> queue for user confirmation!
        match_status = "untracked_candidate"
        applied_change = {
            "application_id": None,
            "company_name": event.company_name,
            "old_stage": "None",
            "new_stage": event.target_lifecycle_stage.value if event.target_lifecycle_stage else "applied",
            "locked": False,
            "pending_suggestion": None,
            "is_pending_confirmation": True,
        }

    # Record email log
    log = EmailLog(
        message_id=msg_id,
        thread_id=f"thread-{msg_id}",
        sender=payload.sender,
        subject=payload.subject,
        snippet=payload.body[:200],
        received_at=utc_now(),
        detected_company=event.company_name,
        detected_stage=event.target_lifecycle_stage.value if event.target_lifecycle_stage else None,
        matched_application_id=matched_app_id,
        match_status=match_status,
        raw_classification=json.dumps(event.model_dump()),
    )
    db.add(log)
    db.commit()

    return {
        "status": "success",
        "matched": bool(applied_change),
        "matched_application": applied_change,
        "extracted_event": event.model_dump(),
    }
