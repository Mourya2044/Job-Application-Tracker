import os
import sys
import json
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load local environment variables if available
load_dotenv()

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

from fastapi import Request
from starlette.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi

# 1. ZeroGPU Handshake Requirement & GPU Decorator
try:
    # pyrefly: ignore [missing-import]
    import spaces
except ImportError:
    class spaces:
        @staticmethod
        def GPU(fn=None, duration=None):
            if fn is not None and callable(fn):
                return fn
            def decorator(f):
                return f
            return decorator

import gradio as gr

# 2. Import application routers and services
from app.main import (
    applications_router,
    mailbox_router,
    jobs_router,
    ai_router,
)
from app.db.database import init_db
from app.services.status_extractor import extract_email_status_event
from app.services.ai_advisor import (
    analyze_resume_fit,
    generate_tailored_cover_letter,
    extract_text_from_pdf,
    extract_resume_profile_from_pdf,
    GLINER_MODEL_ID,
    SIMILARITY_MODEL_ID,
    GEN_MODEL_ID,
)

# Initialize database schema and ensure all tables/columns exist immediately
try:
    init_db()
except Exception as _init_err:
    print(f"Warning: Initial DB schema check deferred: {_init_err}")

# 3. ZeroGPU Accelerated Functions for Gradio Playground
@spaces.GPU(duration=30)
def check_gpu_hardware():
    """Inspects CUDA device specs dynamically allocated by ZeroGPU."""
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram_gb = props.total_memory / (1024 ** 3)
            return (
                f"⚡ ZeroGPU Dynamic Acceleration ACTIVE\n\n"
                f"Device: {name}\n"
                f"Total VRAM: {vram_gb:.2f} GB\n"
                f"CUDA Version: {torch.version.cuda}\n"
                f"Compute Capability: {props.major}.{props.minor}\n\n"
                f"🤖 Active Models:\n"
                f"• Entity & Skill Extractor : {GLINER_MODEL_ID}\n"
                f"• Semantic ATS Embeddings  : {SIMILARITY_MODEL_ID}\n"
                f"• Cover Letter / Advice LLM: {GEN_MODEL_ID}\n\n"
                f"Status: GPU dynamic slice successfully attached to process."
            )
        return (
            "Running in CPU Mode.\n"
            "When hosted on Hugging Face Spaces with ZeroGPU, an Nvidia RTX Pro 6000 Blackwell "
            "slice attaches dynamically on demand when GPU tasks are invoked.\n\n"
            f"🤖 Configured Models:\n"
            f"• Entity & Skill Extractor : {GLINER_MODEL_ID}\n"
            f"• Semantic ATS Embeddings  : {SIMILARITY_MODEL_ID}\n"
            f"• Cover Letter / Advice LLM: {GEN_MODEL_ID}"
        )
    except Exception as e:
        return f"Error querying hardware: {e}"


@spaces.GPU(duration=45)
def extract_email_demo(subject: str, sender: str, body: str):
    """ZeroGPU accelerated GLiNER2 email classification and entity extraction."""
    if not subject and not body:
        return "Please enter an email subject or body.", "{}", "No input provided"
    
    event = extract_email_status_event(subject=subject, raw_body=body, sender=sender)
    
    stage_str = (
        event.target_lifecycle_stage.value.upper()
        if event.target_lifecycle_stage
        else "OTHER / UNRELATED"
    )
    badge = f"📍 Detected Lifecycle Stage: {stage_str} (Category: {event.event_category})"
    details_json = json.dumps(event.model_dump(exclude_none=True), indent=2, default=str)
    meta = f"Confidence: {int(event.confidence * 100)}% | Action Required: {event.action_required} | Deadline: {event.action_deadline or 'N/A'}"
    
    return badge, details_json, meta


@spaces.GPU(duration=45)
def analyze_fit_demo(resume_text: str, job_title: str, company: str, job_description: str):
    """ZeroGPU accelerated resume fit & skill gap analyzer."""
    if not resume_text or not job_description:
        return "Please provide both candidate resume text and job description.", "", "", ""
        
    res = analyze_resume_fit(
        resume_text=resume_text,
        job_description=job_description,
        job_title=job_title,
        company=company,
    )
    
    score_headline = f"🎯 {res['fit_level']} — {res['match_score']}% Match Score"
    matching = "✅ " + ", ".join(res["matching_skills"]) if res["matching_skills"] else "None explicitly detected"
    missing = "⚠️ " + ", ".join(res["missing_skills"]) if res["missing_skills"] else "None (great alignment!)"
    recs = "\n".join(f"• {r}" for r in res["recommendations"])
    
    return score_headline, matching, missing, recs


