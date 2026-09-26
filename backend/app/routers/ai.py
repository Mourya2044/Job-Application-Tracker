import logging
from fastapi import APIRouter, HTTPException
from app.schemas.ai import (
    ResumeMatchRequest,
    ResumeMatchResponse,
    CoverLetterRequest,
    CoverLetterResponse,
)
from app.services.ai_advisor import analyze_resume_fit, generate_tailored_cover_letter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/match-resume", response_model=ResumeMatchResponse)
def match_resume_endpoint(req: ResumeMatchRequest):
    """
    Evaluates candidate resume against a job description, computing fit score,
    matching qualifications, missing requirements, and strategic recommendations.
    """
    try:
        result = analyze_resume_fit(
            resume_text=req.resume_text,
            job_description=req.job_description,
            job_title=req.job_title or "",
            company=req.company or "",
        )
        return ResumeMatchResponse(**result)
    except Exception as e:
        logger.error("Error matching resume: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze resume fit: {str(e)}")


@router.post("/generate-cover-letter", response_model=CoverLetterResponse)
def generate_cover_letter_endpoint(req: CoverLetterRequest):
    """
    Generates a tailored 3-paragraph cover letter and a concise recruiter outreach
    message customized to the target company, role, and candidate's qualifications.
    """
    try:
        result = generate_tailored_cover_letter(
            resume_text=req.resume_text,
            job_title=req.job_title,
            company=req.company,
            job_description=req.job_description or "",
            tone=req.tone or "professional",
        )
        return CoverLetterResponse(**result)
    except Exception as e:
        logger.error("Error generating cover letter: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to generate cover letter: {str(e)}")


@router.get("/status")
def ai_status_endpoint():
    """
    Returns the current execution environment status and GPU acceleration availability.
    """
    try:
        import torch
        cuda_avail = torch.cuda.is_available()
        device_name = torch.cuda.get_device_name(0) if cuda_avail else "CPU"
    except Exception:
        cuda_avail = False
        device_name = "CPU"

    return {
        "status": "online",
        "device": device_name,
        "cuda_available": cuda_avail,
        "accelerator": "Nvidia RTX Pro 6000 Blackwell (ZeroGPU)" if cuda_avail else "Standard Execution",
    }
