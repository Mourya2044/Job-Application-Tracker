import os
import gradio as gr
import spaces

@spaces.GPU
def dummy_gpu_fn():
    return "GPU active"

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
    btn = gr.Button("Ping GPU Status")
    btn.click(fn=dummy_gpu_fn, outputs=status_box)

# Mount the Gradio demo UI onto FastAPI app at /ui
app = gr.mount_gradio_app(app, demo, path="/ui")

# In ZeroGPU, demo.launch() must be called to complete startup handshake
demo.launch(server_port=7860)
