import { z } from "zod";
import { ATS_PROVIDERS } from "../constants.js";

export const ScrapedJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company_name: z.string(),
  company_domain: z.string().optional().nullable(),
  location: z.string().default("Remote"),
  remote_type: z.string().default("Remote"),
  department: z.string().optional().nullable(),
  url: z.string(),
  salary_range: z.string().optional().nullable(),
  salary_min: z.number().optional().nullable(),
  salary_max: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  skills: z.array(z.string()).optional(),
  description_snippet: z.string().optional().nullable(),
  source_type: z.string(),
  posted_at: z.string().optional().nullable(),
});

export type ScrapedJobDto = z.infer<typeof ScrapedJobSchema>;

export const JobSearchQuerySchema = z.object({
  query: z.string().optional().default("software"),
  q: z.string().optional(),
  location: z.string().optional().nullable(),
  source: z.string().optional(),
  live: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type JobSearchQueryInput = z.infer<typeof JobSearchQuerySchema>;

export const CompanyCareerPageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  provider: z.enum(ATS_PROVIDERS),
  domain: z.string().nullable().optional(),
  career_url: z.string().nullable().optional(),
  logo_color: z.string().default("#60a5fa"),
  is_active: z.boolean().default(true),
  sync_frequency_hours: z.number().default(24),
  last_synced_at: z.string().nullable().optional(),
  last_sync_status: z.string().default("idle"),
  last_error_message: z.string().nullable().optional(),
  total_jobs_found: z.number().int().default(0),
});

export type CompanyCareerPageDto = z.infer<typeof CompanyCareerPageSchema>;

export const CompanyCareerPageCreateSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  slug: z.string().min(1, "ATS identifier slug is required"),
  provider: z.enum(ATS_PROVIDERS).default("greenhouse"),
  domain: z.string().optional().nullable(),
  career_url: z.string().url().optional().nullable().or(z.literal("")),
  logo_color: z.string().optional().default("#60a5fa"),
  is_active: z.boolean().optional().default(true),
  sync_frequency_hours: z.number().optional().default(24),
});

export type CompanyCareerPageCreateInput = z.infer<typeof CompanyCareerPageCreateSchema>;

export const JobPostingReadSchema = z.object({
  id: z.string().uuid(),
  external_job_id: z.string().nullable().optional(),
  company_name: z.string(),
  company_domain: z.string().nullable().optional(),
  role_title: z.string(),
  job_url: z.string(),
  salary_range: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  description_snippet: z.string().nullable().optional(),
  source_type: z.string(),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  is_expired: z.boolean(),
  expired_at: z.string().nullable().optional(),
  repost_detected: z.boolean(),
  original_posting_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
});

export type JobPostingDto = z.infer<typeof JobPostingReadSchema>;

export const SavedJobSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  job_posting_id: z.string().uuid().nullable().optional(),
  title: z.string(),
  company_name: z.string(),
  location: z.string().nullable().optional(),
  salary_range: z.string().nullable().optional(),
  job_url: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
});

export type SavedJobDto = z.infer<typeof SavedJobSchema>;

