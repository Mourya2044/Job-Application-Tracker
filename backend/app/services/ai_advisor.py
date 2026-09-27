import io
import os
import re
import logging
from typing import BinaryIO, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# ZeroGPU decorator compatibility
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

# Model identifiers hosted on Hugging Face Hub / HF Spaces
GLINER_MODEL_ID = (
    os.getenv("GLINER_MODEL_ID")
    or os.getenv("NER_MODEL_ID")
    or "fastino/gliner2-multi-v1"
).strip().strip("'\"")

SIMILARITY_MODEL_ID = (
    os.getenv("SIMILARITY_MODEL_ID")
    or os.getenv("EMBEDDING_MODEL_ID")
    or os.getenv("SIMILARITY_MODEL")
    or os.getenv("EMBED_MODEL")
    or "sentence-transformers/all-MiniLM-L6-v2"
).strip().strip("'\"")

GEN_MODEL_ID = (
    os.getenv("AI_ADVISOR_MODEL")
    or os.getenv("GEN_MODEL_ID")
    or os.getenv("MODEL_ID")
    or os.getenv("LLM_MODEL")
    or os.getenv("TEXT_MODEL_ID")
    or "HuggingFaceTB/SmolLM2-135M-Instruct"
).strip().strip("'\"")

# Global lazy singletons
_gliner_model = None
_sim_tokenizer = None
_sim_model = None
_gen_tokenizer = None
_gen_model = None


def get_gliner_model():
    """Lazily load GLiNER2 zero-shot entity and skill extractor."""
    global _gliner_model
    if _gliner_model is None:
        try:
            from gliner2 import GLiNER2
            _gliner_model = GLiNER2.from_pretrained(GLINER_MODEL_ID)
            logger.info("GLiNER2 skill extractor initialized (%s)", GLINER_MODEL_ID)
        except Exception as e:
            logger.warning("Could not load GLiNER2 model: %s", e)
            _gliner_model = False
    return _gliner_model if _gliner_model is not False else None


def get_similarity_model():
    """Lazily load MiniLM / BGE transformer model for semantic embeddings."""
    global _sim_tokenizer, _sim_model
    if _sim_model is None:
        try:
            import torch
            from transformers import AutoTokenizer, AutoModel
            _sim_tokenizer = AutoTokenizer.from_pretrained(SIMILARITY_MODEL_ID)
            _sim_model = AutoModel.from_pretrained(SIMILARITY_MODEL_ID)
            _sim_model.eval()
            logger.info("Semantic similarity model initialized (%s)", SIMILARITY_MODEL_ID)
        except Exception as e:
            logger.warning("Could not load similarity model: %s", e)
            _sim_model = False
            _sim_tokenizer = False
    return (_sim_tokenizer, _sim_model) if _sim_model is not False else (None, None)


def get_generation_model():
    """Lazily load instruction-tuned language model for cover letters & advice."""
    global _gen_tokenizer, _gen_model
    if _gen_model is None:
        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForCausalLM
            _gen_tokenizer = AutoTokenizer.from_pretrained(GEN_MODEL_ID)
            _gen_model = AutoModelForCausalLM.from_pretrained(
                GEN_MODEL_ID,
                dtype=torch.float32 if not torch.cuda.is_available() else torch.float16,
            )
            _gen_model.eval()
            logger.info("Text generation model initialized (%s)", GEN_MODEL_ID)
        except Exception as e:
            logger.warning("Could not load text generation model: %s", e)
            _gen_model = False
            _gen_tokenizer = False
    return (_gen_tokenizer, _gen_model) if _gen_model is not False else (None, None)


