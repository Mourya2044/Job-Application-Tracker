import pytest
from app.capabilities.factory import CapabilityFactory
from app.providers.fallback_heuristic import (
    HeuristicExtractionProvider,
    generate_fallback_cover_letter,
    generate_fallback_resume_fit,
)


@pytest.mark.anyio
async def test_heuristic_extraction_provider():
    provider = HeuristicExtractionProvider()
    res = await provider.extract_email_event(
        subject="Interview with Stripe: Technical Screen",
        sender="recruiting@stripe.com",
        body="Hi Candidate, we would like to schedule a 45-minute technical screen on Google Meet: https://meet.google.com/abc-defg-hij",
    )
    assert res.is_job_related is True
    assert res.target_lifecycle_stage == "interviewing"
    assert res.company_name == "Stripe"
    assert "https://meet.google.com" in (res.meeting_link or "")


@pytest.mark.anyio
async def test_heuristic_rejection_extraction():
    provider = HeuristicExtractionProvider()
    res = await provider.extract_email_event(
        subject="Update on your application with Figma",
        sender="talent@figma.com",
        body="Thank you for your interest in Figma. Unfortunately, after careful consideration, we have decided not to advance your candidacy at this time.",
    )
    assert res.is_job_related is True
    assert res.target_lifecycle_stage == "rejected"
    assert res.company_name == "Figma"


@pytest.mark.anyio
async def test_fallback_resume_fit_and_cover_letter():
    fit = generate_fallback_resume_fit(
        company="Datadog",
        job_title="Software Engineer, Distributed Systems",
        job_description="Seeking backend engineer proficient in Python, Go, distributed tracing, and Kubernetes.",
        resume_text="Senior Python engineer with 5 years building scalable microservices, Go APIs, and containerized cloud systems.",
    )
    assert fit.match_score >= 50.0
    assert len(fit.strengths) > 0
    assert len(fit.xyz_bullet_recommendations) > 0

    letter = generate_fallback_cover_letter(
        company="Datadog",
        job_title="Software Engineer",
        tone="Professional",
    )
    assert "Datadog" in letter.cover_letter
    assert "Software Engineer" in letter.cover_letter


@pytest.mark.anyio
async def test_embedding_provider_batch():
    provider = CapabilityFactory.get_embedding_provider()
    embeddings = await provider.embed_batch(["Backend Software Engineer", "Frontend React Developer"])
    assert len(embeddings) == 2
    assert len(embeddings[0]) == provider.dimensions
    assert len(embeddings[1]) == provider.dimensions

