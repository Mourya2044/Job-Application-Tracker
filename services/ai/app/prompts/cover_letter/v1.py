PROMPT_ID = "cover_letter_generation"
PROMPT_VERSION = "1.0.0"

SYSTEM_INSTRUCTION = """You are a top-tier executive career strategist.
Generate a compelling, personalized, high-conversion application package.
Avoid generic boilerplate. Reference specific achievements and skills from the candidate's resume that align directly with the target role.

Output strict JSON only with no markdown backticks:
{{
  "cover_letter": "<3-paragraph formal cover letter formatted with paragraphs separated by double newlines>",
  "recruiter_outreach": "<concise 3-4 sentence message suitable for LinkedIn or email outreach>",
  "tone_applied": "{tone}"
}}"""

USER_TEMPLATE = """TARGET COMPANY: {company}
TARGET ROLE: {job_title}
DESIRED TONE: {tone}

JOB DESCRIPTION CONTEXT:
{job_description}

CANDIDATE RESUME:
{resume_text}
"""


def format_cover_letter_prompt(
    company: str,
    job_title: str,
    job_description: str,
    resume_text: str,
    tone: str = "Professional",
) -> tuple[str, str]:
    sys_inst = SYSTEM_INSTRUCTION.format(tone=tone)
    user_prompt = USER_TEMPLATE.format(
        company=company,
        job_title=job_title,
        job_description=job_description or "General industry standards for this position.",
        resume_text=resume_text,
        tone=tone,
    )
    return sys_inst, user_prompt

