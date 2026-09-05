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

from app.config import CREDENTIALS_FILE, TOKEN_FILE, GMAIL_SCOPES
from app.db.models import Application, ApplicationStatusEvent, EmailLog, UserMailboxConsent, utc_now
from app.services.change_tracker import apply_auto_stage_change
from app.services.consent_manager import get_or_create_consent, is_sync_authorized
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


def get_gmail_credentials() -> Optional[Credentials]:
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), GMAIL_SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "w") as token:
                token.write(creds.to_json())
        else:
            return None
    return creds


TARGETED_JOB_QUERY = (
    "newer_than:7d ("
    "application OR interview OR assessment OR offer OR rejected OR recruiter OR "
    "careers OR greenhouse OR lever OR workday OR ashby OR hackerrank OR codesignal OR "
    "smartrecruiters OR hirevue OR testgorilla OR talent OR \"status update\" OR \"thank you for applying\""
    ")"
)


def sync_mailbox_events(db: Session, query: Optional[str] = None) -> Dict:
    if query is None:
        query = TARGETED_JOB_QUERY

    if not is_sync_authorized(db):
        return {
            "status": "unauthorized",
            "message": "Mailbox sync consent has not been granted or credentials are missing.",
            "processed_count": 0,
            "updates_count": 0,
        }

    creds = get_gmail_credentials()
    if not creds:
        return {
            "status": "auth_required",
            "message": "Google OAuth credentials expired or missing. Please reconnect mailbox.",
            "processed_count": 0,
            "updates_count": 0,
        }

    try:
        service = build("gmail", "v1", credentials=creds)
        results = service.users().messages().list(userId="me", labelIds=["INBOX"], q=query).execute()
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
                # Discard non-job emails from database storage for privacy
                continue

            # Resolve to existing application
            matched_app = resolve_application_match(db, event, sender=sender, subject=subject)
            match_status = "unmatched"
            matched_app_id = None

            if matched_app:
                matched_app_id = matched_app.id
                match_status = "matched_auto" if not matched_app.stage_locked else "suggested"
                
                # Apply stage transition or suggestion
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
                # Discovered an application in email that is not yet tracked -> queue for user confirmation
                match_status = "untracked_candidate"
                updates_count += 1
                updated_applications.append({
                    "application_id": None,
                    "company_name": event.company_name,
                    "new_stage": event.target_lifecycle_stage.value if event.target_lifecycle_stage else "applied",
                    "event_category": event.event_category,
                    "is_pending_confirmation": True,
                })

            # Record email log for audit
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

        # Update last synced time on consent record
        consent = get_or_create_consent(db)
        consent.last_synced_at = utc_now()
        db.commit()

        return {
            "status": "success",
            "processed_count": processed_count,
            "updates_count": updates_count,
            "updated_applications": updated_applications,
            "last_synced_at": consent.last_synced_at.isoformat(),
        }

    except HttpError as error:
        logger.error("Gmail API error during sync: %s", error)
        return {
            "status": "error",
            "message": f"Gmail API error: {str(error)}",
            "processed_count": 0,
            "updates_count": 0,
        }
