import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  ApplicationCreateSchema,
  ApplicationStageUpdateSchema,
  ApplicationUpdateSchema,
} from "@track/shared";
import { ApplicationsService } from "./applications.service";

const IdParamSchema = z.object({
  id: z.string().uuid("Invalid application ID"),
});

const RevertParamsSchema = z.object({
  id: z.string().uuid("Invalid application ID"),
  eventId: z.string().uuid("Invalid event ID"),
});

export const applicationRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All application endpoints require authentication
  fastify.addHook("onRequest", fastify.authenticate);

  // 1. Get Kanban Board
  fastify.get(
    "",
    {
      schema: {
        description: "Retrieve all tracked applications organized into Kanban stage columns",
        tags: ["applications"],
        summary: "Kanban board view",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const board = await ApplicationsService.getKanbanBoard(request.user.id);
      return reply.send(board);
    }
  );

  // 2. Get Single Application by ID
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Retrieve single application details including chronological audit trail",
        tags: ["applications"],
        summary: "Get application details",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const app = await ApplicationsService.getById(request.user.id, id);
      return reply.send(app);
    }
  );

  // 3. Create Application
  fastify.post(
    "",
    {
      schema: {
        description: "Create and ingest a new tracked application",
        tags: ["applications"],
        summary: "Create application",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = ApplicationCreateSchema.parse(request.body);
      const created = await ApplicationsService.create(request.user.id, parsed);
      return reply.status(201).send(created);
    }
  );

  // 4. Update Application Stage (State Machine Transition)
  fastify.patch(
    "/:id/stage",
    {
      schema: {
        description: "Transition application to a new lifecycle stage with audit history",
        tags: ["applications"],
        summary: "Update lifecycle stage",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const parsed = ApplicationStageUpdateSchema.parse(request.body);
      const updated = await ApplicationsService.updateStage(request.user.id, id, parsed);
      return reply.send(updated);
    }
  );

  // 5. Toggle Stage Lock
  fastify.post(
    "/:id/lock",
    {
      schema: {
        description: "Toggle manual stage lock to prevent automated sync overwrites",
        tags: ["applications"],
        summary: "Toggle stage lock",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const updated = await ApplicationsService.toggleLock(request.user.id, id);
      return reply.send(updated);
    }
  );

  // 6. Revert to Historical Audit Event
  fastify.post(
    "/:id/revert/:eventId",
    {
      schema: {
        description: "Revert application stage back to a historical audit event",
        tags: ["applications"],
        summary: "Revert stage",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id, eventId } = RevertParamsSchema.parse(request.params);
      const reverted = await ApplicationsService.revertToEvent(request.user.id, id, eventId);
      return reply.send(reverted);
    }
  );

  // 7. Update General Application Details
  fastify.patch(
    "/:id",
    {
      schema: {
        description: "Update general metadata of a tracked application",
        tags: ["applications"],
        summary: "Update application",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const parsed = ApplicationUpdateSchema.parse(request.body);
      const updated = await ApplicationsService.updateDetails(request.user.id, id, parsed);
      return reply.send(updated);
    }
  );

  // 8. Delete Application
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete an application and its audit history",
        tags: ["applications"],
        summary: "Delete application",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await ApplicationsService.delete(request.user.id, id);
      return reply.status(204).send();
    }
  );
};

