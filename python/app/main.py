import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routers.applications import router as applications_router
from app.routers.mailbox import router as mailbox_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tracking_app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database schema...")
    init_db()
    logger.info("Database initialized successfully.")
    yield


app = FastAPI(
    title="Application Tracking & Mailbox Status Capture API",
    description="Phase 7 (W23 & W24) Lifecycle state model, tracking board, manual overrides, and automated status capture.",
    version="1.0.0",
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


@app.get("/")
def root():
    return {
        "service": "Application Tracking Service",
        "phase": "Phase 7 (W23 & W24)",
        "status": "online",
        "docs_url": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
