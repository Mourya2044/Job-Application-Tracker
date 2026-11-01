import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.db.models import JobPosting, Application, utc_now

logger = logging.getLogger(__name__)


class JobIntelligenceService:
    @staticmethod
    def reconcile_company_postings(
        db: Session,
        company_name: str,
        scraped_jobs: List[Dict[str, Any]],
        company_domain: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Reconciles incoming scraped positions against historical market records:
        1. Detects job expirations when previously seen positions vanish from career portals.
        2. Detects job repostings when a company republicizes an old role with a new ID.
        3. Tracks historical changes (salary updates, description changes, revivals).
        """
        now = utc_now()
        existing_postings = (
            db.query(JobPosting)
            .filter(func.lower(JobPosting.company_name) == company_name.strip().lower())
            .all()
        )

        existing_by_url = {p.job_url.split("?")[0].rstrip("/"): p for p in existing_postings if p.job_url}
        existing_by_ext_id = {p.external_job_id: p for p in existing_postings if p.external_job_id}
        existing_by_title = {p.role_title.strip().lower(): p for p in existing_postings}

        seen_posting_ids = set()
        created_count = 0
        updated_count = 0
        reposts_count = 0

        for raw_job in scraped_jobs:
            raw_url = (raw_job.get("url") or "").split("?")[0].rstrip("/")
            ext_id = str(raw_job.get("id") or "").strip() or None
            title = (raw_job.get("title") or "").strip()
            if not title or not raw_url:
                continue

            matched_record: Optional[JobPosting] = None
            if ext_id and ext_id in existing_by_ext_id:
                matched_record = existing_by_ext_id[ext_id]
            elif raw_url in existing_by_url:
                matched_record = existing_by_url[raw_url]

            if matched_record:
                # Existing job seen again
                seen_posting_ids.add(matched_record.id)
                matched_record.last_seen_at = now
                if matched_record.is_expired:
                    # Job was revived / reopened
                    matched_record.is_expired = False
                    matched_record.expired_at = None

                # Check for compensation updates
                new_salary = raw_job.get("salary_range")
                if new_salary and new_salary != matched_record.salary_range:
                    matched_record.salary_range = new_salary

                # Check for department/location updates
                if raw_job.get("department") and not matched_record.department:
                    matched_record.department = raw_job.get("department")
                if raw_job.get("location") and not matched_record.location:
                    matched_record.location = raw_job.get("location")

                updated_count += 1
            else:
                # New posting or Reposting
                repost_flag = False
                orig_id = None
                normalized_title = title.lower()
                if normalized_title in existing_by_title:
                    prior = existing_by_title[normalized_title]
                    repost_flag = True
                    orig_id = prior.id
                    reposts_count += 1

                new_record = JobPosting(
                    external_job_id=ext_id,
                    company_name=company_name.strip(),
                    company_domain=company_domain or raw_job.get("company_domain"),
                    role_title=title,
                    job_url=raw_job.get("url") or raw_url,
                    salary_range=raw_job.get("salary_range"),
                    location=raw_job.get("location") or "Remote",
                    department=raw_job.get("department"),
                    description_snippet=raw_job.get("description_snippet"),
                    source_type=raw_job.get("source_type") or "scraped",
                    first_seen_at=now,
                    last_seen_at=now,
                    is_expired=False,
                    repost_detected=repost_flag,
                    original_posting_id=orig_id,
                )
                db.add(new_record)
                db.flush()
                seen_posting_ids.add(new_record.id)
                existing_by_title[normalized_title] = new_record
                if ext_id:
                    existing_by_ext_id[ext_id] = new_record
                existing_by_url[raw_url] = new_record
                created_count += 1

        # Detect Expirations: existing active postings for this company that vanished
        expired_count = 0
        for p in existing_postings:
            if not p.is_expired and p.id not in seen_posting_ids:
                p.is_expired = True
                p.expired_at = now
                expired_count += 1

        db.commit()

        logger.info(
            "Job intelligence sync for %s: %d created, %d updated, %d expired, %d reposts",
            company_name,
            created_count,
            updated_count,
            expired_count,
            reposts_count,
        )

        return {
            "company_name": company_name,
            "total_scraped": len(scraped_jobs),
            "created_count": created_count,
            "updated_count": updated_count,
            "expired_count": expired_count,
            "reposts_count": reposts_count,
            "active_now": len(seen_posting_ids),
        }

    @staticmethod
    def get_intelligence_stats(db: Session) -> Dict[str, Any]:
        """Calculates global intelligence metrics across all discovered market postings."""
        total_market_jobs = db.query(JobPosting).count()
        active_jobs = db.query(JobPosting).filter(JobPosting.is_expired.is_(False)).count()
        expired_jobs = db.query(JobPosting).filter(JobPosting.is_expired.is_(True)).count()
        reposted_jobs = db.query(JobPosting).filter(JobPosting.repost_detected.is_(True)).count()
        total_companies = db.query(func.count(func.distinct(JobPosting.company_name))).scalar() or 0
        salary_disclosed = (
            db.query(JobPosting)
            .filter(JobPosting.salary_range.isnot(None), JobPosting.salary_range != "")
            .count()
        )

        top_departments_raw = (
            db.query(JobPosting.department, func.count(JobPosting.id).label("count"))
            .filter(JobPosting.department.isnot(None), JobPosting.department != "")
            .group_by(JobPosting.department)
            .order_by(desc("count"))
            .limit(5)
            .all()
        )
        top_departments = [{"department": dept, "count": cnt} for dept, cnt in top_departments_raw]

        latest_expirations = (
            db.query(JobPosting)
            .filter(JobPosting.is_expired.is_(True))
            .order_by(desc(JobPosting.expired_at))
            .limit(10)
            .all()
        )

        latest_reposts = (
            db.query(JobPosting)
            .filter(JobPosting.repost_detected.is_(True))
            .order_by(desc(JobPosting.created_at))
            .limit(10)
            .all()
        )

        return {
            "total_market_jobs": total_market_jobs,
            "active_jobs": active_jobs,
            "expired_jobs": expired_jobs,
            "reposted_jobs": reposted_jobs,
            "total_companies": total_companies,
            "salary_disclosed_count": salary_disclosed,
            "top_departments": top_departments,
            "latest_expirations": latest_expirations,
            "latest_reposts": latest_reposts,
        }

