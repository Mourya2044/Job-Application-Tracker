import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
from bs4 import BeautifulSoup
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.config import CREDENTIALS_FILE, TOKEN_FILE, GMAIL_SCOPES, GMAIL_PUBSUB_TOPIC
from app.db.models import Application, ApplicationStatusEvent, EmailLog, UserMailboxConsent, utc_now
from app.services.change_tracker import apply_auto_stage_change
from app.services.consent_manager import (
    get_or_create_consent,
    is_sync_authorized,
    get_client_config,
    get_current_credentials,
)
from app.services.resolver import resolve_application_match
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

            # Check if email already processed
            existing_log = db.query(EmailLog).filter(EmailLog.message_id == msg_id).first()
            if existing_log:
                continue

            # Fetch full message
            msg = service.users().messages().get(userId="me", id=msg_id).execute()
            payload = msg.get("payload", {})
            subject = get_header(payload, "Subject")
            sender = get_header(payload, "From")
            raw_body = get_email_body(payload)
            snippet = msg.get("snippet", "")

            # Classify & extract event
            event = extract_email_status_event(subject=subject, raw_body=raw_body, sender=sender)
            processed_count += 1

            if not event.is_job_related:
                continue

            # Resolve to existing application
            matched_app = resolve_application_match(db, event, sender=sender, subject=subject)
            match_status = "unmatched"
            matched_app_id = None

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
                )
                updates_count += 1
                updated_applications.append({
                    "application_id": matched_app.id,
                    "company_name": matched_app.company_name,
                    "new_stage": matched_app.current_stage,
                    "event_category": event.event_category,
                    "is_new": False,
                })
            elif event.company_name and event.is_job_related:
                match_status = "untracked_candidate"
                updates_count += 1
                updated_applications.append({
                    "application_id": None,
                    "company_name": event.company_name,
                    "new_stage": event.target_lifecycle_stage.value if event.target_lifecycle_stage else "applied",
                    "event_category": event.event_category,
                    "is_pending_confirmation": True,
                })

            email_log = EmailLog(
                message_id=msg_id,
                thread_id=msg.get("threadId"),
                sender=sender,
                subject=subject,
                snippet=snippet,
                received_at=utc_now(),
                detected_company=event.company_name,
                detected_stage=event.target_lifecycle_stage.value if event.target_lifecycle_stage else None,
                matched_application_id=matched_app_id,
                match_status=match_status,
                raw_classification=json.dumps(event.model_dump()),
            )
            db.add(email_log)
            db.commit()

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
            if http_err.resp.status == 404:
                # History ID has expired (older than ~30 days) -> fallback to baseline query
                logger.warning("History ID expired for %s; running fallback sync", consent.user_email)
                result = sync_mailbox_events(db, consent=consent)
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
            # Check if email already processed
            existing_log = db.query(EmailLog).filter(EmailLog.message_id == msg_id).first()
            if existing_log:
                continue

            msg = service.users().messages().get(userId="me", id=msg_id).execute()
            payload = msg.get("payload", {})
            subject = get_header(payload, "Subject")
            sender = get_header(payload, "From")
            raw_body = get_email_body(payload)
            snippet = msg.get("snippet", "")

            # Classify & extract event
            event = extract_email_status_event(subject=subject, raw_body=raw_body, sender=sender)
            processed_count += 1

            if not event.is_job_related:
                continue

            # Resolve to existing application
            matched_app = resolve_application_match(db, event, sender=sender, subject=subject)
            match_status = "unmatched"
            matched_app_id = None

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
                )
                updates_count += 1
                updated_applications.append({
                    "application_id": matched_app.id,
                    "company_name": matched_app.company_name,
                    "new_stage": matched_app.current_stage,
                    "event_category": event.event_category,
                    "is_new": False,
                })
            elif event.company_name and event.is_job_related:
                match_status = "untracked_candidate"
                updates_count += 1
                updated_applications.append({
                    "application_id": None,
                    "company_name": event.company_name,
                    "new_stage": event.target_lifecycle_stage.value if event.target_lifecycle_stage else "applied",
                    "event_category": event.event_category,
                    "is_pending_confirmation": True,
                })

            email_log = EmailLog(
                message_id=msg_id,
                thread_id=msg.get("threadId"),
                sender=sender,
                subject=subject,
                snippet=snippet,
                received_at=utc_now(),
                detected_company=event.company_name,
                detected_stage=event.target_lifecycle_stage.value if event.target_lifecycle_stage else None,
                matched_application_id=matched_app_id,
                match_status=match_status,
                raw_classification=json.dumps(event.model_dump()),
            )
            db.add(email_log)
            db.commit()

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

