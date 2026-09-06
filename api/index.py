import sys
import urllib.parse
from pathlib import Path

# Add the 'python' folder to sys.path so app modules are resolvable by Vercel
ROOT_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = ROOT_DIR / "python"

if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from app.main import app as fastapi_app

async def app(scope, receive, send):
    """
    ASGI entrypoint wrapper for Vercel Serverless.
    Restores the original path explicitly passed by Vercel rewrites via query parameters.
    """
    if scope["type"] == "http":
        query_string = scope.get("query_string", b"").decode("utf-8")
        params = urllib.parse.parse_qs(query_string)
        
        if "vercel_path" in params:
            # Restore the original path
            original_path = params["vercel_path"][0]
            scope["path"] = original_path
            
            # Optionally remove it from the query string so the app doesn't see it
            new_query = urllib.parse.urlencode({k: v for k, v in params.items() if k != "vercel_path"}, doseq=True)
            scope["query_string"] = new_query.encode("utf-8")

    await fastapi_app(scope, receive, send)

__all__ = ["app"]
