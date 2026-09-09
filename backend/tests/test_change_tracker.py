import json
from app.db.models import Application, ApplicationStatusEvent, LifecycleStage, TriggerSource, utc_now
from app.schemas.application import ApplicationStageUpdate
from app.schemas.email_event import ParsedEmailEvent
from app.services.change_tracker import (
    get_kanban_board,
    update_stage_manually,
    apply_auto_stage_change,
    toggle_stage_lock,
    revert_to_event,
)


def test_manual_stage_update_and_audit_event(db_session):
    # 1. Create application
    app = Application(
        company_name="Stripe",
        role_title="Backend Engineer",
        current_stage=LifecycleStage.APPLIED.value,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.INITIAL_INGEST.value,
    )
    db_session.add(app)
    db_session.commit()
    db_session.refresh(app)

    # 2. Manually update stage to INTERVIEWING
    update_payload = ApplicationStageUpdate(
        to_stage=LifecycleStage.INTERVIEWING,
        user_note="Recruiter reached out via phone",
        next_step="Round 1 Technical Interview",
    )
    updated_app = update_stage_manually(db_session, app, update_payload)

    assert updated_app.current_stage == LifecycleStage.INTERVIEWING.value
    assert updated_app.last_status_change_source == TriggerSource.MANUAL_USER_OVERRIDE.value
    assert updated_app.next_step == "Round 1 Technical Interview"

    # 3. Check status events audit trail
    events = db_session.query(ApplicationStatusEvent).filter(ApplicationStatusEvent.application_id == app.id).all()
    assert len(events) == 1
    event = events[0]
    assert event.from_stage == LifecycleStage.APPLIED.value
    assert event.to_stage == LifecycleStage.INTERVIEWING.value
    assert event.trigger_source == TriggerSource.MANUAL_USER_OVERRIDE.value
    assert event.user_note == "Recruiter reached out via phone"


def test_stage_lock_protects_against_auto_update(db_session):
    app = Application(
        company_name="Google",
        role_title="Systems Engineer",
        current_stage=LifecycleStage.SCREENING.value,
        stage_locked=True,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.MANUAL_USER_OVERRIDE.value,
    )
    db_session.add(app)
    db_session.commit()
    db_session.refresh(app)

    # Simulated email indicates rejection
    event = ParsedEmailEvent(
        is_job_related=True,
        event_category="rejection",
        target_lifecycle_stage=LifecycleStage.REJECTED,
        confidence=0.95,
        summary_sentence="Unfortunately we will not be proceeding.",
    )

    apply_auto_stage_change(
        db=db_session,
        application=app,
        event_data=event,
        email_message_id="msg-123",
        email_subject="Your Google Application Status",
    )

    # Since app is locked, stage should NOT change to REJECTED, but suggestion is created
    assert app.current_stage == LifecycleStage.SCREENING.value
    assert app.pending_suggestion is not None
    sugg_json = json.loads(app.pending_suggestion)
    assert sugg_json["suggested_stage"] == LifecycleStage.REJECTED.value


def test_revert_to_previous_state(db_session):
    app = Application(
        company_name="Datadog",
        role_title="Security Engineer",
        current_stage=LifecycleStage.APPLIED.value,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.INITIAL_INGEST.value,
    )
    db_session.add(app)
    db_session.commit()

    # Move to SCREENING
    update_stage_manually(db_session, app, ApplicationStageUpdate(to_stage=LifecycleStage.SCREENING))
    # Move to INTERVIEWING
    update_stage_manually(db_session, app, ApplicationStageUpdate(to_stage=LifecycleStage.INTERVIEWING))
    
    assert app.current_stage == LifecycleStage.INTERVIEWING.value

    # Find the first move event (Applied -> Screening)
    events = db_session.query(ApplicationStatusEvent).filter(ApplicationStatusEvent.application_id == app.id).order_by(ApplicationStatusEvent.changed_at.asc()).all()
    first_event = events[0]

    # Revert back
    reverted_app = revert_to_event(db_session, app, first_event.id)
    assert reverted_app.current_stage == LifecycleStage.APPLIED.value
    assert reverted_app.last_status_change_source == TriggerSource.UNDO_ACTION.value


def test_kanban_board_grouping(db_session):
    app1 = Application(company_name="Apple", role_title="Dev", current_stage=LifecycleStage.APPLIED.value, last_status_change_at=utc_now(), last_status_change_source="initial_ingest")
    app2 = Application(company_name="Netflix", role_title="Dev", current_stage=LifecycleStage.INTERVIEWING.value, last_status_change_at=utc_now(), last_status_change_source="initial_ingest")
    db_session.add_all([app1, app2])
    db_session.commit()

    board = get_kanban_board(db_session)
    assert board.total_applications == 2
    
    applied_col = next(c for c in board.columns if c.stage == LifecycleStage.APPLIED.value)
    interview_col = next(c for c in board.columns if c.stage == LifecycleStage.INTERVIEWING.value)
    
    assert applied_col.count == 1
    assert applied_col.applications[0].company_name == "Apple"
    assert interview_col.count == 1
    assert interview_col.applications[0].company_name == "Netflix"
