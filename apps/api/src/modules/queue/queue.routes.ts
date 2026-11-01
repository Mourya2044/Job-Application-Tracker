import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { QueueService } from "./queue.service";
import { OutboxService } from "./outbox.service";

const IdParamSchema = z.object({
  id: z.string().uuid("Invalid Job ID format"),
});

export const queueRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Requires authentication for queue observability
  fastify.addHook("onRequest", fastify.authenticate);

  // 1. Queue Metrics
  fastify.get(
    "/metrics",
    {
      schema: {
        description: "Get real-time background queue metrics and job counts by state",
        tags: ["queue"],
        summary: "Queue metrics",
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const metrics = await QueueService.getMetrics();
      return reply.send(metrics);
    }
  );

  // 2. Get Job Status by ID
  fastify.get(
    "/jobs/:id",
    {
      schema: {
        description: "Inspect background job status, retry count, output and error trace",
        tags: ["queue"],
        summary: "Get job status",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const job = await QueueService.getJobStatus(id);
      if (!job) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Job not found",
        });
      }
      return reply.send(job);
    }
  );

  // 3. Trigger Outbox Dispatch
  fastify.post(
    "/dispatch-outbox",
    {
      schema: {
        description: "Manually triggers outbox event publication to queue workers",
        tags: ["queue"],
        summary: "Dispatch outbox events",
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const result = await OutboxService.dispatchPending(50);
      return reply.send(result);
    }
  );
};

