import logging
from typing import List, Union
from fastapi import APIRouter
from pydantic import BaseModel

from app.capabilities.factory import CapabilityFactory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["embeddings"])


class EmbedRequest(BaseModel):
    texts: Union[str, List[str]]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int
    model_name: str
    provider: str


@router.post("/embed", response_model=EmbedResponse)
async def generate_embeddings_endpoint(req: EmbedRequest):
    provider = CapabilityFactory.get_embedding_provider()
    input_list = [req.texts] if isinstance(req.texts, str) else req.texts

    embeddings = await provider.embed_batch(input_list)
    return EmbedResponse(
        embeddings=embeddings,
        dimensions=provider.dimensions,
        model_name=provider.model_name,
        provider=provider.provider_name,
    )

