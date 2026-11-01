import { pgTable, uuid, varchar, boolean, timestamp, text, integer, jsonb, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { applications } from "./applications";

export const userMailboxAccounts = pgTable(
  "user_mailbox_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: varchar("provider", { length: 50 }).default("google").notNull(),
    emailAddress: varchar("email_address", { length: 255 }).notNull(),

    refreshTokenEncrypted: text("refresh_token_encrypted"),
    accessTokenEncrypted: text("access_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),

    lastHistoryId: varchar("last_history_id", { length: 255 }),
    watchExpiration: timestamp("watch_expiration", { withTimezone: true }),
    pubsubTopic: varchar("pubsub_topic", { length: 255 }),
    isSyncEnabled: boolean("is_sync_enabled").default(false).notNull(),
    autoCreateApplications: boolean("auto_create_applications").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("uq_user_mailbox").on(table.userId, table.emailAddress),
  ]
);

export const emailLogs = pgTable(
  "email_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    messageId: varchar("message_id", { length: 255 }).notNull(),
    threadId: varchar("thread_id", { length: 255 }),
    sender: varchar("sender", { length: 255 }),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),

    detectedCompany: varchar("detected_company", { length: 255 }),
    detectedStage: varchar("detected_stage", { length: 50 }),
    matchedApplicationId: uuid("matched_application_id").references(() => applications.id, { onDelete: "set null" }),
    matchStatus: varchar("match_status", { length: 50 }).default("unmatched").notNull(),
    rawClassification: jsonb("raw_classification"),

    processingStatus: varchar("processing_status", { length: 50 }).default("processed").notNull(),
    processingAttempts: integer("processing_attempts").default(1).notNull(),
    errorDetails: text("error_details"),
    correlationId: varchar("correlation_id", { length: 100 }),
  },
  (table) => [
    unique("uq_user_message_id").on(table.userId, table.messageId),
    index("idx_email_logs_status").on(table.userId, table.matchStatus),
  ]
);

export type UserMailboxAccount = typeof userMailboxAccounts.$inferSelect;
export type EmailLogRecord = typeof emailLogs.$inferSelect;
