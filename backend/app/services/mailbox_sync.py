import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.config import TOKEN_FILE, GMAIL_SCOPES, GMAIL_PUBSUB_TOPIC
from app.db.models import Application, ApplicationStatusEvent, EmailLog, UserMailboxConsent, utc_now
from app.services.change_tracker import apply_auto_stage_change
from app.services.consent_manager import (
    get_or_create_consent,
    is_sync_authorized,
    get_current_credentials,
)
from app.services.resolver import resolve_application_match, resolve_application_match_with_details
from app.services.status_extractor import extract_email_status_event, sanitize_email_body

logger = logging.getLogger(__name__)


def decode_body(data: Optional[str]) -> str:
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
    except Exception:
        return ""


def get_header(payload: dict, name: str) -> str:
    for header in payload.get("headers", []):
        if header.get("name", "").lower() == name.lower():
            return header.get("value", "")
    return ""


def get_email_body(payload: dict) -> str:
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        return decode_body(payload.get("body", {}).get("data"))
    if mime == "text/html":
        html = decode_body(payload.get("body", {}).get("data"))
        return sanitize_email_body(html)
    for part in payload.get("parts", []):
        body = get_email_body(part)
        if body:
            return body
    if payload.get("body", {}).get("data"):
        return decode_body(payload["body"]["data"])
    return ""


def get_gmail_credentials(
    consent: Optional[UserMailboxConsent] = None,
    db: Optional[Session] = None,
) -> Optional[Credentials]:
    return get_current_credentials(db=db, consent=consent)



TARGETED_JOB_QUERY = (
    "newer_than:7d -in:trash -in:spam ("
    "application OR applied OR applying OR interview OR assessment OR offer OR rejected OR recruiter OR "
    "careers OR greenhouse OR lever OR workday OR ashby OR hackerrank OR codesignal OR "
    "smartrecruiters OR hirevue OR testgorilla OR talent OR \"status update\" OR \"thank you for applying\" OR "
    "\"received your\" OR \"submission\" OR \"candidate\" OR \"candidacy\" OR \"interest in\" OR \"next steps\""
    ")"
)


