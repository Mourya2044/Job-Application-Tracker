import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import embeddings, extraction, generation, health, resume

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("track_ai_service")

app = FastAPI(
    title="Track AI Capability Service",
    description="Stateless, provider-agnostic AI capability engine supporting text generation, entity extraction, and dense semantic embeddings.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(resume.router)
app.include_router(generation.router)
app.include_router(extraction.router)
app.include_router(embeddings.router)

# Serverless AWS Lambda Handler
try:
    from mangum import Mangum

    handler = Mangum(app, lifespan="off")
except ImportError:
    handler = None

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)

