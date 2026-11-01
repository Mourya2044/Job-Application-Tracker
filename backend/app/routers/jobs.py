import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import (
    Application,
    ApplicationStatusEvent,
    CompanyCareerPage,
    JobPosting,
    LifecycleStage,
    SavedJob,
    TriggerSource,
    utc_now,
)
from app.schemas.application import ApplicationRead
from app.schemas.job import (
    ImportScrapedJobPayload,
    JobIntelligenceStats,
    JobPostingRead,
    SavedJobCreate,
    SavedJobRead,
    ScrapedJobPosting,
    UrlScrapeRequest,
)
from app.services.job_scraper import JobScraperService
from app.services.job_deduplicator import JobDeduplicator
from app.services.job_intelligence import JobIntelligenceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/popular-companies")
def get_popular_companies(db: Session = Depends(get_db)):
    """Returns company career pages managed by admin or default curated companies."""
    try:
        companies = db.query(CompanyCareerPage).filter(CompanyCareerPage.is_active.is_(True)).all()
        if companies:
            return [
                {
                    "id": c.id,
                    "name": c.name,
                    "slug": c.slug,
                    "provider": c.provider,
                    "domain": c.domain or f"{c.slug}.com",
                    "color": c.logo_color or "#60a5fa",
                    "career_url": c.career_url,
                    "total_jobs_found": c.total_jobs_found,
                    "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
                }
                for c in companies
            ]
    except Exception as e:
        logger.warning("Could not load popular companies from DB: %s", e)

    return JobScraperService.get_curated_companies()


@router.get("/scrape/ats", response_model=List[ScrapedJobPosting])
async def scrape_ats_jobs(
    provider: str = Query("greenhouse", description="greenhouse, lever, ashby, or workable"),
    company: str = Query(..., description="Company slug (e.g. stripe, figma, airbnb, vercel)"),
    deduplicate: bool = Query(True, description="Remove duplicate postings using Jaccard, Edit Distance, and Vector embeddings"),
):
    """
    Direct ATS Public API Scraper:
    Extracts structured job listings directly from Greenhouse, Lever, Ashby, or Workable with 100% data fidelity.
    """
    provider_clean = provider.strip().lower()
    company_clean = company.strip().lower()

    try:
        if provider_clean == "greenhouse":
            jobs = await JobScraperService.scrape_greenhouse(company_clean)
        elif provider_clean == "lever":
            jobs = await JobScraperService.scrape_lever(company_clean)
        elif provider_clean == "ashby":
            jobs = await JobScraperService.scrape_ashby(company_clean)
        elif provider_clean == "workable":
            jobs = await JobScraperService.scrape_workable(company_clean)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported ATS provider '{provider}'. Supported providers: greenhouse, lever, ashby, workable",
            )

        if deduplicate and len(jobs) > 1:
            raw_dicts = [j.model_dump() if hasattr(j, "model_dump") else j.dict() for j in jobs]
            deduped_dicts, report = JobDeduplicator.deduplicate_job_list(raw_dicts, enable_vectors=True)
            if report.get("duplicates_removed", 0) > 0:
                logger.info("ATS Deduplication for %s removed %d duplicates", company_clean, report["duplicates_removed"])
            return [ScrapedJobPosting(**d) for d in deduped_dicts]

        return jobs
    except HTTPException as httpx_err:
        raise httpx_err
    except Exception as e:
        logger.error("Error scraping ATS %s for %s: %s", provider, company, e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scrape {provider} for {company}: {str(e)}",
        )


@router.post("/scrape/url", response_model=ScrapedJobPosting)
async def scrape_job_url(payload: UrlScrapeRequest):
    """
    Universal Career Page Inspector:
    Extracts Schema.org JSON-LD (JobPosting) structured metadata from any URL with heuristic DOM fallback.
    """
    try:
        return await JobScraperService.scrape_url(payload.url)
    except Exception as e:
        logger.error("Error scraping job URL %s: %s", payload.url, e)
        raise HTTPException(
            status_code=400,
            detail=f"Could not extract job from URL: {str(e)}",
        )


@router.get("/search", response_model=List[ScrapedJobPosting])
async def search_live_jobs(
    query: str = Query("software", description="Job title, skill, or keyword"),
    limit: int = Query(15, ge=1, le=50),
    deduplicate: bool = Query(True, description="Remove duplicate postings using Jaccard, Edit Distance, and Vector embeddings"),
):
    """
    Multi-Source Tech Job Aggregator Feed:
    Concurrently queries multiple live job APIs (RemoteOK, Remotive, Arbeitnow) and deduplicates results.
    """
    try:
        jobs = await JobScraperService.search_multi_source(query=query, limit=limit)
        if deduplicate and len(jobs) > 1:
            raw_dicts = [j.model_dump() if hasattr(j, "model_dump") else j.dict() for j in jobs]
            deduped_dicts, report = JobDeduplicator.deduplicate_job_list(raw_dicts, enable_vectors=True)
            if report.get("duplicates_removed", 0) > 0:
                logger.info("Search deduplication for %s removed %d duplicates", query, report["duplicates_removed"])
            return [ScrapedJobPosting(**d) for d in deduped_dicts[:limit]]
        return jobs[:limit]
    except Exception as e:
        logger.error("Error searching live jobs for query %s: %s", query, e)
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}",
        )


