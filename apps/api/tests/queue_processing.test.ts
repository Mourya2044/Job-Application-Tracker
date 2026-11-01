import { describe, it, expect, vi } from "vitest";
import { QueueService } from "../src/modules/queue/queue.service";
import { OutboxService } from "../src/modules/queue/outbox.service";
import { WorkerRegistry } from "../src/modules/queue/worker.registry";

describe("Phase B: Background Processing & Transactional Outbox", () => {
  describe("Queue Service & Idempotency", () => {
    it("enqueues a job with payload and default settings", async () => {
      const dbModule = await import("../src/db");
      const insertSpy = vi.spyOn(dbModule.db, "insert").mockReturnValue({
        values: (vals: any) => ({
          returning: () => [
            {
              id: "job-101",
              name: "career_sync",
              data: vals.data,
              state: "created",
              priority: vals.priority,
              retryLimit: vals.retryLimit,
              retryCount: 0,
              retryDelaySeconds: vals.retryDelaySeconds,
              retryBackoff: vals.retryBackoff,
              startAfter: vals.startAfter,
              singletonKey: vals.singletonKey,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as any);

      const job = await QueueService.send("career_sync", {
        careerPageId: "page-1",
        companyName: "Stripe",
        provider: "greenhouse",
        slug: "stripe",
      });

      expect(job.id).toBe("job-101");
      expect(job.name).toBe("career_sync");
      expect(job.state).toBe("created");
      expect(job.retryLimit).toBe(3);

      insertSpy.mockRestore();
    });

    it("enforces idempotency using singletonKey to block duplicate active jobs", async () => {
      const dbModule = await import("../src/db");
      const existingJob = {
        id: "job-existing-99",
        name: "career_sync",
        data: { slug: "stripe" },
        state: "created",
        singletonKey: "sync-stripe-today",
      };

      const querySpy = vi.spyOn(dbModule.db.query.queueJobs, "findFirst").mockResolvedValueOnce(existingJob as any);

      const job = await QueueService.send(
        "career_sync",
        {
          careerPageId: "page-1",
          companyName: "Stripe",
          provider: "greenhouse",
          slug: "stripe",
        },
        { singletonKey: "sync-stripe-today" }
      );

      // Returns existing job without inserting duplicate
      expect(job.id).toBe("job-existing-99");
      expect(querySpy).toHaveBeenCalled();

      querySpy.mockRestore();
    });
  });

  describe("Exponential Backoff & Dead-Letter Handling", () => {
    it("schedules exponential backoff retry when under retry limit", async () => {
      const dbModule = await import("../src/db");
      let updatedState: any = null;

      const selectSpy = vi.spyOn(dbModule.db, "select").mockReturnValue({
        from: () => ({
          where: () => [
            {
              id: "job-retry-1",
              retryLimit: 3,
              retryCount: 0,
              retryDelaySeconds: 10,
              retryBackoff: true,
            },
          ],
        }),
      } as any);

      const updateSpy = vi.spyOn(dbModule.db, "update").mockReturnValue({
        set: (vals: any) => {
          updatedState = vals;
          return {
            where: () => ({
              returning: () => [{ id: "job-retry-1", ...vals }],
            }),
          };
        },
      } as any);

      const result = await QueueService.fail("job-retry-1", new Error("Network connection dropped"));

      expect(result.state).toBe("retry");
      expect(updatedState.retryCount).toBe(1);
      // Next startAfter is scheduled in future (10s backoff)
      expect(new Date(updatedState.startAfter).getTime()).toBeGreaterThan(Date.now());
      expect(updatedState.errorDetails).toContain("Network connection dropped");

      selectSpy.mockRestore();
      updateSpy.mockRestore();
    });

    it("moves to failed dead-letter status when retry limit is exceeded", async () => {
      const dbModule = await import("../src/db");
      let updatedState: any = null;

      const selectSpy = vi.spyOn(dbModule.db, "select").mockReturnValue({
        from: () => ({
          where: () => [
            {
              id: "job-fail-final",
              retryLimit: 3,
              retryCount: 3, // Already reached retry limit
              retryDelaySeconds: 10,
              retryBackoff: true,
            },
          ],
        }),
      } as any);

      const updateSpy = vi.spyOn(dbModule.db, "update").mockReturnValue({
        set: (vals: any) => {
          updatedState = vals;
          return {
            where: () => ({
              returning: () => [{ id: "job-fail-final", ...vals }],
            }),
          };
        },
      } as any);

      const result = await QueueService.fail("job-fail-final", new Error("Fatal unrecoverable error"));

      expect(result.state).toBe("failed");
      expect(updatedState.failedAt).toBeDefined();
      expect(updatedState.errorDetails).toContain("Fatal unrecoverable error");

      selectSpy.mockRestore();
      updateSpy.mockRestore();
    });
  });

  describe("Transactional Outbox", () => {
    it("publishes outbox events with pending status", async () => {
      const dbModule = await import("../src/db");
      let insertedPayload: any = null;

      const insertSpy = vi.spyOn(dbModule.db, "insert").mockReturnValue({
        values: (vals: any) => {
          insertedPayload = vals;
          return {
            returning: () => [{ id: "outbox-1", ...vals }],
          };
        },
      } as any);

      const event = await OutboxService.publish("application", "app-123", "career_page.sync_requested", {
        slug: "figma",
      });

      expect(event.id).toBe("outbox-1");
      expect(insertedPayload.aggregateType).toBe("application");
      expect(insertedPayload.aggregateId).toBe("app-123");
      expect(insertedPayload.status).toBe("pending");

      insertSpy.mockRestore();
    });

    it("dispatches pending outbox events into queue jobs and sets status published", async () => {
      const dbModule = await import("../src/db");
      const mockPendingEvents = [
        {
          id: "evt-1",
          aggregateType: "career_page",
          aggregateId: "page-1",
          eventType: "career_page.sync_requested",
          payload: { careerPageId: "p1", companyName: "Figma", provider: "lever", slug: "figma" },
          status: "pending",
        },
      ];

      const sendSpy = vi.spyOn(QueueService, "send").mockResolvedValue({ id: "q-1" } as any);

      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: () => mockPendingEvents,
              }),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
      };

      const txSpy = vi.spyOn(dbModule.db, "transaction").mockImplementation(async (cb: any) => {
        return cb(mockTx);
      });

      const { dispatchedCount } = await OutboxService.dispatchPending(10);

      expect(dispatchedCount).toBe(1);
      expect(sendSpy).toHaveBeenCalledWith(
        "career_sync",
        mockPendingEvents[0].payload,
        expect.objectContaining({ singletonKey: "outbox-evt-1" })
      );

      sendSpy.mockRestore();
      txSpy.mockRestore();
    });
  });

  describe("Worker Registry", () => {
    it("registers and reports job handlers", () => {
      WorkerRegistry.register("batch_scrape", async () => {
        return { success: true };
      });

      const handlers = WorkerRegistry.getRegisteredHandlers();
      expect(handlers).toContain("batch_scrape");
    });
  });
});

