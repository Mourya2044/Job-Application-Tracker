import os
import gradio as gr
import spaces

@spaces.GPU
def dummy_gpu_fn():
    return "GPU active"

# Import routers directly from app
from app.main import (
    lifespan,
    applications_router,
    mailbox_router,
    jobs_router,
    background_worker,
)
from fastapi.middleware.cors import CORSMiddleware

with gr.Blocks(title="Job Tracker Backend") as demo:
    gr.Markdown("# 🚀 Job Tracker API & Background Sync Worker")
    gr.Markdown(
        """
        - **FastAPI Documentation / Swagger**: [Open /docs](/docs)
        - **API Health Check**: [Check /health](/health)
        """
    )
    status_box = gr.Textbox(
        label="Service Status",
        value="Online & Background Polling Worker Running",
        interactive=False,
    )
    btn = gr.Button("Ping GPU Status")
    btn.click(fn=dummy_gpu_fn, outputs=status_box)

# demo.app IS the FastAPI instance that Gradio runs.
# We attach our routers, middlewares, and health endpoint directly to demo.app!
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

@fastapi_app.get("/health")
def health():
    return {
        "service": "Application Tracking & Discovery Service",
        "version": "1.1.0",
        "status": "online",
        "background_sync": background_worker.get_status(),
        "docs_url": "/docs",
    }

# Register background sync worker lifecycle with demo.app events
@fastapi_app.on_event("startup")
async def on_startup():
    from app.config import BACKGROUND_SYNC_ENABLED
    from app.db.database import init_db
    init_db()
    if BACKGROUND_SYNC_ENABLED:
        await background_worker.start()

@fastapi_app.on_event("shutdown")
async def on_shutdown():
    await background_worker.stop()

# In ZeroGPU, demo.launch() starts demo.app on port 7860
demo.launch(server_port=7860)