@spaces.GPU(duration=45)
def generate_cover_letter_demo(resume_text: str, job_title: str, company: str, job_description: str, tone: str):
    """ZeroGPU accelerated tailored cover letter & recruiter outreach generator."""
    if not resume_text or not job_title or not company:
        return "Please provide candidate background, target job title, and company name.", ""
        
    res = generate_tailored_cover_letter(
        resume_text=resume_text,
        job_title=job_title,
        company=company,
        job_description=job_description,
        tone=tone.lower() if tone else "professional",
    )
    
    return res["cover_letter"], res["outreach_message"]


# Sample emails for one-click testing
SAMPLE_EMAILS = {
    "Google Interview Invite": (
        "Invitation to Interview: Software Engineer - Google",
        "recruiting-team@google.com",
        "Hi Alex, Thank you for applying for the Software Engineer role at Google. We were very impressed by your background and would love to invite you for a 45-minute technical screening with one of our engineers on October 14 at 2:00 PM EST. Please confirm your availability or choose a slot via https://calendly.com/google-recruiting/alex-screen. Best regards, Google Talent Team"
    ),
    "Stripe Screening Call": (
        "Stripe | Recruiter Screen for Backend Engineer",
        "jobs@stripe.com",
        "Hello, Thanks for your interest in Stripe! We'd like to schedule an initial 30-minute recruiter screen to chat about the Backend Software Engineer opening. Please pick a time that works for you here: https://calendly.com/stripe/initial-screen. We look forward to speaking!"
    ),
    "HackerRank Assessment": (
        "Complete your technical assessment for Datadog",
        "assessments@hackerrank.com",
        "Dear Candidate, You have been invited by Datadog to complete an Online Assessment for the Systems Engineer position. Please complete your 90-minute coding challenge before October 5th at https://hackerrank.com/tests/dd-candidate-2026. Good luck!"
    ),
    "Workday Rejection": (
        "Update on your application for Full Stack Engineer",
        "talent@airbnb.myworkday.com",
        "Dear Alex, Thank you for taking the time to apply for the Full Stack Engineer role. Although your qualifications are impressive, we have chosen to move forward with other candidates whose experience more closely matches our immediate needs. We wish you the best in your job search."
    ),
}

def load_sample_email(sample_name):
    if sample_name in SAMPLE_EMAILS:
        sub, sender, body = SAMPLE_EMAILS[sample_name]
        return sub, sender, body
    return "", "", ""


