import os
import sys
from pathlib import Path

# Add the 'python' folder to sys.path so app modules are resolvable by Vercel
ROOT_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = ROOT_DIR / "python"

if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

# Set VERCEL environment flag
os.environ.setdefault("VERCEL", "1")

from app.main import app as fastapi_app


async def app(scope, receive, send):
    """
    ASGI entrypoint wrapper for Vercel Serverless.
    Normalizes paths rewritten by Vercel proxies so FastAPI routes match cleanly.
    """
    if scope["type"] == "http":
        path = scope.get("path", "")
        headers = dict(scope.get("headers", []))
        matched_path = headers.get(b"x-matched-path", b"").decode("utf-8")

        # 1. If Vercel rewrote request to /api/index.py or /api/index, restore original matched path
        if matched_path and (path in ("/api/index.py", "/index.py", "/api/index", "/api") or path.startswith("/api/index.py/")):
            path = matched_path
            scope["path"] = path

        # 2. If path is stripped of /api by proxy/rewrite, ensure /api prefix is present for API routes
        if not path.startswith("/api") and path not in ("/", "/docs", "/openapi.json", "/redoc"):
            scope["path"] = f"/api{path}"

    await fastapi_app(scope, receive, send)


__all__ = ["app"]
