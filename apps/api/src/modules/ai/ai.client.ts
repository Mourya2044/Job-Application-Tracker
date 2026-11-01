import crypto from "crypto";
import { config } from "../../config";
import type {
  CoverLetterRequestInput,
  CoverLetterResponseDto,
  EmailExtractionRequestInput,
  ExtractedEmailEventDto,
  ParsedResumeProfileDto,
  ResumeFitEvaluationDto,
  ResumeFitRequestInput,
  ResumeImproveRequestInput,
  ResumeImproveResponseDto,
} from "@track/shared";

export interface AIClientCallResult<T> {
  data: T;
  provider: string;
  modelName: string;
  promptId?: string;
  promptVersion?: string;
  isFallback: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export class AIClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl = config.aiService.url, timeoutMs = config.aiService.timeoutMs) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  private async fetchWithTimeout(endpoint: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Resume Fit Evaluation
  // ---------------------------------------------------------------------------
  async matchResumeFit(input: ResumeFitRequestInput): Promise<AIClientCallResult<ResumeFitEvaluationDto>> {
    try {
      const response = await this.fetchWithTimeout("/api/ai/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (response.ok) {
        const data = (await response.json()) as ResumeFitEvaluationDto;
        return {
          data,
          provider: "fastapi_ai",
          modelName: data.model_name || "gpt-4o-mini",
          promptId: "resume_fit_v1",
          promptVersion: data.model_version || "1.0.0",
          isFallback: false,
          promptTokens: Math.ceil((input.resume_text.length + input.job_description.length) / 4),
          completionTokens: 250,
        };
      }
    } catch {
      // Fallback
    }

    return {
      data: this.fallbackResumeFit(input),
      provider: "heuristic_fallback",
      modelName: "token_jaccard_v1",
      promptId: "resume_fit_fallback",
      promptVersion: "1.0.0",
      isFallback: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Cover Letter & Recruiter Outreach Generation
  // ---------------------------------------------------------------------------
  async generateCoverLetter(input: CoverLetterRequestInput): Promise<AIClientCallResult<CoverLetterResponseDto>> {
    try {
      const response = await this.fetchWithTimeout("/api/ai/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (response.ok) {
        const data = (await response.json()) as CoverLetterResponseDto;
        return {
          data,
          provider: "fastapi_ai",
          modelName: data.model_name || "gpt-4o-mini",
          promptId: "cover_letter_v1",
          promptVersion: "1.0.0",
          isFallback: false,
          promptTokens: Math.ceil(input.resume_text.length / 4) + 100,
          completionTokens: 350,
        };
      }
    } catch {
      // Fallback
    }

    return {
      data: this.fallbackCoverLetter(input),
      provider: "heuristic_fallback",
      modelName: "template_synthesizer_v1",
      promptId: "cover_letter_fallback",
      promptVersion: "1.0.0",
      isFallback: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Email Recruitment Event Extraction
  // ---------------------------------------------------------------------------
  async extractEmailEvent(input: EmailExtractionRequestInput): Promise<AIClientCallResult<ExtractedEmailEventDto>> {
    try {
      const response = await this.fetchWithTimeout("/api/ai/extract-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (response.ok) {
        const data = (await response.json()) as ExtractedEmailEventDto;
        return {
          data,
          provider: "fastapi_ai",
          modelName: "gliner2-multi-v1",
          promptId: "email_event_v1",
          promptVersion: "1.0.0",
          isFallback: false,
          promptTokens: Math.ceil((input.subject.length + input.body.length) / 4),
          completionTokens: 80,
        };
      }
    } catch {
      // Fallback
    }

    return {
      data: this.fallbackEmailExtraction(input),
      provider: "heuristic_fallback",
      modelName: "regex_v1",
      promptId: "email_event_fallback",
      promptVersion: "1.0.0",
      isFallback: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Resume Parsing (Text / Heuristics)
  // ---------------------------------------------------------------------------
  async parseResumeProfile(rawText: string): Promise<AIClientCallResult<ParsedResumeProfileDto>> {
    const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    const nonBlankLines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let candidateName: string | null = null;
    if (nonBlankLines.length > 0 && nonBlankLines[0].split(/\s+/).length <= 4) {
      candidateName = nonBlankLines[0].replace(/[^\w\s.-]/g, "");
    }

    const techKeywords = [
      "typescript", "javascript", "python", "go", "golang", "java", "c++", "rust",
      "react", "next.js", "vue", "angular", "node.js", "fastify", "express", "django", "fastapi",
      "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
      "docker", "kubernetes", "k8s", "aws", "gcp", "azure", "terraform", "ci/cd",
      "graphql", "rest", "grpc", "microservices", "kafka", "rabbitmq"
    ];

    const lower = rawText.toLowerCase();
    const detectedSkills = techKeywords.filter((k) => {
      const escaped = k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
    });

    const summaryLine = nonBlankLines.find(
      (l) => l.length > 40 && !l.includes("@") && !l.includes("http")
    ) || null;

    const data: ParsedResumeProfileDto = {
      candidate_name: candidateName,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0] : null,
      summary: summaryLine,
      skills: detectedSkills,
      raw_text: rawText,
    };

    return {
      data,
      provider: "heuristic_fallback",
      modelName: "profile_parser_v1",
      promptId: "resume_parse_v1",
      promptVersion: "1.0.0",
      isFallback: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Resume Improvement (Google XYZ Framework)
  // ---------------------------------------------------------------------------
  async improveResume(input: ResumeImproveRequestInput): Promise<AIClientCallResult<ResumeImproveResponseDto>> {
    const rawLines = input.resume_text
      .split("\n")
      .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
      .filter((l) => l.length > 15);

    const weaknesses: string[] = [];
    const strengths: string[] = [];
    const improvements: { original: string; improved: string; reason: string }[] = [];

    const passiveStarts = [
      /^responsible for\b/i,
      /^worked on\b/i,
      /^helped with\b/i,
      /^assisted in\b/i,
      /^participated in\b/i,
      /^involved in\b/i,
      /^handled\b/i,
    ];

    for (const line of rawLines) {
      const isPassive = passiveStarts.some((p) => p.test(line));
      const hasMetric = /\b\d+(?:%|x|\+|(?:k|m|ms|s)\b)/i.test(line);

      if (isPassive || !hasMetric) {
        if (improvements.length < 5) {
          const actionVerb = isPassive ? "Architected and delivered" : "Spearheaded";
          const cleaned = line.replace(/^(responsible for|worked on|helped with|assisted in|participated in|involved in|handled)\s+/i, "");
          const improved = `${actionVerb} ${cleaned}, optimizing pipeline throughput by 35% and accelerating release cycles across the engineering team.`;

          improvements.push({
            original: line,
            improved,
            reason: isPassive
              ? "Replaced passive phrasing with decisive action verb and quantified business impact (Google XYZ framework: Accomplished [X] as measured by [Y] by doing [Z])."
              : "Anchored accomplishment with clear metric and measurable team impact (Google XYZ framework: Accomplished [X] as measured by [Y] by doing [Z]).",
          });
        }
      } else {
        if (strengths.length < 3) {
          strengths.push(line);
        }
      }
    }

    if (improvements.length > 0) {
      weaknesses.push("Multiple bullet points lack quantifiable business metrics (e.g., percentages, latencies, cost savings).");
    }
    if (passiveStarts.some((p) => p.test(input.resume_text))) {
      weaknesses.push("Contains passive duties ('responsible for') instead of proactive outcome-oriented leadership verbs.");
    }
    if (strengths.length === 0) {
      strengths.push("Clear industry alignment and technical focus across core systems.");
    }

    const overallScore = Math.max(45, Math.min(95, 85 - improvements.length * 8));

    const data: ResumeImproveResponseDto = {
      overall_score: overallScore,
      strengths,
      weaknesses: weaknesses.length > 0 ? weaknesses : ["No critical structural weaknesses found."],
      xyz_bullet_improvements: improvements,
      action_items: [
        "Quantify every project with specific scale (requests/sec, database size, latency reduction).",
        "Adopt Google XYZ format across all experience bullets: 'Accomplished [X] as measured by [Y], by doing [Z]'.",
        "Front-load bullet points with technical keywords relevant to the target role.",
      ],
      model_name: "xyz_critique_v1",
    };

    return {
      data,
      provider: "heuristic_fallback",
      modelName: "xyz_critique_v1",
      promptId: "resume_improve_v1",
      promptVersion: "1.0.0",
      isFallback: true,
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Heuristic Fallback Implementations
  // ---------------------------------------------------------------------------
  private fallbackResumeFit(input: ResumeFitRequestInput): ResumeFitEvaluationDto {
    const resumeWords = new Set(input.resume_text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
    const jdWords = input.job_description.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

    let matched = 0;
    const jdUnique = new Set(jdWords);
    for (const word of jdUnique) {
      if (resumeWords.has(word)) matched++;
    }

    const matchRatio = jdUnique.size > 0 ? matched / jdUnique.size : 0.5;
    const score = Math.min(98, Math.max(52, Math.round(50 + matchRatio * 50)));

    const role = input.job_title || "Target Role";
    const comp = input.company || "Target Company";

    return {
      match_score: score,
      summary: `Foundational alignment detected for ${role} at ${comp}. Core engineering skills match key requirements.`,
      strengths: ["Core Systems Competency", "Domain Relevance", "Direct Skill Overlap"],
      missing_skills: [
        {
          category: "Domain Specifics",
          missing_skills: ["Production Scale Architecture", "Specialized Tooling"],
          importance: "preferred",
        },
      ],
      xyz_bullet_recommendations: [
        `Engineered high-concurrency microservices for ${role}, improving platform response latency by 25%.`,
        `Led infrastructure modernization initiative, cutting deployment cycle times from days to hours.`,
      ],
      confidence_score: 0.75,
      model_name: "heuristic_fallback",
      model_version: "1.0.0",
    };
  }

  private fallbackCoverLetter(input: CoverLetterRequestInput): CoverLetterResponseDto {
    const comp = input.company;
    const role = input.job_title;

    const letter = `Dear Hiring Team at ${comp},

I am writing to express my strong enthusiasm for the ${role} position. With my background in building resilient, high-performance software systems and collaborating across agile engineering teams, I am confident in my ability to deliver immediate value to your technical roadmap.

In reviewing the requirements for the ${role} role, my hands-on expertise in backend architectures, reliable API design, and distributed systems directly aligns with the challenges your team tackles at ${comp}. I pride myself on writing clean, thoroughly tested, and maintainable code that scales smoothly.

Thank you for your time and consideration. I welcome the opportunity to discuss how my skill set and experience can support ${comp}'s mission.

Sincerely,
Candidate`;

    const outreach = `Hi there! I recently applied for the ${role} role at ${comp}. Given my background in scalable software systems, I'd love to connect and briefly discuss how I can contribute to your engineering goals!`;

    return {
      cover_letter: letter,
      recruiter_outreach: outreach,
      tone_applied: input.tone,
      model_name: "heuristic_fallback",
    };
  }

  private fallbackEmailExtraction(input: EmailExtractionRequestInput): ExtractedEmailEventDto {
    const combined = `${input.subject} ${input.sender} ${input.body}`.toLowerCase();

    // Stage & Category
    let stage = "other";
    let category = "other_unrelated";

    if (/interview|phone screen|meet the team|technical screen/i.test(combined)) {
      stage = "interviewing";
      category = "interview_invite";
    } else if (/assessment|hackerrank|codesignal|testgorilla/i.test(combined)) {
      stage = "screening";
      category = "assessment_invite";
    } else if (/offer|pleased to offer|offer letter/i.test(combined)) {
      stage = "offer";
      category = "offer_received";
    } else if (/unfortunately|not moving forward|other candidates|pursuing other/i.test(combined)) {
      stage = "rejected";
      category = "rejection";
    } else if (/thank you for applying|application received|status of your application/i.test(combined)) {
      stage = "applied";
      category = "application_confirmation";
    }

    // Meeting link
    const linkMatch = input.body.match(/https?:\/\/(?:www\.)?(?:calendly|zoom|meet\.google|teams\.microsoft)[^\s>]+/i);
    const meetingLink = linkMatch ? linkMatch[0] : null;

    // Company extraction
    let company: string | null = null;
    const cleanSubj = input.subject.split(/[:\-|–—]/)[0].trim();
    // Split on prepositions like 'for', 'regarding', 'as', 'about' to isolate the company entity
    const prepSplit = cleanSubj.split(/\s+(?:for|regarding|as|about|at\s+the)\s+/i)[0].trim();
    const subjMatch = prepSplit.match(/\b(?:at|for|with|from)\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,2})\b/i);
    if (subjMatch) {
      const cand = subjMatch[1].trim();
      if (!/^(software|engineer|role|position|the|an|a|your application)$/i.test(cand)) {
        company = cand;
      }
    }

    let companyDomain: string | null = null;
    if (input.sender && input.sender.includes("@")) {
      const domain = input.sender.split("@").pop()?.toLowerCase() || null;
      if (domain && !["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com"].includes(domain)) {
        companyDomain = domain;
        if (!company) {
          company = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
        }
      }
    }

    return {
      is_job_related: category !== "other_unrelated",
      event_category: category,
      target_lifecycle_stage: stage,
      company_name: company || "Company",
      company_domain: companyDomain,
      role_title: "Software Engineer",
      meeting_link: meetingLink,
      action_deadline: null,
      interview_date_time: null,
      confidence_score: 0.75,
      evidence_snippet: input.body.slice(0, 200),
    };
  }
}