# 4. Build Gradio Interface with Interactive Tabs
with gr.Blocks(title="Job Tracker Backend & ZeroGPU Playground", analytics_enabled=False) as demo:
    gr.Markdown("# 🚀 Job Tracker API & ZeroGPU Playground")
    gr.Markdown(
        """
        **Interactive AI & Machine Learning Suite** powered by **Nvidia RTX Pro 6000 Blackwell** (Hugging Face ZeroGPU).
        
        - 📖 **Swagger API Docs**: [Open /docs](/docs)
        - 🩺 **Health Check**: [Check /health](/health)
        - 🌐 **Vercel Web App**: [Open Live Dashboard](https://job-application-tracker-one-ruddy.vercel.app)
        """
    )
    
    with gr.Tabs():
        # Tab 1: Hardware Diagnostic
        with gr.Tab("⚡ ZeroGPU Diagnostic"):
            gr.Markdown("### ZeroGPU Dynamic Hardware Status")
            gr.Markdown("Click below to test dynamic GPU allocation and inspect real-time CUDA properties.")
            hw_button = gr.Button("Inspect ZeroGPU Hardware", variant="primary")
            hw_output = gr.Textbox(label="Hardware Telemetry", lines=7, interactive=False)
            hw_button.click(fn=check_gpu_hardware, outputs=hw_output)

        # Tab 2: Live Email Classifier
        with gr.Tab("📧 GLiNER2 Email Classifier"):
            gr.Markdown("### Zero-Shot Email Lifecycle Classifier & Entity Extractor")
            gr.Markdown("Extracts company name, role, interview dates, meeting links, and detects lifecycle stage in real time.")
            
            sample_dropdown = gr.Dropdown(
                label="Load Preset Sample Email",
                choices=list(SAMPLE_EMAILS.keys()),
                value="Google Interview Invite",
            )
            email_subject = gr.Textbox(
                label="Email Subject",
                value=SAMPLE_EMAILS["Google Interview Invite"][0]
            )
            email_sender = gr.Textbox(
                label="Sender Address",
                value=SAMPLE_EMAILS["Google Interview Invite"][1]
            )
            email_body = gr.Textbox(
                label="Email Body",
                lines=5,
                value=SAMPLE_EMAILS["Google Interview Invite"][2]
            )
            
            sample_dropdown.change(
                fn=load_sample_email,
                inputs=sample_dropdown,
                outputs=[email_subject, email_sender, email_body]
            )
            
            classify_btn = gr.Button("⚡ Classify & Extract Entities", variant="primary")
            
            res_stage = gr.Textbox(label="Lifecycle Stage & Classification", interactive=False)
            res_meta = gr.Textbox(label="Status Metadata", interactive=False)
            res_json = gr.Code(label="Extracted Structured Entities (JSON)", language="json")
            
            classify_btn.click(
                fn=extract_email_demo,
                inputs=[email_subject, email_sender, email_body],
                outputs=[res_stage, res_json, res_meta]
            )

        # Tab 3: Resume Fit Analyzer
        with gr.Tab("🎯 Resume Fit Analyzer"):
            gr.Markdown("### AI Candidate Fit & Skill Gap Analyzer")
            gr.Markdown(f"Powered by **{GLINER_MODEL_ID}** zero-shot extraction & **{SIMILARITY_MODEL_ID}** dense semantic embeddings running on Hugging Face Spaces with ZeroGPU.")
            
            with gr.Row():
                with gr.Column():
                    r_pdf = gr.File(label="📄 Upload Candidate Resume (PDF)", file_types=[".pdf"], file_count="single")
                    r_text = gr.Textbox(
                        label="Candidate Resume / Extracted Text",
                        lines=6,
                        value="Full-stack engineer with 4 years experience in Python, FastAPI, React, PostgreSQL, Docker, and AWS. Built distributed background workers and REST APIs."
                    )
                    r_pdf.change(fn=lambda f: extract_text_from_pdf(f.name if hasattr(f, "name") else str(f)) if f else "", inputs=[r_pdf], outputs=[r_text])
                    j_title = gr.Textbox(label="Job Title", value="Senior Backend Engineer")
                    j_company = gr.Textbox(label="Company Name", value="Stripe")
                    j_desc = gr.Textbox(
                        label="Job Description Requirements",
                        lines=6,
                        value="We are looking for a Senior Backend Engineer. Requirements: Strong proficiency in Python or Go, PostgreSQL, Redis, Kubernetes, AWS, and system design for high-scale payments infrastructure."
                    )
                    fit_btn = gr.Button("⚡ Analyze Match & Gaps", variant="primary")
                
                with gr.Column():
                    fit_score = gr.Textbox(label="Match Assessment", interactive=False)
                    fit_matching = gr.Textbox(label="Matching Skills Found", interactive=False)
                    fit_missing = gr.Textbox(label="Missing Skills / Gaps", interactive=False)
                    fit_recs = gr.Textbox(label="Strategic Recommendations", lines=5, interactive=False)
            
            fit_btn.click(
                fn=analyze_fit_demo,
                inputs=[r_text, j_title, j_company, j_desc],
                outputs=[fit_score, fit_matching, fit_missing, fit_recs]
            )

        # Tab 4: Cover Letter Generator
        with gr.Tab("✍️ Cover Letter Generator"):
            gr.Markdown("### AI Cover Letter & Recruiter Outreach Generator")
            gr.Markdown(f"Generates a customized 3-paragraph cover letter and a concise LinkedIn connection note powered by **{GEN_MODEL_ID}** on Hugging Face Spaces with ZeroGPU.")
            
            with gr.Row():
                with gr.Column():
                    cl_pdf = gr.File(label="📄 Upload Candidate Resume (PDF)", file_types=[".pdf"], file_count="single")
                    cl_resume = gr.Textbox(
                        label="Candidate Background / Resume Summary",
                        lines=5,
                        value="Experienced software engineer specializing in Python, React, cloud microservices, and high-performance databases."
                    )
                    cl_pdf.change(fn=lambda f: extract_text_from_pdf(f.name if hasattr(f, "name") else str(f)) if f else "", inputs=[cl_pdf], outputs=[cl_resume])
                    cl_title = gr.Textbox(label="Target Job Title", value="Software Engineer")
                    cl_company = gr.Textbox(label="Target Company", value="Linear")
                    cl_desc = gr.Textbox(
                        label="Job Description (Optional)",
                        lines=4,
                        value="Building world-class issue tracking and project management software with high design craftsmanship and speed."
                    )
                    cl_tone = gr.Radio(
                        label="Tone",
                        choices=["Professional", "Enthusiastic", "Confident"],
                        value="Professional"
                    )
                    cl_btn = gr.Button("⚡ Generate Tailored Documents", variant="primary")
                
                with gr.Column():
                    cl_letter = gr.Textbox(label="Generated Cover Letter", lines=12, interactive=False)
                    cl_outreach = gr.Textbox(label="LinkedIn / Recruiter Outreach Message (<300 chars)", lines=4, interactive=False)
            
            cl_btn.click(
                fn=generate_cover_letter_demo,
                inputs=[cl_resume, cl_title, cl_company, cl_desc, cl_tone],
                outputs=[cl_letter, cl_outreach]
            )


# 5. Attach FastAPI routers, OpenAPI schema, and Swagger UI directly to demo.app
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
fastapi_app.include_router(ai_router)

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

# 6. Database lifecycle using modern FastAPI lifespan context
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

# 7. Launch via demo.launch(_app=fastapi_app, ssr_mode=False)
if __name__ == "__main__":
    demo.launch(_app=fastapi_app, ssr_mode=False)
