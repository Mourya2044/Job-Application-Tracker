import io
import json
import logging
import time
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from app.capabilities.base import ParsedResumeProfile, ResumeFitResult
from app.capabilities.factory import CapabilityFactory
from app.core.security import sanitize_prompt_input
from app.core.telemetry import TelemetryTracker
from app.prompts.resume_fit.v1 import (
    PROMPT_ID,
    PROMPT_VERSION,
    format_resume_fit_prompt,
)
from app.providers.fallback_heuristic import generate_fallback_resume_fit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["resume"])


class ResumeMatchRequest(BaseModel):
    resume_text: str
    job_description: str
    job_title: Optional[str] = ""
    company: Optional[str] = ""


def extract_text_from_pdf_stream(stream: io.BytesIO) -> str:
    reader = PdfReader(stream)
    text_parts = []
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            text_parts.append(txt)
    return "\n\n".join(text_parts).strip()


@router.post("/match-resume", response_model=ResumeFitResult)
async def match_resume_fit_endpoint(req: ResumeMatchRequest):
    start_time = time.time()
    clean_resume = sanitize_prompt_input(req.resume_text, max_length=12000)
    clean_jd = sanitize_prompt_input(req.job_description, max_length=6000)
    company = req.company or "Target Company"
    title = req.job_title or "Target Role"

    provider = CapabilityFactory.get_text_generation_provider()

    try:
        sys_inst, user_prompt = format_resume_fit_prompt(
            company=company,
            job_title=title,
            job_description=clean_jd,
            resume_text=clean_resume,
        )
        raw_json_str = await provider.generate_completion(
            system_instruction=sys_inst,
            user_prompt=user_prompt,
            max_tokens=1200,
            temperature=0.2,
        )
        data = json.loads(raw_json_str)
        result = ResumeFitResult(
            match_score=float(data.get("match_score", 75.0)),
            summary=data.get("summary", ""),
            strengths=data.get("strengths", []),
            missing_skills=data.get("missing_skills", []),
            xyz_bullet_recommendations=data.get("xyz_bullet_recommendations", []),
            confidence_score=float(data.get("confidence_score", 0.9)),
            model_name=provider.model_name,
            model_version=f"{provider.provider_name}:{PROMPT_VERSION}",
        )
        return result
    except Exception as e:
        logger.warning("Provider text generation failed (%s); returning heuristic fit analysis.", e)
        return generate_fallback_resume_fit(
            company=company,
            job_title=title,
            job_description=clean_jd,
            resume_text=clean_resume,
        )


@router.post("/parse-resume-pdf", response_model=ParsedResumeProfile)
async def parse_resume_pdf_endpoint(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        raw_text = extract_text_from_pdf_stream(io.BytesIO(contents))
        if not raw_text:
            raise HTTPException(status_code=422, detail="No readable text found in PDF.")

        # Lightweight heuristic profile extraction
        import re
        email_m = re.search(r"[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}", raw_text)
        phone_m = re.search(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", raw_text)

        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        cand_name = lines[0] if lines and len(lines[0].split()) <= 4 else None

        return ParsedResumeProfile(
            candidate_name=cand_name,
            email=email_m.group(0) if email_m else None,
            phone=phone_m.group(0) if phone_m else None,
            summary=lines[1] if len(lines) > 1 else None,
            skills=[],
            raw_text=raw_text,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error reading PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")

