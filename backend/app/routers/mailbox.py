import json
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
import base64
from urllib.parse import quote
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.config import TOKEN_FILE, GOOGLE_REDIRECT_URI, GMAIL_PUBSUB_TOPIC, FRONTEND_URL
from app.db.database import get_db, SessionLocal
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
    get_google_auth_url,
    exchange_oauth_code,
    setup_gmail_watch,
    stop_gmail_watch,
)
from app.services.background_worker import background_worker

from app.services.mailbox_sync import (

    sync_mailbox_events,
    sync_mailbox_history_events,
)
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
    try:
        consent = get_or_create_consent(db)
        has_token = bool(consent.refresh_token or os.path.exists(TOKEN_FILE))
        consent.consent_given = has_token
        consent.is_sync_enabled = has_token
        db.commit()

        total_logs = db.query(EmailLog).count()
        matched_logs = db.query(EmailLog).filter(EmailLog.match_status.in_(["matched_auto", "suggested"])).count()
        pending_discoveries_count = db.query(EmailLog).filter(EmailLog.match_status == "untracked_candidate").count()

        watch_exp = consent.watch_expiration
        if watch_exp is not None and watch_exp.tzinfo is None:
            watch_exp = watch_exp.replace(tzinfo=timezone.utc)
        is_watch_active = bool(watch_exp and watch_exp > utc_now())

        return {
            "id": consent.id,
            "user_email": consent.user_email,
            "provider": consent.provider,
            "consent_given": consent.consent_given,
            "is_sync_enabled": consent.is_sync_enabled,
            "auto_create_applications": consent.auto_create_applications,
            "scopes_granted": consent.scopes_granted,
            "last_synced_at": consent.last_synced_at.isoformat() if consent.last_synced_at else None,
            "last_history_id": consent.last_history_id,
            "watch_expiration": consent.watch_expiration.isoformat() if consent.watch_expiration else None,
            "watch_active": is_watch_active,
            "pubsub_topic": consent.pubsub_topic or GMAIL_PUBSUB_TOPIC,
            "has_token_file": has_token,
            "background_sync": background_worker.get_status(),
            "stats": {
                "total_processed_emails": total_logs,
                "total_matched_updates": matched_logs,
                "pending_discoveries_count": pending_discoveries_count,
            },
        }
    except Exception as e:
        logger.error("Error retrieving mailbox status: %s", e, exc_info=True)
        has_file = os.path.exists(TOKEN_FILE)
        return {
            "id": None,
            "user_email": None,
            "provider": "google",
            "consent_given": has_file,
            "is_sync_enabled": has_file,
            "auto_create_applications": True,
            "scopes_granted": None,
            "last_synced_at": None,
            "last_history_id": None,
            "watch_expiration": None,
            "watch_active": False,
            "pubsub_topic": GMAIL_PUBSUB_TOPIC,
            "has_token_file": has_file,
            "background_sync": background_worker.get_status(),
            "stats": {
                "total_processed_emails": 0,
                "total_matched_updates": 0,
                "pending_discoveries_count": 0,
            },
            "error": str(e),
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
        if is_sync_authorized(db):
            return grant_consent(db)
        else:
            return perform_google_login(db)
    else:
        return revoke_consent(db)


def get_effective_redirect_uri(request: Request) -> str:
    """Determine the OAuth callback redirect URI based on config or request headers."""
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")

    # If request is from local dev server
    if "localhost" in host or "127.0.0.1" in host or "localhost" in origin or "localhost" in referer:
        return "http://localhost:3000/api/mailbox/callback"

    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI

    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{proto}://{host}/api/mailbox/callback"


@router.post("/connect-google")
def connect_google_mailbox(request: Request, db: Session = Depends(get_db)):
    """
    Launch Google OAuth flow.
    Returns auth_url for Web flow, or falls back to desktop browser server for local development.
    """
    redirect_uri = get_effective_redirect_uri(request)
    try:
        auth_url = get_google_auth_url(redirect_uri)
        return {"auth_url": auth_url, "redirect_uri": redirect_uri}
    except Exception as e:
        logger.warning("Web OAuth flow could not be created: %s. Attempting local desktop flow.", e)
        try:
            return perform_google_login(db)
        except Exception as local_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google authentication could not be initiated: {str(e)}",
            )


