from typing import Any, Dict, List, Optional, Protocol, runtime_checkable
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Standardized Pydantic Schemas across all Providers
# ---------------------------------------------------------------------------

class SkillGapItem(BaseModel):
    category: str
    missing_skills: List[str]
    importance: str = "preferred"  # required, preferred, nice_to_have


class ResumeFitResult(BaseModel):
    match_score: float = Field(..., ge=0.0, le=100.0)
    summary: str
    strengths: List[str] = Field(default_factory=list)
    missing_skills: List[SkillGapItem] = Field(default_factory=list)
    xyz_bullet_recommendations: List[str] = Field(default_factory=list)
    confidence_score: float = Field(default=0.85, ge=0.0, le=1.0)
    model_name: Optional[str] = None
    model_version: Optional[str] = None


class CoverLetterResult(BaseModel):
    cover_letter: str
    recruiter_outreach: str
    tone_applied: str
    model_name: Optional[str] = None


class ExtractedEmailEventResult(BaseModel):
    is_job_related: bool
    event_category: str  # application_confirmation, interview_invite, assessment_invite, rejection, offer, other_unrelated
    target_lifecycle_stage: str  # applied, screening, interviewing, offer, rejected, other
    company_name: Optional[str] = None
    company_domain: Optional[str] = None
    role_title: Optional[str] = None
    meeting_link: Optional[str] = None
    action_deadline: Optional[str] = None
    interview_date_time: Optional[str] = None
    confidence_score: float = Field(default=0.85, ge=0.0, le=1.0)
    evidence_snippet: Optional[str] = None


class ParsedResumeProfile(BaseModel):
    candidate_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    summary: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    experience_years: Optional[float] = None
    education: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    raw_text: str


# ---------------------------------------------------------------------------
# Capability Protocols (Interfaces)
# ---------------------------------------------------------------------------

@runtime_checkable
class TextGenerationProvider(Protocol):
    provider_name: str
    model_name: str

    async def generate_completion(
        self,
        system_instruction: str,
        user_prompt: str,
        max_tokens: int = 1200,
        temperature: float = 0.2,
    ) -> str:
        ...


@runtime_checkable
class StructuredExtractionProvider(Protocol):
    provider_name: str
    model_name: str

    async def extract_email_event(
        self,
        subject: str,
        sender: str,
        body: str,
    ) -> ExtractedEmailEventResult:
        ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    provider_name: str
    model_name: str
    dimensions: int

    async def embed_text(self, text: str) -> List[float]:
        ...

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        ...

