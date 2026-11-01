import { z } from "zod";

export const SkillGapSchema = z.object({
  category: z.string(),
  missing_skills: z.array(z.string()),
  importance: z.enum(["required", "preferred", "nice_to_have"]).default("preferred"),
});

export type SkillGapDto = z.infer<typeof SkillGapSchema>;

export const ResumeFitEvaluationSchema = z.object({
  match_score: z.number().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  missing_skills: z.array(SkillGapSchema),
  xyz_bullet_recommendations: z.array(z.string()),
  confidence_score: z.number().min(0).max(1),
  model_name: z.string().optional(),
  model_version: z.string().optional(),
});

export type ResumeFitEvaluationDto = z.infer<typeof ResumeFitEvaluationSchema>;

export const ResumeFitRequestSchema = z.object({
  resume_text: z.string().min(20, "Resume text must be at least 20 characters"),
  job_description: z.string().min(20, "Job description must be at least 20 characters"),
  job_title: z.string().optional().default(""),
  company: z.string().optional().default(""),
});

export type ResumeFitRequestInput = z.infer<typeof ResumeFitRequestSchema>;

export const CoverLetterRequestSchema = z.object({
  resume_text: z.string().min(20, "Resume text is required"),
  job_title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company is required"),
  job_description: z.string().optional().default(""),
  tone: z.enum(["Professional", "Enthusiastic", "Technical", "Direct"]).default("Professional"),
});

export type CoverLetterRequestInput = z.infer<typeof CoverLetterRequestSchema>;

export const CoverLetterResponseSchema = z.object({
  cover_letter: z.string(),
  recruiter_outreach: z.string(),
  tone_applied: z.string(),
  model_name: z.string().optional(),
});

export type CoverLetterResponseDto = z.infer<typeof CoverLetterResponseSchema>;

export const ExtractedEmailEventSchema = z.object({
  is_job_related: z.boolean(),
  event_category: z.string(),
  target_lifecycle_stage: z.string(),
  company_name: z.string().nullable().optional(),
  company_domain: z.string().nullable().optional(),
  role_title: z.string().nullable().optional(),
  meeting_link: z.string().nullable().optional(),
  action_deadline: z.string().nullable().optional(),
  interview_date_time: z.string().nullable().optional(),
  confidence_score: z.number().min(0).max(1),
  evidence_snippet: z.string().nullable().optional(),
});

export type ExtractedEmailEventDto = z.infer<typeof ExtractedEmailEventSchema>;

export const EmailExtractionRequestSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  sender: z.string().optional().default(""),
});

export type EmailExtractionRequestInput = z.infer<typeof EmailExtractionRequestSchema>;

export const ParsedResumeProfileSchema = z.object({
  candidate_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  skills: z.array(z.string()).default([]),
  raw_text: z.string(),
});

export type ParsedResumeProfileDto = z.infer<typeof ParsedResumeProfileSchema>;

export const ResumeImproveRequestSchema = z.object({
  resume_text: z.string().min(20, "Resume text must be at least 20 characters"),
  target_role: z.string().optional().default(""),
});

export type ResumeImproveRequestInput = z.infer<typeof ResumeImproveRequestSchema>;

export const BulletImprovementSchema = z.object({
  original: z.string(),
  improved: z.string(),
  reason: z.string(),
});

export type BulletImprovementDto = z.infer<typeof BulletImprovementSchema>;

export const ResumeImproveResponseSchema = z.object({
  overall_score: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  xyz_bullet_improvements: z.array(BulletImprovementSchema),
  action_items: z.array(z.string()),
  model_name: z.string().optional(),
});

export type ResumeImproveResponseDto = z.infer<typeof ResumeImproveResponseSchema>;


