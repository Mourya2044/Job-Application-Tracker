import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.database import get_db, init_db
from app.db.models import (
    Application,
    ApplicationStatusEvent,
    EmailLog,
    LifecycleStage,
    TriggerSource,
    utc_now,
)
from app.schemas.application import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationStageUpdate,
    ApplicationUpdate,
    KanbanBoardResponse,
)
from app.services.change_tracker import (
    get_kanban_board,
    revert_to_event,
    toggle_stage_lock,
    update_stage_manually,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/applications", tags=["applications"])


@router.get("", response_model=KanbanBoardResponse)
def list_applications_kanban(db: Session = Depends(get_db)):
    """Retrieve all tracked applications organized into Kanban lifecycle stage columns."""
    try:
        return get_kanban_board(db)
    except Exception as e:
        logger.error("Error retrieving Kanban board (%s). Attempting schema self-heal...", e)
        db.rollback()
        init_db()
        return get_kanban_board(db)


@router.get("/{application_id}", response_model=ApplicationRead)
def get_application(application_id: str, db: Session = Depends(get_db)):
    """Get single application details including chronological status change audit trail."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.post("", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationCreate, db: Session = Depends(get_db)):
    """Create or ingest an application record from upstream."""
    target_stage = payload.current_stage.value
    app = Application(
        company_name=payload.company_name,
        company_domain=payload.company_domain,
        role_title=payload.role_title,
        job_url=payload.job_url,
        location=payload.location,
        salary_range=payload.salary_range,
        current_stage=target_stage,
        next_step=payload.next_step,
        next_step_deadline=payload.next_step_deadline,
        interview_link=payload.interview_link,
        manual_notes=payload.manual_notes,
        applied_date=payload.applied_date or utc_now(),
        tags=payload.tags,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.INITIAL_INGEST.value,
    )
    db.add(app)
    db.flush()

    # Initial status event
    initial_event = ApplicationStatusEvent(
        application_id=app.id,
        from_stage=None,
        to_stage=app.current_stage,
        changed_at=utc_now(),
        trigger_source=TriggerSource.INITIAL_INGEST.value,
        change_summary=f"Application created in {app.current_stage} stage",
    )
    db.add(initial_event)
    db.commit()
    db.refresh(app)
    return app


@router.patch("/{application_id}", response_model=ApplicationRead)
def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    db: Session = Depends(get_db),
):
    """Update general metadata of an application."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(app, field, value)

    app.updated_at = utc_now()
    db.commit()
    db.refresh(app)
    return app


@router.patch("/{application_id}/stage", response_model=ApplicationRead)
def change_stage_manually(
    application_id: str,
    payload: ApplicationStageUpdate,
    db: Session = Depends(get_db),
):
    """Manually update the lifecycle stage of an application with optional notes & deadlines."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    return update_stage_manually(db=db, application=app, stage_update=payload)


@router.post("/{application_id}/lock", response_model=ApplicationRead)
def lock_stage(application_id: str, db: Session = Depends(get_db)):
    """Toggle manual stage lock to prevent background mailbox sync from overriding stage."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    return toggle_stage_lock(db=db, application=app)


@router.post("/{application_id}/revert/{event_id}", response_model=ApplicationRead)
def revert_stage(
    application_id: str,
    event_id: str,
    db: Session = Depends(get_db),
):
    """Revert application back to a previous stage in its change history."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    try:
        return revert_to_event(db=db, application=app, target_event_id=event_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: str, db: Session = Depends(get_db)):
    """Delete an application and its change ledger."""
    app = db.query(Application).filter(Application.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(app)
    db.commit()
    return None


@router.post("/clear", status_code=status.HTTP_200_OK)
def clear_all_applications(db: Session = Depends(get_db)):
    """Clear all applications, status events, and email logs to start completely fresh."""
    db.query(ApplicationStatusEvent).delete()
    db.query(EmailLog).delete()
    db.query(Application).delete()
    db.commit()
    return {"message": "All application records, events, and logs cleared successfully."}


@router.post("/seed", response_model=KanbanBoardResponse)
def seed_demo_applications(db: Session = Depends(get_db)):
    """Seed realistic initial applications matching code.html for demo and verification."""
    existing_count = db.query(Application).count()
    if existing_count > 0:
        return get_kanban_board(db)

    samples = [
        {
            "company_name": "Vercel",
            "company_domain": "vercel.com",
            "role_title": "Software Engineer, Frontend",
            "location": "Remote",
            "salary_range": "$160,000 - $190,000",
            "current_stage": "offer",
            "applied_date": datetime(2024, 12, 28, tzinfo=timezone.utc),
            "next_step": "Offer letter received. Review & sign package",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Confirmation email received", "trigger": "mailbox_auto", "time": datetime(2024, 12, 28, tzinfo=timezone.utc)},
                {"from_stage": "applied", "to_stage": "screening", "summary": "Recruiter email: moving to screening", "trigger": "mailbox_auto", "time": datetime(2025, 1, 3, tzinfo=timezone.utc)},
                {"from_stage": "screening", "to_stage": "interview", "summary": "Interview invitation via email", "trigger": "mailbox_auto", "time": datetime(2025, 1, 8, tzinfo=timezone.utc)},
                {"from_stage": "interview", "to_stage": "offer", "summary": "Offer letter received", "trigger": "mailbox_auto", "time": datetime(2025, 1, 14, tzinfo=timezone.utc)},
            ],
        },
        {
            "company_name": "Meta",
            "company_domain": "meta.com",
            "role_title": "Product Engineer",
            "location": "Menlo Park, CA",
            "salary_range": "$175,000 - $215,000",
            "current_stage": "interview",
            "applied_date": datetime(2025, 1, 3, tzinfo=timezone.utc),
            "next_step": "System Design Round (2:00 PM - 3:30 PM)",
            "manual_notes": "Prepare system design for next round",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Application confirmed", "trigger": "mailbox_auto", "time": datetime(2025, 1, 3, tzinfo=timezone.utc)},
                {"from_stage": "applied", "to_stage": "screening", "summary": "Phone screen scheduled", "trigger": "mailbox_auto", "time": datetime(2025, 1, 6, tzinfo=timezone.utc)},
                {"from_stage": "screening", "to_stage": "interview", "summary": "Passed phone screen, onsite scheduled", "trigger": "manual_user_override", "time": datetime(2025, 1, 10, tzinfo=timezone.utc)},
            ],
        },
        {
            "company_name": "Airbnb",
            "company_domain": "airbnb.com",
            "role_title": "Frontend Engineer",
            "location": "San Francisco, CA",
            "salary_range": "$170,000 - $200,000",
            "current_stage": "interview",
            "applied_date": datetime(2025, 1, 5, tzinfo=timezone.utc),
            "next_step": "Technical Screen (10:00 AM - 11:00 AM)",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Application received", "trigger": "mailbox_auto", "time": datetime(2025, 1, 5, tzinfo=timezone.utc)},
                {"from_stage": "applied", "to_stage": "screening", "summary": "Technical assessment link received", "trigger": "mailbox_auto", "time": datetime(2025, 1, 7, tzinfo=timezone.utc)},
                {"from_stage": "screening", "to_stage": "interview", "summary": "Round 2 interview invite", "trigger": "mailbox_auto", "time": datetime(2025, 1, 12, tzinfo=timezone.utc)},
            ],
        },
        {
            "company_name": "Spotify",
            "company_domain": "spotify.com",
            "role_title": "Full Stack Developer",
            "location": "Remote",
            "salary_range": "$150,000 - $185,000",
            "current_stage": "screening",
            "applied_date": datetime(2025, 1, 8, tzinfo=timezone.utc),
            "next_step": "Resume review in progress",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Application submitted", "trigger": "mailbox_auto", "time": datetime(2025, 1, 8, tzinfo=timezone.utc)},
                {"from_stage": "applied", "to_stage": "screening", "summary": "Resume review in progress", "trigger": "mailbox_auto", "time": datetime(2025, 1, 12, tzinfo=timezone.utc)},
            ],
        },
        {
            "company_name": "Netflix",
            "company_domain": "netflix.com",
            "role_title": "Senior Software Engineer",
            "location": "Los Gatos, CA",
            "salary_range": "$200,000 - $260,000",
            "current_stage": "applied",
            "applied_date": datetime(2025, 1, 10, tzinfo=timezone.utc),
            "next_step": "Awaiting initial recruiter screening",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Application confirmed", "trigger": "mailbox_auto", "time": datetime(2025, 1, 10, tzinfo=timezone.utc)},
            ],
        },
        {
            "company_name": "Figma",
            "company_domain": "figma.com",
            "role_title": "Design Engineer",
            "location": "San Francisco, CA",
            "salary_range": "$165,000 - $195,000",
            "current_stage": "applied",
            "applied_date": datetime(2025, 1, 11, tzinfo=timezone.utc),
            "next_step": "Application received via careers@figma.com",
            "events": [
                {"from_stage": None, "to_stage": "applied", "summary": "Application received", "trigger": "mailbox_auto", "time": datetime(2025, 1, 11, tzinfo=timezone.utc)},
            ],
        },
    ]

    for item in samples:
        app = Application(
            company_name=item["company_name"],
            company_domain=item["company_domain"],
            role_title=item["role_title"],
            location=item["location"],
            salary_range=item["salary_range"],
            current_stage=item["current_stage"],
            next_step=item.get("next_step"),
            manual_notes=item.get("manual_notes"),
            applied_date=item.get("applied_date", utc_now()),
            tags="Auto-tracked",
            last_status_change_at=item["events"][-1]["time"] if item.get("events") else utc_now(),
            last_status_change_source=item["events"][-1]["trigger"] if item.get("events") else TriggerSource.INITIAL_INGEST.value,
        )
        db.add(app)
        db.flush()

        for evt in item.get("events", []):
            event = ApplicationStatusEvent(
                application_id=app.id,
                from_stage=evt.get("from_stage"),
                to_stage=evt.get("to_stage"),
                changed_at=evt.get("time", utc_now()),
                trigger_source=evt.get("trigger", "mailbox_auto"),
                change_summary=evt.get("summary", f"Stage changed to {evt.get('to_stage')}"),
            )
            db.add(event)

    db.commit()
    return get_kanban_board(db)

