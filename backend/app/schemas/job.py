from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.db.models import LifecycleStage


class ScrapedJobPosting(BaseModel):
    id: str = Field(..., description="Unique ID for this job listing or token")
    title: str = Field(..., description="Job role title (e.g. Senior Backend Engineer)")
    company_name: str = Field(..., description="Company name")
    company_domain: Optional[str] = Field(None, description="Company website/domain")
    location: Optional[str] = Field("Remote", description="Location or Remote status")
    remote_type: Optional[str] = Field("Remote", description="remote, onsite, hybrid, or unknown")
    department: Optional[str] = Field(None, description="Team or department")
    url: str = Field(..., description="Direct link to apply or view posting")
    salary_range: Optional[str] = Field(None, description="Salary or compensation tier")
    description_snippet: Optional[str] = Field(None, description="Cleaned description or summary")
    source_type: str = Field("ats", description="ats_greenhouse, ats_lever, ats_ashby, json_ld, remoteok, or html_heuristic")
    posted_at: Optional[datetime] = None


class AtsScrapeRequest(BaseModel):
    provider: str = Field("greenhouse", description="greenhouse, lever, or ashby")
    company_slug: str = Field(..., description="Company identifier on the ATS (e.g. stripe, figma, airbnb)")


class UrlScrapeRequest(BaseModel):
    url: str = Field(..., description="Direct URL to a career page or job listing")


class JobSearchQuery(BaseModel):
    query: str = Field("software", description="Job title, skill, or keyword")
    location: Optional[str] = Field(None, description="Optional location filter")


class ImportScrapedJobPayload(BaseModel):
    job: ScrapedJobPosting
    target_stage: LifecycleStage = Field(default=LifecycleStage.APPLIED)
    notes: Optional[str] = None


class SavedJobCreate(BaseModel):
    title: str
    company_name: str
    company_logo_color: Optional[str] = None
    location: Optional[str] = "Remote"
    job_type: Optional[str] = "Full-time"
    salary_range: Optional[str] = None
    job_url: Optional[str] = None
    tags: Optional[str] = None
    posted_date: Optional[str] = "Recently"


class SavedJobRead(SavedJobCreate):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

