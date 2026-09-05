import logging
import re
from typing import Optional
from bs4 import BeautifulSoup
from langchain_openai import ChatOpenAI
from langchain_core.exceptions import OutputParserException

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.db.models import LifecycleStage
from app.schemas.email_event import ParsedEmailEvent

logger = logging.getLogger(__name__)

# Initialize model if API key is present
llm_model = None
structured_extractor = None

if OPENAI_API_KEY:
    try:
        llm_model = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0.0)
        structured_extractor = llm_model.with_structured_output(ParsedEmailEvent, method="json_schema")
    except Exception as e:
        logger.warning("Could not initialize OpenAI structured extractor: %s", e)


# Known non-job senders & keywords to discard instantly with ZERO API calls
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


def sanitize_and_trim_body(raw_body: str, max_chars: int = 1200) -> str:
    if not raw_body:
        return ""
    if "<html" in raw_body.lower() or "<div" in raw_body.lower() or "<p" in raw_body.lower():
        soup = BeautifulSoup(raw_body, "html.parser")
        for tag in soup(["script", "style", "head", "meta", "footer"]):
            tag.decompose()
        clean = soup.get_text(separator="\n", strip=True)
    else:
        clean = raw_body.strip()

    # Strip out repetitive legal footer disclaimers & unsubscribe noise to save tokens
    clean = re.split(r"(?:Unsubscribe|This email was sent to|Privacy Policy|View email in browser|CONFIDENTIALITY NOTICE)", clean, flags=re.IGNORECASE)[0]
    
    # Compress multi-newlines & trim
    clean = re.sub(r"\n\s*\n+", "\n\n", clean).strip()
    return clean[:max_chars]


def sanitize_email_body(raw_body: str) -> str:
    return sanitize_and_trim_body(raw_body)



def heuristic_extract_status(subject: str, body: str) -> ParsedEmailEvent:
    text = f"{subject}\n{body}".lower()

    # Rejection heuristics
    rejection_keywords = [
        "thank you for your interest",
        "unfortunately",
        "not moving forward",
        "pursue other candidates",
        "we have decided to proceed with other",
        "not selected for an interview",
        "decided not to advance",
        "will not be moving forward",
    ]
    if any(kw in text for kw in rejection_keywords):
        return ParsedEmailEvent(
            is_job_related=True,
            event_category="rejection",
            target_lifecycle_stage=LifecycleStage.REJECTED,
            confidence=0.92,
            action_required=False,
            summary_sentence="Application not moving forward.",
        )

    # Offer heuristics
    offer_keywords = [
        "offer letter",
        "congratulations on your offer",
        "pleased to offer you",
        "formal offer",
        "offer of employment",
        "compensation package",
    ]
    if any(kw in text for kw in offer_keywords):
        return ParsedEmailEvent(
            is_job_related=True,
            event_category="offer_received",
            target_lifecycle_stage=LifecycleStage.OFFER,
            confidence=0.95,
            action_required=True,
            action_deadline="Review offer terms",
            summary_sentence="Formal job offer received.",
        )

    # Interview heuristics
    interview_keywords = [
        "invitation to interview",
        "schedule an interview",
        "schedule your interview",
        "interview confirmation",
        "technical round",
        "hiring manager screen",
        "phone interview",
        "onsite interview",
        "next round of interviews",
        "calendly.com",
        "zoom.us/j",
        "teams.microsoft.com",
        "meet.google.com",
    ]
    if any(kw in text for kw in interview_keywords):
        link_match = re.search(r"https?://(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|calendly\.com)/[^\s>]+", body)
        meeting_url = link_match.group(0) if link_match else None
        
        return ParsedEmailEvent(
            is_job_related=True,
            event_category="interview_invite",
            target_lifecycle_stage=LifecycleStage.INTERVIEWING,
            confidence=0.90,
            action_required=True,
            meeting_link=meeting_url,
            summary_sentence="Interview invitation or schedule update received.",
        )

    # Assessment / OA heuristics
    oa_keywords = [
        "online assessment",
        "hackerrank",
        "codesignal",
        "codility",
        "take-home challenge",
        "coding challenge",
        "technical assessment",
        "complete the assessment",
        "testgorilla",
    ]
    if any(kw in text for kw in oa_keywords):
        return ParsedEmailEvent(
            is_job_related=True,
            event_category="assessment_invite",
            target_lifecycle_stage=LifecycleStage.SCREENING,
            confidence=0.92,
            action_required=True,
            action_deadline="Complete assessment within given window",
            summary_sentence="Online coding assessment / test received.",
        )

    # Application confirmation heuristics
    confirmation_keywords = [
        "thank you for applying",
        "we have received your application",
        "application submitted",
        "application received",
        "confirming your application",
        "your application for",
    ]
    if any(kw in text for kw in confirmation_keywords):
        return ParsedEmailEvent(
            is_job_related=True,
            event_category="application_confirmation",
            target_lifecycle_stage=LifecycleStage.APPLIED,
            confidence=0.88,
            action_required=False,
            summary_sentence="Application confirmation received.",
        )

    return ParsedEmailEvent(
        is_job_related=False,
        event_category="other_unrelated",
        confidence=0.1,
    )


def extract_email_status_event(subject: str, raw_body: str, sender: str = "") -> ParsedEmailEvent:
    # 1. Tier 1: Fast Noise Filter (0 API calls, 0 cost)
    if is_obvious_noise(subject, sender):
        return ParsedEmailEvent(is_job_related=False, event_category="other_unrelated", confidence=0.0)

    # Clean & compress body (save tokens)
    clean_body = sanitize_and_trim_body(raw_body, max_chars=1200)

    # 2. Tier 2: Check for positive hiring/job signals
    if not has_job_signals(subject, sender, clean_body[:300]):
        return ParsedEmailEvent(is_job_related=False, event_category="other_unrelated", confidence=0.0)

    # 3. Tier 3: Call LLM ONLY for genuine job candidate emails with compressed token payload
    if structured_extractor:
        prompt = f"""Classify this job application email. Extract company, role, stage (applied, screening, interviewing, offer, rejected), confidence (0.0-1.0), and interview dates/links if any.

Sender: {sender}
Subject: {subject}
Body:
{clean_body}"""
        try:
            result = structured_extractor.invoke(prompt)
            if isinstance(result, ParsedEmailEvent):
                return result
        except OutputParserException as ope:
            logger.warning("Structured parser failed: %s", ope)
        except Exception as e:
            logger.warning("LLM extraction error: %s. Falling back to heuristics.", e)

    # Fallback to rule-based heuristics
    event = heuristic_extract_status(subject, clean_body)
    if event.is_job_related and not event.company_name:
        match = re.search(r"(?:at|with|from|to)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\s+for|\s+-\s+|\s*\(|$)", subject)
        if match:
            event.company_name = match.group(1).strip()
    return event
