import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { outboxEvents, OutboxEventRecord } from "../../db/schema/queue";
import { QueueService } from "./queue.service";
import { QueueJobName } from "./queue.types";

export class OutboxService {
  /**
   * Publishes an event into the transactional outbox.
   * Can accept a transaction client (tx) so that the event insertion commits atomically
   * with business domain changes.
   */
  static async publish(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, any>,
    txClient?: any
  ): Promise<OutboxEventRecord> {
    const client = txClient || db;
    const [event] = await client
      .insert(outboxEvents)
      .values({
        aggregateType,
        aggregateId,
        eventType,
        payload,
        status: "pending",
      })
      .returning();

    return event;
  }

  /**
   * Dispatches pending outbox events into corresponding queue jobs using FOR UPDATE SKIP LOCKED.
   */
  static async dispatchPending(limit = 20): Promise<{ dispatchedCount: number }> {
    return await db.transaction(async (tx) => {
      const pending = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, "pending"))
        .limit(limit)
        .for("update", { skipLocked: true });

      if (pending.length === 0) {
        return { dispatchedCount: 0 };
      }

      let count = 0;
      for (const event of pending) {
        try {
          // Route eventType to appropriate queue job name
          let targetJobName: QueueJobName | null = null;
          let jobPayload: any = event.payload;

          if (event.eventType.startsWith("career_page.")) {
            targetJobName = "career_sync";
          } else if (event.eventType.startsWith("gmail.")) {
            targetJobName = "gmail_sync";
          } else if (event.eventType.startsWith("email.")) {
            targetJobName = "email_process";
          } else if (event.eventType.startsWith("ai.")) {
            targetJobName = "ai_inference";
          }

          if (targetJobName) {
            await QueueService.send(targetJobName, jobPayload, {
              singletonKey: `outbox-${event.id}`,
            });
          }

          await tx
            .update(outboxEvents)
            .set({
              status: "published",
              publishedAt: new Date(),
            })
            .where(eq(outboxEvents.id, event.id));

          count++;
        } catch (err: any) {
          await tx
            .update(outboxEvents)
            .set({
              status: "failed",
              errorDetails: err.message,
            })
            .where(eq(outboxEvents.id, event.id));
        }
      }

      return { dispatchedCount: count };
    });
  }
}

