import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import BACKGROUND_SYNC_ENABLED
from app.db.database import init_db
from app.routers.applications import router as applications_router
from app.routers.mailbox import router as mailbox_router
from app.routers.jobs import router as jobs_router
from app.services.background_worker import background_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tracking_app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database schema...")
    init_db()
    logger.info("Database initialized successfully.")

    if BACKGROUND_SYNC_ENABLED:
        logger.info("Launching Gmail background event sync worker...")
        await background_worker.start()

    yield

    logger.info("Shutting down background sync worker...")
    await background_worker.stop()
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


@app.get("/health")
def health():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "background_sync": background_worker.get_status(),
        "docs_url": "/docs",
    }


@app.get("/")
def root(request: Request):
    accept = request.headers.get("accept", "")
    data = {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "background_sync": background_worker.get_status(),
        "docs_url": "/docs",
        "health_url": "/health",
        "ui_url": "/ui",
    }
    if "text/html" in accept and "application/json" not in accept:
        return HTMLResponse(
            content="""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Tracker Backend API</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 540px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
        h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #ffffff; }
        p { margin: 0 0 24px 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
        .links { display: flex; flex-direction: column; gap: 10px; }
        .btn { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #334155; color: #f8fafc; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; transition: all 0.2s; }
        .btn:hover {{ background: #475569; transform: translateY(-1px); }}
        .btn-primary {{ background: #6366f1; color: white; }}
        .btn-primary:hover {{ background: #4f46e5; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="badge"><div class="dot"></div> System Online & Background Worker Active</div>
        <h1>🚀 Job Tracker Backend</h1>
        <p>FastAPI microservice for job application tracking, automated Gmail status sync, and multi-tier ATS scraping.</p>
        <div class="links">
            <a href="/docs" class="btn btn-primary"><span>📖 Interactive Swagger API Docs</span> <span>/docs →</span></a>
            <a href="/health" class="btn"><span>🩺 API Health Status</span> <span>/health →</span></a>
            <a href="/ui" class="btn"><span>🎛️ Gradio Status Widget</span> <span>/ui →</span></a>
            <a href="https://job-application-tracker-one-ruddy.vercel.app" target="_blank" class="btn"><span>🌐 Vercel Web Dashboard</span> <span>External ↗</span></a>
        </div>
    </div>
</body>
</html>"""
        )
    return data


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
