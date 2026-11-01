import json
import logging
from typing import Any, Dict, List, Optional
import httpx

from app.capabilities.base import (
    CoverLetterResult,
    EmbeddingProvider,
    ExtractedEmailEventResult,
    ResumeFitResult,
    StructuredExtractionProvider,
    TextGenerationProvider,
)
from app.providers.fallback_heuristic import (
    generate_fallback_cover_letter,
    generate_fallback_resume_fit,
)

logger = logging.getLogger(__name__)


class OpenAITextGenerationProvider(TextGenerationProvider):
    provider_name: str = "openai"

    def __init__(self, api_key: str, model_name: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model_name = model_name

    async def generate_completion(
        self,
        system_instruction: str,
        user_prompt: str,
        max_tokens: int = 1200,
        temperature: float = 0.2,
    ) -> str:
        if not self.api_key:
            raise ValueError("OpenAI API key is not configured.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


class OpenAIEmbeddingProvider(EmbeddingProvider):
    provider_name: str = "openai"

    def __init__(self, api_key: str, model_name: str = "text-embedding-3-small", dimensions: int = 1536):
        self.api_key = api_key
        self.model_name = model_name
        self.dimensions = dimensions

    async def embed_text(self, text: str) -> List[float]:
        batch = await self.embed_batch([text])
        return batch[0]

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if not self.api_key:
            raise ValueError("OpenAI API key is not configured.")

        url = "https://api.openai.com/v1/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "input": texts,
        }
        if "text-embedding-3" in self.model_name:
            payload["dimensions"] = self.dimensions

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]

