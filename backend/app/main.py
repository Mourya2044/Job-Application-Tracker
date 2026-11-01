import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import FRONTEND_URL
from app.db.database import init_db, get_db
from app.db.models import (
    Application,
    ApplicationStatusEvent,
    CompanyCareerPage,
    EmailLog,
    JobPosting,
    UserMailboxConsent,
)
from app.routers.applications import router as applications_router
from app.routers.mailbox import router as mailbox_router
from app.routers.jobs import router as jobs_router
from app.routers.ai import router as ai_router
from app.routers.admin_companies import router as admin_companies_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tracking_app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database schema...")
    init_db()
    logger.info("Database initialized successfully.")
    yield
    logger.info("Application shutdown complete.")


app = FastAPI(
    title="Application Tracking & Mailbox Status Capture API",
    description="Full-featured lifecycle tracking, automated Gmail event-based status capture, and multi-tiered job scraper.",
    version="1.1.0",
    lifespan=lifespan,
)

# Enable CORS for local development and frontend Vite server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(applications_router)
app.include_router(mailbox_router)
app.include_router(jobs_router)
app.include_router(ai_router)
app.include_router(admin_companies_router)


@app.get("/health")
def health():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "sync_mode": "pubsub_webhook",
        "docs_url": "/docs",
    }


@app.get("/api/system/metrics")
def get_system_metrics(db: Session = Depends(get_db)):
    """
    Exposes operational observability metrics:
    - Mailbox processing counters, success rates, dead-letter isolating count
    - Scraper health stats, market intelligence counts, expiration counts
    - Total application and audit event counts
    """
    total_emails = db.query(EmailLog).count()
    processed_emails = db.query(EmailLog).filter(EmailLog.processing_status == "processed").count()
    failed_emails = db.query(EmailLog).filter(EmailLog.processing_status == "failed").count()
    matched_auto = db.query(EmailLog).filter(EmailLog.match_status == "matched_auto").count()
    suggested_emails = db.query(EmailLog).filter(EmailLog.match_status == "suggested").count()

    total_companies = db.query(CompanyCareerPage).count()
    active_companies = db.query(CompanyCareerPage).filter(CompanyCareerPage.is_active.is_(True)).count()
    total_market_jobs = db.query(JobPosting).count()
    active_market_jobs = db.query(JobPosting).filter(JobPosting.is_expired.is_(False)).count()
    expired_market_jobs = db.query(JobPosting).filter(JobPosting.is_expired.is_(True)).count()
    reposted_market_jobs = db.query(JobPosting).filter(JobPosting.repost_detected.is_(True)).count()

    total_apps = db.query(Application).count()
    total_events = db.query(ApplicationStatusEvent).count()

    user_consent = db.query(UserMailboxConsent).first()
    mailbox_connected = user_consent is not None and bool(user_consent.refresh_token or user_consent.access_token)

    return {
        "mailbox": {
            "connected": mailbox_connected,
            "total_emails_ingested": total_emails,
            "processed_success": processed_emails,
            "failed_dead_letter": failed_emails,
            "matched_auto_transitions": matched_auto,
            "suggested_review_pending": suggested_emails,
            "success_rate_percent": round((processed_emails / total_emails * 100), 2) if total_emails > 0 else 100.0,
        },
        "market_intelligence": {
            "monitored_companies": total_companies,
            "active_monitored_companies": active_companies,
            "total_market_postings": total_market_jobs,
            "active_postings": active_market_jobs,
            "expired_postings": expired_market_jobs,
            "reposts_detected": reposted_market_jobs,
        },
        "storage": {
            "total_applications": total_apps,
            "total_audit_events": total_events,
        },
    }


@app.get("/")
def root(request: Request):
    accept = request.headers.get("accept", "")
    data = {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "sync_mode": "pubsub_webhook",
        "docs_url": "/docs",
        "health_url": "/health",
    }
    if "text/html" in accept and "application/json" not in accept:
        return HTMLResponse(
            content=f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Tracker Backend API</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }}
        .card {{ background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 540px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }}
        .badge {{ display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }}
        .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #10b981; }}
        h1 {{ margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #ffffff; }}
        p {{ margin: 0 0 24px 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }}
        .links {{ display: flex; flex-direction: column; gap: 10px; }}
        .btn {{ display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #334155; color: #f8fafc; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; transition: all 0.2s; }}
        .btn:hover {{ background: #475569; transform: translateY(-1px); }}
        .btn-primary {{ background: #6366f1; color: white; }}
        .btn-primary:hover {{ background: #4f46e5; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge"><div class="dot"></div> System Online & Webhook Active</div>
        <h1>🚀 Job Tracker Backend</h1>
        <p>FastAPI microservice for job application tracking, automated Gmail status sync, and multi-tier ATS scraping.</p>
        <div class="links">
            <a href="/docs" class="btn btn-primary"><span>📖 Interactive Swagger API Docs</span> <span>/docs →</span></a>
            <a href="/health" class="btn"><span>🩺 API Health Status</span> <span>/health →</span></a>
            <a href="{FRONTEND_URL}" target="_blank" class="btn"><span>🌐 Web Dashboard</span> <span>{FRONTEND_URL} ↗</span></a>
        </div>
    </div>
</body>
</html>"""
        )
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
