import logging
from typing import List
from app.capabilities.base import EmbeddingProvider

logger = logging.getLogger(__name__)

_bge_tokenizer = None
_bge_model = None


class LocalBGEEmbeddingProvider(EmbeddingProvider):
    provider_name: str = "local_bge"

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5", dimensions: int = 384):
        self.model_name = model_name
        self.dimensions = dimensions

    def _get_model(self):
        global _bge_tokenizer, _bge_model
        if _bge_model is None:
            try:
                import torch
                from transformers import AutoTokenizer, AutoModel

                _bge_tokenizer = AutoTokenizer.from_pretrained(self.model_name, local_files_only=True)
                _bge_model = AutoModel.from_pretrained(self.model_name, local_files_only=True)
                _bge_model.eval()
                logger.info("Local BGE Embedding model loaded (%s)", self.model_name)
            except Exception as e:
                logger.warning("Local BGE weights not loaded: %s. Using synthetic embedding fallback.", e)
                _bge_model = False
                _bge_tokenizer = False
        return _bge_tokenizer, _bge_model

    async def embed_text(self, text: str) -> List[float]:
        batch = await self.embed_batch([text])
        return batch[0]

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        tokenizer, model = self._get_model()
        if not model or model is False:
            # Deterministic hash fallback to preserve consistent 384-dimensional vector format offline
            import hashlib
            results = []
            for t in texts:
                vec = []
                for i in range(self.dimensions):
                    h = hashlib.sha256(f"{t}:{i}".encode("utf-8")).digest()
                    val = (int.from_bytes(h[:4], "little") / 0xFFFFFFFF) * 2.0 - 1.0
                    vec.append(round(val, 6))
                results.append(vec)
            return results

        try:
            import torch

            encoded = tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            with torch.no_grad():
                outputs = model(**encoded)
                # Mean pooling
                attention_mask = encoded["attention_mask"].unsqueeze(-1)
                embeddings = torch.sum(outputs.last_hidden_state * attention_mask, dim=1) / torch.clamp(
                    attention_mask.sum(dim=1), min=1e-9
                )
                # Normalize embeddings
                embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
                return embeddings.cpu().tolist()
        except Exception as e:
            logger.error("Error computing BGE embeddings: %s", e)
            return [[0.0] * self.dimensions for _ in texts]

