import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple
import httpx
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow, InstalledAppFlow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.config import (
    CREDENTIALS_FILE,
    TOKEN_FILE,
    GMAIL_SCOPES,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_CREDENTIALS_JSON,
    GMAIL_PUBSUB_TOPIC,
)
from app.db.models import UserMailboxConsent, utc_now

logger = logging.getLogger(__name__)


def get_client_config() -> Tuple[Optional[str], Optional[str]]:
    """Retrieve Google OAuth client_id and client_secret from env vars or credentials file."""
    # 1. Direct environment variables
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        return GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

    # 2. JSON string in environment variable
    if GOOGLE_CREDENTIALS_JSON:
        try:
            data = json.loads(GOOGLE_CREDENTIALS_JSON)
            info = data.get("web") or data.get("installed") or {}
            if info.get("client_id") and info.get("client_secret"):
                return info.get("client_id"), info.get("client_secret")
        except Exception:
            pass

    # 3. File on disk
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r") as f:
                data = json.load(f)
                info = data.get("installed") or data.get("web") or {}
                return info.get("client_id"), info.get("client_secret")
        except Exception:
            pass

    return None, None


def get_google_flow(redirect_uri: str) -> Flow:
    """Create a Google OAuth Flow configured for Web Server redirect."""
    client_id, client_secret = get_client_config()
    if client_id and client_secret:
        client_config = {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        return Flow.from_client_config(
            client_config,
            scopes=GMAIL_SCOPES,
            redirect_uri=redirect_uri,
        )

    if os.path.exists(CREDENTIALS_FILE):
        return Flow.from_client_secrets_file(
            str(CREDENTIALS_FILE),
            scopes=GMAIL_SCOPES,
            redirect_uri=redirect_uri,
        )

    raise ValueError(
        "Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and "
        "GOOGLE_CLIENT_SECRET environment variables or provide credentials.json."
    )


def get_google_auth_url(redirect_uri: str) -> str:
    """Generate the Google OAuth authorization URL for user consent redirect."""
    flow = get_google_flow(redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    return auth_url


def exchange_oauth_code(code: str, redirect_uri: str, db: Session) -> UserMailboxConsent:
    """Exchange OAuth authorization code for tokens and store them in the database."""
    flow = get_google_flow(redirect_uri)
    flow.fetch_token(code=code)
    creds = flow.credentials

    user_email = fetch_gmail_user_email(creds)

    consent = get_or_create_consent(db)
    consent.consent_given = True
    consent.is_sync_enabled = True
    consent.consent_timestamp = utc_now()
    consent.scopes_granted = ",".join(GMAIL_SCOPES)
    if creds.refresh_token:
        consent.refresh_token = creds.refresh_token
    consent.access_token = creds.token
    if creds.expiry:
        consent.token_expiry = creds.expiry
    if user_email:
        consent.user_email = user_email

    db.commit()
    db.refresh(consent)
    return consent


def get_current_credentials(
    db: Optional[Session] = None,
    consent: Optional[UserMailboxConsent] = None,
) -> Optional[Credentials]:
    """
    Retrieve valid Google credentials from the database consent record or local token.json.
    Automatically refreshes expired credentials.
    """
    client_id, client_secret = get_client_config()
    creds = None

    # 1. First priority: database record
    if consent and consent.refresh_token:
        creds = Credentials(
            token=consent.access_token,
            refresh_token=consent.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=GMAIL_SCOPES,
        )
    # 2. Local development fallback: token.json
    elif os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), GMAIL_SCOPES)
        except Exception as e:
            logger.warning("Error reading token.json: %s", e)

    if not creds:
        return None

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                if consent:
                    consent.access_token = creds.token
                    if creds.expiry:
                        consent.token_expiry = creds.expiry
                    if db:
                        db.commit()
                if os.path.exists(TOKEN_FILE):
                    with open(TOKEN_FILE, "w") as token_file:
                        token_file.write(creds.to_json())
            except Exception as e:
                logger.warning("Error refreshing Google credentials: %s", e)
                return None
        else:
            return None

    return creds


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
    has_token = bool((consent and consent.refresh_token) or os.path.exists(TOKEN_FILE))

    if not consent:
        has_file_token = os.path.exists(TOKEN_FILE)
        consent = UserMailboxConsent(
            provider="google",
            consent_given=has_file_token,
            consent_timestamp=utc_now() if has_file_token else None,
            scopes_granted=",".join(GMAIL_SCOPES) if has_file_token else None,
            is_sync_enabled=has_file_token,
            auto_create_applications=True,
        )
        db.add(consent)
        db.commit()
        db.refresh(consent)

    if consent.consent_given and not consent.user_email:
        creds = get_current_credentials(db=db, consent=consent)
        if creds:
            email = fetch_gmail_user_email(creds)
            if email:
                consent.user_email = email
                db.commit()
                db.refresh(consent)

    return consent


