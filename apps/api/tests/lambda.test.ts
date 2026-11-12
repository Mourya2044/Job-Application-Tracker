import { describe, it, expect, vi } from "vitest";
import { handler } from "../src/lambda";
import { OutboxService } from "../src/modules/queue/outbox.service";
import { WorkerRegistry } from "../src/modules/queue/worker.registry";

describe("Serverless Lambda Handler", () => {
  it("processes API Gateway HTTP v2 GET /health request", async () => {
    const event = {
      version: "2.0",
      routeKey: "GET /health",
      rawPath: "/health",
      headers: {
        host: "api.track.internal",
      },
      requestContext: {
        http: {
          method: "GET",
          path: "/health",
        },
      },
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.service).toBe("track-api");
    expect(body.status).toBe("online");
  });

  it("processes scheduled EventBridge cron for queue draining", async () => {
    const outboxSpy = vi.spyOn(OutboxService, "dispatchPending").mockResolvedValue({ dispatchedCount: 5 });
    const workerSpy = vi.spyOn(WorkerRegistry, "drainBatch").mockResolvedValue({ processed: 5, errors: 0 });

    const event = {
      source: "aws.events",
      "detail-type": "Scheduled Event",
      action: "process_queue",
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe("queue_processed");
    expect(body.dispatchedOutbox).toBe(5);
    expect(body.jobsProcessed).toBe(5);
    expect(body.errors).toBe(0);

    outboxSpy.mockRestore();
    workerSpy.mockRestore();
  });

  it("handles unauthenticated endpoint routing and preserves 401 status", async () => {
    const event = {
      rawPath: "/api/applications",
      requestContext: {
        http: {
          method: "GET",
          path: "/api/applications",
        },
      },
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });
});
