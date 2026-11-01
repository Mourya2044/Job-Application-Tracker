import { pgTable, uuid, varchar, boolean, timestamp, text, integer, jsonb, index } from "drizzle-orm/pg-core";

export const queueJobs = pgTable(
  "queue_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    data: jsonb("data").notNull(),
    state: varchar("state", { length: 50 }).default("created").notNull(), // created | active | completed | failed | retry
    priority: integer("priority").default(0).notNull(),
    retryLimit: integer("retry_limit").default(3).notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    retryDelaySeconds: integer("retry_delay_seconds").default(10).notNull(),
    retryBackoff: boolean("retry_backoff").default(true).notNull(),
    startAfter: timestamp("start_after", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    singletonKey: varchar("singleton_key", { length: 255 }),
    output: jsonb("output"),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_queue_fetch").on(table.state, table.startAfter, table.priority, table.createdAt),
    index("idx_queue_singleton").on(table.singletonKey),
    index("idx_queue_name").on(table.name),
  ]
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 50 }).default("pending").notNull(), // pending | published | failed
    publishedAt: timestamp("published_at", { withTimezone: true }),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_outbox_status_created").on(table.status, table.createdAt),
  ]
);

export type QueueJobRecord = typeof queueJobs.$inferSelect;
export type NewQueueJobRecord = typeof queueJobs.$inferInsert;
export type OutboxEventRecord = typeof outboxEvents.$inferSelect;
export type NewOutboxEventRecord = typeof outboxEvents.$inferInsert;

