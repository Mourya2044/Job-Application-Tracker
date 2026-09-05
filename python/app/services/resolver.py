import logging
import re
from typing import List, Optional
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.db.models import Application
from app.schemas.email_event import ParsedEmailEvent

logger = logging.getLogger(__name__)


def normalize_string(s: Optional[str]) -> str:
    if not s:
        return ""
    # Remove common legal suffixes
    cleaned = re.sub(r"\b(inc|corp|corporation|llc|ltd|limited|technologies|tech|solutions|co)\b\.?", "", s, flags=re.IGNORECASE)
    # Remove non-alphanumerics
    cleaned = re.sub(r"[^\w\s]", "", cleaned)
    return cleaned.strip().lower()


def extract_domain_from_email(email_str: str) -> Optional[str]:
    match = re.search(r"@([\w.-]+\.[a-zA-Z]{2,})", email_str)
    if match:
        domain = match.group(1).lower()
        # Filter generic webmail and ATS domains
        generic_domains = {
            "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
            "greenhouse-mail.io", "lever.co", "workday.com", "ashbyhq.com",
            "smartrecruiters.com", "icims.com", "taleo.net"
        }
        if domain not in generic_domains:
            return domain
    return None


def resolve_application_match(
    db: Session,
    event: ParsedEmailEvent,
    sender: str = "",
    subject: str = "",
) -> Optional[Application]:
    applications: List[Application] = db.query(Application).all()
    if not applications:
        return None

    extracted_company = normalize_string(event.company_name)
    sender_domain = extract_domain_from_email(sender)
    normalized_subject = normalize_string(subject)

    best_match: Optional[Application] = None
    highest_score = 0.0

    for app in applications:
        app_company_norm = normalize_string(app.company_name)
        if not app_company_norm:
            continue

        score = 0.0

        # 1. Exact or direct substring match on company name
        if extracted_company and (extracted_company == app_company_norm or extracted_company in app_company_norm or app_company_norm in extracted_company):
            score = max(score, 95.0)

        # 2. Company name present in subject line
        if app_company_norm in normalized_subject:
            score = max(score, 90.0)

        # 3. Domain match
        if sender_domain and app.company_domain and sender_domain in app.company_domain.lower():
            score = max(score, 92.0)

        # 4. RapidFuzz token set ratio
        if extracted_company:
            fuzzy_score = fuzz.token_set_ratio(extracted_company, app_company_norm)
            score = max(score, fuzzy_score)

        if score > highest_score and score >= 80.0:
            highest_score = score
            best_match = app

    if best_match:
        logger.info(
            "Matched email to application %s (%s) with score %.1f",
            best_match.id,
            best_match.company_name,
            highest_score,
        )

    return best_match
