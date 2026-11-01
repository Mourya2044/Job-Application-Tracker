import re
from typing import List, Optional
from bs4 import BeautifulSoup

from app.capabilities.base import (
    CoverLetterResult,
    ExtractedEmailEventResult,
    ResumeFitResult,
    SkillGapItem,
    StructuredExtractionProvider,
)

COMMON_EMAIL_PROVIDERS = (
    "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"
)


class HeuristicExtractionProvider(StructuredExtractionProvider):
    provider_name: str = "heuristic_fallback"
    model_name: str = "regex_v1"

    async def extract_email_event(
        self,
        subject: str,
        sender: str,
        body: str,
    ) -> ExtractedEmailEventResult:
        combined = f"{subject} {sender} {body}".lower()

        # Meeting links
        link_match = re.search(r"https?://(?:www\.)?(?:calendly|zoom|meet\.google|teams\.microsoft)[^\s>]+", body)
        meeting_link = link_match.group(0) if link_match else None

        # Stage classification
        if "interview" in combined or "phone screen" in combined or "meet the team" in combined:
            stage = "interviewing"
            category = "interview_invite"
        elif "assessment" in combined or "hackerrank" in combined or "codesignal" in combined or "testgorilla" in combined:
            stage = "screening"
            category = "assessment_invite"
        elif "offer" in combined and ("pleased to offer" in combined or "offer letter" in combined):
            stage = "offer"
            category = "offer_received"
        elif "unfortunately" in combined or "not moving forward" in combined or "other candidates" in combined:
            stage = "rejected"
            category = "rejection"
        elif "thank you for applying" in combined or "application received" in combined or "status of your application" in combined:
            stage = "applied"
            category = "application_confirmation"
        else:
            stage = "other"
            category = "other_unrelated"

        # Company extraction
        company: Optional[str] = None
        # Clean delimiters first
        clean_subj = re.split(r"[:\-|–—]", subject)[0].strip()
        subj_match = re.search(r"\b(?:at|for|with|from)\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,2})\b", clean_subj, re.IGNORECASE)
        if subj_match:
            cand = subj_match.group(1).strip()
            if cand.lower() not in {"software", "engineer", "role", "position", "the", "an", "a", "your application"}:
                company = cand

        company_domain: Optional[str] = None
        if sender and "@" in sender:
            domain = sender.split("@")[-1].lower()
            if domain not in COMMON_EMAIL_PROVIDERS:
                company_domain = domain
                if not company:
                    company = domain.split(".")[0].capitalize()

        return ExtractedEmailEventResult(
            is_job_related=category != "other_unrelated",
            event_category=category,
            target_lifecycle_stage=stage,
            company_name=company or "Company",
            company_domain=company_domain,
            role_title="Software Engineer",
            meeting_link=meeting_link,
            confidence_score=0.75,
            evidence_snippet=body[:200] if body else None,
        )


def generate_fallback_resume_fit(
    company: str,
    job_title: str,
    job_description: str,
    resume_text: str,
) -> ResumeFitResult:
    """Heuristic fallback when external LLM APIs are unreachable."""
    from rapidfuzz import fuzz

    ratio = fuzz.token_set_ratio(job_description.lower(), resume_text.lower())
    score = min(95.0, max(45.0, float(ratio)))

    return ResumeFitResult(
        match_score=round(score, 1),
        summary=f"Strong foundational alignment for {job_title} at {company}. Key core technical proficiencies match required competencies.",
        strengths=["Technical Core Skills", "Domain Alignment", "Hands-on Experience"],
        missing_skills=[
            SkillGapItem(
                category="Specialized Frameworks",
                missing_skills=["Advanced Architecture", "Scale Optimization"],
                importance="preferred",
            )
        ],
        xyz_bullet_recommendations=[
            f"Engineered high-throughput solutions for {job_title} role, improving reliability and operational velocity."
        ],
        confidence_score=0.70,
        model_name="heuristic_fallback",
        model_version="1.0.0",
    )


def generate_fallback_cover_letter(
    company: str,
    job_title: str,
    tone: str,
) -> CoverLetterResult:
    """Heuristic fallback when LLM API is unavailable."""
    letter = (
        f"Dear Hiring Team at {company},\n\n"
        f"I am writing to express my strong enthusiasm for the {job_title} position. "
        f"With a solid background in software engineering, scalable distributed architectures, "
        f"and agile product delivery, I have consistently driven measurable improvements across the tech stack.\n\n"
        f"At {company}, I look forward to contributing directly to your engineering initiatives, collaborating closely "
        f"with cross-functional teams, and upholding rigorous standards for code quality and reliability.\n\n"
        f"Thank you for your time and consideration. I welcome the opportunity to discuss how my skill set aligns with your team's goals.\n\n"
        f"Sincerely,\nCandidate"
    )
    outreach = (
        f"Hi there! I recently applied for the {job_title} role at {company}. "
        f"Given my background in high-impact software engineering, I would love to connect and discuss how I can contribute to your team's initiatives!"
    )
    return CoverLetterResult(
        cover_letter=letter,
        recruiter_outreach=outreach,
        tone_applied=tone,
        model_name="heuristic_fallback",
    )

