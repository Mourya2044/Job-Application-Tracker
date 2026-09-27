import io
from fastapi.testclient import TestClient
from app.main import app
from app.services.ai_advisor import (
    analyze_resume_fit,
    generate_tailored_cover_letter,
    extract_text_from_pdf,
    extract_resume_profile_from_pdf,
)

client = TestClient(app)

SAMPLE_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<< /Font<< /F1 4 0 R>> >>/Contents 5 0 R>>endobj\n"
    b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"5 0 obj<</Length 145>>stream\n"
    b"BT /F1 12 Tf 72 712 Td (Alex Mercer) Tj 0 -20 Td (alex@example.com - 555-123-4567) Tj 0 -20 Td (Senior Python Engineer proficient in FastAPI, Docker, and AWS.) Tj ET\n"
    b"endstream\nendobj\n"
    b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000108 00000 n \n0000000216 00000 n \n0000000283 00000 n \n"
    b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n480\n%%EOF"
)


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


def test_ai_advisor_pdf_extraction():
    text = extract_text_from_pdf(SAMPLE_PDF_BYTES)
    assert "Alex Mercer" in text
    assert "FastAPI" in text

    profile = extract_resume_profile_from_pdf(SAMPLE_PDF_BYTES)
    assert profile["candidate_name"] == "Alex Mercer"
    assert profile["email"] == "alex@example.com"
    assert "Python" in profile["skills"] or "FastAPI" in profile["skills"]


def test_ai_router_endpoints():
    # 1. Test status
    status_res = client.get("/api/ai/status")
    assert status_res.status_code == 200
    assert "status" in status_res.json()
    assert "accelerator" in status_res.json()
    assert "models" in status_res.json()

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

    # 4. Test parse-resume-pdf
    pdf_parse_res = client.post(
        "/api/ai/parse-resume-pdf",
        files={"file": ("resume.pdf", SAMPLE_PDF_BYTES, "application/pdf")},
    )
    assert pdf_parse_res.status_code == 200
    parsed = pdf_parse_res.json()
    assert "raw_text" in parsed
    assert "Alex Mercer" in parsed["raw_text"]
    assert parsed["email"] == "alex@example.com"

    # 5. Test match-resume-pdf
    pdf_match_res = client.post(
        "/api/ai/match-resume-pdf",
        files={"file": ("resume.pdf", SAMPLE_PDF_BYTES, "application/pdf")},
        data={
            "job_description": "Seeking Python engineer with Docker and AWS.",
            "job_title": "Backend Engineer",
            "company": "Stripe",
        },
    )
    assert pdf_match_res.status_code == 200
    pdf_match_data = pdf_match_res.json()
    assert pdf_match_data["match_score"] > 50
    assert len(pdf_match_data["matching_skills"]) > 0
