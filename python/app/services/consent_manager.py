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


import urllib.parse
from datetime import timedelta

def get_google_auth_url(redirect_uri: str) -> str:
    """Generate the Google OAuth authorization URL for user consent redirect."""
    client_id, _ = get_client_config()
    if not client_id:
        raise ValueError("Google OAuth credentials not configured.")
        
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


def exchange_oauth_code(code: str, redirect_uri: str, db: Session) -> UserMailboxConsent:
    """Exchange OAuth authorization code for tokens and store them in the database."""
    client_id, client_secret = get_client_config()
    
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10.0,
    )
    
    if response.status_code != 200:
        raise ValueError(f"Failed to exchange token: {response.text}")
        
    creds_data = response.json()
    
    creds = Credentials(
        token=creds_data["access_token"],
        refresh_token=creds_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=GMAIL_SCOPES,
    )

    user_email = fetch_gmail_user_email(creds)

    consent = get_or_create_consent(db)
    consent.consent_given = True
    consent.is_sync_enabled = True
    consent.consent_timestamp = utc_now()
    consent.scopes_granted = ",".join(GMAIL_SCOPES)
    if creds_data.get("refresh_token"):
        consent.refresh_token = creds_data["refresh_token"]
    consent.access_token = creds_data["access_token"]
    if creds_data.get("expires_in"):
        consent.token_expiry = utc_now() + timedelta(seconds=creds_data["expires_in"])
    if user_email:
        consent.user_email = user_email

    db.commit()
    db.refresh(consent)

    try:
        setup_gmail_watch(db, consent)
    except Exception as watch_err:
        logger.warning("Auto watch registration failed during OAuth exchange: %s", watch_err)

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

    try:
        setup_gmail_watch(db, consent)
    except Exception as watch_err:
        logger.warning("Auto watch registration failed during local login: %s", watch_err)

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
    try:
        stop_gmail_watch(db, consent)
    except Exception as watch_err:
        logger.warning("Stopping Gmail watch failed during revoke: %s", watch_err)

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
    consent.watch_expiration = None
    db.commit()
    db.refresh(consent)
    return consent


def is_sync_authorized(db: Session, consent: Optional[UserMailboxConsent] = None) -> bool:
    if consent is None:
        consent = get_or_create_consent(db)
    has_creds = bool(consent.refresh_token or os.path.exists(TOKEN_FILE))
    return bool(consent.consent_given and consent.is_sync_enabled and has_creds)


def setup_gmail_watch(db: Session, consent: UserMailboxConsent) -> Optional[Dict]:
    """
    Registers Gmail users().watch with the Google Cloud Pub/Sub topic.
    Updates consent.watch_expiration and consent.last_history_id in the database.
    """
    creds = get_current_credentials(db=db, consent=consent)
    if not creds:
        logger.warning("No valid credentials to setup Gmail watch.")
        return None

    topic = consent.pubsub_topic or GMAIL_PUBSUB_TOPIC
    if not topic:
        logger.warning("No GMAIL_PUBSUB_TOPIC configured; skipping watch setup.")
        return None

    try:
        service = build("gmail", "v1", credentials=creds)
        res = service.users().watch(
            userId="me",
            body={
                "topicName": topic,
                "labelIds": ["INBOX"],
            },
        ).execute()

        exp_ms = int(res.get("expiration", 0))
        if exp_ms:
            consent.watch_expiration = datetime.fromtimestamp(exp_ms / 1000.0, timezone.utc)
        if res.get("historyId"):
            consent.last_history_id = str(res["historyId"])
        consent.pubsub_topic = topic
        db.commit()
        db.refresh(consent)
        logger.info(
            "Gmail watch established successfully for %s until %s (historyId=%s)",
            consent.user_email,
            consent.watch_expiration,
            consent.last_history_id,
        )
        return res
    except Exception as e:
        logger.error("Failed to setup Gmail watch for %s: %s", consent.user_email, e)
        return None


def stop_gmail_watch(db: Session, consent: UserMailboxConsent) -> bool:
    """Stops Gmail push notifications for the user."""
    creds = get_current_credentials(db=db, consent=consent)
    if creds:
        try:
            service = build("gmail", "v1", credentials=creds)
            service.users().stop(userId="me").execute()
            logger.info("Gmail watch stopped for %s", consent.user_email)
        except Exception as e:
            logger.warning("Failed to stop Gmail watch: %s", e)
    consent.watch_expiration = None
    db.commit()
    return True

