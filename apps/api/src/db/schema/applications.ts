import { pgTable, uuid, varchar, boolean, timestamp, text, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { jobPostings } from "./jobs";

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, { onDelete: "set null" }),

    companyName: varchar("company_name", { length: 255 }).notNull(),
    companyDomain: varchar("company_domain", { length: 255 }),
    roleTitle: varchar("role_title", { length: 255 }).notNull(),
    jobUrl: text("job_url"),
    location: varchar("location", { length: 255 }),
    salaryRange: varchar("salary_range", { length: 255 }),

    currentStage: varchar("current_stage", { length: 50 }).default("applied").notNull(),
    stageLocked: boolean("stage_locked").default(false).notNull(),
    appliedDate: timestamp("applied_date", { withTimezone: true }).defaultNow(),

    nextStep: varchar("next_step", { length: 255 }),
    nextStepDeadline: timestamp("next_step_deadline", { withTimezone: true }),
    interviewLink: text("interview_link"),
    manualNotes: text("manual_notes"),
    pendingSuggestion: jsonb("pending_suggestion"),
    tags: text("tags").array(),

    lastStatusChangeAt: timestamp("last_status_change_at", { withTimezone: true }).defaultNow().notNull(),
    lastStatusChangeSource: varchar("last_status_change_source", { length: 50 }).default("initial_ingest").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_apps_user_stage").on(table.userId, table.currentStage),
    index("idx_apps_user_comp").on(table.userId, table.companyName),
  ]
);

export const applicationStatusEvents = pgTable(
  "application_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .references(() => applications.id, { onDelete: "cascade" })
      .notNull(),
    fromStage: varchar("from_stage", { length: 50 }),
    toStage: varchar("to_stage", { length: 50 }).notNull(),
    triggerSource: varchar("trigger_source", { length: 50 }).notNull(),
    confidenceScore: doublePrecision("confidence_score"),
    changeSummary: text("change_summary").notNull(),
    userNote: text("user_note"),

    emailMessageId: varchar("email_message_id", { length: 255 }),
    emailSubject: text("email_subject"),
    decisionMetadata: jsonb("decision_metadata"),
    modelVersion: varchar("model_version", { length: 100 }),

    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_events_app_date").on(table.applicationId, table.changedAt),
  ]
);

export type ApplicationRecord = typeof applications.$inferSelect;
export type NewApplicationRecord = typeof applications.$inferInsert;
export type ApplicationStatusEventRecord = typeof applicationStatusEvents.$inferSelect;
export type NewApplicationStatusEventRecord = typeof applicationStatusEvents.$inferInsert;
