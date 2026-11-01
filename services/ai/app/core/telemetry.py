import hashlib
import time
from typing import Any, Dict, Optional
from pydantic import BaseModel


class AIExecutionRecord(BaseModel):
    capability: str
    provider: str
    model_name: str
    prompt_id: Optional[str] = None
    prompt_version: Optional[str] = None
    input_hash: str
    latency_ms: int
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    status: str = "success"  # success, fallback, failed
    error_details: Optional[str] = None


class TelemetryTracker:
    @staticmethod
    def compute_input_hash(variables: Dict[str, Any]) -> str:
        serialized = "".join(f"{k}:{v}" for k, v in sorted(variables.items()))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @staticmethod
    def create_record(
        capability: str,
        provider: str,
        model_name: str,
        start_time: float,
        variables: Dict[str, Any],
        prompt_id: Optional[str] = None,
        prompt_version: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        cost_usd: Optional[float] = None,
        status: str = "success",
        error_details: Optional[str] = None,
    ) -> AIExecutionRecord:
        latency_ms = int((time.time() - start_time) * 1000)
        input_hash = TelemetryTracker.compute_input_hash(variables)
        return AIExecutionRecord(
            capability=capability,
            provider=provider,
            model_name=model_name,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
            input_hash=input_hash,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            cost_usd=cost_usd,
            status=status,
            error_details=error_details,
        )

