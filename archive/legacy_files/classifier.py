import logging
from typing import Literal, Optional

from langchain_core.exceptions import OutputParserException
from pydantic import BaseModel, Field

from ai import model

logger = logging.getLogger(__name__)

CATEGORIES = Literal[
    "application_confirmation",
    "assessment",
    "interview",
    "offer",
    "rejection",
    "recruiter_outreach",
    "other",
]


class EmailClassification(BaseModel):
    is_relevant: bool = Field(
        description="True if this email is relevant to someone applying for jobs "
        "(application confirmations, online assessments, interview invites/updates, "
        "offers, rejections, recruiter outreach, etc). False for anything else "
        "(newsletters, promotions, receipts, unrelated personal/work mail)."
    )
    category: Optional[CATEGORIES] = Field(
        default=None, description="The kind of job-related email, if is_relevant is true."
    )
    company: Optional[str] = Field(
        default=None, description="Company associated with the email, if any."
    )
    role: Optional[str] = Field(
        default=None, description="Job role/title associated with the email, if any."
    )


classifier_model = model.with_structured_output(EmailClassification, method="json_schema")


def classify_email(email: dict) -> EmailClassification:
    prompt = f"""
Classify whether the following email is relevant to someone applying for jobs
(e.g. application confirmation, online assessment, interview invite/update,
offer, rejection, recruiter outreach). Anything else is not relevant.

Subject: {email.get('subject', '')}

Body:
{email.get('body', '')}
"""
    try:
        return classifier_model.invoke(prompt)  # type: ignore[return-value]
    except OutputParserException:
        logger.warning(
            "Classifier returned a non-JSON response for email %s; treating as not relevant.",
            email.get("id"),
        )
        return EmailClassification(is_relevant=False)
