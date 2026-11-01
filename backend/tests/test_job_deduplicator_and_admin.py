from app.services.job_deduplicator import (
    JobDeduplicator,
    clean_and_tokenize,
    normalize_company_name,
)


def test_jaccard_similarity_calculation():
    set_a = {"software", "engineer", "python", "backend"}
    set_b = {"backend", "software", "engineer", "python"}
    set_c = {"frontend", "designer", "figma"}

    # Identical sets
    assert JobDeduplicator.jaccard_similarity(set_a, set_b) == 1.0

    # Overlapping sets
    set_d = {"software", "engineer", "react"}
    sim = JobDeduplicator.jaccard_similarity(set_a, set_d)
    # intersection: software, engineer (2). union: software, engineer, python, backend, react (5)
    assert round(sim, 2) == 0.40

    # Disjoint sets
    assert JobDeduplicator.jaccard_similarity(set_a, set_c) == 0.0


def test_edit_distance_ratio_calculation():
    # Word reordering with token sort ratio
    ratio = JobDeduplicator.edit_distance_ratio(
        "Senior Software Engineer",
        "Software Engineer, Senior"
    )
    assert ratio >= 0.95

    # Minor abbreviation / typo
    ratio_typo = JobDeduplicator.edit_distance_ratio(
        "Fullstack Developer",
        "Full Stack Developer"
    )
    assert ratio_typo >= 0.90


def test_vector_or_fallback_similarity():
    # Semantically equivalent role titles
    sim = JobDeduplicator.vector_cosine_similarity(
        "Lead Frontend Architect with React experience",
        "Senior React and TypeScript UI Engineer",
    )
    assert sim > 0.65

    # Unrelated role titles
    sim_unrelated = JobDeduplicator.vector_cosine_similarity(
        "Senior Python Backend Distributed Systems Engineer",
        "Executive Administrative Assistant and Office Receptionist",
    )
    # The semantically similar pair must have significantly higher cosine similarity than unrelated pair
    assert sim > (sim_unrelated + 0.15)


def test_deduplicate_job_list_blocking_and_filtering():
    jobs = [
        {
            "id": "job-1",
            "title": "Senior Software Engineer (Python)",
            "company_name": "Stripe, Inc.",
            "url": "https://stripe.com/jobs/1",
            "description_snippet": "Building distributed payment rails in Python and Go.",
        },
        {
            "id": "job-2",
            "title": "Senior Software Engineer - Python",
            "company_name": "Stripe",
            "url": "https://boards.greenhouse.io/stripe/jobs/1",
            "salary_range": "$185,000 - $230,000",
            "department": "Core Payments",
            "description_snippet": "Building distributed payment infrastructure in Python, Go, and Kubernetes at global scale.",
        },
        {
            "id": "job-3",
            "title": "Lead Product Designer",
            "company_name": "Stripe",
            "url": "https://stripe.com/jobs/2",
            "description_snippet": "Design world-class financial interfaces.",
        },
        {
            "id": "job-4",
            "title": "Senior Software Engineer (Python)",
            "company_name": "Figma",
            "url": "https://figma.com/jobs/99",
            "description_snippet": "Work on multiplayer canvas engine in Python and C++.",
        },
    ]

    deduped, report = JobDeduplicator.deduplicate_job_list(jobs)
    assert report["original_count"] == 4
    assert report["duplicates_removed"] == 1
    assert report["unique_count"] == 3

    # Ensure job-1 and job-2 collapsed into 1 entry under Stripe and backfilled metadata
    stripe_jobs = [j for j in deduped if "stripe" in j["company_name"].lower()]
    assert len(stripe_jobs) == 2  # One engineer, one designer
    eng_job = [j for j in stripe_jobs if "engineer" in j["title"].lower()][0]
    assert eng_job["salary_range"] == "$185,000 - $230,000"
    assert eng_job["department"] == "Core Payments"


from app.schemas.job import ScrapedJobPosting
from app.schemas.company import CompanyCareerPageCreate, CompanyCareerPageUpdate
from app.routers.jobs import deduplicate_jobs
from app.routers.admin_companies import (
    list_company_career_pages,
    create_company_career_page,
    update_company_career_page,
    delete_company_career_page,
)


def test_deduplicate_endpoint_and_admin_search():
    payload = [
        ScrapedJobPosting(
            id="rok-101",
            title="Backend Engineer (Golang)",
            company_name="Cloudflare, Inc.",
            url="https://remoteok.com/jobs/101",
            source_type="remoteok",
        ),
        ScrapedJobPosting(
            id="rem-202",
            title="Golang Backend Engineer",
            company_name="Cloudflare",
            url="https://remotive.com/jobs/202",
            salary_range="$160k - $200k",
            source_type="remotive",
        ),
    ]
    resp = deduplicate_jobs(jobs=payload, enable_vectors=False)
    assert resp["report"]["original_count"] == 2
    assert resp["report"]["duplicates_removed"] == 1
    assert len(resp["unique_jobs"]) == 1
    assert resp["unique_jobs"][0].salary_range == "$160k - $200k"


def test_admin_career_pages_crud(db_session):
    # 1. List career pages
    data = list_company_career_pages(db=db_session)
    assert isinstance(data, list)

    # 2. Create new company
    new_company = CompanyCareerPageCreate(
        name="Acme Test Corp",
        slug="acme",
        provider="greenhouse",
        domain="acme.org",
        career_url="https://boards.greenhouse.io/acme",
        logo_color="#ff0055",
        is_active=True,
        sync_frequency_hours=12.0,
    )
    created = create_company_career_page(payload=new_company, db=db_session)
    company_id = created.id
    assert created.name == "Acme Test Corp"

    # 3. Update company & search filter
    updated = update_company_career_page(company_id=company_id, payload=CompanyCareerPageUpdate(logo_color="#00ffcc"), db=db_session)
    assert updated.logo_color == "#00ffcc"

    search_res = list_company_career_pages(search="acme", db=db_session)
    assert any(c.id == company_id for c in search_res)

    # 4. Delete company
    del_res = delete_company_career_page(company_id=company_id, db=db_session)
    assert del_res is None
