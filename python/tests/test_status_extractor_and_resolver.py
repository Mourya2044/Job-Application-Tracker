from app.db.models import Application, LifecycleStage, utc_now
from app.services.status_extractor import extract_email_status_event
from app.services.resolver import resolve_application_match


def test_status_extractor_heuristics():
    # 1. Rejection test
    rejection = extract_email_status_event(
        subject="Update on your application at Spotify",
        raw_body="Thank you for taking the time to speak with us. Unfortunately, we have decided not to advance your application at this time.",
        sender="careers@spotify.com",
    )
    assert rejection.is_job_related is True
    assert rejection.target_lifecycle_stage == LifecycleStage.REJECTED
    assert rejection.event_category == "rejection"

    # 2. Assessment test
    oa = extract_email_status_event(
        subject="Invitation to complete HackerRank assessment for Uber",
        raw_body="Please complete the online assessment on HackerRank within 48 hours to proceed.",
        sender="no-reply@hackerrank.net",
    )
    assert oa.is_job_related is True
    assert oa.target_lifecycle_stage == LifecycleStage.SCREENING
    assert oa.event_category == "assessment_invite"

    # 3. Interview test
    interview = extract_email_status_event(
        subject="Interview confirmation with Stripe for Software Engineer",
        raw_body="Your technical round is scheduled. Please join via https://meet.google.com/xyz-abcd-efg at the scheduled time.",
        sender="recruiting@stripe.com",
    )
    assert interview.is_job_related is True
    assert interview.target_lifecycle_stage == LifecycleStage.INTERVIEWING
    assert interview.meeting_link == "https://meet.google.com/xyz-abcd-efg"

    # 4. Offer test
    offer = extract_email_status_event(
        subject="Congratulations on your Offer Letter from Figma!",
        raw_body="We are pleased to offer you the role of Product Engineer. Please review the compensation package attached.",
        sender="hr@figma.com",
    )
    assert offer.is_job_related is True
    assert offer.target_lifecycle_stage == LifecycleStage.OFFER


def test_resolver_matching(db_session):
    app1 = Application(company_name="Spotify", company_domain="spotify.com", role_title="Dev", current_stage="applied", last_status_change_at=utc_now(), last_status_change_source="initial_ingest")
    app2 = Application(company_name="Stripe Inc.", company_domain="stripe.com", role_title="Backend", current_stage="applied", last_status_change_at=utc_now(), last_status_change_source="initial_ingest")
    db_session.add_all([app1, app2])
    db_session.commit()

    # Exact match via sender domain
    event1 = extract_email_status_event("Interview schedule", "Let's meet", "recruiter@spotify.com")
    matched1 = resolve_application_match(db_session, event1, sender="recruiter@spotify.com", subject="Interview schedule")
    assert matched1 is not None
    assert matched1.id == app1.id

    # Fuzzy match on company name
    event2 = extract_email_status_event("Your application at Stripe", "Next steps", "ats@greenhouse-mail.io")
    matched2 = resolve_application_match(db_session, event2, sender="ats@greenhouse-mail.io", subject="Your application at Stripe")
    assert matched2 is not None
    assert matched2.id == app2.id
