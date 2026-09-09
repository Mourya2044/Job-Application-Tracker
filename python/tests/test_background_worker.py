import base64
import json
import pytest
from unittest.mock import MagicMock, patch
from app.db.models import Application, EmailLog, UserMailboxConsent, utc_now
from app.services.background_worker import GmailBackgroundSyncWorker
from app.services.mailbox_sync import sync_mailbox_history_events


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
