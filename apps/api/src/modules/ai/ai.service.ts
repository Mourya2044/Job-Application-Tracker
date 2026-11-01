import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { aiExecutions } from "../../db/schema/ai";
import { AIClient, computeSha256 } from "./ai.client";
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

export class AIService {
  private client: AIClient;

  constructor(client = new AIClient()) {
    this.client = client;
  }

  // ---------------------------------------------------------------------------
  // 1. Resume Fit Evaluation
  // ---------------------------------------------------------------------------
  async evaluateResumeFit(
    userId: string,
    input: ResumeFitRequestInput
  ): Promise<ResumeFitEvaluationDto> {
    const startTime = Date.now();
    const inputHash = computeSha256(`${input.resume_text}:${input.job_description}:${input.job_title}:${input.company}`);

    try {
      const { data, provider, modelName, promptId, promptVersion, promptTokens, completionTokens, isFallback } =
        await this.client.matchResumeFit(input);

      const latencyMs = Date.now() - startTime;

      await this.recordExecution({
        userId,
        capability: "resume_fit",
        provider,
        modelName,
        promptId,
        promptVersion,
        inputHash,
        latencyMs,
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        status: isFallback ? "fallback" : "success",
      });

      return data;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      await this.recordExecution({
        userId,
        capability: "resume_fit",
        provider: "unknown",
        modelName: "unknown",
        inputHash,
        latencyMs,
        status: "error",
        errorDetails: err?.message || String(err),
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Cover Letter Generation
  // ---------------------------------------------------------------------------
  async generateCoverLetter(
    userId: string,
    input: CoverLetterRequestInput
  ): Promise<CoverLetterResponseDto> {
    const startTime = Date.now();
    const inputHash = computeSha256(`${input.resume_text}:${input.job_title}:${input.company}:${input.tone}`);

    try {
      const { data, provider, modelName, promptId, promptVersion, promptTokens, completionTokens, isFallback } =
        await this.client.generateCoverLetter(input);

      const latencyMs = Date.now() - startTime;

      await this.recordExecution({
        userId,
        capability: "cover_letter",
        provider,
        modelName,
        promptId,
        promptVersion,
        inputHash,
        latencyMs,
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        status: isFallback ? "fallback" : "success",
      });

      return data;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      await this.recordExecution({
        userId,
        capability: "cover_letter",
        provider: "unknown",
        modelName: "unknown",
        inputHash,
        latencyMs,
        status: "error",
        errorDetails: err?.message || String(err),
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Email Recruitment Event Extraction
  // ---------------------------------------------------------------------------
  async extractEmailEvent(
    userId: string | null,
    input: EmailExtractionRequestInput
  ): Promise<ExtractedEmailEventDto> {
    const startTime = Date.now();
    const inputHash = computeSha256(`${input.subject}:${input.sender}:${input.body}`);

    try {
      const { data, provider, modelName, promptId, promptVersion, promptTokens, completionTokens, isFallback } =
        await this.client.extractEmailEvent(input);

      const latencyMs = Date.now() - startTime;

      await this.recordExecution({
        userId,
        capability: "email_extraction",
        provider,
        modelName,
        promptId,
        promptVersion,
        inputHash,
        latencyMs,
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        status: isFallback ? "fallback" : "success",
      });

      return data;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      await this.recordExecution({
        userId,
        capability: "email_extraction",
        provider: "unknown",
        modelName: "unknown",
        inputHash,
        latencyMs,
        status: "error",
        errorDetails: err?.message || String(err),
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Resume Parsing
  // ---------------------------------------------------------------------------
  async parseResume(
    userId: string,
    rawText: string
  ): Promise<ParsedResumeProfileDto> {
    const startTime = Date.now();
    const inputHash = computeSha256(rawText);

    try {
      const { data, provider, modelName, promptId, promptVersion, isFallback } =
        await this.client.parseResumeProfile(rawText);

      const latencyMs = Date.now() - startTime;

      await this.recordExecution({
        userId,
        capability: "resume_parse",
        provider,
        modelName,
        promptId,
        promptVersion,
        inputHash,
        latencyMs,
        status: isFallback ? "fallback" : "success",
      });

      return data;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      await this.recordExecution({
        userId,
        capability: "resume_parse",
        provider: "unknown",
        modelName: "unknown",
        inputHash,
        latencyMs,
        status: "error",
        errorDetails: err?.message || String(err),
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Resume Improvement (Google XYZ)
  // ---------------------------------------------------------------------------
  async improveResume(
    userId: string,
    input: ResumeImproveRequestInput
  ): Promise<ResumeImproveResponseDto> {
    const startTime = Date.now();
    const inputHash = computeSha256(`${input.resume_text}:${input.target_role}`);

    try {
      const { data, provider, modelName, promptId, promptVersion, isFallback } =
        await this.client.improveResume(input);

      const latencyMs = Date.now() - startTime;

      await this.recordExecution({
        userId,
        capability: "resume_improve",
        provider,
        modelName,
        promptId,
        promptVersion,
        inputHash,
        latencyMs,
        status: isFallback ? "fallback" : "success",
      });

      return data;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      await this.recordExecution({
        userId,
        capability: "resume_improve",
        provider: "unknown",
        modelName: "unknown",
        inputHash,
        latencyMs,
        status: "error",
        errorDetails: err?.message || String(err),
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Telemetry History & Observability
  // ---------------------------------------------------------------------------
  async getExecutionHistory(userId: string, limit = 50) {
    return db
      .select()
      .from(aiExecutions)
      .where(eq(aiExecutions.userId, userId))
      .orderBy(desc(aiExecutions.createdAt))
      .limit(limit);
  }

  private async recordExecution(params: {
    userId: string | null;
    capability: string;
    provider: string;
    modelName: string;
    promptId?: string;
    promptVersion?: string;
    inputHash: string;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    status: string;
    errorDetails?: string;
  }) {
    try {
      await db.insert(aiExecutions).values({
        userId: params.userId,
        capability: params.capability,
        provider: params.provider,
        modelName: params.modelName,
        promptId: params.promptId || null,
        promptVersion: params.promptVersion || null,
        inputHash: params.inputHash,
        latencyMs: params.latencyMs,
        promptTokens: params.promptTokens || null,
        completionTokens: params.completionTokens || null,
        status: params.status,
        errorDetails: params.errorDetails || null,
      });
    } catch (e) {
      // Telemetry failures must not block the core API workflow
      if (process.env.NODE_ENV !== "test") {
        console.warn("Failed to persist AI execution telemetry:", e);
      }
    }
  }
}

export const aiService = new AIService();
