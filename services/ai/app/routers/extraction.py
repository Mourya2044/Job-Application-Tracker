import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from app.capabilities.base import ExtractedEmailEventResult
from app.capabilities.factory import CapabilityFactory
from app.core.security import sanitize_prompt_input

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["extraction"])


class EmailExtractionRequest(BaseModel):
    subject: str
    body: str
    sender: Optional[str] = ""


@router.post("/extract-email", response_model=ExtractedEmailEventResult)
async def extract_email_endpoint(req: EmailExtractionRequest):
    clean_body = sanitize_prompt_input(req.body, max_length=4000)
    provider = CapabilityFactory.get_extraction_provider()

    return await provider.extract_email_event(
        subject=req.subject,
        sender=req.sender or "",
        body=clean_body,
    )

