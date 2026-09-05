import json
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.models import (
    Application,
    ApplicationStatusEvent,
    LifecycleStage,
    TriggerSource,
    utc_now,
)
from app.schemas.application import (
    ApplicationStageUpdate,
    KanbanBoardResponse,
    StageGroup,
    ApplicationRead,
)
from app.schemas.email_event import ParsedEmailEvent


STAGE_DEFINITIONS = [
    {"stage": LifecycleStage.APPLIED.value, "label": "Applied"},
    {"stage": LifecycleStage.SCREENING.value, "label": "Screening / OA"},
    {"stage": LifecycleStage.INTERVIEWING.value, "label": "Interviewing"},
    {"stage": LifecycleStage.OFFER.value, "label": "Offer Received"},
    {"stage": LifecycleStage.ACCEPTED.value, "label": "Accepted"},
    {"stage": LifecycleStage.REJECTED.value, "label": "Rejected"},
    {"stage": LifecycleStage.WITHDRAWN.value, "label": "Withdrawn / Archived"},
]


def get_kanban_board(db: Session) -> KanbanBoardResponse:
    applications = db.query(Application).order_by(desc(Application.last_status_change_at)).all()
    
    # Group by stage
    groups_dict = {def_item["stage"]: [] for def_item in STAGE_DEFINITIONS}
    for app in applications:
        stage_key = app.current_stage
        if stage_key not in groups_dict:
            stage_key = LifecycleStage.APPLIED.value
        groups_dict[stage_key].append(ApplicationRead.model_validate(app))

    columns = []
    for def_item in STAGE_DEFINITIONS:
        apps_in_stage = groups_dict[def_item["stage"]]
        columns.append(
            StageGroup(
                stage=def_item["stage"],
                label=def_item["label"],
                count=len(apps_in_stage),
                applications=apps_in_stage,
            )
        )

    return KanbanBoardResponse(
        columns=columns,
        total_applications=len(applications),
    )


def update_stage_manually(
    db: Session,
    application: Application,
    stage_update: ApplicationStageUpdate,
) -> Application:
    old_stage = application.current_stage
    new_stage = stage_update.to_stage.value

    # Update application fields
    application.current_stage = new_stage
    application.last_status_change_at = utc_now()
    application.last_status_change_source = TriggerSource.MANUAL_USER_OVERRIDE.value
    
    if stage_update.next_step is not None:
        application.next_step = stage_update.next_step
    if stage_update.next_step_deadline is not None:
        application.next_step_deadline = stage_update.next_step_deadline
    if stage_update.interview_link is not None:
        application.interview_link = stage_update.interview_link
    if stage_update.user_note is not None:
        application.manual_notes = stage_update.user_note
        
    # Clear any pending suggestion once user explicitly acts
    application.pending_suggestion = None

    # Record audit event
    summary = f"Manually changed stage from {old_stage} to {new_stage}"
    if stage_update.user_note:
        summary += f" ({stage_update.user_note})"

    event = ApplicationStatusEvent(
        application_id=application.id,
        from_stage=old_stage,
        to_stage=new_stage,
        changed_at=utc_now(),
        trigger_source=TriggerSource.MANUAL_USER_OVERRIDE.value,
        user_note=stage_update.user_note,
        confidence_score=1.0,
        change_summary=summary,
    )
    db.add(event)
    db.commit()
    db.refresh(application)
    return application


def apply_auto_stage_change(
    db: Session,
    application: Application,
    event_data: ParsedEmailEvent,
    email_message_id: Optional[str] = None,
    email_subject: Optional[str] = None,
    email_snippet: Optional[str] = None,
) -> Application:
    if not event_data.target_lifecycle_stage:
        return application

    target_stage = event_data.target_lifecycle_stage.value
    old_stage = application.current_stage

    # If stage is already the same, just update next step / dates if available
    if old_stage == target_stage:
        if event_data.action_deadline:
            application.next_step_deadline = None  # Could parse datetime if formatted
            application.next_step = f"Action deadline: {event_data.action_deadline}"
        if event_data.meeting_link:
            application.interview_link = event_data.meeting_link
        db.commit()
        db.refresh(application)
        return application

    # Check if application stage is locked by user or confidence is low
    if application.stage_locked or event_data.confidence < 0.80:
        suggestion = {
            "suggested_stage": target_stage,
            "confidence": event_data.confidence,
            "reason": event_data.summary_sentence or f"Detected {event_data.event_category} email",
            "email_subject": email_subject,
            "email_message_id": email_message_id,
            "interview_date_time": event_data.interview_date_time,
            "meeting_link": event_data.meeting_link,
            "action_deadline": event_data.action_deadline,
        }
        application.pending_suggestion = json.dumps(suggestion)
        db.commit()
        db.refresh(application)
        return application

    # Apply automated stage transition
    application.current_stage = target_stage
    application.last_status_change_at = utc_now()
    application.last_status_change_source = TriggerSource.MAILBOX_AUTO.value
    application.pending_suggestion = None

    if event_data.interview_date_time:
        application.next_step = f"Interview on {event_data.interview_date_time}"
    elif event_data.action_deadline:
        application.next_step = f"Deadline: {event_data.action_deadline}"
    elif event_data.summary_sentence:
        application.next_step = event_data.summary_sentence

    if event_data.meeting_link:
        application.interview_link = event_data.meeting_link

    meta_json = json.dumps(event_data.model_dump())
    summary = f"Auto-updated from {old_stage} to {target_stage} via email: {event_data.summary_sentence or email_subject or 'Status change detected'}"

    event = ApplicationStatusEvent(
        application_id=application.id,
        from_stage=old_stage,
        to_stage=target_stage,
        changed_at=utc_now(),
        trigger_source=TriggerSource.MAILBOX_AUTO.value,
        confidence_score=event_data.confidence,
        change_summary=summary,
        email_message_id=email_message_id,
        email_subject=email_subject,
        email_snippet=email_snippet,
        extracted_metadata=meta_json,
    )
    db.add(event)
    db.commit()
    db.refresh(application)
    return application


def toggle_stage_lock(db: Session, application: Application) -> Application:
    application.stage_locked = not application.stage_locked
    db.commit()
    db.refresh(application)
    return application


def revert_to_event(db: Session, application: Application, target_event_id: str) -> Application:
    target_event = db.query(ApplicationStatusEvent).filter(
        ApplicationStatusEvent.id == target_event_id,
        ApplicationStatusEvent.application_id == application.id,
    ).first()

    if not target_event:
        raise ValueError("Status event not found for this application")

    old_stage = application.current_stage
    revert_stage = target_event.from_stage or target_event.to_stage

    application.current_stage = revert_stage
    application.last_status_change_at = utc_now()
    application.last_status_change_source = TriggerSource.UNDO_ACTION.value
    application.pending_suggestion = None

    undo_event = ApplicationStatusEvent(
        application_id=application.id,
        from_stage=old_stage,
        to_stage=revert_stage,
        changed_at=utc_now(),
        trigger_source=TriggerSource.UNDO_ACTION.value,
        confidence_score=1.0,
        change_summary=f"Reverted stage from {old_stage} back to {revert_stage}",
    )
    db.add(undo_event)
    db.commit()
    db.refresh(application)
    return application
