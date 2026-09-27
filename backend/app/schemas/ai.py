from typing import List, Optional
from pydantic import BaseModel, Field


class ResumeMatchRequest(BaseModel):
    resume_text: str = Field(..., description="Text content or skills list of candidate's resume")
    job_description: str = Field(..., description="Job description or requirements text")
    job_title: Optional[str] = Field("", description="Title of the job role")
    company: Optional[str] = Field("", description="Company name")


class ResumeMatchResponse(BaseModel):
    match_score: int
    fit_level: str
    matching_skills: List[str]
    missing_skills: List[str]
    candidate_strengths: List[str]
    recommendations: List[str]
    summary: str


class CoverLetterRequest(BaseModel):
    resume_text: str = Field(..., description="Candidate resume text or summary")
    job_title: str = Field(..., description="Job role being applied for")
    company: str = Field(..., description="Target company name")
    job_description: Optional[str] = Field("", description="Optional job description to align with")
    tone: Optional[str] = Field("professional", description="Tone: professional, enthusiastic, confident")


class CoverLetterResponse(BaseModel):
    cover_letter: str
    outreach_message: str
    tone: str
    skills_highlighted: List[str]


class ParsedResumeResponse(BaseModel):
    raw_text: str = Field(..., description="Full cleaned text extracted from resume PDF")
    candidate_name: str = Field("", description="Detected candidate name")
    email: str = Field("", description="Extracted candidate email address")
    phone: str = Field("", description="Extracted phone number")
    links: List[str] = Field(default_factory=list, description="Extracted URLs, portfolio, GitHub, or LinkedIn links")
    skills: List[str] = Field(default_factory=list, description="Extracted technical skills and competencies")
    education: List[str] = Field(default_factory=list, description="Extracted education credentials or degrees")
    experience_roles: List[str] = Field(default_factory=list, description="Detected job titles or past experience roles")
    summary: str = Field(..., description="Executive summary preview of candidate profile")
