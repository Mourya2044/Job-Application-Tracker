from typing import Literal, Optional
from pydantic import BaseModel, Field
from app.db.models import LifecycleStage

EVENT_CATEGORIES = Literal[
    "application_confirmation",
    "assessment_invite",
    "interview_invite",
    "interview_scheduled",
    "offer_received",
    "rejection",
    "recruiter_outreach",
    "status_update_general",
    "other_unrelated",
]


class ParsedEmailEvent(BaseModel):
    is_job_related: bool = Field(
        description="True if this email relates to a job application (confirmation, assessment, interview, offer, rejection, recruiter)."
    )
    event_category: EVENT_CATEGORIES = Field(
        default="other_unrelated",
        description="Categorization of the email event."
    )
    company_name: Optional[str] = Field(
        default=None,
        description="Normalized company name from subject or body (e.g. 'Google', 'Stripe', 'Meta')."
    )
    company_domain: Optional[str] = Field(
        default=None,
        description="Company domain if identifiable (e.g. 'stripe.com')."
    )
    role_title: Optional[str] = Field(
        default=None,
        description="Job role/title mentioned in the email."
    )
    target_lifecycle_stage: Optional[LifecycleStage] = Field(
        default=None,
        description="Corresponding lifecycle stage if this email represents a stage transition."
    )
    confidence: float = Field(
        default=0.0,
        description="Confidence score between 0.0 and 1.0 in this classification."
    )
    action_required: bool = Field(
        default=False,
        description="True if user needs to take action (e.g. complete assessment, choose interview slot, sign offer)."
    )
    action_deadline: Optional[str] = Field(
        default=None,
        description="Human readable deadline string or date if mentioned (e.g. 'Aug 30, 2026 5:00 PM')."
    )
    interview_date_time: Optional[str] = Field(
        default=None,
        description="Date and time of scheduled interview if mentioned."
    )
    meeting_link: Optional[str] = Field(
        default=None,
        description="Zoom, Google Meet, Teams, or scheduling URL (e.g. Calendly/GoodTime)."
    )
    summary_sentence: Optional[str] = Field(
        default=None,
        description="Concise 1-sentence summary of the update."
    )
