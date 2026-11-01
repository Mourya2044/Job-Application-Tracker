from fastapi import APIRouter
from app.capabilities.factory import CapabilityFactory
from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    return {
        "service": "track-ai-microservice",
        "status": "online",
        "environment": settings.ENVIRONMENT,
    }


@router.get("/api/ai/status")
def ai_status_check():
    text_provider = CapabilityFactory.get_text_generation_provider()
    extraction_provider = CapabilityFactory.get_extraction_provider()
    embedding_provider = CapabilityFactory.get_embedding_provider()

    return {
        "status": "online",
        "capabilities": {
            "text_generation": {
                "provider": text_provider.provider_name,
                "model": text_provider.model_name,
            },
            "extraction": {
                "provider": extraction_provider.provider_name,
                "model": extraction_provider.model_name,
            },
            "embeddings": {
                "provider": embedding_provider.provider_name,
                "model": embedding_provider.model_name,
                "dimensions": embedding_provider.dimensions,
            },
        },
    }

