import base64
import pytest
from app.services.security import encrypt_token, decrypt_token, validate_safe_url
from app.db.models import Application, EmailLog, LifecycleStage, TriggerSource, utc_now
from app.services.mailbox_sync import process_single_email_message


def test_token_encryption_roundtrip():
    secret = "ya29.a0ARrdaM-sensitive-access-token-example"
    encrypted = encrypt_token(secret)
    assert encrypted != secret
    assert encrypted.startswith("enc:")
    decrypted = decrypt_token(encrypted)
    assert decrypted == secret

    # Plaintext fallback for legacy tokens
    plain = "legacy_unencrypted_token"
    assert decrypt_token(plain) == plain


def test_ssrf_safe_url_validation():
    # Valid external URLs return the safe URL string
    assert validate_safe_url("https://boards.greenhouse.io/stripe") == "https://boards.greenhouse.io/stripe"
    assert validate_safe_url("https://jobs.lever.co/figma") == "https://jobs.lever.co/figma"
    assert validate_safe_url("https://careers.google.com/jobs") == "https://careers.google.com/jobs"

    # Block non-HTTP(S) schemes (raise ValueError)
    with pytest.raises(ValueError):
        validate_safe_url("file:///etc/passwd")
    with pytest.raises(ValueError):
        validate_safe_url("ftp://ftp.example.com")
    with pytest.raises(ValueError):
        validate_safe_url("gopher://example.com")

    # Block localhost & loopback
    with pytest.raises(ValueError):
        validate_safe_url("http://127.0.0.1:8000/admin")
    with pytest.raises(ValueError):
        validate_safe_url("http://localhost:3000")

    # Block private RFC1918 IPs
    with pytest.raises(ValueError):
        validate_safe_url("http://10.0.0.1/internal")
    with pytest.raises(ValueError):
        validate_safe_url("http://192.168.1.1/router")
    with pytest.raises(ValueError):
        validate_safe_url("http://172.16.0.5/api")

    # Block Cloud Metadata Services (AWS, GCP)
    with pytest.raises(ValueError):
        validate_safe_url("http://169.254.169.254/latest/meta-data/")
    with pytest.raises(ValueError):
        validate_safe_url("http://metadata.google.internal/computeMetadata/v1/")


class MockGmailService:
    def __init__(self, msg_id: str, subject: str, body: str, sender: str):
        self.msg_id = msg_id
        self.subject = subject
        self.body = body
        self.sender = sender

    def users(self):
        return self

    def messages(self):
        return self

    def get(self, userId, id):
        class _Req:
            def __init__(self, outer):
                self.outer = outer
            def execute(inner_self):
                return {
                    "id": self.msg_id,
                    "threadId": f"thread_{self.msg_id}",
                    "snippet": self.body[:100],
                    "payload": {
                        "headers": [
                            {"name": "Subject", "value": self.subject},
                            {"name": "From", "value": self.sender},
                        ],
                        "mimeType": "text/plain",
                        "body": {
                            "data": base64.urlsafe_b64encode(self.body.encode("utf-8")).decode("utf-8")
                        },
                    },
                }
        return _Req(self)


def test_mailbox_sync_idempotent_processing(db_session):
    # 1. Create target application
    app = Application(
        company_name="Spotify",
        company_domain="spotify.com",
        role_title="Backend Engineer",
        current_stage=LifecycleStage.APPLIED.value,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.INITIAL_INGEST.value,
    )
    db_session.add(app)
    db_session.commit()
    db_session.refresh(app)

    msg_id = "msg_spotify_interview_101"
    subject = "Interview Confirmation with Spotify"
    body = "Your technical interview is confirmed for tomorrow at 2 PM. Please join https://meet.google.com/xyz."
    sender = "recruiting@spotify.com"
    mock_service = MockGmailService(msg_id, subject, body, sender)

    # First delivery of message
    result1 = process_single_email_message(
        db=db_session,
        service=mock_service,
        msg_id=msg_id,
        correlation_id="corr_test_001",
    )
    assert result1["status"] == "processed"
    assert result1["updated"] is True
    assert result1["app_info"]["new_stage"] == LifecycleStage.INTERVIEWING.value

    # Check EmailLog created with correlation ID
    log1 = db_session.query(EmailLog).filter(EmailLog.message_id == msg_id).first()
    assert log1 is not None
    assert log1.processing_status == "processed"
    assert log1.correlation_id == "corr_test_001"
    assert log1.matched_application_id == app.id

    # Second delivery of duplicate message
    result2 = process_single_email_message(
        db=db_session,
        service=mock_service,
        msg_id=msg_id,
        correlation_id="corr_test_002",
    )
    assert result2["status"] == "duplicate_skipped"
    assert result2["updated"] is False

    # Verify no double transition occurred
    db_session.refresh(app)
    assert app.current_stage == LifecycleStage.INTERVIEWING.value
