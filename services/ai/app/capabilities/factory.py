import logging
from app.capabilities.base import (
    EmbeddingProvider,
    StructuredExtractionProvider,
    TextGenerationProvider,
)
from app.core.config import settings
from app.providers.fallback_heuristic import HeuristicExtractionProvider
from app.providers.gliner_provider import GLiNERExtractionProvider
from app.providers.local_bge_provider import LocalBGEEmbeddingProvider
from app.providers.openai_provider import (
    OpenAIEmbeddingProvider,
    OpenAITextGenerationProvider,
)

logger = logging.getLogger(__name__)


class CapabilityFactory:
    _text_gen_instance: TextGenerationProvider = None
    _extraction_instance: StructuredExtractionProvider = None
    _embedding_instance: EmbeddingProvider = None

    @classmethod
    def get_text_generation_provider(cls) -> TextGenerationProvider:
        if cls._text_gen_instance is None:
            provider = settings.AI_TEXT_GENERATION_PROVIDER.lower().strip()
            if provider == "openai" and settings.AI_TEXT_GENERATION_API_KEY:
                logger.info("Initializing OpenAI Text Generation Provider (%s)", settings.AI_TEXT_GENERATION_MODEL)
                cls._text_gen_instance = OpenAITextGenerationProvider(
                    api_key=settings.AI_TEXT_GENERATION_API_KEY,
                    model_name=settings.AI_TEXT_GENERATION_MODEL,
                )
            else:
                # Fallback to local / heuristic provider
                logger.info("Using Fallback / Local provider for Text Generation")
                cls._text_gen_instance = OpenAITextGenerationProvider(
                    api_key="",
                    model_name="fallback",
                )
        return cls._text_gen_instance

    @classmethod
    def get_extraction_provider(cls) -> StructuredExtractionProvider:
        if cls._extraction_instance is None:
            provider = settings.AI_EXTRACTION_PROVIDER.lower().strip()
            if provider == "gliner":
                logger.info("Initializing GLiNER Extraction Provider (%s)", settings.AI_EXTRACTION_MODEL)
                cls._extraction_instance = GLiNERExtractionProvider(model_id=settings.AI_EXTRACTION_MODEL)
            else:
                logger.info("Initializing Heuristic Extraction Provider")
                cls._extraction_instance = HeuristicExtractionProvider()
        return cls._extraction_instance

    @classmethod
    def get_embedding_provider(cls) -> EmbeddingProvider:
        if cls._embedding_instance is None:
            provider = settings.AI_EMBEDDING_PROVIDER.lower().strip()
            if provider == "openai" and settings.AI_EMBEDDING_API_KEY:
                logger.info("Initializing OpenAI Embedding Provider (%s)", settings.AI_EMBEDDING_MODEL)
                cls._embedding_instance = OpenAIEmbeddingProvider(
                    api_key=settings.AI_EMBEDDING_API_KEY,
                    model_name=settings.AI_EMBEDDING_MODEL,
                    dimensions=settings.AI_EMBEDDING_DIMENSIONS,
                )
            else:
                logger.info("Initializing Local BGE Embedding Provider (%s)", settings.AI_EMBEDDING_MODEL)
                cls._embedding_instance = LocalBGEEmbeddingProvider(
                    model_name=settings.AI_EMBEDDING_MODEL,
                    dimensions=settings.AI_EMBEDDING_DIMENSIONS,
                )
        return cls._embedding_instance

