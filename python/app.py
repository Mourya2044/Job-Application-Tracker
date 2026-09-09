import logging
import uvicorn
from app.main import app

logger = logging.getLogger("app")

try:
    import gradio as gr

    with gr.Blocks(title="Job Tracker Backend") as demo:
        gr.Markdown("# 🚀 Job Tracker API & Background Sync Worker")
        gr.Markdown(
            """
            - **FastAPI Documentation / Swagger**: [Open /docs](/docs)
            - **API Health Check**: [Check /health](/health)
            - **Applications API**: [Open /api/applications](/api/applications)
            - **Vercel Web App**: [Open Vercel App](https://job-application-tracker-one-ruddy.vercel.app)
            """
        )
        status_box = gr.Textbox(
            label="Service Status",
            value="Online & Background Polling Worker Running",
            interactive=False,
        )

    # Mount Gradio sub-application under /ui
    # This leaves FastAPI as the root app so /, /docs, /health, /openapi.json, and /api/* work cleanly
    app = gr.mount_gradio_app(app, demo, path="/ui")
except Exception as e:
    logger.warning("Could not mount Gradio UI: %s", e)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
