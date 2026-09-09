import pytest
from fastapi.testclient import TestClient


def test_root_and_health_accessible(client: TestClient):
    """Test that root and /health endpoints are accessible and online."""
    res_root = client.get("/")
    assert res_root.status_code == 200
    data_root = res_root.json()
    assert data_root.get("status") == "online"
    assert "service" in data_root

    res_health = client.get("/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert data_health.get("status") == "online"
    assert "background_sync" in data_health


def test_docs_and_openapi_accessible(client: TestClient):
    """Test that OpenAPI schema and Swagger documentation are accessible."""
    res_docs = client.get("/docs")
    assert res_docs.status_code == 200
    assert "swagger" in res_docs.text.lower() or "html" in res_docs.headers.get("content-type", "")

    res_openapi = client.get("/openapi.json")
    assert res_openapi.status_code == 200
    schema = res_openapi.json()
    assert "openapi" in schema
    assert "paths" in schema
    assert "/api/applications" in schema["paths"]
    assert "/api/mailbox/status" in schema["paths"]
    assert "/api/jobs/popular-companies" in schema["paths"]


def test_applications_api_accessible(client: TestClient):
    """Test that /api/applications CRUD endpoints are accessible."""
    # 1. Kanban board retrieval
    res_list = client.get("/api/applications")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "columns" in data
    assert "total_applications" in data

    # 2. Ingest / create an application
    payload = {
        "company_name": "Acme Corp",
        "role_title": "Software Engineer",
        "job_url": "https://example.com/jobs/123",
        "current_stage": "applied",
    }
    res_create = client.post("/api/applications", json=payload)
    assert res_create.status_code == 201
    created_app = res_create.json()
    assert created_app["company_name"] == "Acme Corp"
    assert created_app["current_stage"] == "applied"
    app_id = created_app["id"]

    # 3. Retrieve single application
    res_get = client.get(f"/api/applications/{app_id}")
    assert res_get.status_code == 200
    app_data = res_get.json()
    assert app_data["id"] == app_id
    assert app_data["company_name"] == "Acme Corp"


def test_mailbox_api_accessible(client: TestClient):
    """Test that /api/mailbox status and telemetry endpoints are accessible."""
    res_status = client.get("/api/mailbox/status")
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert "consent_given" in status_data
    assert "is_sync_enabled" in status_data

    res_bg = client.get("/api/mailbox/background-sync")
    assert res_bg.status_code == 200
    bg_data = res_bg.json()
    assert "is_running" in bg_data
    assert "interval_seconds" in bg_data

    res_pending = client.get("/api/mailbox/pending-discoveries")
    assert res_pending.status_code == 200
    assert isinstance(res_pending.json(), list)

    res_connect = client.post("/api/mailbox/connect-google")
    assert res_connect.status_code == 200
    connect_data = res_connect.json()
    assert "auth_url" in connect_data or "user_email" in connect_data or "redirect_uri" in connect_data


def test_jobs_api_accessible(client: TestClient):
    """Test that /api/jobs scraper endpoints are accessible."""
    res_popular = client.get("/api/jobs/popular-companies")
    assert res_popular.status_code == 200
    companies = res_popular.json()
    assert isinstance(companies, list)
    assert len(companies) > 0
    first = companies[0]
    assert "name" in first
    assert "provider" in first