# Canonical aliases for normalization
SYNONYM_MAP = {
    "golang": "Go",
    "go": "Go",
    "react.js": "React",
    "reactjs": "React",
    "react": "React",
    "vue.js": "Vue",
    "vuejs": "Vue",
    "vue": "Vue",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "aws": "AWS",
    "amazon web services": "AWS",
    "gcp": "GCP",
    "google cloud": "GCP",
    "google cloud platform": "GCP",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "rest": "REST APIs",
    "restful": "REST APIs",
    "fastapi": "FastAPI",
    "docker": "Docker",
    "python": "Python",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "redis": "Redis",
    "graphql": "GraphQL",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "linux": "Linux",
    "terraform": "Terraform",
    "ci/cd": "CI/CD",
}

# Seniority levels and their numeric ranks
SENIORITY_RANKS = {
    "intern": 1,
    "junior": 2,
    "associate": 2,
    "entry": 2,
    "mid": 3,
    "intermediate": 3,
    "senior": 4,
    "sr": 4,
    "lead": 5,
    "staff": 6,
    "principal": 7,
    "architect": 6,
    "manager": 5,
    "director": 7,
    "head": 7,
    "vp": 8,
}

# Action verbs commonly expected by ATS scanners in achievement bullets
ATS_ACTION_VERBS = [
    "architected", "engineered", "developed", "built", "implemented", "designed",
    "optimized", "scaled", "automated", "spearheaded", "deployed", "reduced",
    "increased", "delivered", "led", "refactored", "orchestrated", "migrated",
    "resolved", "integrated", "streamlined", "accelerated", "maintained"
]


def _normalize_skill(skill: str) -> str:
    cleaned = skill.strip().strip(",.;:()[]{}'\"")
    lower = cleaned.lower()
    if lower in SYNONYM_MAP:
        return SYNONYM_MAP[lower]
    return cleaned.title() if not cleaned.isupper() and len(cleaned) <= 4 else cleaned


def extract_skills_from_text(text: str) -> List[str]:
    """
    Extracts technical skills and qualifications using GLiNER2 zero-shot information extraction.
    Falls back gracefully to token regex heuristics if the neural model is offline.
    """
    if not text or not text.strip():
        return []

    found_skills = []
    gliner = get_gliner_model()

    if gliner:
        try:
            schema = (
                gliner.create_schema()
                .entities({
                    "skill": "Technical skill, programming language, library, framework, or database",
                    "competency": "Engineering domain proficiency, cloud platform, or core qualification",
                })
            )
            extraction = gliner.extract(text[:2500], schema)
            entities = extraction.get("entities", {})
            for item in entities.get("skill", []) + entities.get("competency", []):
                norm = _normalize_skill(item)
                if norm and len(norm) > 1:
                    found_skills.append(norm)
        except Exception as e:
            logger.debug("GLiNER2 extraction failed: %s", e)

    # Secondary pattern heuristic to ensure comprehensive coverage
    token_pattern = r"(?i)\b(python|javascript|typescript|golang|go|rust|java|c\+\+|c\#|ruby|sql|react|vue|angular|fastapi|django|flask|node\.js|express|docker|kubernetes|k8s|aws|gcp|azure|postgresql|postgres|mysql|redis|mongodb|graphql|tailwind|next\.js|linux|ci/cd|terraform|git)\b"
    for match in re.finditer(token_pattern, text):
        norm = _normalize_skill(match.group(1))
        if norm not in found_skills:
            found_skills.append(norm)

    # Deduplicate while preserving order
    deduped = []
    seen = set()
    for s in found_skills:
        k = s.lower()
        if k not in seen:
            seen.add(k)
            deduped.append(s)

    return deduped


