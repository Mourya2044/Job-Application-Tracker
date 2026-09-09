import os
import gradio as gr
try:
    import spaces
    @spaces.GPU
    def dummy_gpu_fn():
        return "GPU initialized"
except ImportError:
    pass

from app.main import app

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

# Mount the Gradio demo UI onto FastAPI app at /ui
app = gr.mount_gradio_app(app, demo, path="/ui")

# In Hugging Face Spaces Gradio SDK, HF executes `python app.py` (so __name__ == '__main__').
# HF sets the environment variable SYSTEM="spaces".
# If already managed by HF, we do not call demo.launch(), OR we call it only when running outside HF.
if __name__ == "__main__" and os.getenv("SYSTEM") != "spaces":
    demo.launch(server_name="0.0.0.0", server_port=7860, ssr_mode=False)
