import pytest
from app.db.models import JobPosting
from app.services.job_intelligence import JobIntelligenceService


def test_job_intelligence_reconciliation_and_expiration(db_session):
    company = "Stripe"
    scraped_batch_1 = [
        {
            "id": "stripe-101",
            "title": "Staff Backend Engineer, Payments",
            "url": "https://stripe.com/jobs/101",
            "salary_range": "$210,000 - $260,000",
            "department": "Payments Engineering",
            "location": "Remote - US",
        },
        {
            "id": "stripe-102",
            "title": "Product Designer, Billing",
            "url": "https://stripe.com/jobs/102",
            "salary_range": "$170,000 - $210,000",
            "department": "Design",
            "location": "San Francisco, CA",
        },
    ]

    # Batch 1 Sync
    rep1 = JobIntelligenceService.reconcile_company_postings(
        db=db_session,
        company_name=company,
        scraped_jobs=scraped_batch_1,
        company_domain="stripe.com",
    )
    assert rep1["created_count"] == 2
    assert rep1["active_now"] == 2
    assert rep1["expired_count"] == 0

    postings_1 = db_session.query(JobPosting).filter(JobPosting.company_name == company).all()
    assert len(postings_1) == 2
    assert all(not p.is_expired for p in postings_1)

    # Batch 2 Sync:
    # 1. stripe-101 remains active with an updated salary
    # 2. stripe-102 vanished (expired position!)
    # 3. stripe-103 is a repost of "Product Designer, Billing" with a new ID!
    scraped_batch_2 = [
        {
            "id": "stripe-101",
            "title": "Staff Backend Engineer, Payments",
            "url": "https://stripe.com/jobs/101",
            "salary_range": "$225,000 - $275,000",  # Updated compensation
            "department": "Payments Engineering",
            "location": "Remote - US",
        },
        {
            "id": "stripe-103",
            "title": "Product Designer, Billing",  # Reposted title
            "url": "https://stripe.com/jobs/103",
            "salary_range": "$175,000 - $215,000",
            "department": "Design",
            "location": "San Francisco, CA",
        },
    ]

    rep2 = JobIntelligenceService.reconcile_company_postings(
        db=db_session,
        company_name=company,
        scraped_jobs=scraped_batch_2,
        company_domain="stripe.com",
    )
    assert rep2["updated_count"] == 1
    assert rep2["created_count"] == 1
    assert rep2["expired_count"] == 1
    assert rep2["reposts_count"] == 1

    # Check database state
    p101 = db_session.query(JobPosting).filter(JobPosting.external_job_id == "stripe-101").first()
    assert p101 is not None
    assert p101.salary_range == "$225,000 - $275,000"
    assert p101.is_expired is False

    p102 = db_session.query(JobPosting).filter(JobPosting.external_job_id == "stripe-102").first()
    assert p102 is not None
    assert p102.is_expired is True
    assert p102.expired_at is not None

    p103 = db_session.query(JobPosting).filter(JobPosting.external_job_id == "stripe-103").first()
    assert p103 is not None
    assert p103.repost_detected is True
    assert p103.original_posting_id == p102.id


def test_job_intelligence_dashboard_metrics(db_session):
    stats = JobIntelligenceService.get_intelligence_stats(db_session)
    assert "total_market_jobs" in stats
    assert "active_jobs" in stats
    assert "expired_jobs" in stats
    assert "reposted_jobs" in stats
    assert "total_companies" in stats
    assert isinstance(stats["top_departments"], list)

