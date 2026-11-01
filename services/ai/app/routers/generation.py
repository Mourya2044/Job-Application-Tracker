import json
import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.capabilities.base import CoverLetterResult
from app.capabilities.factory import CapabilityFactory
from app.core.security import sanitize_prompt_input
from app.prompts.cover_letter.v1 import (
    PROMPT_ID,
    PROMPT_VERSION,
    format_cover_letter_prompt,
)
from app.providers.fallback_heuristic import generate_fallback_cover_letter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["generation"])


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_title: str
    company: str
    job_description: Optional[str] = ""
    tone: Optional[str] = "Professional"


@router.post("/cover-letter", response_model=CoverLetterResult)
async def generate_cover_letter_endpoint(req: CoverLetterRequest):
    clean_resume = sanitize_prompt_input(req.resume_text, max_length=12000)
    clean_jd = sanitize_prompt_input(req.job_description, max_length=4000)
    tone = req.tone or "Professional"

    provider = CapabilityFactory.get_text_generation_provider()

    try:
        sys_inst, user_prompt = format_cover_letter_prompt(
            company=req.company,
            job_title=req.job_title,
            job_description=clean_jd,
            resume_text=clean_resume,
            tone=tone,
        )
        raw_json_str = await provider.generate_completion(
            system_instruction=sys_inst,
            user_prompt=user_prompt,
            max_tokens=1200,
            temperature=0.3,
        )
        data = json.loads(raw_json_str)
        return CoverLetterResult(
            cover_letter=data.get("cover_letter", ""),
            recruiter_outreach=data.get("recruiter_outreach", ""),
            tone_applied=tone,
            model_name=provider.model_name,
        )
    except Exception as e:
        logger.warning("Provider cover letter generation failed (%s); using heuristic fallback.", e)
        return generate_fallback_cover_letter(
            company=req.company,
            job_title=req.job_title,
            tone=tone,
        )

