import pytest
from unittest.mock import AsyncMock, patch
from app.db.models import Application, ApplicationStatusEvent, LifecycleStage, TriggerSource
from app.schemas.job import ImportScrapedJobPayload, ScrapedJobPosting
from app.services.job_scraper import JobScraperService
from app.routers.jobs import import_scraped_job_to_board


@pytest.mark.anyio
async def test_greenhouse_scraper_parsing():
    mock_gh_response = {
        "jobs": [
            {
                "id": 12345,
                "title": "Staff Backend Engineer",
                "location": {"name": "San Francisco, CA (Remote)"},
                "departments": [{"name": "Payments Infrastructure"}],
                "absolute_url": "https://boards.greenhouse.io/stripe/jobs/12345",
                "content": "<p>Build real-time financial systems at Stripe.</p>",
                "updated_at": "2026-08-10T12:00:00Z",
            }
        ]
    }

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: mock_gh_response
        mock_resp.raise_for_status = lambda: None
        mock_get.return_value = mock_resp

        jobs = await JobScraperService.scrape_greenhouse("stripe")
        assert len(jobs) == 1
        job = jobs[0]
        assert job.id == "gh-stripe-12345"
        assert job.title == "Staff Backend Engineer"
        assert job.company_name == "Stripe"
        assert job.remote_type == "remote"
        assert job.department == "Payments Infrastructure"
        assert "Build real-time financial systems" in job.description_snippet
        assert job.source_type == "ats_greenhouse"


@pytest.mark.anyio
async def test_lever_scraper_parsing():
    mock_lever_response = [
        {
            "id": "lever-abc",
            "text": "Product Designer",
            "categories": {
                "location": "New York",
                "team": "Design",
                "commitment": "Full-time",
            },
            "hostedUrl": "https://jobs.lever.co/figma/lever-abc",
            "descriptionPlain": "Design beautiful collaborative tools.",
            "createdAt": 1723456789000,
        }
    ]

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: mock_lever_response
        mock_resp.raise_for_status = lambda: None
        mock_get.return_value = mock_resp

        jobs = await JobScraperService.scrape_lever("figma")
        assert len(jobs) == 1
        job = jobs[0]
        assert job.title == "Product Designer"
        assert job.company_name == "Figma"
        assert job.department == "Design"
        assert job.source_type == "ats_lever"


@pytest.mark.anyio
async def test_schema_org_json_ld_extraction():
    html_content = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Machine Learning Engineer",
          "description": "Develop frontier AI models.",
          "hiringOrganization": {
            "@type": "Organization",
            "name": "Anthropic"
          },
          "jobLocation": {
            "@type": "Place",
            "address": {
              "addressLocality": "San Francisco",
              "addressRegion": "CA"
            }
          },
          "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "USD",
            "value": {
              "minValue": 250000,
              "maxValue": 350000,
              "unitText": "YEAR"
            }
          }
        }
        </script>
      </head>
      <body>
        <h1>Machine Learning Engineer</h1>
      </body>
    </html>
    """

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.text = html_content
        mock_resp.raise_for_status = lambda: None
        mock_get.return_value = mock_resp

        job = await JobScraperService.scrape_url("https://careers.anthropic.com/jobs/ml-engineer")
        assert job.title == "Machine Learning Engineer"
        assert job.company_name == "Anthropic"
        assert "San Francisco" in job.location
        assert "250,000" in (job.salary_range or "")
        assert job.source_type == "json_ld"


def test_import_scraped_job_to_board(db_session):
    posting = ScrapedJobPosting(
        id="gh-stripe-999",
        title="Software Engineer, Core Banking",
        company_name="Stripe",
        company_domain="stripe.com",
        location="Remote",
        remote_type="remote",
        department="Infrastructure",
        url="https://boards.greenhouse.io/stripe/jobs/999",
        salary_range="$180,000 - $220,000",
        description_snippet="Manage distributed ledger databases.",
        source_type="ats_greenhouse",
    )

    payload = ImportScrapedJobPayload(job=posting, target_stage=LifecycleStage.APPLIED)
    app = import_scraped_job_to_board(payload=payload, db=db_session)

    assert app.id is not None
    assert app.company_name == "Stripe"
    assert app.role_title == "Software Engineer, Core Banking"
    assert app.current_stage == LifecycleStage.APPLIED.value
    assert app.last_status_change_source == TriggerSource.INITIAL_INGEST.value
    assert app.job_url == "https://boards.greenhouse.io/stripe/jobs/999"

    # Verify audit trail event
    events = db_session.query(ApplicationStatusEvent).filter(ApplicationStatusEvent.application_id == app.id).all()
    assert len(events) == 1
    assert events[0].to_stage == "applied"
    assert "Discovered via Job Scraper" in events[0].change_summary