def perform_google_login(db: Session) -> UserMailboxConsent:
    """Launch desktop Google OAuth flow (for local offline development)."""
    client_id, client_secret = get_client_config()
    if not client_id and not os.path.exists(CREDENTIALS_FILE):
        raise FileNotFoundError("Google OAuth credentials not found.")

    if os.path.exists(CREDENTIALS_FILE):
        flow = InstalledAppFlow.from_client_secrets_file(
            str(CREDENTIALS_FILE),
            GMAIL_SCOPES,
        )
    else:
        client_config = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        flow = InstalledAppFlow.from_client_config(client_config, GMAIL_SCOPES)

    creds = flow.run_local_server(port=0, prompt="consent")

    with open(TOKEN_FILE, "w") as token_file:
        token_file.write(creds.to_json())

    user_email = fetch_gmail_user_email(creds)

    consent = get_or_create_consent(db)
    consent.consent_given = True
    consent.is_sync_enabled = True
    consent.consent_timestamp = utc_now()
    consent.scopes_granted = ",".join(GMAIL_SCOPES)
    consent.refresh_token = creds.refresh_token
    consent.access_token = creds.token
    if creds.expiry:
        consent.token_expiry = creds.expiry
    if user_email:
        consent.user_email = user_email
    db.commit()
    db.refresh(consent)

    if GMAIL_PUBSUB_TOPIC:
        try:
            from app.services.mailbox_sync import setup_gmail_watch
            setup_gmail_watch(db, topic_name=GMAIL_PUBSUB_TOPIC, consent=consent)
        except Exception as e:
            logger.warning("Could not auto-register Gmail watch for %s: %s", consent.user_email, e)

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
    token_to_revoke = consent.access_token or consent.refresh_token

    if not token_to_revoke and os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                data = json.load(f)
                token_to_revoke = data.get("token") or data.get("access_token")
        except Exception:
            pass

    if token_to_revoke:
        try:
            httpx.post("https://oauth2.googleapis.com/revoke", params={"token": token_to_revoke}, timeout=5.0)
        except Exception as e:
            logger.warning("Online token revocation failed: %s", e)

    if os.path.exists(TOKEN_FILE):
        try:
            os.remove(TOKEN_FILE)
        except Exception:
            pass

    consent.consent_given = False
    consent.is_sync_enabled = False
    consent.scopes_granted = None
    consent.user_email = None
    consent.last_history_id = None
    consent.refresh_token = None
    consent.access_token = None
    consent.token_expiry = None
    db.commit()
    db.refresh(consent)
    return consent


def is_sync_authorized(db: Session, consent: Optional[UserMailboxConsent] = None) -> bool:
    if consent is None:
        consent = get_or_create_consent(db)
    has_creds = bool(consent.refresh_token or os.path.exists(TOKEN_FILE))
    return bool(consent.consent_given and consent.is_sync_enabled and has_creds)

