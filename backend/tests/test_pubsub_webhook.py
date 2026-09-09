import base64
import json
import pytest
from fastapi.testclient import TestClient


def test_pubsub_webhook_get_verification(client: TestClient):
    """Test that GET /api/mailbox/webhook and GET /api/mailbox/pubsub return 200 health info."""
    for path in ["/api/mailbox/webhook", "/api/mailbox/pubsub"]:
        res = client.get(path)
        assert res.status_code == 200
        data = res.json()
        assert data.get("status") == "online"
        assert "Gmail Pub/Sub Webhook" in data.get("service", "")


def test_pubsub_webhook_post_empty_body(client: TestClient):
    """Test that POST /api/mailbox/webhook handles empty or ping bodies with HTTP 200."""
    res = client.post("/api/mailbox/webhook", json={})
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"


def test_pubsub_webhook_post_valid_payload(client: TestClient):
    """Test that POST /api/mailbox/webhook decodes Gmail push data and returns HTTP 200 to ACK."""
    gmail_event = {
        "emailAddress": "testuser@gmail.com",
        "historyId": "987654321",
    }
    encoded_data = base64.b64encode(json.dumps(gmail_event).encode("utf-8")).decode("utf-8")

    payload = {
        "message": {
            "data": encoded_data,
            "messageId": "msg-123456789",
            "publishTime": "2026-09-09T22:00:00.000Z",
        },
        "subscription": "projects/gmail-summarise-503906/subscriptions/gmail-sub",
    }

    res = client.post("/api/mailbox/webhook", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
    assert data.get("message") == "acknowledged"
    assert data.get("historyId") == "987654321"


def test_pubsub_webhook_post_malformed_data(client: TestClient):
    """Test that malformed data does not throw unhandled 500 error, ensuring message is ACKed."""
    payload = {
        "message": {
            "data": "not-valid-base64-!!!",
            "messageId": "msg-bad",
        },
        "subscription": "projects/test/subscriptions/test-sub",
    }

    res = client.post("/api/mailbox/webhook", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"


def test_pubsub_watch_stop_endpoint(client: TestClient):
    """Test the on-demand watch stop endpoint."""
    res = client.post("/api/mailbox/watch/stop")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "success"