def process_single_email_message(
    db: Session,
    service,
    msg_id: str,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Idempotent single email processor with dead-letter failure isolation.
    Guarantees duplicate delivery does not create redundant status transitions.
    """
    existing_log = db.query(EmailLog).filter(EmailLog.message_id == msg_id).first()
    if existing_log and existing_log.processing_status == "processed":
        return {"status": "duplicate_skipped", "message_id": msg_id, "updated": False}

    attempts = (existing_log.processing_attempts if existing_log else 0.0) + 1.0

    try:
        msg = service.users().messages().get(userId="me", id=msg_id).execute()
        payload = msg.get("payload", {})
        subject = get_header(payload, "Subject")
        sender = get_header(payload, "From")
        raw_body = get_email_body(payload)
        snippet = msg.get("snippet", "")

        event = extract_email_status_event(subject=subject, raw_body=raw_body, sender=sender)

        if not event.is_job_related:
            if not existing_log:
                existing_log = EmailLog(message_id=msg_id)
                db.add(existing_log)
            existing_log.thread_id = msg.get("threadId")
            existing_log.sender = sender
            existing_log.subject = subject
            existing_log.snippet = snippet
            existing_log.received_at = utc_now()
            existing_log.match_status = "non_job"
            existing_log.processing_status = "processed"
            existing_log.processing_attempts = attempts
            existing_log.correlation_id = correlation_id
            existing_log.raw_classification = json.dumps(event.model_dump())
            db.commit()
            return {"status": "non_job", "message_id": msg_id, "updated": False}

        matched_app, match_details = resolve_application_match_with_details(
            db, event, sender=sender, subject=subject
        )
        match_status = "unmatched"
        matched_app_id = None
        updated_app_info = None

        if matched_app:
            matched_app_id = matched_app.id
            match_status = "matched_auto" if not matched_app.stage_locked else "suggested"

            apply_auto_stage_change(
                db=db,
                application=matched_app,
                event_data=event,
                email_message_id=msg_id,
                email_subject=subject,
                email_snippet=snippet,
                decision_details=match_details,
            )
            updated_app_info = {
                "application_id": matched_app.id,
                "company_name": matched_app.company_name,
                "new_stage": matched_app.current_stage,
                "event_category": event.event_category,
                "is_new": False,
            }
        elif event.company_name and event.is_job_related:
            match_status = "untracked_candidate"
            updated_app_info = {
                "application_id": None,
                "company_name": event.company_name,
                "new_stage": event.target_lifecycle_stage.value if event.target_lifecycle_stage else "applied",
                "event_category": event.event_category,
                "is_pending_confirmation": True,
            }

        if not existing_log:
            existing_log = EmailLog(message_id=msg_id)
            db.add(existing_log)

        existing_log.thread_id = msg.get("threadId")
        existing_log.sender = sender
        existing_log.subject = subject
        existing_log.snippet = snippet
        existing_log.received_at = utc_now()
        existing_log.detected_company = event.company_name
        existing_log.detected_stage = event.target_lifecycle_stage.value if event.target_lifecycle_stage else None
        existing_log.matched_application_id = matched_app_id
        existing_log.match_status = match_status
        existing_log.processing_status = "processed"
        existing_log.processing_attempts = attempts
        existing_log.correlation_id = correlation_id
        existing_log.error_details = None
        existing_log.raw_classification = json.dumps(event.model_dump())
        db.commit()

        return {
            "status": "processed",
            "message_id": msg_id,
            "updated": bool(updated_app_info),
            "app_info": updated_app_info,
        }

    except Exception as exc:
        logger.error("Error processing email message %s: %s", msg_id, exc)
        if not existing_log:
            existing_log = EmailLog(message_id=msg_id)
            db.add(existing_log)
        existing_log.processing_status = "failed"
        existing_log.processing_attempts = attempts
        existing_log.error_details = str(exc)[:1000]
        existing_log.correlation_id = correlation_id
        try:
            db.commit()
        except Exception:
            db.rollback()
        return {"status": "failed", "message_id": msg_id, "updated": False, "error": str(exc)}


def sync_mailbox_events(
    db: Session,
    query: Optional[str] = None,
    consent: Optional[UserMailboxConsent] = None,
) -> Dict:
    if query is None:
        query = TARGETED_JOB_QUERY

    if consent is None:
        consent = get_or_create_consent(db)

    if not is_sync_authorized(db, consent):
        return {
            "status": "unauthorized",
            "message": "Mailbox sync consent has not been granted or credentials are missing.",
            "processed_count": 0,
            "updates_count": 0,
        }

    creds = get_gmail_credentials(consent, db=db)
    if not creds:
        return {
            "status": "auth_required",
            "message": "Google OAuth credentials expired or missing. Please reconnect mailbox.",
            "processed_count": 0,
            "updates_count": 0,
        }

    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        results = service.users().messages().list(userId="me", q=query, maxResults=100).execute()
        messages = results.get("messages", [])

        processed_count = 0
        updates_count = 0
        updated_applications = []

        for msg_meta in messages:
            msg_id = msg_meta["id"]
            res = process_single_email_message(db, service, msg_id)
            if res.get("status") in ("processed", "non_job"):
                processed_count += 1
            if res.get("updated") and res.get("app_info"):
                updates_count += 1
                updated_applications.append(res["app_info"])

        # Update last synced time & historyId on consent record
        consent.last_synced_at = utc_now()
        try:
            profile = service.users().getProfile(userId="me").execute()
            if profile.get("historyId"):
                consent.last_history_id = str(profile.get("historyId"))
        except Exception:
            pass
        db.commit()

        return {
            "status": "success",
            "processed_count": processed_count,
            "updates_count": updates_count,
            "updated_applications": updated_applications,
            "last_synced_at": consent.last_synced_at.isoformat(),
            "history_id": consent.last_history_id,
        }

    except HttpError as error:
        logger.error("Gmail API error during sync: %s", error)
        return {
            "status": "error",
            "message": f"Gmail API error: {str(error)}",
            "processed_count": 0,
            "updates_count": 0,
        }


def sync_mailbox_history_events(
    db: Session,
    consent: Optional[UserMailboxConsent] = None,
) -> Dict:
    """
    Incremental Event-Based Status Sync:
    Uses Gmail users().history().list(startHistoryId=...) to detect and process only new emails
    that arrived since the last history marker.
    """
    if consent is None:
        consent = get_or_create_consent(db)

    if not is_sync_authorized(db, consent):
        return {
            "status": "unauthorized",
            "message": "Mailbox sync consent has not been granted or credentials are missing.",
            "processed_count": 0,
            "updates_count": 0,
        }

    creds = get_gmail_credentials(consent, db=db)
    if not creds:
        return {
            "status": "auth_required",
            "message": "Google OAuth credentials expired or missing. Please reconnect mailbox.",
            "processed_count": 0,
            "updates_count": 0,
        }

    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)

        # If no historyId yet, do initial baseline sync
        if not consent.last_history_id:
            logger.info("No last_history_id found for %s; performing baseline sync", consent.user_email)
            result = sync_mailbox_events(db, consent=consent)
            return result

        # Incremental event sync query
        try:
            history_res = (
                service.users()
                .history()
                .list(
                    userId="me",
                    startHistoryId=consent.last_history_id,
                )
                .execute()
            )
        except HttpError as http_err:
            if http_err.resp.status in (404, 400):
                # History ID has expired (older than ~30 days or invalidated) -> reconciliation fallback
                logger.warning(
                    "History ID %s expired for %s (status %s); running reconciliation sync",
                    consent.last_history_id,
                    consent.user_email,
                    http_err.resp.status,
                )
                consent.last_history_id = None
                db.commit()
                result = sync_mailbox_events(db, query="newer_than:7d", consent=consent)
                return result
            raise http_err

        records = history_res.get("history", [])
        new_msg_ids = set()
        for rec in records:
            for added in rec.get("messagesAdded", []):
                mid = added.get("message", {}).get("id")
                if mid:
                    new_msg_ids.add(mid)
            for msg in rec.get("messages", []):
                mid = msg.get("id")
                if mid:
                    new_msg_ids.add(mid)
            for label_added in rec.get("labelsAdded", []):
                mid = label_added.get("message", {}).get("id")
                if mid:
                    new_msg_ids.add(mid)

        # Fallback safeguard: if history list returned 0 new messages but an event triggered,
        # inspect recent messages (last 5) to catch any newly arrived message that was filed under inbox/updates
        if not new_msg_ids:
            try:
                recent_res = service.users().messages().list(userId="me", maxResults=5).execute()
                for m in recent_res.get("messages", []):
                    mid = m.get("id")
                    if mid:
                        if not db.query(EmailLog.id).filter(EmailLog.message_id == mid).first():
                            new_msg_ids.add(mid)
            except Exception as recent_err:
                logger.debug("Recent messages fallback check error: %s", recent_err)

        processed_count = 0
        updates_count = 0
        updated_applications = []

        for msg_id in new_msg_ids:
            res = process_single_email_message(db, service, msg_id)
            if res.get("status") in ("processed", "non_job"):
                processed_count += 1
            if res.get("updated") and res.get("app_info"):
                updates_count += 1
                updated_applications.append(res["app_info"])

        # Update consent record with new historyId
        new_history_id = history_res.get("historyId")
        if new_history_id:
            consent.last_history_id = str(new_history_id)
        consent.last_synced_at = utc_now()
        db.commit()

        return {
            "status": "success",
            "processed_count": processed_count,
            "updates_count": updates_count,
            "updated_applications": updated_applications,
            "last_synced_at": consent.last_synced_at.isoformat(),
            "history_id": consent.last_history_id,
        }

    except HttpError as error:
        logger.error("Gmail API error during history sync: %s", error)
        return {
            "status": "error",
            "message": f"Gmail API error: {str(error)}",
            "processed_count": 0,
            "updates_count": 0,
        }

