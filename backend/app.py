import os
import sys

# Suppress harmless Python 3.12 / Gradio 6 selector event loop destructor warning (ValueError: Invalid file descriptor: -1)
_default_unraisablehook = sys.unraisablehook

def _suppress_benign_eventloop_unraisable(unraisable):
    if unraisable.exc_type and issubclass(unraisable.exc_type, ValueError) and "Invalid file descriptor" in str(unraisable.exc_value):
        return
    _default_unraisablehook(unraisable)

sys.unraisablehook = _suppress_benign_eventloop_unraisable

# Disable Gradio 6 SSR Node proxy and analytics telemetry
os.environ["GRADIO_SSR_MODE"] = "False"
os.environ["GRADIO_SERVER_MODE_ENABLED"] = "1"
os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"

import logging
from fastapi import Request
from starlette.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi

# 1. ZeroGPU Handshake Requirement
# Hugging Face ZeroGPU scans for at least one function decorated with @spaces.GPU during startup
try:
    import spaces
except ImportError:
    class spaces:
        @staticmethod
        def GPU(fn):
            return fn

@spaces.GPU
def dummy_gpu_fn():
    return "GPU active & ZeroGPU handshake complete"

import gradio as gr

# 2. Import application routers
from app.main import (
    applications_router,
    mailbox_router,
    jobs_router,
)
from app.db.database import init_db

# 3. Create Gradio interface for Hugging Face Space UI
with gr.Blocks(title="Job Tracker Backend", analytics_enabled=False) as demo:
    gr.Markdown("# 🚀 Job Tracker API & Background Sync Worker")
    gr.Markdown(
        """
        - **FastAPI Documentation / Swagger**: [Open /docs](/docs)
        - **API Health Check**: [Check /health](/health)
        - **Applications Endpoint**: [Open /api/applications](/api/applications)
        - **Vercel Web App**: [Open Vercel App](https://job-application-tracker-one-ruddy.vercel.app)
        """
    )
    status_box = gr.Textbox(
        label="Service Status",
        value="Online & Background Polling Worker Running",
        interactive=False,
    )
    btn = gr.Button("Ping GPU Status")
    btn.click(fn=dummy_gpu_fn, outputs=status_box)

# 4. Attach all FastAPI routers, OpenAPI schema, and Swagger UI directly to demo.app
fastapi_app = demo.app

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NormalizePathMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if "//" in path:
                normalized = "/" + "/".join(filter(None, path.split("/")))
                scope["path"] = normalized
                if "raw_path" in scope:
                    scope["raw_path"] = normalized.encode("ascii")
        await self.app(scope, receive, send)

fastapi_app.add_middleware(NormalizePathMiddleware)

import asyncio

@fastapi_app.middleware("http")
async def json_root_middleware(request: Request, call_next):
    if request.url.path == "/" and ("application/json" in request.headers.get("accept", "") or "curl" in request.headers.get("user-agent", "").lower()):
        return JSONResponse({
            "service": "Application Tracking & Discovery Service",
            "version": "1.1.0",
            "status": "online",
            "sync_mode": "pubsub_webhook",
            "docs_url": "/docs",
            "health_url": "/health",
        })
    return await call_next(request)

fastapi_app.include_router(applications_router)
fastapi_app.include_router(mailbox_router)
fastapi_app.include_router(jobs_router)

# Mount Pub/Sub webhook handlers at root-level and /api aliases so any GCP push configuration succeeds
from app.routers.mailbox import gmail_pubsub_webhook, verify_pubsub_endpoint

fastapi_app.add_api_route("/webhook", gmail_pubsub_webhook, methods=["POST"], tags=["mailbox"])
fastapi_app.add_api_route("/pubsub", gmail_pubsub_webhook, methods=["POST"], tags=["mailbox"])
fastapi_app.add_api_route("/api/webhook", gmail_pubsub_webhook, methods=["POST"], tags=["mailbox"])
fastapi_app.add_api_route("/api/pubsub", gmail_pubsub_webhook, methods=["POST"], tags=["mailbox"])

fastapi_app.add_api_route("/webhook", verify_pubsub_endpoint, methods=["GET"], tags=["mailbox"])
fastapi_app.add_api_route("/pubsub", verify_pubsub_endpoint, methods=["GET"], tags=["mailbox"])
fastapi_app.add_api_route("/api/webhook", verify_pubsub_endpoint, methods=["GET"], tags=["mailbox"])
fastapi_app.add_api_route("/api/pubsub", verify_pubsub_endpoint, methods=["GET"], tags=["mailbox"])

@fastapi_app.get("/health", tags=["system"])
def health():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "sync_mode": "pubsub_webhook",
        "docs_url": "/docs",
    }

# Explicitly register Swagger UI and OpenAPI routes since Gradio sets docs_url=None by default
@fastapi_app.get("/docs", include_in_schema=False)
def swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Job Tracker API Documentation",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    )

fastapi_app.openapi = lambda: get_openapi(
    title="Job Tracker Backend API",
    version="1.1.0",
    description="Full-featured lifecycle tracking, automated Gmail status capture, and multi-tier job scraper.",
    routes=fastapi_app.routes,
)

# 5. Database lifecycle using modern FastAPI lifespan context
from contextlib import asynccontextmanager

_original_lifespan = fastapi_app.router.lifespan_context

@asynccontextmanager
async def lifespan(app):
    init_db()
    if _original_lifespan:
        async with _original_lifespan(app) as maybe_state:
            yield maybe_state
    else:
        yield

fastapi_app.router.lifespan_context = lifespan

# 6. Launch via demo.launch(_app=fastapi_app, ssr_mode=False)
# Passing _app=fastapi_app ensures Gradio configures our existing FastAPI instance rather than creating a new blank one.
# Disabling ssr_mode prevents Gradio 6 from launching the Node SvelteKit front proxy which intercepts GET requests.
if __name__ == "__main__":
    demo.launch(_app=fastapi_app, ssr_mode=False)
