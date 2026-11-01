import { z } from "zod";
import { MATCH_STATUSES, EMAIL_PROCESSING_STATUSES } from "../constants.js";

export const MailboxStatusSchema = z.object({
  id: z.string().uuid().nullable(),
  user_email: z.string().email().nullable(),
  provider: z.string().default("google"),
  consent_given: z.boolean(),
  is_sync_enabled: z.boolean(),
  auto_create_applications: z.boolean(),
  scopes_granted: z.string().nullable().optional(),
  last_synced_at: z.string().nullable().optional(),
  last_history_id: z.string().nullable().optional(),
  watch_expiration: z.string().nullable().optional(),
  watch_active: z.boolean(),
  pubsub_topic: z.string().nullable().optional(),
  has_token: z.boolean(),
  stats: z.object({
    total_processed_emails: z.number().int(),
    total_matched_updates: z.number().int(),
    pending_discoveries_count: z.number().int(),
  }),
});

export type MailboxStatusDto = z.infer<typeof MailboxStatusSchema>;

export const EmailLogSchema = z.object({
  id: z.string().uuid(),
  message_id: z.string(),
  thread_id: z.string().nullable().optional(),
  sender: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  received_at: z.string().nullable().optional(),
  processed_at: z.string(),
  detected_company: z.string().nullable().optional(),
  detected_stage: z.string().nullable().optional(),
  matched_application_id: z.string().uuid().nullable().optional(),
  match_status: z.enum(MATCH_STATUSES),
  raw_classification: z.record(z.any()).nullable().optional(),
  processing_status: z.enum(EMAIL_PROCESSING_STATUSES),
  processing_attempts: z.number().int(),
  error_details: z.string().nullable().optional(),
  correlation_id: z.string().nullable().optional(),
});

export type EmailLogDto = z.infer<typeof EmailLogSchema>;

export const SimulateEmailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  sender: z.string().default("recruiter@company.com"),
});

export type SimulateEmailInput = z.infer<typeof SimulateEmailSchema>;

export const PendingDiscoverySchema = z.object({
  id: z.string().uuid(),
  log_id: z.string().uuid(),
  message_id: z.string(),
  sender: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  received_at: z.string().nullable().optional(),
  company_name: z.string(),
  company_domain: z.string().nullable().optional(),
  role_title: z.string().default("Software Engineer"),
  suggested_stage: z.string().default("applied"),
  summary_sentence: z.string().nullable().optional(),
  action_deadline: z.string().nullable().optional(),
  interview_date_time: z.string().nullable().optional(),
  meeting_link: z.string().nullable().optional(),
  confidence: z.number().default(0.9),
});

export type PendingDiscoveryDto = z.infer<typeof PendingDiscoverySchema>;

