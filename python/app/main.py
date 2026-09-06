import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
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


@app.get("/")
def root():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "background_sync": background_worker.get_status(),
        "docs_url": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
