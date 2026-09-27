import io
import os
import contextlib
import logging
import re
import warnings
from typing import Optional
from bs4 import BeautifulSoup

from app.db.models import LifecycleStage
from app.schemas.email_event import ParsedEmailEvent

logger = logging.getLogger(__name__)

# Suppress harmless runtime & future warnings during GLiNER2 execution
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)

# Model identifiers hosted on Hugging Face Hub / HF Spaces
GLINER_MODEL_ID = (
    os.getenv("GLINER_MODEL_ID")
    or os.getenv("NER_MODEL_ID")
    or "fastino/gliner2-multi-v1"
).strip().strip("'\"")

# Lazily initialized GLiNER2 extractor
_gliner_model = None


def get_gliner_model():
    """Lazily load GLiNER2 model on first extraction request safely without terminal charmap crashes."""
    global _gliner_model
    if _gliner_model is None:
        try:
            from gliner2 import GLiNER2
            # Suppress terminal prints that may contain Unicode chars unhandled by standard Windows cp1252
            with contextlib.redirect_stdout(io.StringIO()):
                _gliner_model = GLiNER2.from_pretrained(GLINER_MODEL_ID)
            logger.info("GLiNER2 model loaded successfully (%s).", GLINER_MODEL_ID)
        except Exception as e:
            logger.error("Could not initialize GLiNER2 model: %s", e)
            _gliner_model = False
    return _gliner_model if _gliner_model is not False else None


# Known non-job senders & keywords to discard instantly with ZERO model calls
NOISE_SENDER_PATTERNS = [
    r"uber\.com", r"amazon\.(?!jobs)", r"paypal\.com", r"netflix\.com",
    r"github\.com", r"medium\.com", r"swiggy", r"zomato", r"doordash", r"instacart",
    r"bank", r"credit", r"chase\.com", r"capitalone", r"wellsfargo", r"hdfc", r"icici",
    r"receipt", r"invoice", r"billing", r"statement", r"newsletter", r"marketing",
    r"support@", r"order", r"shipping", r"delivery", r"courier",
]

NOISE_SUBJECT_PATTERNS = [
    r"your order", r"receipt for", r"invoice", r"payment received", r"statement ready",
    r"verification code", r"security alert", r"one-time password", r"your otp",
    r"new login", r"signed in on", r"password reset", r"confirm your email",
    r"weekly digest", r"daily digest", r"subscription", r"shipping update",
    r"tracking number", r"discount", r"sale starts", r"coupon", r"cashback",
]

POSITIVE_JOB_SIGNALS = [
    r"application", r"interview", r"assessment", r"offer", r"rejection", r"recruiter",
    r"careers?", r"talent", r"hiring", r"headhunter", r"greenhouse", r"lever",
    r"myworkday", r"workday", r"ashby", r"hackerrank", r"codesignal", r"smartrecruiters",
    r"testgorilla", r"codility", r"hirevue", r"take-home", r"not moving forward",
    r"thank you for applying", r"status of your application", r"candidate",
]

RECRUITMENT_SENDER_KEYWORDS = [
    "career", "recruit", "talent", "job", "hr@", "greenhouse", "lever", "workday", "ashby", "hackerrank", "codesignal"
]

COMMON_EMAIL_PROVIDERS = (
    "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"
)


def is_obvious_noise(subject: str, sender: str) -> bool:
    sender_lower = sender.lower()
    subject_lower = subject.lower()

    # Never treat recruitment senders as noise
    if any(kw in sender_lower for kw in RECRUITMENT_SENDER_KEYWORDS):
        return False

    for pat in NOISE_SENDER_PATTERNS:
        if re.search(pat, sender_lower):
            return True

    for pat in NOISE_SUBJECT_PATTERNS:
        if re.search(pat, subject_lower):
            return True

    return False


def has_job_signals(subject: str, sender: str, body_preview: str) -> bool:
    combined = f"{subject} {sender} {body_preview}".lower()
    for sig in POSITIVE_JOB_SIGNALS:
        if re.search(sig, combined):
            return True
    return False


def sanitize_and_trim_body(raw_body: str, max_chars: int = 1500) -> str:
    if not raw_body:
        return ""
    if "<html" in raw_body.lower() or "<div" in raw_body.lower() or "<p" in raw_body.lower():
        soup = BeautifulSoup(raw_body, "html.parser")
        for tag in soup(["script", "style", "head", "meta", "footer"]):
            tag.decompose()
        clean = soup.get_text(separator="\n", strip=True)
    else:
        clean = raw_body.strip()

    # Strip out repetitive legal footer disclaimers & unsubscribe noise
    clean = re.split(
        r"(?:Unsubscribe|This email was sent to|Privacy Policy|View email in browser|CONFIDENTIALITY NOTICE)",
        clean,
        flags=re.IGNORECASE,
    )[0]

    # Compress multi-newlines & trim
    clean = re.sub(r"\n\s*\n+", "\n\n", clean).strip()
    return clean[:max_chars]


def sanitize_email_body(raw_body: str) -> str:
    return sanitize_and_trim_body(raw_body)


