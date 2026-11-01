from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class CompanyCareerPageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Display name of company e.g. Stripe")
    slug: str = Field(..., min_length=1, max_length=255, description="ATS board slug e.g. stripe")
    provider: str = Field("greenhouse", description="ATS provider: greenhouse, lever, ashby, workable, or json_ld")
    domain: Optional[str] = Field(None, max_length=255, description="Company root domain e.g. stripe.com")
    career_url: Optional[str] = Field(None, max_length=1024, description="Direct URL to career portal")
    logo_color: Optional[str] = Field("#60a5fa", description="Hex brand color e.g. #60a5fa")
    is_active: bool = Field(True, description="Whether automated or manual discovery is enabled")
    sync_frequency_hours: float = Field(24.0, ge=1.0, le=168.0, description="Sync cadence in hours")


class CompanyCareerPageCreate(CompanyCareerPageBase):
    pass


class CompanyCareerPageUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    provider: Optional[str] = None
    domain: Optional[str] = None
    career_url: Optional[str] = None
    logo_color: Optional[str] = None
    is_active: Optional[bool] = None
    sync_frequency_hours: Optional[float] = None


class CompanyCareerPageRead(CompanyCareerPageBase):
    id: str
    last_synced_at: Optional[datetime] = None
    last_sync_status: str
    last_error_message: Optional[str] = None
    total_jobs_found: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)



class CompanySyncResult(BaseModel):
    company_id: str
    name: str
    provider: str
    slug: str
    status: str
    jobs_count: int
    message: str
    synced_at: datetime