@router.get("/callback")
def google_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Google OAuth redirect handler for web deployments.
    Exchanges code for tokens, saves to DB, auto-registers event-based Pub/Sub watch, and redirects user to frontend.
    """
    host = request.headers.get("x-forwarded-host", request.headers.get("host", request.url.netloc))
    is_local = "localhost" in host or "127.0.0.1" in host
    target_frontend = "http://localhost:3000" if is_local else FRONTEND_URL

    if error:
        return RedirectResponse(url=f"{target_frontend}/?oauth=error&msg={quote(error)}")
    if not code:
        return RedirectResponse(url=f"{target_frontend}/?oauth=error&msg=missing_code")

    redirect_uri = get_effective_redirect_uri(request)
    try:
        consent = exchange_oauth_code(code=code, redirect_uri=redirect_uri, db=db)
        return RedirectResponse(url=f"{target_frontend}/?oauth=success")
    except Exception as e:
        logger.error("OAuth code exchange failed: %s", e)
        return RedirectResponse(url=f"{target_frontend}/?oauth=error&msg={quote(str(e))}")


@router.post("/sync")
def trigger_sync(query: Optional[str] = None, db: Session = Depends(get_db)):
    """Trigger on-demand mailbox status capture sync from Gmail."""
    result = sync_mailbox_events(db, query=query)
    return result


@router.post("/disconnect", response_model=MailboxConsentRead)
def disconnect_mailbox(db: Session = Depends(get_db)):
    """Disconnect mailbox, stop Gmail watch, revoke token online, and delete credentials."""
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


# =============================================================================
# Background Sync & Event-Based Tracking Controls
# =============================================================================

class BackgroundSyncConfigPayload(BaseModel):
    interval_seconds: int = Field(120, ge=10, le=3600, description="Interval in seconds between background sync loops")



@router.get("/background-sync")
def get_background_sync_status():
    """Retrieve the real-time operational status and telemetry of the background sync worker."""
    return background_worker.get_status()


@router.post("/background-sync/start")
async def start_background_sync():
    """Start or resume the periodic background sync worker."""
    await background_worker.start()
    return background_worker.get_status()


@router.post("/background-sync/stop")
async def stop_background_sync():
    """Pause the background sync worker."""
    await background_worker.stop()
    return background_worker.get_status()


@router.post("/background-sync/configure")
def configure_background_sync(payload: BackgroundSyncConfigPayload):
    """Configure the background sync loop interval in seconds."""
    background_worker.set_interval(payload.interval_seconds)
    return background_worker.get_status()


@router.post("/background-sync/trigger")
async def trigger_background_sync_cycle():
    """Immediately trigger a background sync run without waiting for the timer."""
    result = await background_worker.trigger_cycle()
    return {
        "status": "success",
        "result": result,
        "worker": background_worker.get_status(),
    }


# =============================================================================
# Google Cloud Pub/Sub Webhook & Push Notification Handlers
# =============================================================================

@router.post("/webhook")
@router.post("/pubsub")
async def gmail_pubsub_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Push endpoint for Google Cloud Pub/Sub Gmail notifications.
    Immediately returns HTTP 200 OK so Pub/Sub marks messages as ACKed.
    Decodes the Gmail notification payload and kicks off incremental history sync.
    """
    try:
        raw_body = await request.body()
        if not raw_body:
            return Response(
                status_code=status.HTTP_200_OK,
                content=json.dumps({"status": "ok", "message": "empty_body"}),
                media_type="application/json",
            )

        try:
            body = json.loads(raw_body.decode("utf-8"))
        except Exception:
            # If body is not json, still return 200 to prevent infinite pubsub retries
            return Response(
                status_code=status.HTTP_200_OK,
                content=json.dumps({"status": "ok", "message": "non_json"}),
                media_type="application/json",
            )

        message = body.get("message", {})
        data_b64 = message.get("data")
        subscription = body.get("subscription", "")
        message_id = message.get("messageId", "")

        logger.info(
            "Received Pub/Sub push notification from subscription: %s, messageId: %s",
            subscription,
            message_id,
        )

        if not data_b64:
            # Verification ping or heartbeat from Google Cloud Pub/Sub
            return Response(
                status_code=status.HTTP_200_OK,
                content=json.dumps({"status": "ok", "message": "verified"}),
                media_type="application/json",
            )

        # Decode base64 payload from Gmail: {"emailAddress": "...", "historyId": "..."}
        try:
            # Add padding if required
            padding = 4 - (len(data_b64) % 4)
            if padding and padding < 4:
                data_b64 += "=" * padding
            decoded_bytes = base64.urlsafe_b64decode(data_b64)
            payload_data = json.loads(decoded_bytes.decode("utf-8"))
        except Exception as dec_err:
            logger.warning("Could not decode Pub/Sub message data: %s", dec_err)
            payload_data = {}

        target_email = payload_data.get("emailAddress")
        history_id = payload_data.get("historyId")
        logger.info("Gmail notification decoded: email=%s, historyId=%s", target_email, history_id)

        # Dispatch async background sync cycle so HTTP 200 is returned immediately
        def _run_pubsub_sync(user_email: Optional[str]):
            try:
                with SessionLocal() as session:
                    query = session.query(UserMailboxConsent).filter(
                        UserMailboxConsent.consent_given == True,  # noqa: E712
                        UserMailboxConsent.is_sync_enabled == True,  # noqa: E712
                    )
                    if user_email:
                        target_consent = query.filter(UserMailboxConsent.user_email == user_email).first()
                        consents_to_sync = [target_consent] if target_consent else query.all()
                    else:
                        consents_to_sync = query.all()

                    for c in consents_to_sync:
                        try:
                            logger.info("Triggering incremental history sync for %s via Pub/Sub event", c.user_email)
                            sync_mailbox_history_events(session, consent=c)
                        except Exception as sync_err:
                            logger.error("Error during Pub/Sub triggered sync for %s: %s", c.user_email, sync_err)
            except Exception as bg_err:
                logger.error("Error in background Pub/Sub sync runner: %s", bg_err)

        background_tasks.add_task(_run_pubsub_sync, target_email)

        return Response(
            status_code=status.HTTP_200_OK,
            content=json.dumps({"status": "ok", "message": "acknowledged", "historyId": history_id}),
            media_type="application/json",
        )

    except Exception as e:
        logger.error("Unhandled error in Pub/Sub webhook: %s", e, exc_info=True)
        # MUST return 200 OK so Pub/Sub does not enter an infinite retry loop with un-acked messages
        return Response(
            status_code=status.HTTP_200_OK,
            content=json.dumps({"status": "ok", "error": "logged"}),
            media_type="application/json",
        )


