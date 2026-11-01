import io
import contextlib
import logging
import re
from typing import Optional

from app.capabilities.base import ExtractedEmailEventResult, StructuredExtractionProvider
from app.providers.fallback_heuristic import HeuristicExtractionProvider

logger = logging.getLogger(__name__)

_gliner_cache = None


class GLiNERExtractionProvider(StructuredExtractionProvider):
    provider_name: str = "gliner"

    def __init__(self, model_id: str = "fastino/gliner2-multi-v1"):
        self.model_name = model_id
        self._fallback = HeuristicExtractionProvider()

    def _get_model(self):
        global _gliner_cache
        if _gliner_cache is None:
            try:
                from gliner2 import GLiNER2
                with contextlib.redirect_stdout(io.StringIO()):
                    try:
                        _gliner_cache = GLiNER2.from_pretrained(self.model_name, local_files_only=True)
                    except Exception:
                        _gliner_cache = GLiNER2.from_pretrained(self.model_name)
                logger.info("GLiNER2 extraction model initialized (%s)", self.model_name)
            except Exception as e:
                logger.warning("Could not load GLiNER2 model (%s); using heuristic fallback: %s", self.model_name, e)
                _gliner_cache = False
        return _gliner_cache if _gliner_cache is not False else None

    async def extract_email_event(
        self,
        subject: str,
        sender: str,
        body: str,
    ) -> ExtractedEmailEventResult:
        model = self._get_model()
        if not model:
            return await self._fallback.extract_email_event(subject=subject, sender=sender, body=body)

        try:
            email_text = f"From: {sender}\nSubject: {subject}\n\n{body[:1500]}"
            schema = (
                model.create_schema()
                .entities({
                    "company": "Company Name",
                    "applied_role": "Job role or position applied for by the candidate",
                    "next_step": "Next hiring step or action required",
                    "meeting_link": "Calendly, Google Meet, Zoom, or scheduling link",
                    "interview_date": "Interview date or scheduling deadline",
                })
                .classification("status", ["applied", "screening", "interviewing", "offer", "rejected", "other"])
            )

            extraction = model.extract(email_text, schema)
            entities = extraction.get("entities", {})
            status_cls = extraction.get("classification", {}).get("status", "applied")

            def _get_ent(key: str) -> Optional[str]:
                vals = entities.get(key, [])
                return vals[0] if vals and isinstance(vals, list) else None

            company = _get_ent("company")
            role = _get_ent("applied_role")
            meeting_link = _get_ent("meeting_link")
            interview_date = _get_ent("interview_date")

            is_job = status_cls != "other"
            cat_map = {
                "applied": "application_confirmation",
                "screening": "assessment_invite",
                "interviewing": "interview_invite",
                "offer": "offer_received",
                "rejected": "rejection",
                "other": "other_unrelated",
            }

            return ExtractedEmailEventResult(
                is_job_related=is_job,
                event_category=cat_map.get(status_cls, "application_confirmation"),
                target_lifecycle_stage=status_cls,
                company_name=company,
                role_title=role or "Software Engineer",
                meeting_link=meeting_link,
                interview_date_time=interview_date,
                confidence_score=0.92,
                evidence_snippet=body[:200] if body else None,
            )
        except Exception as e:
            logger.warning("GLiNER extraction encountered error: %s. Using heuristic fallback.", e)
            return await self._fallback.extract_email_event(subject=subject, sender=sender, body=body)

