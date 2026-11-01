import { z } from "zod";
import { LIFECYCLE_STAGES, TRIGGER_SOURCES } from "../constants.js";

export const ApplicationCreateSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  company_domain: z.string().optional().nullable(),
  role_title: z.string().min(1, "Role title is required"),
  job_url: z.string().url().optional().nullable().or(z.literal("")),
  location: z.string().optional().nullable(),
  salary_range: z.string().optional().nullable(),
  current_stage: z.enum(LIFECYCLE_STAGES).default("applied"),
  applied_date: z.string().datetime().optional().nullable(),
  next_step: z.string().optional().nullable(),
  next_step_deadline: z.string().datetime().optional().nullable(),
  interview_link: z.string().url().optional().nullable().or(z.literal("")),
  manual_notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export type ApplicationCreateInput = z.infer<typeof ApplicationCreateSchema>;

export const ApplicationUpdateSchema = ApplicationCreateSchema.partial().extend({
  stage_locked: z.boolean().optional(),
});

export type ApplicationUpdateInput = z.infer<typeof ApplicationUpdateSchema>;

export const ApplicationStageUpdateSchema = z.object({
  to_stage: z.enum(LIFECYCLE_STAGES),
  user_note: z.string().optional().nullable(),
  next_step: z.string().optional().nullable(),
  next_step_deadline: z.string().datetime().optional().nullable(),
  interview_link: z.string().url().optional().nullable().or(z.literal("")),
});

export type ApplicationStageUpdateInput = z.infer<typeof ApplicationStageUpdateSchema>;

export const ApplicationStatusEventSchema = z.object({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  from_stage: z.string().nullable(),
  to_stage: z.string(),
  trigger_source: z.enum(TRIGGER_SOURCES),
  confidence_score: z.number().nullable(),
  change_summary: z.string(),
  user_note: z.string().nullable(),
  email_message_id: z.string().nullable(),
  email_subject: z.string().nullable(),
  decision_metadata: z.record(z.any()).nullable(),
  model_version: z.string().nullable(),
  changed_at: z.string(),
});

export type ApplicationStatusEventDto = z.infer<typeof ApplicationStatusEventSchema>;

export const ApplicationReadSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  job_posting_id: z.string().uuid().nullable().optional(),
  company_name: z.string(),
  company_domain: z.string().nullable().optional(),
  role_title: z.string(),
  job_url: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  salary_range: z.string().nullable().optional(),
  current_stage: z.enum(LIFECYCLE_STAGES),
  stage_locked: z.boolean(),
  applied_date: z.string().nullable().optional(),
  next_step: z.string().nullable().optional(),
  next_step_deadline: z.string().nullable().optional(),
  interview_link: z.string().nullable().optional(),
  manual_notes: z.string().nullable().optional(),
  pending_suggestion: z.record(z.any()).nullable().optional(),
  tags: z.array(z.string()).default([]),
  last_status_change_at: z.string(),
  last_status_change_source: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  status_events: z.array(ApplicationStatusEventSchema).default([]),
});

export type ApplicationDto = z.infer<typeof ApplicationReadSchema>;

export const KanbanColumnSchema = z.object({
  stage: z.enum(LIFECYCLE_STAGES),
  title: z.string(),
  count: z.number().int(),
  applications: z.array(ApplicationReadSchema),
});

export type KanbanColumnDto = z.infer<typeof KanbanColumnSchema>;

export const KanbanBoardSchema = z.object({
  total_applications: z.number().int(),
  columns: z.array(KanbanColumnSchema),
});

export type KanbanBoardDto = z.infer<typeof KanbanBoardSchema>;

