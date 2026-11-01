import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  CoverLetterRequestSchema,
  EmailExtractionRequestSchema,
  ResumeFitRequestSchema,
  ResumeImproveRequestSchema,
} from "@track/shared";
import { aiService } from "./ai.service";

const ResumeParseBodySchema = z.object({
  resume_text: z.string().min(10, "Resume text must be at least 10 characters"),
});

export const aiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All AI endpoints require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  // 1. Parse Resume
  fastify.post(
    "/resume/parse",
    {
      schema: {
        description: "Parse raw resume text into structured profile entities and detected competencies",
        tags: ["ai"],
        summary: "Parse resume profile",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = ResumeParseBodySchema.parse(request.body);
      const result = await aiService.parseResume(request.user.id, parsed.resume_text);
      return reply.send(result);
    }
  );

  // 2. Resume Fit Evaluation
  fastify.post(
    "/resume/fit",
    {
      schema: {
        description: "Analyze semantic and technical fit between a resume and job description",
        tags: ["ai"],
        summary: "Evaluate resume job fit",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const input = ResumeFitRequestSchema.parse(request.body);
      const result = await aiService.evaluateResumeFit(request.user.id, input);
      return reply.send(result);
    }
  );

  // 3. Resume Improvement (Google XYZ)
  fastify.post(
    "/resume/improve",
    {
      schema: {
        description: "Critique resume bullet points and provide quantifiable Google XYZ impact rewrites",
        tags: ["ai"],
        summary: "Improve resume with XYZ framework",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const input = ResumeImproveRequestSchema.parse(request.body);
      const result = await aiService.improveResume(request.user.id, input);
      return reply.send(result);
    }
  );

  // 4. Generate Cover Letter & Outreach
  fastify.post(
    "/generate",
    {
      schema: {
        description: "Generate tailored cover letter and recruiter outreach message for target role",
        tags: ["ai"],
        summary: "Generate cover letter and outreach",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const input = CoverLetterRequestSchema.parse(request.body);
      const result = await aiService.generateCoverLetter(request.user.id, input);
      return reply.send(result);
    }
  );

  // 5. Extract Email Event
  fastify.post(
    "/email/extract",
    {
      schema: {
        description: "Extract job lifecycle stage, company, and interview details from recruiter email",
        tags: ["ai"],
        summary: "Extract email recruitment event",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const input = EmailExtractionRequestSchema.parse(request.body);
      const result = await aiService.extractEmailEvent(request.user.id, input);
      return reply.send(result);
    }
  );

  // 6. AI Execution Telemetry History
  fastify.get(
    "/executions",
    {
      schema: {
        description: "Retrieve chronological audit log of user AI model calls, latency, and telemetry",
        tags: ["ai"],
        summary: "Get AI execution history",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const history = await aiService.getExecutionHistory(request.user.id);
      return reply.send(history);
    }
  );
};

