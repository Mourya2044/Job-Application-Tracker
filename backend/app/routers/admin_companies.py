import logging
import urllib.parse
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import CompanyCareerPage, utc_now
from app.schemas.company import (
    CompanyCareerPageCreate,
    CompanyCareerPageRead,
    CompanyCareerPageUpdate,
    CompanySyncResult,
)
from app.services.job_scraper import JobScraperService
from app.services.job_intelligence import JobIntelligenceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/career-pages", tags=["admin-career-pages"])


def detect_ats_provider_and_slug(url_or_slug: str, fallback_provider: str = "greenhouse"):
    """
    Intelligently extracts ATS provider and slug from raw URLs or slugs:
    - https://boards.greenhouse.io/stripe -> ('greenhouse', 'stripe')
    - https://jobs.lever.co/figma -> ('lever', 'figma')
    - https://jobs.ashbyhq.com/linear -> ('ashby', 'linear')
    """
    text = url_or_slug.strip().lower()
    if "://" not in text and not text.startswith("www."):
        return fallback_provider, text

    try:
        parsed = urllib.parse.urlparse(text)
        netloc = parsed.netloc
        parts = [p for p in parsed.path.strip("/").split("/") if p]

        if "greenhouse.io" in netloc:
            slug = parts[0] if parts else text
            return "greenhouse", slug
        elif "lever.co" in netloc:
            slug = parts[0] if parts else text
            return "lever", slug
        elif "ashbyhq.com" in netloc:
            slug = parts[0] if parts else text
            return "ashby", slug
        elif "workable.com" in netloc:
            slug = parts[0] if parts else text
            return "workable", slug
    except Exception as e:
        logger.debug("URL detection parse note: %s", e)

    return fallback_provider, text


@router.get("", response_model=List[CompanyCareerPageRead])
def list_company_career_pages(
    active_only: bool = Query(False, description="Filter only active companies"),
    search: Optional[str] = Query(None, description="Search by company name, slug, or provider"),
    db: Session = Depends(get_db),
):
    """Lists all monitored company career pages with their health & sync stats."""
    query = db.query(CompanyCareerPage)
    if isinstance(active_only, bool) and active_only:
        query = query.filter(CompanyCareerPage.is_active.is_(True))
    if isinstance(search, str) and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            CompanyCareerPage.name.ilike(term)
            | CompanyCareerPage.slug.ilike(term)
            | CompanyCareerPage.provider.ilike(term)
        )
    return query.order_by(CompanyCareerPage.name.asc()).all()


