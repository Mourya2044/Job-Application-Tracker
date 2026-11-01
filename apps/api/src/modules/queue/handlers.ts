import { WorkerRegistry } from "./worker.registry";
import { JobsService } from "../jobs/jobs.service";
import { db } from "../../db";
import { jobPostings, queueJobs } from "../../db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { OutboxService } from "./outbox.service";

export function initializeDefaultQueueWorkers(): void {
  // 1. Career Page Synchronization Worker
  WorkerRegistry.register("career_sync", async (data) => {
    return await JobsService.syncCareerPage(data.careerPageId);
  });

  // 2. Multi-source Batch Scraper Worker
  WorkerRegistry.register("batch_scrape", async (data) => {
    const allJobs = [];
    for (const q of data.queries || ["software"]) {
      const res = await JobsService.searchLiveAggregators(q, data.limit || 20);
      allJobs.push(...res);
    }
    return { totalDiscovered: allJobs.length };
  });

  // 3. Job Expiration Reconciliation Worker (Reconciles jobs not seen in 30 days)
  WorkerRegistry.register("reconcile_expiration", async (data) => {
    const days = data.daysThreshold || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const expiredResult = await db
      .update(jobPostings)
      .set({
        isExpired: true,
        expiredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jobPostings.isExpired, false), lte(jobPostings.lastSeenAt, cutoff)))
      .returning();

    return { expiredPostingsCount: expiredResult.length };
  });

  // 4. Periodic Maintenance Worker (Dispatches outbox and cleans up old jobs)
  WorkerRegistry.register("periodic_maintenance", async (data) => {
    const retentionDays = data.retentionDays || 14;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Dispatch pending outbox events
    const { dispatchedCount } = await OutboxService.dispatchPending(50);

    // Prune completed queue records older than retention period
    const deleted = await db
      .delete(queueJobs)
      .where(and(eq(queueJobs.state, "completed"), lte(queueJobs.completedAt, cutoff)))
      .returning();

    return {
      dispatchedOutboxEvents: dispatchedCount,
      prunedCompletedJobs: deleted.length,
    };
  });

  // 5. Gmail Synchronization Worker
  WorkerRegistry.register("gmail_sync", async (data) => {
    const { GmailSyncService } = await import("../mailbox/gmailSync.service");
    return await GmailSyncService.syncMailbox(data.mailboxAccountId, {
      fullReconciliation: data.fullReconciliation,
    });
  });
}