def extract_email_status_event(subject: str, raw_body: str, sender: str = "") -> ParsedEmailEvent:
    """
    Classifies an incoming email and extracts structured job application event data
    using exclusively the local GLiNER2 zero-shot model.
    """
    # 1. Tier 1: Fast Noise Filter (0 model calls)
    if is_obvious_noise(subject, sender):
        return ParsedEmailEvent(is_job_related=False, event_category="other_unrelated", confidence=0.0)

    # Clean & compress body
    clean_body = sanitize_and_trim_body(raw_body, max_chars=1500)

    # 2. Tier 2: Check for positive hiring/job signals
    if not has_job_signals(subject, sender, clean_body[:400]):
        return ParsedEmailEvent(is_job_related=False, event_category="other_unrelated", confidence=0.0)

    # Extract company domain from sender address if applicable
    company_domain = None
    if sender:
        domain_match = re.search(r"@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", sender)
        if domain_match:
            candidate_domain = domain_match.group(1).lower()
            if candidate_domain not in COMMON_EMAIL_PROVIDERS:
                company_domain = candidate_domain

    email_text = f"From: {sender}\nSubject: {subject}\n\n{clean_body}"

    # 3. Model Extraction via GLiNER2
    model = get_gliner_model()
    if not model:
        logger.warning("GLiNER2 model is not loaded; using pattern heuristics fallback.")
        link_m = re.search(r"https?://(?:www\.)?(?:calendly|zoom|meet\.google|teams\.microsoft)[^\s>]+", email_text)
        meeting_link = link_m.group(0) if link_m else None

        lower = email_text.lower()
        if "interview" in lower or "screen" in lower or "chat" in lower or "schedule" in lower:
            stage = LifecycleStage.SCREENING
            cat = "interview_invite"
            action_req = True
        elif "offer" in lower:
            stage = LifecycleStage.OFFER
            cat = "offer_received"
            action_req = True
        elif "unfortunately" in lower or "not moving forward" in lower or "other candidates" in lower:
            stage = LifecycleStage.REJECTED
            cat = "rejection"
            action_req = False
        else:
            stage = LifecycleStage.APPLIED
            cat = "application_confirmation"
            action_req = False

        company = company_domain.split(".")[0].capitalize() if company_domain else "Company"

        return ParsedEmailEvent(
            is_job_related=True,
            event_category=cat,
            company_name=company,
            company_domain=company_domain,
            role_title="Software Engineer",
            target_lifecycle_stage=stage,
            confidence=0.75,
            action_required=action_req,
            meeting_link=meeting_link,
            summary_sentence=f"{cat.replace('_', ' ').capitalize()} for role at {company}.",
        )

    try:

        # Unified Schema Extraction (Entities + Lifecycle Stage) in a single forward pass
        schema = (
            model.create_schema()
            .entities({
                "company": "Company Name",
                "applied_role": "Job role or position applied for by the candidate",
                "recruiter_title": "Title or role of the recruiter or sender in the signature",
                "next_step": "Next hiring step or action required",
                "interview_date": "Interview date or scheduling deadline",
                "interview_time": "Interview time or duration",
                "meeting_link": "Calendly, Google Meet, Zoom, or scheduling link",
            })
            .classification("status", ["applied", "screening", "interviewing", "offer", "rejected"])
        )

        extraction = model.extract(email_text, schema)
        entities = extraction.get("entities", {})

        # Safe entity extraction helper
        def get_first_entity(k: str) -> Optional[str]:
            vals = entities.get(k)
            if isinstance(vals, list) and len(vals) > 0:
                return vals[0]
            return None

        # Extract primary entities from model output
        company_name = get_first_entity("company")
        role_title = get_first_entity("applied_role")
        meeting_link = get_first_entity("meeting_link")
        interview_date = get_first_entity("interview_date")
        interview_time = get_first_entity("interview_time")
        raw_status = extraction.get("status", "applied")

        # Check if this is an online assessment (OA)
        oa_keywords = [
            "assessment", "hackerrank", "codesignal", "codility",
            "testgorilla", "take-home", "coding challenge", "technical assessment"
        ]
        is_oa = any(kw in email_text.lower() for kw in oa_keywords)

        # Map GLiNER status to schema EVENT_CATEGORIES & DB LifecycleStage
        if is_oa and raw_status in ("applied", "screening"):
            event_category = "assessment_invite"
            stage = LifecycleStage.SCREENING
            action_required = True
            action_deadline = interview_date or "Complete assessment within given window"
        elif raw_status == "screening":
            event_category = "interview_invite"
            stage = LifecycleStage.SCREENING
            action_required = True
            action_deadline = interview_date
        elif raw_status == "interviewing":
            event_category = "interview_invite"
            stage = LifecycleStage.INTERVIEWING
            action_required = True
            action_deadline = interview_date
        elif raw_status == "offer":
            event_category = "offer_received"
            stage = LifecycleStage.OFFER
            action_required = True
            action_deadline = "Review offer terms"
        elif raw_status == "rejected":
            event_category = "rejection"
            stage = LifecycleStage.REJECTED
            action_required = False
            action_deadline = None
        else:  # applied
            event_category = "application_confirmation"
            stage = LifecycleStage.APPLIED
            action_required = False
            action_deadline = None

        interview_date_time = (
            f"{interview_date} at {interview_time}"
            if (interview_date and interview_time)
            else (interview_date or interview_time)
        )

        summary = f"{event_category.replace('_', ' ').capitalize()} for {role_title or 'position'} at {company_name or 'Company'}."

        return ParsedEmailEvent(
            is_job_related=True,
            event_category=event_category,
            company_name=company_name,
            company_domain=company_domain,
            role_title=role_title,
            target_lifecycle_stage=stage,
            confidence=0.95,
            action_required=action_required,
            action_deadline=action_deadline,
            interview_date_time=interview_date_time,
            meeting_link=meeting_link,
            summary_sentence=summary,
        )

    except Exception as e:
        logger.error("GLiNER2 extraction failed: %s", e)
        return ParsedEmailEvent(is_job_related=False, event_category="other_unrelated", confidence=0.0)
