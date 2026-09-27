import logging
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from app.schemas.ai import (
    ResumeMatchRequest,
    ResumeMatchResponse,
    CoverLetterRequest,
    CoverLetterResponse,
    ParsedResumeResponse,
)
from app.services.ai_advisor import (
    analyze_resume_fit,
    generate_tailored_cover_letter,
    extract_resume_profile_from_pdf,
    extract_text_from_pdf,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/parse-resume-pdf", response_model=ParsedResumeResponse)
async def parse_resume_pdf_endpoint(file: UploadFile = File(...)):
    """
    Parses an uploaded resume PDF, extracting clean raw text and structured candidate
    information (name, contact, skills, education, roles, summary) via GLiNER2 zero-shot AI.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are supported.")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

        profile = extract_resume_profile_from_pdf(contents)
        if not profile.get("raw_text"):
            raise HTTPException(status_code=422, detail="Could not extract readable text from the uploaded PDF.")

        return ParsedResumeResponse(**profile)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error parsing resume PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to process resume PDF: {str(e)}")


@router.post("/match-resume-pdf", response_model=ResumeMatchResponse)
async def match_resume_pdf_endpoint(
    file: UploadFile = File(...),
    job_description: str = Form(...),
    job_title: Optional[str] = Form(""),
    company: Optional[str] = Form(""),
):
    """
    Evaluates an uploaded candidate resume PDF against a job description, computing fit score,
    matching qualifications, missing requirements, and strategic recommendations via AI models.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are supported.")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")

        resume_text = extract_text_from_pdf(contents)
        if not resume_text:
            raise HTTPException(status_code=422, detail="Could not extract readable text from the uploaded PDF.")

        result = analyze_resume_fit(
            resume_text=resume_text,
            job_description=job_description,
            job_title=job_title or "",
            company=company or "",
        )
        return ResumeMatchResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error matching resume PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to analyze resume PDF: {str(e)}")


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
        "models": {
            "entity_extractor": "fastino/gliner2-multi-v1",
            "semantic_matching": "sentence-transformers/all-MiniLM-L6-v2",
            "cover_letter_generator": "HuggingFaceTB/SmolLM2-135M-Instruct",
            "pdf_parser": "pypdf + GLiNER2",
        },
    }
