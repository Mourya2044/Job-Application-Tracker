import re
from typing import Optional


def sanitize_prompt_input(text: Optional[str], max_length: int = 12000) -> str:
    """
    Sanitizes untrusted text inputs (resumes, job postings, email bodies) before injecting into model prompts.
    Defends against delimiter breakouts, system instructions overrides, and prompt injection attempts.
    """
    if not text:
        return ""

    sanitized = text.strip()
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length]

    # Neutralize instruction override phrases and markdown block delimiters
    patterns = [
        r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
        r"(?i)system\s*:\s*",
        r"(?i)human\s*:\s*",
        r"(?i)assistant\s*:\s*",
        r"<\|im_start\|>",
        r"<\|im_end\|>",
        r"<\|endoftext\|>",
        r"\[INST\]",
        r"\[/INST\]",
    ]
    for pat in patterns:
        sanitized = re.sub(pat, "[FILTERED]", sanitized)

    return sanitized

