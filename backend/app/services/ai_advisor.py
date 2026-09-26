import logging
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ZeroGPU decorator compatibility
try:
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

# Common technical & professional skill lexicon for extraction
KNOWN_TECH_SKILLS = [
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "sql", "r", "html", "css", "bash", "shell",
    # Frontend
    "react", "react.js", "next.js", "vue", "vue.js", "angular", "svelte", "tailwind",
    "redux", "graphql", "rest", "restful", "webpack", "vite",
    # Backend & Frameworks
    "fastapi", "django", "flask", "node.js", "express", "spring", "spring boot",
    ".net", "asp.net", "rails", "gin", "grpc", "microservices",
    # Databases & Storage
    "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "cassandra",
    "sqlite", "dynamodb", "snowflake", "bigquery", "prisma", "sqlalchemy",
    # Cloud & DevOps
    "aws", "amazon web services", "gcp", "google cloud", "azure", "docker", "kubernetes",
    "k8s", "terraform", "ci/cd", "github actions", "gitlab ci", "jenkins", "linux", "nginx",
    # AI & Data
    "pytorch", "tensorflow", "keras", "scikit-learn", "pandas", "numpy", "transformers",
    "huggingface", "llm", "rag", "langchain", "nlp", "computer vision", "opencv", "spark",
    # Practices & Methods
    "agile", "scrum", "git", "system design", "distributed systems", "tdd", "unit testing",
    "api design", "oop", "clean architecture"
]


def extract_skills_from_text(text: str) -> List[str]:
    """Extracts known tech skills and keywords from free text."""
    if not text:
        return []
    
    text_lower = " " + re.sub(r"[^a-zA-Z0-9\+\#\.\/]", " ", text.lower()) + " "
    found = []
    
    for skill in KNOWN_TECH_SKILLS:
        # Match with word boundaries or punctuation boundaries
        pattern = r"(?:\b|\s)" + re.escape(skill) + r"(?:\b|\s)"
        if re.search(pattern, text_lower):
            found.append(skill.title() if not skill.isupper() else skill)
            
    # Normalize synonyms
    canonical = []
    seen = set()
    for s in found:
        norm = s.lower()
        if norm in ("golang", "go"):
            c = "Go"
        elif norm in ("react.js", "react"):
            c = "React"
        elif norm in ("vue.js", "vue"):
            c = "Vue"
        elif norm in ("postgres", "postgresql"):
            c = "PostgreSQL"
        elif norm in ("aws", "amazon web services"):
            c = "AWS"
        elif norm in ("gcp", "google cloud"):
            c = "GCP"
        elif norm in ("k8s", "kubernetes"):
            c = "Kubernetes"
        elif norm in ("rest", "restful"):
            c = "REST APIs"
        else:
            c = s
            
        if c.lower() not in seen:
            seen.add(c.lower())
            canonical.append(c)
            
    return canonical


def analyze_resume_fit(
    resume_text: str,
    job_description: str,
    job_title: str = "",
    company: str = ""
) -> Dict:
    """
    Computes a comprehensive match analysis between candidate resume and job posting.
    Returns match score, matched skills, missing skills, and actionable recommendations.
    """
    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_description)
    
    # If job description mentions no specific known tech skills, extract common role keywords
    if not job_skills and job_title:
        title_skills = extract_skills_from_text(job_title)
        if title_skills:
            job_skills.extend(title_skills)
            
    resume_skill_set = {s.lower() for s in resume_skills}
    job_skill_set = {s.lower() for s in job_skills}
    
    matching = [s for s in job_skills if s.lower() in resume_skill_set]
    missing = [s for s in job_skills if s.lower() not in resume_skill_set]
    extra_strengths = [s for s in resume_skills if s.lower() not in job_skill_set][:6]
    
    # Calculate score
    if job_skills:
        ratio = len(matching) / len(job_skills)
        score = int(min(98, max(35, round(ratio * 70 + 25))))
    else:
        # Lexical overlap fallback
        resume_words = set(re.findall(r"\w+", resume_text.lower()))
        job_words = set(re.findall(r"\w+", job_description.lower()))
        overlap = len(resume_words.intersection(job_words))
        score = int(min(95, max(40, round(overlap * 2.5)))) if job_words else 70

    if score >= 80:
        fit_level = "Strong Match"
    elif score >= 60:
        fit_level = "Moderate Match"
    else:
        fit_level = "Growth Opportunity"

    # Actionable recommendations
    recommendations = []
    if missing:
        top_missing = ", ".join(missing[:4])
        recommendations.append(f"Highlight any experience or project familiarity with: {top_missing}.")
    if matching:
        top_matching = ", ".join(matching[:4])
        recommendations.append(f"Emphasize your core strengths in {top_matching} during your initial screening.")
    if extra_strengths:
        top_extra = ", ".join(extra_strengths[:3])
        recommendations.append(f"Leverage your additional proficiency in {top_extra} to stand out as a multifaceted candidate.")
    if not recommendations:
        recommendations.append("Tailor your work experience bullet points to mirror the key verbs and outcomes in the job post.")

    role_label = job_title or "this position"
    company_label = f" at {company}" if company else ""

    summary = (
        f"You are a {fit_level} ({score}%) for {role_label}{company_label}. "
        f"Found {len(matching)} key matching qualifications with {len(missing)} areas to address."
    )

    return {
        "match_score": score,
        "fit_level": fit_level,
        "matching_skills": matching,
        "missing_skills": missing,
        "candidate_strengths": extra_strengths,
        "recommendations": recommendations,
        "summary": summary,
    }


