import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server";
import { aiService } from "../src/modules/ai/ai.service";

describe("Phase D: AI Integration & Telemetry Tests", () => {
  let app: FastifyInstance;
  const testUserId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  let authToken: string;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
    authToken = app.jwt.sign({ id: testUserId, email: "ai-tester@track.test" });
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Authentication boundary
  it("rejects unauthenticated requests to AI endpoints with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/resume/fit",
      payload: {
        resume_text: "Experienced engineer with Node.js and TypeScript background.",
        job_description: "Looking for a Senior TypeScript Backend Developer with PostgreSQL.",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // 2. Input validation
  it("validates request inputs and rejects underspecified payloads with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/resume/fit",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resume_text: "Too short",
        job_description: "Too short",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // 3. Resume Parsing
  it("parses candidate resume text into structured contact and competency entities", async () => {
    const resumeText = `Jane Doe
Senior Fullstack Engineer
Email: jane.doe@example.com | Phone: (555) 234-5678
San Francisco, CA

Professional Summary:
Passionate software architect with 7+ years developing distributed backend services, high-throughput APIs, and scalable web apps.

Core Competencies:
TypeScript, React, Python, PostgreSQL, Docker, Kubernetes, AWS, GraphQL.
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/ai/resume/parse",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { resume_text: resumeText },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidate_name).toBe("Jane Doe");
    expect(body.email).toBe("jane.doe@example.com");
    expect(body.phone).toBe("(555) 234-5678");
    expect(body.skills).toContain("typescript");
    expect(body.skills).toContain("react");
    expect(body.skills).toContain("postgresql");
    expect(body.skills).toContain("docker");
  });

  // 4. Resume Fit Evaluation
  it("evaluates resume against job description returning score, strengths, and recommendations", async () => {
    const resumeText = `Experienced backend engineer specializing in TypeScript, Node.js, Fastify, PostgreSQL, and Docker. Built event-driven architectures with Kafka.`;
    const jobDescription = `Seeking a Senior Backend Engineer proficient in TypeScript, PostgreSQL, and microservices architecture to lead our core data infrastructure.`;

    const res = await app.inject({
      method: "POST",
      url: "/api/ai/resume/fit",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resume_text: resumeText,
        job_description: jobDescription,
        job_title: "Senior Backend Engineer",
        company: "Stripe",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.match_score).toBeGreaterThan(50);
    expect(body.summary).toContain("Stripe");
    expect(body.strengths.length).toBeGreaterThan(0);
    expect(body.missing_skills.length).toBeGreaterThan(0);
    expect(body.xyz_bullet_recommendations.length).toBeGreaterThan(0);
  });

  // 5. Resume Improvement (Google XYZ)
  it("transforms weak passive resume bullets into quantifiable Google XYZ impact achievements", async () => {
    const resumeText = `
Responsible for managing the database backups and maintenance.
Worked on the company web application and improved API performance.
Helped with customer onboarding processes and created documentation.
`;

    const res = await app.inject({
      method: "POST",
      url: "/api/ai/resume/improve",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resume_text: resumeText,
        target_role: "Staff Infrastructure Engineer",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.overall_score).toBeGreaterThanOrEqual(45);
    expect(body.weaknesses.length).toBeGreaterThan(0);
    expect(body.xyz_bullet_improvements.length).toBeGreaterThan(0);
    expect(body.action_items.length).toBeGreaterThan(0);

    const firstImprovement = body.xyz_bullet_improvements[0];
    expect(firstImprovement.improved).toMatch(/optimizing|accelerating|throughput/i);
    expect(firstImprovement.reason).toContain("Google XYZ");
  });

  // 6. Cover Letter & Recruiter Outreach Generation
  it("generates tailored cover letter and outreach messages with requested tone", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/generate",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resume_text: "Senior software engineer with 6 years leading React, TypeScript, and cloud-native systems.",
        job_title: "Senior Frontend Engineer",
        company: "Linear",
        tone: "Professional",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cover_letter).toContain("Linear");
    expect(body.cover_letter).toContain("Senior Frontend Engineer");
    expect(body.recruiter_outreach).toContain("Linear");
    expect(body.tone_applied).toBe("Professional");
  });

  // 7. Email Event Extraction
  it("extracts interview invitation, company, and meeting link from recruiter email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/email/extract",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        subject: "Interview Invitation from Figma for Staff Engineer",
        sender: "recruiting@figma.com",
        body: "Hi Jane, we were impressed with your background and would love to invite you for a 45-minute technical screen. Please join using Google Meet: https://meet.google.com/xyz-uvwx-rst",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.is_job_related).toBe(true);
    expect(body.target_lifecycle_stage).toBe("interviewing");
    expect(body.company_name).toBe("Figma");
    expect(body.meeting_link).toContain("https://meet.google.com/xyz-uvwx-rst");
  });

  // 8. AI Telemetry History
  it("persists execution telemetry in the database and provides audit history", async () => {
    vi.spyOn(aiService, "getExecutionHistory").mockResolvedValueOnce([
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: testUserId,
        capability: "resume_parse",
        provider: "heuristic_fallback",
        modelName: "profile_parser_v1",
        promptId: "resume_parse_v1",
        promptVersion: "1.0.0",
        inputHash: "a".repeat(64),
        latencyMs: 12,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: null,
        status: "fallback",
        errorDetails: null,
        createdAt: new Date(),
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        userId: testUserId,
        capability: "resume_fit",
        provider: "heuristic_fallback",
        modelName: "token_jaccard_v1",
        promptId: "resume_fit_fallback",
        promptVersion: "1.0.0",
        inputHash: "b".repeat(64),
        latencyMs: 25,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: null,
        status: "fallback",
        errorDetails: null,
        createdAt: new Date(),
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/ai/executions",
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].capability).toBe("resume_parse");
    expect(body[1].capability).toBe("resume_fit");
  });
});