def extract_text_from_pdf(pdf_source: Union[bytes, BinaryIO, str]) -> str:
    """
    Extracts and normalizes clean text from a PDF file path, raw bytes, or stream.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.error("pypdf is not installed. Please install pypdf to parse PDF files.")
        return ""

    try:
        if isinstance(pdf_source, bytes):
            stream = io.BytesIO(pdf_source)
        elif isinstance(pdf_source, str):
            if os.path.exists(pdf_source):
                stream = open(pdf_source, "rb")
            else:
                logger.error("PDF file path does not exist: %s", pdf_source)
                return ""
        else:
            stream = pdf_source

        reader = PdfReader(stream)
        pages_text = []
        for i, page in enumerate(reader.pages):
            try:
                page_str = page.extract_text()
                if page_str:
                    pages_text.append(page_str)
            except Exception as e:
                logger.warning("Error reading PDF page %d: %s", i + 1, e)

        full_text = "\n\n".join(pages_text)
        # Clean up hyphenated line wraps (e.g. "distrib-\nuted" -> "distributed")
        cleaned = re.sub(r"(\w+)-\n(\w+)", r"\1\2", full_text)
        # Normalize excessive whitespace and linebreaks
        cleaned = re.sub(r"[ \t]+", " ", cleaned)
        cleaned = re.sub(r"\n\s*\n\s*\n+", "\n\n", cleaned)
        return cleaned.strip()
    except Exception as e:
        logger.error("Failed to extract text from PDF: %s", e)
        return ""


def extract_resume_profile_from_pdf(pdf_source: Union[bytes, BinaryIO, str]) -> Dict:
    """
    Extracts text from a PDF resume and structures it into candidate profile data
    (name, email, phone, links, skills, education, roles, summary) using AI extraction.
    """
    raw_text = extract_text_from_pdf(pdf_source)
    if not raw_text:
        return {
            "raw_text": "",
            "candidate_name": "",
            "email": "",
            "phone": "",
            "links": [],
            "skills": [],
            "education": [],
            "experience_roles": [],
            "summary": "No readable text found in PDF.",
        }

    # 1. Contact & Link Extraction (Regex)
    email_match = re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", raw_text)
    email = email_match.group(0) if email_match else ""

    phone_match = re.search(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", raw_text)
    phone = phone_match.group(0) if phone_match else ""

    links = re.findall(
        r"https?://(?:www\.)?(?:linkedin\.com/in/[a-zA-Z0-9_-]+|github\.com/[a-zA-Z0-9_-]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/[^\s]*)",
        raw_text,
    )
    short_links = re.findall(r"(?:linkedin\.com/in/[a-zA-Z0-9_-]+|github\.com/[a-zA-Z0-9_-]+)", raw_text)
    for sl in short_links:
        full_l = "https://" + sl
        if full_l not in links:
            links.append(full_l)

    # 2. GLiNER2 Model Extraction for structured entities
    candidate_name = ""
    education_items = []
    experience_roles = []

    gliner = get_gliner_model()
    if gliner:
        try:
            schema = (
                gliner.create_schema()
                .entities({
                    "candidate_name": "Full name of the candidate or person",
                    "education": "University, college, degree, or major",
                    "job_title": "Professional job title or position held",
                })
            )
            extraction = gliner.extract(raw_text[:1500], schema)
            entities = extraction.get("entities", {})

            names = entities.get("candidate_name", [])
            if names:
                candidate_name = names[0].strip()

            education_items = list(dict.fromkeys(entities.get("education", [])))[:5]
            experience_roles = list(dict.fromkeys(entities.get("job_title", [])))[:5]
        except Exception as e:
            logger.debug("GLiNER2 resume profile extraction error: %s", e)

    # Fallback for candidate name from first line if not detected
    if not candidate_name:
        for line in raw_text.split("\n")[:3]:
            candidate_line = line.strip()
            words = candidate_line.split()
            if 2 <= len(words) <= 4 and "@" not in candidate_line and not any(c.isdigit() for c in candidate_line):
                candidate_name = candidate_line.title()
                break

    # 3. Extract all skills and qualifications using GLiNER2 AI
    skills = extract_skills_from_text(raw_text)

    # 4. Generate candidate summary preview
    name_str = candidate_name or "Candidate"
    skills_preview = ", ".join(skills[:6]) if skills else "general software engineering"
    summary = f"{name_str} with expertise in {skills_preview}. Extracted {len(skills)} technical skills from resume."

    return {
        "raw_text": raw_text,
        "candidate_name": candidate_name,
        "email": email,
        "phone": phone,
        "links": links,
        "skills": skills,
        "education": education_items,
        "experience_roles": experience_roles,
        "summary": summary,
    }


def compute_semantic_embedding(text: str):
    """Computes normalized dense contextual embedding using all-MiniLM-L6-v2."""
    tok, model = get_similarity_model()
    if not tok or not model:
        return None

    try:
        import torch
        inp = tok(text, padding=True, truncation=True, max_length=512, return_tensors="pt")
        device = next(model.parameters()).device
        inp = {k: v.to(device) for k, v in inp.items()}
        with torch.no_grad():
            out = model(**inp)
            emb = out.last_hidden_state.mean(dim=1)
            norm_emb = torch.nn.functional.normalize(emb, p=2, dim=1)
            return norm_emb
    except Exception as e:
        logger.debug("Error computing semantic embedding: %s", e)
        return None


def calculate_semantic_similarity(emb1, emb2) -> float:
    """Calculates cosine similarity between two normalized embeddings."""
    if emb1 is None or emb2 is None:
        return 0.0
    try:
        import torch
        sim = float(torch.mm(emb1, emb2.T)[0][0].item())
        return max(-1.0, min(1.0, sim))
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# ATS (Applicant Tracking System) Specialized Evaluators
# ---------------------------------------------------------------------------

def extract_years_of_experience(text: str) -> Optional[int]:
    """Extracts explicit years of experience mentioned in text (e.g. '5+ years', '3-5 years')."""
    pat = r"(\d+)\+?\s*(?:-\s*(\d+)\s*)?(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?"
    matches = re.findall(pat, text, flags=re.IGNORECASE)
    if not matches:
        return None
    years = []
    for a, b in matches:
        try:
            val = int(b) if b else int(a)
            if 0 < val <= 40:
                years.append(val)
        except Exception:
            continue
    return max(years) if years else None


def detect_seniority_level(text: str) -> Tuple[str, int]:
    """Detects highest seniority level present in role or resume."""
    text_lower = text.lower()
    highest_title = "mid"
    highest_rank = 3
    for title, rank in SENIORITY_RANKS.items():
        if re.search(rf"\b{title}\b", text_lower):
            if rank > highest_rank:
                highest_rank = rank
                highest_title = title.title()
    return highest_title, highest_rank


def check_ats_formatting_and_sections(text: str) -> Tuple[int, Dict[str, bool]]:
    """
    Evaluates ATS parseability: checks for essential contact fields,
    standard section headers, action verbs, and quantified metrics.
    """
    has_email = bool(re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text))
    has_phone = bool(re.search(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}", text))
    has_exp_sec = bool(re.search(r"(?i)\b(work\s+experience|professional\s+experience|employment\s+history|experience)\b", text))
    has_edu_sec = bool(re.search(r"(?i)\b(education|academic\s+background|degrees?|qualifications?)\b", text))
    has_skills_sec = bool(re.search(r"(?i)\b(skills|technical\s+skills|technologies|core\s+competencies)\b", text))

    # Check for quantified metrics (e.g., 40%, $2M, 50ms latency, 100k users)
    has_metrics = bool(re.search(r"\d+%\b|\$\d+|\b\d+\s*(?:ms|seconds|minutes|hours|users|clients|queries|requests|x|fold|tb|gb)\b", text, flags=re.IGNORECASE))

    # Base ATS formatting health score
    score = 100
    if not has_email:
        score -= 15
    if not has_phone:
        score -= 10
    if not has_exp_sec:
        score -= 15
    if not has_edu_sec:
        score -= 10
    if not has_skills_sec:
        score -= 15
    if not has_metrics:
        score -= 15

    score = max(35, min(100, score))

    checks = {
        "has_email": has_email,
        "has_phone": has_phone,
        "has_experience_section": has_exp_sec,
        "has_education_section": has_edu_sec,
        "has_skills_section": has_skills_sec,
        "has_quantified_metrics": has_metrics,
    }
    return score, checks


def check_education_alignment(resume_text: str, job_description: str) -> int:
    """Evaluates degree level and certification match between job and resume."""
    degree_levels = {
        "phd": 4, "doctorate": 4,
        "master": 3, "ms": 3, "m.tech": 3, "mba": 3,
        "bachelor": 2, "bs": 2, "b.tech": 2, "b.e": 2, "undergraduate": 2
    }

    job_lower = job_description.lower()
    res_lower = resume_text.lower()

    req_degree_rank = 1
    for deg, rank in degree_levels.items():
        if re.search(rf"\b{deg}\b", job_lower):
            if rank > req_degree_rank:
                req_degree_rank = rank

    cand_degree_rank = 1
    for deg, rank in degree_levels.items():
        if re.search(rf"\b{deg}\b", res_lower):
            if rank > cand_degree_rank:
                cand_degree_rank = rank

    if req_degree_rank <= 1:
        # Job description does not strictly mandate a specific degree
        return 90 if cand_degree_rank >= 2 else 75
    elif cand_degree_rank >= req_degree_rank:
        return 95
    else:
        # Candidate has lower degree tier than explicitly requested
        return 65


@spaces.GPU(duration=60)
def analyze_resume_fit(
    resume_text: str = "",
    job_description: str = "",
    job_title: str = "",
    company: str = "",
    resume_pdf: Optional[Union[bytes, str]] = None,
) -> Dict:
    """
    ATS (Applicant Tracking System) Scorer and Resume Fit Engine.
    Evaluates resumes across 5 core ATS pillars:
      1. Technical Skills & Keywords (35%)
      2. Experience & Seniority Alignment (20%)
      3. Education & Credentials (15%)
      4. ATS Parseability & Formatting Health (15%)
      5. Semantic Relevance & Impact (15%)
    """
    if resume_pdf is not None and not resume_text:
        resume_text = extract_text_from_pdf(resume_pdf)

    # 1. Pillar 1: Technical Skills & Hard Keywords (Weight: 35%)
    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_description)

    if not job_skills and job_title:
        title_skills = extract_skills_from_text(job_title)
        if title_skills:
            job_skills.extend(title_skills)

    candidate_skill_embs = {}
    for cs in resume_skills:
        c_emb = compute_semantic_embedding(cs)
        if c_emb is not None:
            candidate_skill_embs[cs] = c_emb

    matching = []
    missing = []

    for req in job_skills:
        # Check direct lexical match
        if any(req.lower() == cs.lower() for cs in resume_skills):
            matching.append(req)
            continue

        # Check semantic embedding match for direct synonyms/equivalents (threshold 0.85)
        req_emb = compute_semantic_embedding(req)
        matched = False
        if req_emb is not None and candidate_skill_embs:
            for cs, c_emb in candidate_skill_embs.items():
                sim = calculate_semantic_similarity(req_emb, c_emb)
                if sim >= 0.85:
                    matched = True
                    break

        if matched:
            matching.append(req)
        else:
            missing.append(req)

    job_skill_lower = {s.lower() for s in job_skills}
    extra_strengths = [s for s in resume_skills if s.lower() not in job_skill_lower][:6]

    if job_skills:
        skill_coverage = len(matching) / len(job_skills)
        skills_score = int(min(100, max(30, round(skill_coverage * 100))))
    else:
        skills_score = 75

    # 2. Pillar 2: Experience & Seniority Alignment (Weight: 20%)
    cand_years = extract_years_of_experience(resume_text)
    req_years = extract_years_of_experience(job_description)

    _, req_rank = detect_seniority_level(f"{job_title} {job_description}")
    _, cand_rank = detect_seniority_level(resume_text)

    if req_years is not None and cand_years is not None:
        if cand_years >= req_years:
            exp_ratio = 1.0
        else:
            exp_ratio = max(0.4, cand_years / req_years)
        experience_score = int(round(exp_ratio * 100))
    elif req_rank and cand_rank:
        if cand_rank >= req_rank:
            experience_score = 95
        else:
            experience_score = 70
    else:
        experience_score = 80

    # 3. Pillar 3: Education & Credentials Alignment (Weight: 15%)
    education_score = check_education_alignment(resume_text, job_description)

    # 4. Pillar 4: ATS Parseability & Formatting Health (Weight: 15%)
    formatting_score, section_checks = check_ats_formatting_and_sections(resume_text)

    # 5. Pillar 5: Semantic Relevance & Responsibility Coverage (Weight: 15%)
    emb_resume = compute_semantic_embedding(resume_text)
    emb_job = compute_semantic_embedding(job_description)
    doc_similarity = calculate_semantic_similarity(emb_resume, emb_job)
    semantic_score = int(min(100, max(35, round(max(0.0, doc_similarity) * 100))))

    # Composite ATS Score (Weighted Multi-Pillar Engine)
    raw_ats_score = (
        0.35 * skills_score +
        0.20 * experience_score +
        0.15 * education_score +
        0.15 * formatting_score +
        0.15 * semantic_score
    )
    ats_score = int(min(98, max(35, round(raw_ats_score))))

    # ATS Fit Tiers
    if ats_score >= 80:
        fit_level = "Strong ATS Match"
    elif ats_score >= 60:
        fit_level = "Moderate ATS Match"
    else:
        fit_level = "Growth Opportunity (At Risk of ATS Filter)"

    # Actionable ATS Optimization Recommendations
    recommendations = []
    role_label = job_title or "this position"
    company_label = f" at {company}" if company else ""

    if missing:
        top_missing = ", ".join(missing[:4])
        recommendations.append(
            f"ATS Keyword Gap: Incorporate exact terms for '{top_missing}' in your Skills and Experience bullet points to pass automated keyword screening."
        )

    if not section_checks.get("has_quantified_metrics"):
        recommendations.append(
            "Quantified Impact: Add numerical metrics (e.g. latency reduction %, throughput, team size, cost savings) to experience bullets to rank higher in recruiter ATS views."
        )

    if not section_checks.get("has_email") or not section_checks.get("has_phone"):
        recommendations.append(
            "ATS Header Issue: Ensure a clearly visible email and phone number are present at the top of your resume for recruiter outreach parsers."
        )

    if matching:
        top_matching = ", ".join(matching[:4])
        recommendations.append(
            f"Core ATS Strengths: Your verified proficiency in {top_matching} provides a solid qualification match for {role_label}."
        )

    if extra_strengths:
        top_extra = ", ".join(extra_strengths[:3])
        recommendations.append(
            f"Value-Add Differentiators: Emphasize your background in {top_extra} as versatile strengths that distinguish you from other candidates."
        )

    if not recommendations:
        recommendations.append(
            f"Tailor action verbs in your recent role to directly reflect the requirements of {role_label}."
        )

    summary = (
        f"ATS Match Score: {ats_score}% ({fit_level}) for {role_label}{company_label}. "
        f"Technical Skills: {skills_score}%, Experience Alignment: {experience_score}%, "
        f"ATS Formatting Health: {formatting_score}%, Semantic Relevance: {semantic_score}%."
    )

    ats_breakdown = {
        "skills_score": skills_score,
        "experience_score": experience_score,
        "education_score": education_score,
        "formatting_score": formatting_score,
        "semantic_score": semantic_score,
    }

    return {
        "match_score": ats_score,
        "fit_level": fit_level,
        "matching_skills": matching,
        "missing_skills": missing,
        "candidate_strengths": extra_strengths,
        "recommendations": recommendations,
        "summary": summary,
        "ats_score": ats_score,
        "ats_breakdown": ats_breakdown,
        "section_checks": section_checks,
        "detected_years_candidate": cand_years,
        "detected_years_required": req_years,
    }


def _generate_with_causal_lm(
    prompt_messages: List[Dict[str, str]],
    max_new_tokens: int = 220
) -> Optional[str]:
    """Generates text from instruction model using chat template."""
    tok, model = get_generation_model()
    if not tok or not model:
        return None

    try:
        import torch
        device = next(model.parameters()).device
        prompt = tok.apply_chat_template(prompt_messages, tokenize=False, add_generation_prompt=True)
        inp = tok(prompt, return_tensors="pt").to(device)

        with torch.no_grad():
            out = model.generate(
                **inp,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                repetition_penalty=1.1,
            )
            gen_text = tok.decode(out[0][inp.input_ids.shape[1]:], skip_special_tokens=True)
            return gen_text.strip()
    except Exception as e:
        logger.warning("Causal LM generation encountered an error: %s", e)
        return None


def _clean_and_personalize_cover_letter(
    raw_text: str,
    role_name: str,
    company_name: str,
    skills_phrase: str,
    tone: str
) -> str:
    """Post-processes AI model text to guarantee accurate company, role, and formatting."""
    text = raw_text.strip()
    text = re.sub(r"^```(?:markdown)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    # 1. Replace placeholder tokens commonly produced by LLMs
    placeholders = [
        (r"\[(?:Company\s*Name|Company|Target\s*Company|Client\s*Name|Organization)\]", company_name),
        (r"\[(?:Job\s*Title|Position\s*Title|Position|Role\s*Name|Role)\]", role_name),
        (r"\[(?:Recipient(?:'s)?\s*Name|Hiring\s*Manager|Hiring\s*Team)\]", f"Hiring Team at {company_name}"),
        (r"\[(?:Candidate\s*Name|My\s*Name|Applicant\s*Name)\]", "[Your Name]"),
    ]
    for pat, rep in placeholders:
        text = re.sub(pat, rep, text, flags=re.IGNORECASE)

    # 2. Ensure company_name appears in the greeting or text
    if company_name not in text:
        if text.lower().startswith("dear"):
            lines = text.split("\n", 1)
            text = f"Dear Hiring Team at {company_name},\n" + (lines[1] if len(lines) > 1 else "")
        else:
            text = f"Dear Hiring Team at {company_name},\n\n" + text

    # 3. Ensure role_name appears in the text
    if role_name not in text:
        match = re.search(rf"\b{re.escape(role_name)}\b", text, flags=re.IGNORECASE)
        if match:
            text = text[:match.start()] + role_name + text[match.end():]
        else:
            paragraphs = text.split("\n\n")
            if len(paragraphs) > 1:
                paragraphs[1] = f"I am writing to express my strong interest in the {role_name} position at {company_name}. " + paragraphs[1]
                text = "\n\n".join(paragraphs)

    # 4. Ensure professional signoff
    if "[Your Name]" not in text and not text.lower().endswith("sincerely,"):
        text = text.rstrip() + "\n\nSincerely,\n[Your Name]"

    return text


@spaces.GPU(duration=60)
def generate_tailored_cover_letter(
    resume_text: str = "",
    job_title: str = "",
    company: str = "",
    job_description: str = "",
    tone: str = "professional",
    resume_pdf: Optional[Union[bytes, str]] = None,
) -> Dict[str, str]:
    """
    Generates a tailored, compelling cover letter and recruiter outreach note
    using the Hugging Face instruction-tuned AI model on HF Spaces ZeroGPU.
    Accepts candidate resume text or PDF source.
    """
    if resume_pdf is not None and not resume_text:
        resume_text = extract_text_from_pdf(resume_pdf)

    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_description)
    matching_skills = [s for s in job_skills if s.lower() in {r.lower() for r in resume_skills}]

    target_skills = matching_skills if matching_skills else (resume_skills[:4] if resume_skills else ["software engineering", "scalable architectures"])
    skills_phrase = ", ".join(target_skills[:3]) if len(target_skills) >= 2 else (target_skills[0] if target_skills else "software engineering")

    company_name = company.strip() if company else "your team"
    role_name = job_title.strip() if job_title else "Software Engineer"
    active_tone = tone.lower() if tone else "professional"

    resume_snippet = resume_text.strip()[:500]
    job_snippet = job_description.strip()[:350]

    system_prompt = (
        "You are an expert career consultant and professional resume advisor. "
        "Write concise, highly tailored cover letters and recruiter outreach messages."
    )
    user_prompt = (
        f"Write a 3-paragraph tailored cover letter for candidate applying for the role '{role_name}' at '{company_name}'.\n"
        f"Tone: {active_tone.capitalize()}\n"
        f"Candidate Background: {resume_snippet}\n"
        f"Key qualifications to feature: {skills_phrase}\n"
        f"Job requirements context: {job_snippet}\n\n"
        f"Format:\n"
        f"Dear Hiring Team at {company_name},\n\n"
        f"[Paragraph 1: Passion for {role_name} at {company_name}]\n\n"
        f"[Paragraph 2: Concrete technical impact delivering results with {skills_phrase}]\n\n"
        f"[Paragraph 3: Confident interview request]\n\n"
        f"Sincerely,\n[Your Name]"
    )

    generated_cover_letter = None
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    try:
        raw_output = _generate_with_causal_lm(messages, max_new_tokens=220)
        if raw_output and len(raw_output) > 100:
            generated_cover_letter = _clean_and_personalize_cover_letter(
                raw_text=raw_output,
                role_name=role_name,
                company_name=company_name,
                skills_phrase=skills_phrase,
                tone=active_tone,
            )
    except Exception as e:
        logger.debug("AI model generation fallback: %s", e)

    # High-quality fallback guaranteeing proper formatting
    if not generated_cover_letter:
        if active_tone == "enthusiastic":
            opening_hook = f"I am thrilled to apply for the {role_name} position at {company_name}. Having developed robust systems and worked closely with {skills_phrase}, I have long admired {company_name}'s product vision and team culture."
            closer = f"I would welcome the opportunity to discuss how my enthusiasm and background in {skills_phrase} can help {company_name} achieve its goals. Thank you for your consideration."
        elif active_tone == "confident":
            opening_hook = f"I am writing to express my strong candidacy for the {role_name} opportunity at {company_name}. With demonstrated expertise in {skills_phrase}, I am prepared to deliver immediate value to your engineering organization."
            closer = f"I look forward to discussing how my experience delivering resilient solutions can drive technical success at {company_name}. Thank you for your time."
        else:
            opening_hook = f"Please accept this letter as an expression of my strong interest in the {role_name} opening at {company_name}. My background in {skills_phrase} aligns directly with the core requirements of your engineering team."
            closer = f"Thank you for considering my application. I welcome the opportunity for an interview to explore how my qualifications can best support {company_name}."

        body_para = (
            f"Throughout my work, I have focused on engineering scalable, maintainable architectures while collaborating in agile environments. "
            f"My hands-on experience spans {skills_phrase}, with a commitment to shipping reliable features that solve substantive business problems. "
            f"Joining {company_name} represents an exciting opportunity to apply these technical strengths toward high-impact objectives."
        )

        generated_cover_letter = (
            f"Dear Hiring Team at {company_name},\n\n"
            f"{opening_hook}\n\n"
            f"{body_para}\n\n"
            f"{closer}\n\n"
            f"Sincerely,\n[Your Name]"
        )

    outreach_message = (
        f"Hi there! I noticed {company_name} is hiring for a {role_name}. "
        f"With my hands-on background in {skills_phrase}, I'd love to connect and discuss how I can contribute to the team. Best, [Your Name]"
    )
    if len(outreach_message) >= 300:
        outreach_message = f"Hi! I recently applied for {role_name} at {company_name}. With expertise in {skills_phrase}, I'd love to connect! Best, [Your Name]"

    return {
        "cover_letter": generated_cover_letter,
        "outreach_message": outreach_message,
        "tone": active_tone,
        "skills_highlighted": target_skills[:5],
    }
