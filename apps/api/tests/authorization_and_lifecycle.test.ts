import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../src/server";
import { FastifyInstance } from "fastify";
import { ApplicationsService } from "../src/modules/applications/applications.service";
import { isStageTransitionAllowed, VALID_STAGE_TRANSITIONS, VALID_AUTOMATED_TRANSITIONS } from "@track/shared";

describe("Authorization Boundaries & Application Lifecycle", () => {
  let app: FastifyInstance;

  const userA = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    email: "userA@track.test",
  };

  const userB = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    email: "userB@track.test",
  };

  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    tokenUserA = app.jwt.sign(userA);
    tokenUserB = app.jwt.sign(userB);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Lifecycle State Machine Validation", () => {
    it("allows standard forward transitions", () => {
      expect(isStageTransitionAllowed("applied", "screening")).toBe(true);
      expect(isStageTransitionAllowed("screening", "interview")).toBe(true);
      expect(isStageTransitionAllowed("interview", "offer")).toBe(true);
      expect(isStageTransitionAllowed("offer", "accepted")).toBe(true);
      expect(isStageTransitionAllowed("offer", "rejected")).toBe(true);
      expect(isStageTransitionAllowed("applied", "rejected")).toBe(true);
    });

    it("rejects illegal jumping transitions", () => {
      // Cannot jump from applied straight to accepted without an offer
      expect(isStageTransitionAllowed("applied", "accepted")).toBe(false);
      // Cannot jump from screening straight to accepted without an offer
      expect(isStageTransitionAllowed("screening", "accepted")).toBe(false);
      // Cannot jump from interview straight to accepted without an offer
      expect(isStageTransitionAllowed("interview", "accepted")).toBe(false);
    });

    it("disallows automated updates from mutating terminal states", () => {
      // In automated updates (e.g. Gmail sync), terminal states cannot transition automatically
      expect(isStageTransitionAllowed("rejected", "interview", true)).toBe(false);
      expect(isStageTransitionAllowed("rejected", "applied", true)).toBe(false);
      expect(isStageTransitionAllowed("accepted", "screening", true)).toBe(false);
      expect(isStageTransitionAllowed("withdrawn", "interview", true)).toBe(false);
    });

    it("disallows backward automated updates", () => {
      expect(isStageTransitionAllowed("interview", "applied", true)).toBe(false);
      expect(isStageTransitionAllowed("offer", "screening", true)).toBe(false);
    });
  });

  describe("Cross-User Ownership and Authorization Barrier", () => {
    const foreignAppId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    it("GET /api/applications/:id returns 404 when requesting another user's application", async () => {
      // Spy on ApplicationsService.getById to simulate non-ownership (row not found for user)
      const spy = vi.spyOn(ApplicationsService, "getById").mockImplementation(async (userId, id) => {
        if (userId === userB.id && id === foreignAppId) {
          const err = new Error("Application not found");
          (err as any).statusCode = 404;
          throw err;
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/applications/${foreignAppId}`,
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Not Found");
      expect(spy).toHaveBeenCalledWith(userB.id, foreignAppId);

      spy.mockRestore();
    });

    it("PATCH /api/applications/:id/stage returns 404 when mutating another user's application", async () => {
      const spy = vi.spyOn(ApplicationsService, "updateStage").mockImplementation(async (userId, id) => {
        if (userId === userB.id && id === foreignAppId) {
          const err = new Error("Application not found");
          (err as any).statusCode = 404;
          throw err;
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/applications/${foreignAppId}/stage`,
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
        payload: {
          to_stage: "interview",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(spy).toHaveBeenCalledWith(userB.id, foreignAppId, expect.anything());

      spy.mockRestore();
    });

    it("POST /api/applications/:id/lock returns 404 when toggling lock on another user's application", async () => {
      const spy = vi.spyOn(ApplicationsService, "toggleLock").mockImplementation(async (userId, id) => {
        if (userId === userB.id && id === foreignAppId) {
          const err = new Error("Application not found");
          (err as any).statusCode = 404;
          throw err;
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/applications/${foreignAppId}/lock`,
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(spy).toHaveBeenCalledWith(userB.id, foreignAppId);

      spy.mockRestore();
    });

    it("POST /api/applications/:id/revert/:eventId returns 404 when reverting another user's application", async () => {
      const eventId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      const spy = vi.spyOn(ApplicationsService, "revertToEvent").mockImplementation(async (userId, id) => {
        if (userId === userB.id && id === foreignAppId) {
          const err = new Error("Application not found");
          (err as any).statusCode = 404;
          throw err;
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/applications/${foreignAppId}/revert/${eventId}`,
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(spy).toHaveBeenCalledWith(userB.id, foreignAppId, eventId);

      spy.mockRestore();
    });

    it("DELETE /api/applications/:id returns 404 when attempting to delete another user's application", async () => {
      const spy = vi.spyOn(ApplicationsService, "delete").mockImplementation(async (userId, id) => {
        if (userId === userB.id && id === foreignAppId) {
          const err = new Error("Application not found");
          (err as any).statusCode = 404;
          throw err;
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/applications/${foreignAppId}`,
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(spy).toHaveBeenCalledWith(userB.id, foreignAppId);

      spy.mockRestore();
    });

    it("Kanban board isolates user records completely", async () => {
      const spy = vi.spyOn(ApplicationsService, "getKanbanBoard").mockImplementation(async (userId) => {
        if (userId === userB.id) {
          return {
            total_applications: 0,
            columns: [
              { stage: "applied", title: "Applied", count: 0, applications: [] },
              { stage: "screening", title: "Screening", count: 0, applications: [] },
              { stage: "interview", title: "Interview", count: 0, applications: [] },
              { stage: "interviewing", title: "Interviewing", count: 0, applications: [] },
              { stage: "offer", title: "Offer", count: 0, applications: [] },
              { stage: "accepted", title: "Accepted", count: 0, applications: [] },
              { stage: "rejected", title: "Rejected", count: 0, applications: [] },
              { stage: "withdrawn", title: "Withdrawn", count: 0, applications: [] },
            ],
          };
        }
        throw new Error("Unexpected invocation");
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/applications",
        headers: {
          authorization: `Bearer ${tokenUserB}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.total_applications).toBe(0);
      expect(spy).toHaveBeenCalledWith(userB.id);

      spy.mockRestore();
    });
  });

  describe("Stage Transition Invariants in ApplicationsService", () => {
    it("updateStage throws 400 Bad Request on illegal stage jump", async () => {
      // Mock db.transaction for ApplicationsService
      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => [
                {
                  id: "app-123",
                  userId: userA.id,
                  currentStage: "applied",
                  stageLocked: false,
                },
              ],
            }),
          }),
        }),
      };

      const dbModule = await import("../src/db");
      const txSpy = vi.spyOn(dbModule.db, "transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        ApplicationsService.updateStage(userA.id, "app-123", { to_stage: "accepted" })
      ).rejects.toThrow(/Cannot transition application from 'applied' to 'accepted'/);

      txSpy.mockRestore();
    });

    it("applyAutomatedStageUpdate enforces stage lock invariant", async () => {
      let updatedValues: any = null;

      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => [
                {
                  id: "app-123",
                  userId: userA.id,
                  currentStage: "interview",
                  stageLocked: true, // LOCKED
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => {
            updatedValues = vals;
            return {
              where: () => ({
                returning: () => [
                  {
                    id: "app-123",
                    currentStage: "interview", // Remains unchanged
                    stageLocked: true,
                    pendingSuggestion: vals.pendingSuggestion,
                  },
                ],
              }),
            };
          },
        }),
      };

      const dbModule = await import("../src/db");
      const txSpy = vi.spyOn(dbModule.db, "transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await ApplicationsService.applyAutomatedStageUpdate(userA.id, "app-123", {
        target_stage: "offer",
        reason: "Offer letter detected in email",
        confidence_score: 0.95,
      });

      // Stage was NOT overridden
      expect(result.stage_overridden).toBe(false);
      expect(result.suggestion_queued).toBe(true);
      expect(result.application.currentStage).toBe("interview");
      // Suggestion was queued
      expect(updatedValues.pendingSuggestion.suggested_stage).toBe("offer");
      expect(updatedValues.pendingSuggestion.reason).toBe("Offer letter detected in email");

      txSpy.mockRestore();
    });

    it("applyAutomatedStageUpdate applies transition when stage is unlocked", async () => {
      let updatedValues: any = null;
      let insertedEvent: any = null;

      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => [
                {
                  id: "app-123",
                  userId: userA.id,
                  currentStage: "interview",
                  stageLocked: false, // UNLOCKED
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => {
            updatedValues = vals;
            return {
              where: () => ({
                returning: () => [
                  {
                    id: "app-123",
                    currentStage: vals.currentStage,
                    stageLocked: false,
                    pendingSuggestion: null,
                  },
                ],
              }),
            };
          },
        }),
        insert: () => ({
          values: (vals: any) => {
            insertedEvent = vals;
            return Promise.resolve();
          },
        }),
      };

      const dbModule = await import("../src/db");
      const txSpy = vi.spyOn(dbModule.db, "transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await ApplicationsService.applyAutomatedStageUpdate(userA.id, "app-123", {
        target_stage: "offer",
        reason: "Offer letter detected in email",
        confidence_score: 0.95,
      });

      // Stage WAS transitioned
      expect(result.stage_overridden).toBe(true);
      expect(result.suggestion_queued).toBe(false);
      expect(updatedValues.currentStage).toBe("offer");
      expect(updatedValues.lastStatusChangeSource).toBe("mailbox_auto");
      // Status audit event was inserted
      expect(insertedEvent.fromStage).toBe("interview");
      expect(insertedEvent.toStage).toBe("offer");
      expect(insertedEvent.triggerSource).toBe("mailbox_auto");

      txSpy.mockRestore();
    });

    it("revertToEvent creates an undo_action audit event and preserves chronological history", async () => {
      const historicalEventId = "event-historic-001";
      let insertedEvent: any = null;

      const existingEvents = [
        {
          id: "event-recent-002",
          applicationId: "app-123",
          fromStage: "screening",
          toStage: "interview",
          triggerSource: "manual_user_override",
          changedAt: new Date("2026-11-01T12:00:00Z"),
        },
        {
          id: historicalEventId,
          applicationId: "app-123",
          fromStage: "applied",
          toStage: "screening",
          triggerSource: "mailbox_auto",
          changedAt: new Date("2026-10-31T12:00:00Z"),
        },
        {
          id: "event-init-000",
          applicationId: "app-123",
          fromStage: null,
          toStage: "applied",
          triggerSource: "initial_ingest",
          changedAt: new Date("2026-10-30T12:00:00Z"),
        },
      ];

      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => [
                {
                  id: "app-123",
                  userId: userA.id,
                  currentStage: "interview",
                },
              ],
            }),
          }),
        }),
        query: {
          applicationStatusEvents: {
            findFirst: () => ({
              id: historicalEventId,
              applicationId: "app-123",
              toStage: "screening",
            }),
            findMany: () => [
              {
                id: "event-undo-003",
                applicationId: "app-123",
                fromStage: "interview",
                toStage: "screening",
                triggerSource: "undo_action",
                changedAt: new Date(),
              },
              ...existingEvents,
            ],
          },
        },
        update: () => ({
          set: (vals: any) => ({
            where: () => ({
              returning: () => [
                {
                  id: "app-123",
                  currentStage: vals.currentStage,
                  lastStatusChangeSource: vals.lastStatusChangeSource,
                },
              ],
            }),
          }),
        }),
        insert: () => ({
          values: (vals: any) => {
            insertedEvent = vals;
            return Promise.resolve();
          },
        }),
      };

      const dbModule = await import("../src/db");
      const txSpy = vi.spyOn(dbModule.db, "transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const reverted = await ApplicationsService.revertToEvent(userA.id, "app-123", historicalEventId);

      // Reverted to historical event's toStage
      expect(reverted.current_stage).toBe("screening");
      // An undo_action event was created
      expect(insertedEvent.triggerSource).toBe("undo_action");
      expect(insertedEvent.fromStage).toBe("interview");
      expect(insertedEvent.toStage).toBe("screening");
      // All historical events are preserved (length is 4: undo + 3 prior)
      expect(reverted.status_events.length).toBe(4);
      expect(reverted.status_events[0].triggerSource).toBe("undo_action");

      txSpy.mockRestore();
    });
  });
});

