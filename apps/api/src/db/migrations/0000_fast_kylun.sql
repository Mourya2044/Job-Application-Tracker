CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"password_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "company_career_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"provider" varchar(50) DEFAULT 'greenhouse' NOT NULL,
	"domain" varchar(255),
	"career_url" text,
	"logo_color" varchar(50) DEFAULT '#60a5fa',
	"is_active" boolean DEFAULT true NOT NULL,
	"sync_frequency_hours" integer DEFAULT 24 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" varchar(50) DEFAULT 'idle' NOT NULL,
	"last_error_message" text,
	"total_jobs_found" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_career_pages_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "job_posting_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salary_range" varchar(255),
	"location" varchar(255),
	"is_active_during_scrape" boolean NOT NULL,
	"change_type" varchar(50) DEFAULT 'heartbeat' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_job_id" varchar(255),
	"source_type" varchar(100) NOT NULL,
	"company_career_page_id" uuid,
	"company_name" varchar(255) NOT NULL,
	"company_domain" varchar(255),
	"role_title" varchar(255) NOT NULL,
	"location" varchar(255),
	"salary_range" varchar(255),
	"job_url" text NOT NULL,
	"department" varchar(255),
	"description_snippet" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_expired" boolean DEFAULT false NOT NULL,
	"expired_at" timestamp with time zone,
	"repost_detected" boolean DEFAULT false NOT NULL,
	"original_posting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_posting_id" uuid,
	"title" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"location" varchar(255),
	"salary_range" varchar(255),
	"job_url" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage" varchar(50),
	"to_stage" varchar(50) NOT NULL,
	"trigger_source" varchar(50) NOT NULL,
	"confidence_score" double precision,
	"change_summary" text NOT NULL,
	"user_note" text,
	"email_message_id" varchar(255),
	"email_subject" text,
	"decision_metadata" jsonb,
	"model_version" varchar(100),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_posting_id" uuid,
	"company_name" varchar(255) NOT NULL,
	"company_domain" varchar(255),
	"role_title" varchar(255) NOT NULL,
	"job_url" text,
	"location" varchar(255),
	"salary_range" varchar(255),
	"current_stage" varchar(50) DEFAULT 'applied' NOT NULL,
	"stage_locked" boolean DEFAULT false NOT NULL,
	"applied_date" timestamp with time zone DEFAULT now(),
	"next_step" varchar(255),
	"next_step_deadline" timestamp with time zone,
	"interview_link" text,
	"manual_notes" text,
	"pending_suggestion" jsonb,
	"tags" text[],
	"last_status_change_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status_change_source" varchar(50) DEFAULT 'initial_ingest' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"thread_id" varchar(255),
	"sender" varchar(255),
	"subject" text,
	"snippet" text,
	"received_at" timestamp with time zone,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detected_company" varchar(255),
	"detected_stage" varchar(50),
	"matched_application_id" uuid,
	"match_status" varchar(50) DEFAULT 'unmatched' NOT NULL,
	"raw_classification" jsonb,
	"processing_status" varchar(50) DEFAULT 'processed' NOT NULL,
	"processing_attempts" integer DEFAULT 1 NOT NULL,
	"error_details" text,
	"correlation_id" varchar(100),
	CONSTRAINT "uq_user_message_id" UNIQUE("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "user_mailbox_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'google' NOT NULL,
	"email_address" varchar(255) NOT NULL,
	"refresh_token_encrypted" text,
	"access_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"last_history_id" varchar(255),
	"watch_expiration" timestamp with time zone,
	"pubsub_topic" varchar(255),
	"is_sync_enabled" boolean DEFAULT false NOT NULL,
	"auto_create_applications" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_mailbox" UNIQUE("user_id","email_address")
);
--> statement-breakpoint
CREATE TABLE "ai_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"capability" varchar(50) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"prompt_id" varchar(100),
	"prompt_version" varchar(50),
	"input_hash" varchar(64) NOT NULL,
	"latency_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost_usd" varchar(50),
	"status" varchar(50) NOT NULL,
	"error_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_observations" ADD CONSTRAINT "job_posting_observations_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_company_career_page_id_company_career_pages_id_fk" FOREIGN KEY ("company_career_page_id") REFERENCES "public"."company_career_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_events" ADD CONSTRAINT "application_status_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_matched_application_id_applications_id_fk" FOREIGN KEY ("matched_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mailbox_accounts" ADD CONSTRAINT "user_mailbox_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_career_pages_active" ON "company_career_pages" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_career_pages_provider" ON "company_career_pages" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_job_obs_posting_date" ON "job_posting_observations" USING btree ("job_posting_id","observed_at");--> statement-breakpoint
CREATE INDEX "idx_job_postings_comp" ON "job_postings" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "idx_job_postings_expired" ON "job_postings" USING btree ("is_expired");--> statement-breakpoint
CREATE INDEX "idx_saved_jobs_user" ON "saved_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_events_app_date" ON "application_status_events" USING btree ("application_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_apps_user_stage" ON "applications" USING btree ("user_id","current_stage");--> statement-breakpoint
CREATE INDEX "idx_apps_user_comp" ON "applications" USING btree ("user_id","company_name");--> statement-breakpoint
CREATE INDEX "idx_email_logs_status" ON "email_logs" USING btree ("user_id","match_status");--> statement-breakpoint
CREATE INDEX "idx_ai_exec_created" ON "ai_executions" USING btree ("created_at");