import io
import os
import re
import logging
from typing import BinaryIO, Dict, List, Optional, Tuple, Union

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

# Model identifiers hosted on Hugging Face Hub / HF Spaces
GLINER_MODEL_ID = os.getenv("GLINER_MODEL_ID", "fastino/gliner2-multi-v1")
SIMILARITY_MODEL_ID = os.getenv("SIMILARITY_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")
GEN_MODEL_ID = os.getenv("AI_ADVISOR_MODEL", "HuggingFaceTB/SmolLM2-135M-Instruct")

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
    """Lazily load MiniLM transformer model for semantic embeddings."""
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
}


def _normalize_skill(skill: str) -> str:
    cleaned = skill.strip().strip(",.;:()[]{}'\"")
    lower = cleaned.lower()
    if lower in SYNONYM_MAP:
        return SYNONYM_MAP[lower]
    return cleaned.title() if not cleaned.isupper() and len(cleaned) <= 4 else cleaned


def extract_skills_from_text(text: str) -> List[str]:
    """
    Extracts technical skills and qualifications using GLiNER2 zero-shot information extraction.
    Falls back gracefully if the neural model is not yet cached.
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

    # Secondary pattern heuristic to ensure full coverage of common tech tokens
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


@spaces.GPU(duration=60)
def analyze_resume_fit(
    resume_text: str = "",
    job_description: str = "",
    job_title: str = "",
    company: str = "",
    resume_pdf: Optional[Union[bytes, str]] = None,
) -> Dict:
    """
    Computes a comprehensive match analysis between candidate resume (text or PDF)
    and job requirements using Hugging Face AI models (GLiNER2 + all-MiniLM-L6-v2 embeddings).
    """
    if resume_pdf is not None and not resume_text:
        resume_text = extract_text_from_pdf(resume_pdf)

    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_description)

    if not job_skills and job_title:
        title_skills = extract_skills_from_text(job_title)
        if title_skills:
            job_skills.extend(title_skills)

    # 1. Compute Document-level Semantic Similarity
    emb_resume = compute_semantic_embedding(resume_text)
    emb_job = compute_semantic_embedding(job_description)
    doc_similarity = calculate_semantic_similarity(emb_resume, emb_job)

    # 2. Compute Requirement-level Alignment via Dense Similarity
    matching = []
    missing = []

    candidate_skill_embs = {}
    for cs in resume_skills:
        c_emb = compute_semantic_embedding(cs)
        if c_emb is not None:
            candidate_skill_embs[cs] = c_emb

    for req in job_skills:
        # Check direct lexical match first
        if any(req.lower() == cs.lower() for cs in resume_skills):
            matching.append(req)
            continue

        # Check semantic embedding match
        req_emb = compute_semantic_embedding(req)
        matched = False
        if req_emb is not None and candidate_skill_embs:
            for cs, c_emb in candidate_skill_embs.items():
                sim = calculate_semantic_similarity(req_emb, c_emb)
                if sim >= 0.65:
                    matched = True
                    break

        if matched:
            matching.append(req)
        else:
            missing.append(req)

    # Extra strengths candidate has that aren't explicit job requirements
    job_skill_lower = {s.lower() for s in job_skills}
    extra_strengths = [s for s in resume_skills if s.lower() not in job_skill_lower][:6]

    # 3. Dynamic AI Match Score Calculation
    if job_skills:
        coverage_ratio = len(matching) / len(job_skills)
        sim_factor = max(0.0, doc_similarity)
        # Weighted blend of semantic alignment (35%) and requirement coverage (65%)
        raw_score = (0.35 * sim_factor + 0.65 * coverage_ratio) * 65 + 32
        score = int(min(98, max(38, round(raw_score))))
    else:
        # Grounded in document embedding similarity
        sim_factor = max(0.0, doc_similarity)
        score = int(min(95, max(45, round(sim_factor * 85 + 15))))

    # Determine fit level
    if score >= 80:
        fit_level = "Strong Match"
    elif score >= 60:
        fit_level = "Moderate Match"
    else:
        fit_level = "Growth Opportunity"

    # 4. Generate AI Strategic Preparation Recommendations
    recommendations = []
    role_label = job_title or "this role"
    company_label = f" at {company}" if company else ""

    if missing:
        top_missing = ", ".join(missing[:4])
        recommendations.append(
            f"Address requirements in {top_missing} by highlighting related architectures, projects, or self-directed learning."
        )
    if matching:
        top_matching = ", ".join(matching[:4])
        recommendations.append(
            f"Lead with verified proficiencies in {top_matching} during behavioral and technical interview stages."
        )
    if extra_strengths:
        top_extra = ", ".join(extra_strengths[:3])
        recommendations.append(
            f"Position your additional background in {top_extra} as a key differentiator for {role_label}."
        )
    if not recommendations:
        recommendations.append(
            f"Tailor your experience bullet points to mirror the key verbs and outcomes in the {role_label} posting."
        )

    summary = (
        f"AI analysis evaluated a {fit_level} ({score}%) for {role_label}{company_label}. "
        f"Detected {len(matching)} key matching qualifications and {len(missing)} requirement gaps."
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

    # Construct prompt messages for instruction model
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

    # Generate or format concise LinkedIn / Recruiter outreach message (< 300 chars)
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
