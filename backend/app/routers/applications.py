from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.database import get_db
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

router = APIRouter(prefix="/api/applications", tags=["applications"])


@router.get("", response_model=KanbanBoardResponse)
def list_applications_kanban(db: Session = Depends(get_db)):
    """Retrieve all tracked applications organized into Kanban lifecycle stage columns."""
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
    app = Application(
        company_name=payload.company_name,
        company_domain=payload.company_domain,
        role_title=payload.role_title,
        job_url=payload.job_url,
        location=payload.location,
        salary_range=payload.salary_range,
        current_stage=payload.current_stage.value,
        next_step=payload.next_step,
        next_step_deadline=payload.next_step_deadline,
        interview_link=payload.interview_link,
        manual_notes=payload.manual_notes,
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
    """Seed realistic initial applications across lifecycle stages for demo and verification."""
    existing_count = db.query(Application).count()
    if existing_count > 0:
        return get_kanban_board(db)

    samples = [
        {
            "company_name": "Stripe",
            "company_domain": "stripe.com",
            "role_title": "Senior Backend Engineer",
            "location": "Remote (US)",
            "salary_range": "$175,000 - $210,000",
            "current_stage": LifecycleStage.APPLIED.value,
            "next_step": "Awaiting response / OA",
        },
        {
            "company_name": "Google",
            "company_domain": "google.com",
            "role_title": "Software Engineer III (Core Systems)",
            "location": "Mountain View, CA / Hybrid",
            "salary_range": "$180,000 - $230,000",
            "current_stage": LifecycleStage.SCREENING.value,
            "next_step": "Complete OA (HackerRank)",
            "next_step_deadline": datetime(2026, 9, 2, 23, 59, tzinfo=timezone.utc),
        },
        {
            "company_name": "Datadog",
            "company_domain": "datadoghq.com",
            "role_title": "Full Stack Engineer (APM)",
            "location": "New York, NY",
            "salary_range": "$165,000 - $195,000",
            "current_stage": LifecycleStage.INTERVIEWING.value,
            "next_step": "Technical Round 2 with Engineering Manager",
            "next_step_deadline": datetime(2026, 9, 4, 15, 0, tzinfo=timezone.utc),
            "interview_link": "https://meet.google.com/abc-defg-hij",
        },
        {
            "company_name": "Figma",
            "company_domain": "figma.com",
            "role_title": "Product Engineer",
            "location": "San Francisco, CA",
            "salary_range": "$190,000 - $225,000",
            "current_stage": LifecycleStage.OFFER.value,
            "next_step": "Review formal offer package & sign",
            "next_step_deadline": datetime(2026, 9, 10, 18, 0, tzinfo=timezone.utc),
        },
        {
            "company_name": "Meta",
            "company_domain": "meta.com",
            "role_title": "Infrastructure Engineer",
            "location": "Menlo Park, CA",
            "salary_range": "$170,000 - $215,000",
            "current_stage": LifecycleStage.REJECTED.value,
            "next_step": "Position filled internally",
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
            next_step_deadline=item.get("next_step_deadline"),
            interview_link=item.get("interview_link"),
            last_status_change_at=utc_now(),
            last_status_change_source=TriggerSource.INITIAL_INGEST.value,
        )
        db.add(app)
        db.flush()

        event = ApplicationStatusEvent(
            application_id=app.id,
            from_stage=None,
            to_stage=app.current_stage,
            changed_at=utc_now(),
            trigger_source=TriggerSource.INITIAL_INGEST.value,
            change_summary=f"Initial application tracked in {app.current_stage} stage",
        )
        db.add(event)

    db.commit()
    return get_kanban_board(db)