def generate_tailored_cover_letter(
    resume_text: str,
    job_title: str,
    company: str,
    job_description: str = "",
    tone: str = "professional"
) -> Dict[str, str]:
    """
    Generates a tailored, professional 3-paragraph cover letter and a concise
    LinkedIn/recruiter outreach message.
    """
    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_description)
    matching_skills = [s for s in job_skills if s.lower() in {r.lower() for r in resume_skills}]
    
    target_skills = matching_skills if matching_skills else (resume_skills[:4] if resume_skills else ["modern software engineering", "problem solving"])
    skills_phrase = ", ".join(target_skills[:3]) if len(target_skills) >= 2 else (target_skills[0] if target_skills else "software engineering")

    company_name = company.strip() if company else "your team"
    role_name = job_title.strip() if job_title else "Software Engineer"

    # Tone adjustments
    if tone.lower() == "enthusiastic":
        opening_hook = f"I was thrilled to discover the opening for the {role_name} position at {company_name}. With my background in {skills_phrase}, I have long admired {company_name}'s innovation and product vision, and I would love to contribute directly to your team's success."
        closer = f"I would welcome the opportunity to discuss how my passion for impact and skills in {skills_phrase} can help {company_name} achieve its goals. Thank you for your time and consideration!"
    elif tone.lower() == "confident":
        opening_hook = f"I am writing to express my strong interest in the {role_name} role at {company_name}. Having developed high-reliability systems and demonstrated proficiency in {skills_phrase}, I am confident in my ability to deliver immediate value to your organization."
        closer = f"I look forward to the chance to speak with your team about driving results at {company_name}. Thank you for reviewing my application."
    else:  # professional / balanced default
        opening_hook = f"Please accept this letter as an expression of my enthusiasm for the {role_name} position at {company_name}. My professional experience and technical focus in {skills_phrase} align closely with the requirements of this role."
        closer = f"Thank you for considering my application. I welcome the opportunity for an interview to explore how my qualifications can best support {company_name}."

    body_para = (
        f"Throughout my career, I have focused on delivering scalable, clean, and maintainable solutions. "
        f"My hands-on experience spans {skills_phrase}, alongside collaborating in agile environments to ship robust features on schedule. "
        f"What excites me most about {company_name} is the opportunity to solve meaningful technical challenges while upholding high engineering standards."
    )

    cover_letter = (
        f"Dear Hiring Team,\n\n"
        f"{opening_hook}\n\n"
        f"{body_para}\n\n"
        f"{closer}\n\n"
        f"Sincerely,\n[Your Name]"
    )

    # Concise Recruiter / LinkedIn Outreach message (under 300 chars, ideal for LinkedIn connection note)
    outreach_message = (
        f"Hi there! I noticed {company_name} is hiring for a {role_name}. "
        f"Given my hands-on background in {skills_phrase}, I believe I'd be a great addition to the team. "
        f"I've submitted my application and would love to connect. Best, [Your Name]"
    )

    return {
        "cover_letter": cover_letter,
        "outreach_message": outreach_message,
        "tone": tone,
        "skills_highlighted": target_skills[:5],
    }
