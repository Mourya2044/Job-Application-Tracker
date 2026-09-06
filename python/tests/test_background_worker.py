import base64
import json
import pytest
from unittest.mock import MagicMock, patch
from app.db.models import Application, EmailLog, UserMailboxConsent, utc_now
from app.services.background_worker import GmailBackgroundSyncWorker
from app.services.mailbox_sync import sync_mailbox_history_events
from app.routers.mailbox import receive_pubsub_webhook, PubSubPushPayload


@pytest.mark.anyio
async def test_background_worker_lifecycle():
    worker = GmailBackgroundSyncWorker(interval_seconds=30)
    assert worker.interval_seconds == 30
    assert not worker.is_running

    worker.set_interval(45)
    assert worker.interval_seconds == 45

    await worker.start()
    assert worker.is_running
    status = worker.get_status()
    assert status["is_running"] is True
    assert status["interval_seconds"] == 45

    await worker.stop()
    assert not worker.is_running
    assert worker.last_status == "paused"


def test_sync_mailbox_history_unauthorized(db_session):
    consent = UserMailboxConsent(
        provider="google",
        consent_given=False,
        is_sync_enabled=False,
    )
    db_session.add(consent)
    db_session.commit()

    res = sync_mailbox_history_events(db_session, consent=consent)
    assert res["status"] == "unauthorized"
    assert res["processed_count"] == 0


def test_pubsub_webhook_dispatch(db_session):
    consent = UserMailboxConsent(
        user_email="candidate@example.com",
        provider="google",
        consent_given=True,
        is_sync_enabled=True,
        last_history_id="1000",
    )
    db_session.add(consent)
    db_session.commit()

    raw_event = json.dumps({"emailAddress": "candidate@example.com", "historyId": "1050"})
    b64_data = base64.b64encode(raw_event.encode("utf-8")).decode("utf-8")

    payload = PubSubPushPayload(
        message={"data": b64_data, "messageId": "msg-pubsub-1"},
        subscription="projects/demo/subscriptions/sub1",
    )

    with patch("app.routers.mailbox.sync_mailbox_history_events") as mock_sync:
        mock_sync.return_value = {
            "status": "success",
            "processed_count": 1,
            "updates_count": 1,
        }

        response = receive_pubsub_webhook(payload, db=db_session)
        assert response["status"] == "processed"
        assert response["email_address"] == "candidate@example.com"
        assert response["history_id"] == "1050"
        assert mock_sync.called
