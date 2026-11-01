import { pgTable, uuid, varchar, boolean, timestamp, text, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const companyCareerPages = pgTable(
  "company_career_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).unique().notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 50 }).default("greenhouse").notNull(),
    domain: varchar("domain", { length: 255 }),
    careerUrl: text("career_url"),
    logoColor: varchar("logo_color", { length: 50 }).default("#60a5fa"),
    isActive: boolean("is_active").default(true).notNull(),
    syncFrequencyHours: integer("sync_frequency_hours").default(24).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: varchar("last_sync_status", { length: 50 }).default("idle").notNull(),
    lastErrorMessage: text("last_error_message"),
    totalJobsFound: integer("total_jobs_found").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_career_pages_active").on(table.isActive),
    index("idx_career_pages_provider").on(table.provider),
  ]
);

export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalJobId: varchar("external_job_id", { length: 255 }),
    sourceType: varchar("source_type", { length: 100 }).notNull(),
    companyCareerPageId: uuid("company_career_page_id").references(() => companyCareerPages.id, { onDelete: "set null" }),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    companyDomain: varchar("company_domain", { length: 255 }),
    roleTitle: varchar("role_title", { length: 255 }).notNull(),
    location: varchar("location", { length: 255 }),
    salaryRange: varchar("salary_range", { length: 255 }),
    jobUrl: text("job_url").notNull(),
    department: varchar("department", { length: 255 }),
    descriptionSnippet: text("description_snippet"),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    isExpired: boolean("is_expired").default(false).notNull(),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    repostDetected: boolean("repost_detected").default(false).notNull(),
    originalPostingId: uuid("original_posting_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_job_postings_comp").on(table.companyName),
    index("idx_job_postings_expired").on(table.isExpired),
  ]
);

export const jobPostingObservations = pgTable(
  "job_posting_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobPostingId: uuid("job_posting_id")
      .references(() => jobPostings.id, { onDelete: "cascade" })
      .notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    salaryRange: varchar("salary_range", { length: 255 }),
    location: varchar("location", { length: 255 }),
    isActiveDuringScrape: boolean("is_active_during_scrape").notNull(),
    changeType: varchar("change_type", { length: 50 }).default("heartbeat").notNull(),
  },
  (table) => [
    index("idx_job_obs_posting_date").on(table.jobPostingId, table.observedAt),
  ]
);

export const savedJobs = pgTable(
  "saved_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    jobPostingId: uuid("job_posting_id").references(() => jobPostings.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    companyName: varchar("company_name", { length: 255 }).notNull(),
    location: varchar("location", { length: 255 }),
    salaryRange: varchar("salary_range", { length: 255 }),
    jobUrl: text("job_url"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_saved_jobs_user").on(table.userId),
  ]
);

export type CompanyCareerPage = typeof companyCareerPages.$inferSelect;
export type JobPosting = typeof jobPostings.$inferSelect;
export type JobPostingObservation = typeof jobPostingObservations.$inferSelect;
export type SavedJob = typeof savedJobs.$inferSelect;
