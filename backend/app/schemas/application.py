from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.db.models import LifecycleStage, TriggerSource


class ApplicationStatusEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    application_id: str
    from_stage: Optional[str] = None
    to_stage: str
    changed_at: datetime
    trigger_source: str
    user_note: Optional[str] = None
    confidence_score: Optional[float] = None
    change_summary: str
    email_message_id: Optional[str] = None
    email_subject: Optional[str] = None
    email_snippet: Optional[str] = None
    extracted_metadata: Optional[str] = None


class ApplicationBase(BaseModel):
    company_name: str = Field(..., description="Company name (e.g. Google, Stripe)")
    company_domain: Optional[str] = Field(None, description="Company website or domain")
    role_title: str = Field(..., description="Job role or title")
    job_url: Optional[str] = Field(None, description="Link to job posting")
    location: Optional[str] = Field(None, description="Location / Remote status")
    salary_range: Optional[str] = Field(None, description="Salary or compensation details")
    current_stage: LifecycleStage = Field(default=LifecycleStage.APPLIED)
    next_step: Optional[str] = Field(None, description="Upcoming deadline or interview note")
    next_step_deadline: Optional[datetime] = None
    interview_link: Optional[str] = None
    manual_notes: Optional[str] = None
    applied_date: Optional[datetime] = None
    tags: Optional[str] = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationUpdate(BaseModel):
    company_name: Optional[str] = None
    company_domain: Optional[str] = None
    role_title: Optional[str] = None
    job_url: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    next_step: Optional[str] = None
    next_step_deadline: Optional[datetime] = None
    interview_link: Optional[str] = None
    manual_notes: Optional[str] = None
    stage_locked: Optional[bool] = None
    applied_date: Optional[datetime] = None
    tags: Optional[str] = None


class ApplicationStageUpdate(BaseModel):
    to_stage: LifecycleStage
    user_note: Optional[str] = Field(None, description="Reason for manual transition")
    next_step: Optional[str] = Field(None, description="Optional updated next step")
    next_step_deadline: Optional[datetime] = None
    interview_link: Optional[str] = None


class ApplicationRead(ApplicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    stage_locked: bool
    last_status_change_at: datetime
    last_status_change_source: str
    pending_suggestion: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    status_events: List[ApplicationStatusEventRead] = []


class StageGroup(BaseModel):
    stage: str
    label: str
    count: int
    applications: List[ApplicationRead]


class KanbanBoardResponse(BaseModel):
    columns: List[StageGroup]
    total_applications: int
    last_sync_time: Optional[datetime] = None
