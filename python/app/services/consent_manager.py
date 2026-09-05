import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional
import httpx
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.config import CREDENTIALS_FILE, TOKEN_FILE, GMAIL_SCOPES
from app.db.models import UserMailboxConsent, utc_now

logger = logging.getLogger(__name__)


def get_current_credentials() -> Optional[Credentials]:
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), GMAIL_SCOPES)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "w") as token_file:
                token_file.write(creds.to_json())
        return creds if creds and creds.valid else None
    except Exception as e:
        logger.warning("Error loading or refreshing Google credentials: %s", e)
        return None


def fetch_gmail_user_email(creds: Credentials) -> Optional[str]:
    try:
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        return profile.get("emailAddress")
    except Exception as e:
        logger.warning("Could not fetch user profile from Gmail API: %s", e)
        return None


def get_or_create_consent(db: Session) -> UserMailboxConsent:
    consent = db.query(UserMailboxConsent).filter(UserMailboxConsent.provider == "google").first()
    has_token = os.path.exists(TOKEN_FILE)

    if not consent:
        consent = UserMailboxConsent(
            provider="google",
            consent_given=has_token,
            consent_timestamp=utc_now() if has_token else None,
            scopes_granted=",".join(GMAIL_SCOPES) if has_token else None,
            is_sync_enabled=has_token,
            auto_create_applications=True,
        )
        db.add(consent)
        db.commit()
        db.refresh(consent)

    if has_token and not consent.user_email:
        creds = get_current_credentials()
        if creds:
            email = fetch_gmail_user_email(creds)
            if email:
                consent.user_email = email
                consent.consent_given = True
                consent.is_sync_enabled = True
                db.commit()
                db.refresh(consent)

    return consent


def perform_google_login(db: Session) -> UserMailboxConsent:
    """Launch Google OAuth flow in the user's browser, obtain token, and record consent."""
    if not os.path.exists(CREDENTIALS_FILE):
        raise FileNotFoundError(f"OAuth client secret file not found at {CREDENTIALS_FILE}")

    flow = InstalledAppFlow.from_client_secrets_file(
        str(CREDENTIALS_FILE),
        GMAIL_SCOPES,
    )
    
    # Run local web server to handle browser OAuth callback
    creds = flow.run_local_server(port=0, prompt="consent")

    # Save the token
    with open(TOKEN_FILE, "w") as token_file:
        token_file.write(creds.to_json())

    # Query the user profile to get their real email address
    user_email = fetch_gmail_user_email(creds)

    consent = get_or_create_consent(db)
    consent.consent_given = True
    consent.is_sync_enabled = True
    consent.consent_timestamp = utc_now()
    consent.scopes_granted = ",".join(GMAIL_SCOPES)
    if user_email:
        consent.user_email = user_email
    db.commit()
    db.refresh(consent)
    return consent


def grant_consent(db: Session, user_email: Optional[str] = None) -> UserMailboxConsent:
    consent = get_or_create_consent(db)
    consent.consent_given = True
    consent.is_sync_enabled = True
    consent.consent_timestamp = utc_now()
    consent.scopes_granted = ",".join(GMAIL_SCOPES)
    if user_email:
        consent.user_email = user_email
    db.commit()
    db.refresh(consent)
    return consent


def revoke_consent(db: Session) -> UserMailboxConsent:
    """Revoke Google OAuth token and disconnect mailbox."""
    consent = get_or_create_consent(db)
    
    # Attempt to revoke token online
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                data = json.load(f)
                token = data.get("token") or data.get("access_token")
                if token:
                    httpx.post("https://oauth2.googleapis.com/revoke", params={"token": token}, timeout=5.0)
        except Exception as e:
            logger.warning("Online token revocation failed (continuing local purge): %s", e)

        try:
            os.remove(TOKEN_FILE)
        except Exception:
            pass

    consent.consent_given = False
    consent.is_sync_enabled = False
    consent.scopes_granted = None
    consent.user_email = None
    consent.last_history_id = None
    db.commit()
    db.refresh(consent)
    return consent


def is_sync_authorized(db: Session) -> bool:
    consent = get_or_create_consent(db)
    return bool(consent.consent_given and consent.is_sync_enabled and os.path.exists(TOKEN_FILE))