@router.post("", response_model=CompanyCareerPageRead, status_code=status.HTTP_201_CREATED)
def create_company_career_page(
    payload: CompanyCareerPageCreate,
    db: Session = Depends(get_db),
):
    """Registers a new company career page for automated/manual monitoring."""
    clean_name = payload.name.strip()
    existing = db.query(CompanyCareerPage).filter(CompanyCareerPage.name.ilike(clean_name)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company with name '{clean_name}' already exists in directory.",
        )

    # Detect provider and slug if user passed full URL as slug or career_url
    provider = payload.provider.strip().lower()
    slug = payload.slug.strip().lower()
    if payload.career_url and (not slug or slug == clean_name.lower()):
        detected_p, detected_s = detect_ats_provider_and_slug(payload.career_url, provider)
        provider = detected_p
        slug = detected_s
    elif "://" in slug:
        detected_p, detected_s = detect_ats_provider_and_slug(slug, provider)
        provider = detected_p
        slug = detected_s

    domain = payload.domain
    if not domain and clean_name:
        domain = f"{clean_name.lower().replace(' ', '')}.com"

    company = CompanyCareerPage(
        name=clean_name,
        slug=slug,
        provider=provider,
        domain=domain,
        career_url=payload.career_url,
        logo_color=payload.logo_color or "#60a5fa",
        is_active=payload.is_active,
        sync_frequency_hours=payload.sync_frequency_hours,
        last_sync_status="idle",
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyCareerPageRead)
def get_company_career_page(company_id: str, db: Session = Depends(get_db)):
    """Retrieves a single company career page configuration."""
    company = db.query(CompanyCareerPage).filter(CompanyCareerPage.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company career page not found")
    return company


@router.put("/{company_id}", response_model=CompanyCareerPageRead)
def update_company_career_page(
    company_id: str,
    payload: CompanyCareerPageUpdate,
    db: Session = Depends(get_db),
):
    """Updates settings for a monitored company career page."""
    company = db.query(CompanyCareerPage).filter(CompanyCareerPage.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company career page not found")

    update_data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field == "slug" and value:
            setattr(company, field, value.strip().lower())
        elif field == "provider" and value:
            setattr(company, field, value.strip().lower())
        elif value is not None:
            setattr(company, field, value)

    company.updated_at = utc_now()
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_career_page(company_id: str, db: Session = Depends(get_db)):
    """Removes a company career page from the directory."""
    company = db.query(CompanyCareerPage).filter(CompanyCareerPage.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company career page not found")
    db.delete(company)
    db.commit()
    return None


@router.post("/{company_id}/sync", response_model=CompanySyncResult)
async def sync_company_career_page(company_id: str, db: Session = Depends(get_db)):
    """
    Triggers an immediate live scrape of jobs for the specified company,
    updates total count and sync health status.
    """
    company = db.query(CompanyCareerPage).filter(CompanyCareerPage.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company career page not found")

    provider = company.provider.strip().lower()
    slug = company.slug.strip().lower()

    try:
        jobs = []
        if provider == "greenhouse":
            jobs = await JobScraperService.scrape_greenhouse(slug)
        elif provider == "lever":
            jobs = await JobScraperService.scrape_lever(slug)
        elif provider == "ashby":
            jobs = await JobScraperService.scrape_ashby(slug)
        elif provider == "workable":
            jobs = await JobScraperService.scrape_workable(slug)
        elif company.career_url:
            scraped_single = await JobScraperService.scrape_url(company.career_url)
            jobs = [scraped_single] if scraped_single else []
        else:
            raise ValueError(f"Unsupported ATS provider '{provider}' and no career URL specified")

        company.last_synced_at = utc_now()
        company.last_sync_status = "success"
        company.last_error_message = None
        company.total_jobs_found = float(len(jobs))
        db.commit()

        # Reconcile market job intelligence records (expiration, reposts, salary tracking)
        try:
            intel_report = JobIntelligenceService.reconcile_company_postings(
                db=db,
                company_name=company.name,
                scraped_jobs=jobs,
                company_domain=company.domain,
            )
        except Exception as intel_err:
            logger.warning("Job intelligence reconciliation error for %s: %s", company.name, intel_err)
            intel_report = {}

        return CompanySyncResult(
            company_id=company.id,
            name=company.name,
            provider=company.provider,
            slug=company.slug,
            status="success",
            jobs_count=len(jobs),
            message=f"Successfully extracted {len(jobs)} live jobs from {company.name}.",
            synced_at=company.last_synced_at,
        )
    except Exception as e:
        logger.error("Error syncing company %s: %s", company.name, e)
        company.last_synced_at = utc_now()
        company.last_sync_status = "failed"
        company.last_error_message = str(e)[:500]
        db.commit()

        return CompanySyncResult(
            company_id=company.id,
            name=company.name,
            provider=company.provider,
            slug=company.slug,
            status="failed",
            jobs_count=0,
            message=f"Sync failed for {company.name}: {str(e)}",
            synced_at=company.last_synced_at,
        )


@router.post("/sync-all", response_model=List[CompanySyncResult])
async def sync_all_active_companies(db: Session = Depends(get_db)):
    """Triggers batch synchronization for all active company career pages."""
    companies = db.query(CompanyCareerPage).filter(CompanyCareerPage.is_active.is_(True)).all()
    results = []

    for comp in companies:
        provider = comp.provider.strip().lower()
        slug = comp.slug.strip().lower()
        try:
            jobs = []
            if provider == "greenhouse":
                jobs = await JobScraperService.scrape_greenhouse(slug)
            elif provider == "lever":
                jobs = await JobScraperService.scrape_lever(slug)
            elif provider == "ashby":
                jobs = await JobScraperService.scrape_ashby(slug)
            elif provider == "workable":
                jobs = await JobScraperService.scrape_workable(slug)
            elif comp.career_url:
                single = await JobScraperService.scrape_url(comp.career_url)
                jobs = [single] if single else []

            comp.last_synced_at = utc_now()
            comp.last_sync_status = "success"
            comp.last_error_message = None
            comp.total_jobs_found = float(len(jobs))

            try:
                JobIntelligenceService.reconcile_company_postings(
                    db=db,
                    company_name=comp.name,
                    scraped_jobs=jobs,
                    company_domain=comp.domain,
                )
            except Exception as intel_err:
                logger.warning("Job intelligence batch error for %s: %s", comp.name, intel_err)

            results.append(
                CompanySyncResult(
                    company_id=comp.id,
                    name=comp.name,
                    provider=comp.provider,
                    slug=comp.slug,
                    status="success",
                    jobs_count=len(jobs),
                    message=f"Synced {len(jobs)} positions.",
                    synced_at=comp.last_synced_at,
                )
            )
        except Exception as e:
            comp.last_synced_at = utc_now()
            comp.last_sync_status = "failed"
            comp.last_error_message = str(e)[:500]
            results.append(
                CompanySyncResult(
                    company_id=comp.id,
                    name=comp.name,
                    provider=comp.provider,
                    slug=comp.slug,
                    status="failed",
                    jobs_count=0,
                    message=str(e),
                    synced_at=comp.last_synced_at,
                )
            )

    db.commit()
    return results