@router.post("/deduplicate")
def deduplicate_jobs(
    jobs: List[ScrapedJobPosting],
    enable_vectors: bool = Query(True, description="Enable dense neural vector embedding cosine evaluation"),
):
    """
    Deduplicates a batch of job postings using 3 algorithmic techniques:
    1. Jaccard Token & Shingle Similarity (Intersection over Union)
    2. Levenshtein / Token Sort Edit Distance Ratio
    3. Dense Neural Vector Embedding Cosine Similarity
    """
    raw_dicts = [j.model_dump() if hasattr(j, "model_dump") else j.dict() for j in jobs]
    deduped_dicts, report = JobDeduplicator.deduplicate_job_list(raw_dicts, enable_vectors=enable_vectors)
    return {
        "report": report,
        "unique_jobs": [ScrapedJobPosting(**d) for d in deduped_dicts],
    }



@router.post("/import", response_model=ApplicationRead)
def import_scraped_job_to_board(
    payload: ImportScrapedJobPayload,
    db: Session = Depends(get_db),
):
    """
    1-Click Track Application:
    Instantly imports a scraped job posting directly into the Kanban tracking board.
    """
    job = payload.job
    target_stage = payload.target_stage.value if payload.target_stage else LifecycleStage.APPLIED.value

    # Check if this job URL or company+role is already tracked
    existing = None
    if job.url:
        existing = db.query(Application).filter(Application.job_url == job.url).first()
    if not existing:
        existing = (
            db.query(Application)
            .filter(
                Application.company_name.ilike(job.company_name),
                Application.role_title.ilike(job.title),
            )
            .first()
        )

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Application for '{job.title}' at {job.company_name} is already being tracked.",
        )

    # Match corresponding market JobPosting if already discovered
    posting_id = None
    if job.url:
        clean_url = job.url.split("?")[0].rstrip("/")
        posting_match = db.query(JobPosting).filter(JobPosting.job_url.like(f"{clean_url}%")).first()
        if posting_match:
            posting_id = posting_match.id

    # Create new Application
    app = Application(
        company_name=job.company_name,
        company_domain=job.company_domain,
        role_title=job.title,
        job_url=job.url,
        location=job.location,
        salary_range=job.salary_range,
        current_stage=target_stage,
        job_posting_id=posting_id,
        last_status_change_at=utc_now(),
        last_status_change_source=TriggerSource.INITIAL_INGEST.value,
        manual_notes=payload.notes or f"Imported via job scraper ({job.source_type}).",
        next_step="Review application requirements and submit resume" if target_stage == "applied" else None,
    )
    db.add(app)
    db.flush()

    # Log initial audit event
    event = ApplicationStatusEvent(
        application_id=app.id,
        from_stage=None,
        to_stage=target_stage,
        changed_at=utc_now(),
        trigger_source=TriggerSource.INITIAL_INGEST.value,
        confidence_score=1.0,
        change_summary=f"Discovered via Job Scraper ({job.source_type}) and imported to {target_stage.upper()}.",
    )
    db.add(event)
    db.commit()
    db.refresh(app)

    return app


@router.get("/saved", response_model=List[SavedJobRead])
def list_saved_jobs(db: Session = Depends(get_db)):
    """List all saved / bookmarked job postings."""
    return db.query(SavedJob).order_by(SavedJob.created_at.desc()).all()


@router.post("/save", response_model=SavedJobRead)
def save_job(payload: SavedJobCreate, db: Session = Depends(get_db)):
    """Save / bookmark a job posting."""
    existing = db.query(SavedJob).filter(
        SavedJob.company_name.ilike(payload.company_name),
        SavedJob.title.ilike(payload.title),
    ).first()
    if existing:
        return existing

    saved = SavedJob(
        title=payload.title,
        company_name=payload.company_name,
        company_logo_color=payload.company_logo_color,
        location=payload.location,
        job_type=payload.job_type,
        salary_range=payload.salary_range,
        job_url=payload.job_url,
        tags=payload.tags,
        posted_date=payload.posted_date,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


@router.delete("/saved/{job_id}", status_code=204)
def delete_saved_job(job_id: str, db: Session = Depends(get_db)):
    """Remove a saved job posting."""
    saved = db.query(SavedJob).filter(SavedJob.id == job_id).first()
    if saved:
        db.delete(saved)
        db.commit()


@router.get("/intelligence", response_model=JobIntelligenceStats)
def get_job_intelligence_dashboard(db: Session = Depends(get_db)):
    """Global job intelligence metrics: market trends, expired positions, reposts, and salary disclosures."""
    return JobIntelligenceService.get_intelligence_stats(db)


@router.get("/market", response_model=List[JobPostingRead])
def list_market_job_postings(
    is_expired: Optional[bool] = Query(None, description="Filter by expired positions"),
    repost_only: Optional[bool] = Query(None, description="Filter by detected repostings"),
    company: Optional[str] = Query(None, description="Filter by company name"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Retrieves discovered market job postings with historical expiration and reposting flags."""
    query = db.query(JobPosting)
    if isinstance(is_expired, bool):
        query = query.filter(JobPosting.is_expired.is_(is_expired))
    if isinstance(repost_only, bool) and repost_only:
        query = query.filter(JobPosting.repost_detected.is_(True))
    if isinstance(company, str) and company.strip():
        query = query.filter(JobPosting.company_name.ilike(f"%{company.strip()}%"))
    return query.order_by(JobPosting.last_seen_at.desc()).limit(limit).all()
    return None

