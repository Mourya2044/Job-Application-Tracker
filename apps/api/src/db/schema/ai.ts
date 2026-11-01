import { pgTable, uuid, varchar, timestamp, text, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const aiExecutions = pgTable(
  "ai_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    capability: varchar("capability", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    modelName: varchar("model_name", { length: 100 }).notNull(),
    promptId: varchar("prompt_id", { length: 100 }),
    promptVersion: varchar("prompt_version", { length: 50 }),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costUsd: varchar("cost_usd", { length: 50 }),
    status: varchar("status", { length: 50 }).notNull(),
    errorDetails: text("error_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_exec_created").on(table.createdAt),
  ]
);

export type AIExecution = typeof aiExecutions.$inferSelect;
