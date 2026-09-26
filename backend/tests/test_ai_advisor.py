from fastapi.testclient import TestClient
from app.main import app
from app.services.ai_advisor import analyze_resume_fit, generate_tailored_cover_letter

client = TestClient(app)


def test_ai_advisor_resume_fit():
    resume = "Senior developer with Python, FastAPI, PostgreSQL, Docker, AWS, and Redis."
    job_desc = "Looking for a backend engineer with Python, PostgreSQL, Kubernetes, and AWS."
    
    result = analyze_resume_fit(
        resume_text=resume,
        job_description=job_desc,
        job_title="Backend Engineer",
        company="Stripe",
    )
    
    assert "match_score" in result
    assert result["match_score"] >= 60
    assert "Python" in result["matching_skills"]
    assert "PostgreSQL" in result["matching_skills"]
    assert "Kubernetes" in result["missing_skills"]
    assert len(result["recommendations"]) > 0


def test_ai_advisor_cover_letter():
    resume = "Frontend engineer with React, TypeScript, Tailwind, and GraphQL."
    result = generate_tailored_cover_letter(
        resume_text=resume,
        job_title="Frontend Developer",
        company="Vercel",
        job_description="Building modern web apps with React and Next.js.",
        tone="enthusiastic",
    )
    
    assert "cover_letter" in result
    assert "Vercel" in result["cover_letter"]
    assert "Frontend Developer" in result["cover_letter"]
    assert "outreach_message" in result
    assert len(result["outreach_message"]) < 300


def test_ai_router_endpoints():
    # 1. Test status
    status_res = client.get("/api/ai/status")
    assert status_res.status_code == 200
    assert "status" in status_res.json()
    assert "accelerator" in status_res.json()

    # 2. Test match-resume
    match_res = client.post("/api/ai/match-resume", json={
        "resume_text": "Software engineer proficient in Go, Docker, Kubernetes, and Linux.",
        "job_description": "We need an engineer experienced with Docker, Kubernetes, and AWS.",
        "job_title": "DevOps Engineer",
        "company": "Cloudflare",
    })
    assert match_res.status_code == 200
    data = match_res.json()
    assert data["match_score"] > 50
    assert "Docker" in data["matching_skills"]
    assert "AWS" in data["missing_skills"]

    # 3. Test generate-cover-letter
    cl_res = client.post("/api/ai/generate-cover-letter", json={
        "resume_text": "Experienced Python and FastAPI backend engineer.",
        "job_title": "Backend Lead",
        "company": "Figma",
        "tone": "confident",
    })
    assert cl_res.status_code == 200
    cl_data = cl_res.json()
    assert "Figma" in cl_data["cover_letter"]
    assert "Backend Lead" in cl_data["cover_letter"]
    assert "outreach_message" in cl_data
