from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ResumeMatchRequest(BaseModel):
    resume_text: str = Field(..., description="Text content or skills list of candidate's resume")
    job_description: str = Field(..., description="Job description or requirements text")
    job_title: Optional[str] = Field("", description="Title of the job role")
    company: Optional[str] = Field("", description="Company name")


class ATSBreakdown(BaseModel):
    skills_score: int = Field(..., description="Technical keywords & skills match score (0-100)")
    experience_score: int = Field(..., description="Years of experience and seniority alignment score (0-100)")
    education_score: int = Field(..., description="Education and credentials match score (0-100)")
    formatting_score: int = Field(..., description="ATS parseability, section headers, and formatting score (0-100)")
    semantic_score: int = Field(..., description="Semantic relevance and responsibility alignment score (0-100)")


class SectionChecks(BaseModel):
    has_email: bool = Field(..., description="Valid contact email detected")
    has_phone: bool = Field(..., description="Contact phone number detected")
    has_experience_section: bool = Field(..., description="Standard work experience section detected")
    has_education_section: bool = Field(..., description="Standard education section detected")
    has_skills_section: bool = Field(..., description="Standard technical skills section detected")
    has_quantified_metrics: bool = Field(..., description="Action verbs with quantified metrics detected")


class ResumeMatchResponse(BaseModel):
    match_score: int = Field(..., description="Overall ATS composite match score (0-100)")
    fit_level: str = Field(..., description="ATS fit tier / ranking tier")
    matching_skills: List[str] = Field(..., description="Matched technical skills and qualifications")
    missing_skills: List[str] = Field(..., description="Missing ATS keywords and qualifications")
    candidate_strengths: List[str] = Field(..., description="Candidate strengths exceeding job requirements")
    recommendations: List[str] = Field(..., description="Actionable ATS optimization recommendations")
    summary: str = Field(..., description="Executive ATS evaluation summary")
    # Extended ATS Scorer telemetry
    ats_score: Optional[int] = Field(None, description="Equivalent to match_score")
    ats_breakdown: Optional[ATSBreakdown] = Field(None, description="Pillar-by-pillar ATS score breakdown")
    section_checks: Optional[SectionChecks] = Field(None, description="ATS parseability and formatting checklist")
    detected_years_candidate: Optional[int] = Field(None, description="Candidate years of experience detected")
    detected_years_required: Optional[int] = Field(None, description="Job required years of experience detected")
    bullet_critiques: Optional[List[Dict[str, str]]] = Field(default_factory=list, description="AI bullet point rewrites following the Google XYZ formula")
    strategic_interview_tips: Optional[List[str]] = Field(default_factory=list, description="Tailored interview discussion topics and strategic positioning")


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
