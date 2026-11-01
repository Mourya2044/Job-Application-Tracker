import { QueueJobName, JobHandler } from "./queue.types";
import { QueueService } from "./queue.service";
import { QueueJobRecord } from "../../db/schema/queue";

export interface WorkerOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

export class WorkerRegistry {
  private static handlers = new Map<QueueJobName, JobHandler>();
  private static isRunning = false;
  private static pollTimer: NodeJS.Timeout | null = null;
  private static activeWorkersCount = 0;

  /**
   * Registers a job execution handler for a specific queue job name.
   */
  static register<K extends QueueJobName>(name: K, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Starts background worker loop with concurrency limits.
   */
  static start(options: WorkerOptions = {}): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const concurrency = options.concurrency || 3;
    const pollIntervalMs = options.pollIntervalMs || 2000;

    const poll = async () => {
      if (!this.isRunning) return;

      try {
        const availableSlots = concurrency - this.activeWorkersCount;
        if (availableSlots > 0) {
          const registeredNames = Array.from(this.handlers.keys());
          if (registeredNames.length > 0) {
            const jobs = await QueueService.fetchNext(registeredNames, availableSlots);
            for (const job of jobs) {
              this.activeWorkersCount++;
              this.executeJob(job).finally(() => {
                this.activeWorkersCount--;
              });
            }
          }
        }
      } catch (err) {
        // Log background worker error and continue
        console.error("Worker poll error:", err);
      } finally {
        if (this.isRunning) {
          this.pollTimer = setTimeout(poll, pollIntervalMs);
        }
      }
    };

    poll();
  }

  /**
   * Executes a single job, tracks completion and handles failures.
   */
  private static async executeJob(job: QueueJobRecord): Promise<void> {
    const handler = this.handlers.get(job.name as QueueJobName);
    if (!handler) {
      await QueueService.fail(job.id, `No registered handler for job type '${job.name}'`);
      return;
    }

    try {
      const output = await handler(job.data, job);
      await QueueService.complete(job.id, output);
    } catch (err: any) {
      await QueueService.fail(job.id, err);
    }
  }

  /**
   * Graceful shutdown of worker polling and wait for active jobs to complete.
   */
  static async stop(timeoutMs = 5000): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const start = Date.now();
    while (this.activeWorkersCount > 0 && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  static getActiveWorkersCount(): number {
    return this.activeWorkersCount;
  }

  static getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

