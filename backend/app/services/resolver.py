import logging
import re
from typing import Any, Dict, List, Optional, Tuple
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


def resolve_application_match_with_details(
    db: Session,
    event: ParsedEmailEvent,
    sender: str = "",
    subject: str = "",
) -> Tuple[Optional[Application], Dict[str, Any]]:
    applications: List[Application] = db.query(Application).all()
    if not applications:
        return None, {"reason": "No applications in database"}

    extracted_company = normalize_string(event.company_name)
    sender_domain = extract_domain_from_email(sender)
    normalized_subject = normalize_string(subject)

    best_match: Optional[Application] = None
    highest_score = 0.0
    best_strategy = "none"
    best_role_sim = 0.0

    event_role_norm = normalize_string(event.role_title)

    for app in applications:
        app_company_norm = normalize_string(app.company_name)
        if not app_company_norm:
            continue

        app_role_norm = normalize_string(app.role_title)

        # If this is a new application confirmation and the existing card has a completely different role,
        # do NOT merge them into the same card.
        role_sim = 0.0
        if event_role_norm and app_role_norm:
            role_sim = float(fuzz.token_set_ratio(event_role_norm, app_role_norm))

        if event.event_category == "application_confirmation" and event_role_norm and app_role_norm:
            if role_sim < 60:
                continue

        score = 0.0
        strategy = "fuzzy_token"

        # 1. Exact or direct substring match on company name
        if extracted_company and (extracted_company == app_company_norm or extracted_company in app_company_norm or app_company_norm in extracted_company):
            score = max(score, 90.0)
            strategy = "exact_company_name"

        # 2. Company name present in subject line
        if app_company_norm in normalized_subject:
            score = max(score, 85.0)
            if score == 85.0:
                strategy = "subject_mention"

        # 3. Domain match
        if sender_domain and app.company_domain and sender_domain in app.company_domain.lower():
            score = max(score, 88.0)
            if score == 88.0:
                strategy = "domain_equality"

        # 4. RapidFuzz token set ratio on company
        if extracted_company:
            fuzzy_score = float(fuzz.token_set_ratio(extracted_company, app_company_norm))
            if fuzzy_score > score:
                score = fuzzy_score
                strategy = "fuzzy_token"

        # 5. Role match bonus / penalty to correctly route to the right position card
        if app_role_norm and event_role_norm:
            if role_sim >= 65:
                score += 25.0
            elif role_sim < 40:
                score -= 20.0

        if score > highest_score and score >= 80.0:
            highest_score = score
            best_match = app
            best_strategy = strategy
            best_role_sim = role_sim

    details = {
        "matched": bool(best_match),
        "score": round(highest_score, 1),
        "strategy": best_strategy,
        "role_similarity": round(best_role_sim, 1),
        "extracted_company": event.company_name,
        "extracted_role": event.role_title,
        "sender_domain": sender_domain,
    }

    if best_match:
        details["application_id"] = best_match.id
        details["company_name"] = best_match.company_name
        details["role_title"] = best_match.role_title
        logger.info(
            "Matched email to application %s (%s - %s) with score %.1f via %s",
            best_match.id,
            best_match.company_name,
            best_match.role_title,
            highest_score,
            best_strategy,
        )

    return best_match, details


def resolve_application_match(
    db: Session,
    event: ParsedEmailEvent,
    sender: str = "",
    subject: str = "",
) -> Optional[Application]:
    match, _ = resolve_application_match_with_details(db, event, sender=sender, subject=subject)
    return match
