import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { queueJobs, QueueJobRecord, NewQueueJobRecord } from "../../db/schema/queue";
import { QueueJobName, QueueJobPayloads, SendJobOptions } from "./queue.types";

export class QueueService {
  /**
   * Enqueues a persistent job. Supports deduplication / idempotency via singletonKey.
   */
  static async send<K extends QueueJobName>(
    name: K,
    data: QueueJobPayloads[K],
    options: SendJobOptions = {}
  ): Promise<QueueJobRecord> {
    const now = new Date();
    const startAfter = options.startAfter ? new Date(options.startAfter) : now;
    const singletonKey = options.singletonKey || null;

    if (singletonKey) {
      // Idempotency: check if an active or pending job with the same singletonKey already exists
      const existing = await db.query.queueJobs.findFirst({
        where: and(
          eq(queueJobs.singletonKey, singletonKey),
          inArray(queueJobs.state, ["created", "retry", "active"])
        ),
      });

      if (existing) {
        return existing;
      }
    }

    const [job] = await db
      .insert(queueJobs)
      .values({
        name,
        data: data as Record<string, any>,
        state: "created",
        priority: options.priority ?? 0,
        retryLimit: options.retryLimit ?? 3,
        retryCount: 0,
        retryDelaySeconds: options.retryDelaySeconds ?? 10,
        retryBackoff: options.retryBackoff ?? true,
        startAfter,
        singletonKey,
      })
      .returning();

    return job;
  }

  /**
   * Atomically fetches and reserves the next batch of eligible jobs using FOR UPDATE SKIP LOCKED.
   */
  static async fetchNext(names: QueueJobName[], batchSize = 1): Promise<QueueJobRecord[]> {
    const now = new Date();

    return await db.transaction(async (tx) => {
      // Query eligible jobs with pessimistic row lock skipping already locked rows
      const eligible = await tx
        .select()
        .from(queueJobs)
        .where(
          and(
            inArray(queueJobs.name, names),
            inArray(queueJobs.state, ["created", "retry"]),
            sql`${queueJobs.startAfter} <= ${now}`
          )
        )
        .orderBy(desc(queueJobs.priority), queueJobs.createdAt)
        .limit(batchSize)
        .for("update", { skipLocked: true });

      if (eligible.length === 0) {
        return [];
      }

      const ids = eligible.map((j) => j.id);

      // Transition reserved jobs to "active"
      const updated = await tx
        .update(queueJobs)
        .set({
          state: "active",
          startedAt: now,
          updatedAt: now,
        })
        .where(inArray(queueJobs.id, ids))
        .returning();

      return updated;
    });
  }

  /**
   * Marks a job as completed with optional execution output.
   */
  static async complete(jobId: string, output?: Record<string, any> | null): Promise<QueueJobRecord> {
    const now = new Date();
    const [updated] = await db
      .update(queueJobs)
      .set({
        state: "completed",
        completedAt: now,
        output: output || null,
        updatedAt: now,
      })
      .where(eq(queueJobs.id, jobId))
      .returning();

    return updated;
  }

  /**
   * Handles failure: schedules exponential backoff retry if under retry limit,
   * otherwise moves to "failed" dead-letter status.
   */
  static async fail(jobId: string, error: Error | string): Promise<QueueJobRecord> {
    const [job] = await db.select().from(queueJobs).where(eq(queueJobs.id, jobId));
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const now = new Date();
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
    const newRetryCount = job.retryCount + 1;

    if (newRetryCount <= job.retryLimit) {
      // Exponential backoff: baseDelay * 2^(retryCount - 1)
      const multiplier = job.retryBackoff ? Math.pow(2, newRetryCount - 1) : 1;
      const delayMs = job.retryDelaySeconds * multiplier * 1000;
      const nextStartAfter = new Date(now.getTime() + delayMs);

      const [retried] = await db
        .update(queueJobs)
        .set({
          state: "retry",
          retryCount: newRetryCount,
          startAfter: nextStartAfter,
          errorDetails: errorMessage,
          updatedAt: now,
        })
        .where(eq(queueJobs.id, jobId))
        .returning();

      return retried;
    } else {
      // Dead-letter: permanent failure
      const [failed] = await db
        .update(queueJobs)
        .set({
          state: "failed",
          failedAt: now,
          errorDetails: errorMessage,
          updatedAt: now,
        })
        .where(eq(queueJobs.id, jobId))
        .returning();

      return failed;
    }
  }

  /**
   * Retrieves status and execution history for a job.
   */
  static async getJobStatus(jobId: string): Promise<QueueJobRecord | null> {
    const [job] = await db.select().from(queueJobs).where(eq(queueJobs.id, jobId));
    return job || null;
  }

  /**
   * Gets queue metrics and counts by state.
   */
  static async getMetrics() {
    const rows = await db
      .select({
        state: queueJobs.state,
        count: sql<number>`count(*)`,
      })
      .from(queueJobs)
      .groupBy(queueJobs.state);

    const counts: Record<string, number> = {
      created: 0,
      active: 0,
      retry: 0,
      completed: 0,
      failed: 0,
    };

    for (const r of rows) {
      counts[r.state] = Number(r.count);
    }

    return counts;
  }
}

