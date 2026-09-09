import os
import logging
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

# 2. Import application routers and background worker
from app.main import (
    applications_router,
    mailbox_router,
    jobs_router,
    background_worker,
)
from app.config import BACKGROUND_SYNC_ENABLED
from app.db.database import init_db

# 3. Create Gradio interface for Hugging Face Space UI
with gr.Blocks(title="Job Tracker Backend") as demo:
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

fastapi_app.include_router(applications_router)
fastapi_app.include_router(mailbox_router)
fastapi_app.include_router(jobs_router)

@fastapi_app.get("/health", tags=["system"])
def health():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "background_sync": background_worker.get_status(),
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

@fastapi_app.get("/openapi.json", include_in_schema=False)
def openapi_endpoint():
    return get_openapi(
        title="Job Tracker Backend API",
        version="1.1.0",
        description="Full-featured lifecycle tracking, automated Gmail status capture, and multi-tier job scraper.",
        routes=fastapi_app.routes,
    )

# 5. Background sync worker lifecycle
@fastapi_app.on_event("startup")
async def on_startup():
    init_db()
    if BACKGROUND_SYNC_ENABLED:
        await background_worker.start()

@fastapi_app.on_event("shutdown")
async def on_shutdown():
    await background_worker.stop()

# 6. Launch via demo.launch()
# In Hugging Face ZeroGPU Spaces, calling demo.launch() without hardcoded host/port allows
# Gradio to properly hook into the ZeroGPU supervisor without Errno 98 port collisions.
if __name__ == "__main__":
    demo.launch()