@router.get("/webhook")
@router.get("/pubsub")
def verify_pubsub_endpoint():
    """Health check & verification endpoint for Google Cloud Pub/Sub."""
    return {
        "status": "online",
        "service": "Gmail Pub/Sub Webhook",
        "endpoints": ["/api/mailbox/webhook", "/api/mailbox/pubsub"],
        "topic": GMAIL_PUBSUB_TOPIC,
    }


@router.post("/watch/setup")
def register_watch_endpoint(db: Session = Depends(get_db)):
    """Manually register or renew Gmail users().watch with Cloud Pub/Sub topic."""
    consent = get_or_create_consent(db)
    if not is_sync_authorized(db, consent):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mailbox sync is not authorized. Please connect your Gmail account first.",
        )
    res = setup_gmail_watch(db, consent)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to establish Gmail watch. Please ensure your Google Cloud Pub/Sub topic "
                f"'{consent.pubsub_topic or GMAIL_PUBSUB_TOPIC}' has granted the 'Pub/Sub Publisher' "
                "role to 'gmail-api-push@system.gserviceaccount.com'."
            ),
        )
    return {
        "status": "success",
        "message": "Gmail watch registered successfully.",
        "watch_expiration": consent.watch_expiration.isoformat() if consent.watch_expiration else None,
        "history_id": consent.last_history_id,
        "topic": consent.pubsub_topic or GMAIL_PUBSUB_TOPIC,
    }


@router.post("/watch/stop")
def stop_watch_endpoint(db: Session = Depends(get_db)):
    """Stop Gmail push notifications and clear watch expiration."""
    consent = get_or_create_consent(db)
    stop_gmail_watch(db, consent)
    return {
        "status": "success",
        "message": "Gmail watch stopped.",
    }

