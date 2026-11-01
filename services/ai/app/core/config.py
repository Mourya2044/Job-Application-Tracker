import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class AIServiceSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Service Bindings
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Capability 1: Text Generation (Cover Letters, Tailored Outreaches)
    AI_TEXT_GENERATION_PROVIDER: str = os.getenv("AI_TEXT_GENERATION_PROVIDER", "openai")  # openai, anthropic, local_qwen, ollama
    AI_TEXT_GENERATION_MODEL: str = os.getenv("AI_TEXT_GENERATION_MODEL", "gpt-4o-mini")
    AI_TEXT_GENERATION_API_KEY: str = os.getenv("AI_TEXT_GENERATION_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    AI_TEXT_GENERATION_MAX_TOKENS: int = 1200
    AI_TEXT_GENERATION_TEMPERATURE: float = 0.2

    # Capability 2: Structured Entity & Lifecycle Extraction (Recruiter Emails)
    AI_EXTRACTION_PROVIDER: str = os.getenv("AI_EXTRACTION_PROVIDER", "gliner")  # gliner, openai, heuristic
    AI_EXTRACTION_MODEL: str = os.getenv("AI_EXTRACTION_MODEL", "fastino/gliner2-multi-v1")
    AI_EXTRACTION_API_KEY: str = os.getenv("AI_EXTRACTION_API_KEY", os.getenv("OPENAI_API_KEY", ""))

    # Capability 3: Semantic Embeddings (Job Deduplication & Resume Matching)
    AI_EMBEDDING_PROVIDER: str = os.getenv("AI_EMBEDDING_PROVIDER", "local_bge")  # local_bge, openai, sentence_transformers
    AI_EMBEDDING_MODEL: str = os.getenv("AI_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    AI_EMBEDDING_DIMENSIONS: int = int(os.getenv("AI_EMBEDDING_DIMENSIONS", "384"))
    AI_EMBEDDING_API_KEY: str = os.getenv("AI_EMBEDDING_API_KEY", os.getenv("OPENAI_API_KEY", ""))

    # Optional Anthropic / Ollama Endpoints
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


settings = AIServiceSettings()

