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

# Mount the entire FastAPI backend onto Gradio's internal FastAPI app
# In Gradio 4/5/6, demo.app is the underlying FastAPI application that demo.launch() serves!
demo.app.mount("/", app)

# In ZeroGPU, demo.launch() serves demo.app on port 7860
demo.launch(server_port=7860)
