import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  applications,
  applicationStatusEvents,
  ApplicationRecord,
  ApplicationStatusEventRecord,
} from "../../db/schema/applications";
import {
  ApplicationCreateInput,
  ApplicationStageUpdateInput,
  ApplicationUpdateInput,
  KanbanBoardDto,
  LIFECYCLE_STAGES,
  LifecycleStage,
  isStageTransitionAllowed,
} from "@track/shared";

export interface ListApplicationsOptions {
  stage?: LifecycleStage;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AutomatedStageUpdateInput {
  target_stage: LifecycleStage;
  reason: string;
  confidence_score: number;
  email_message_id?: string;
  email_subject?: string;
  decision_metadata?: Record<string, any>;
}

export class ApplicationsService {
  /**
   * Retrieves all applications owned by the user, grouped into Kanban stage columns.
   */
  static async getKanbanBoard(userId: string): Promise<KanbanBoardDto> {
    const userApps = await db.query.applications.findMany({
      where: eq(applications.userId, userId),
      orderBy: [desc(applications.lastStatusChangeAt)],
    });

    const appIds = userApps.map((a) => a.id);
    let eventsByAppId: Record<string, ApplicationStatusEventRecord[]> = {};

    if (appIds.length > 0) {
      const allEvents = await db.query.applicationStatusEvents.findMany({
        where: inArray(applicationStatusEvents.applicationId, appIds),
        orderBy: [desc(applicationStatusEvents.changedAt)],
      });
      for (const evt of allEvents) {
        if (!eventsByAppId[evt.applicationId]) {
          eventsByAppId[evt.applicationId] = [];
        }
        eventsByAppId[evt.applicationId].push(evt);
      }
    }

    const appsWithEvents = userApps.map((app) => ({
      id: app.id,
      user_id: app.userId,
      job_posting_id: app.jobPostingId,
      company_name: app.companyName,
      company_domain: app.companyDomain,
      role_title: app.roleTitle,
      job_url: app.jobUrl,
      location: app.location,
      salary_range: app.salaryRange,
      current_stage: app.currentStage as LifecycleStage,
      stage_locked: app.stageLocked,
      applied_date: app.appliedDate ? app.appliedDate.toISOString() : null,
      next_step: app.nextStep,
      next_step_deadline: app.nextStepDeadline ? app.nextStepDeadline.toISOString() : null,
      interview_link: app.interviewLink,
      manual_notes: app.manualNotes,
      pending_suggestion: app.pendingSuggestion as Record<string, any> | null,
      tags: app.tags || [],
      last_status_change_at: app.lastStatusChangeAt.toISOString(),
      last_status_change_source: app.lastStatusChangeSource,
      created_at: app.createdAt.toISOString(),
      updated_at: app.updatedAt.toISOString(),
      status_events: (eventsByAppId[app.id] || []).map((e) => ({
        id: e.id,
        application_id: e.applicationId,
        from_stage: e.fromStage,
        to_stage: e.toStage,
        trigger_source: e.triggerSource as any,
        confidence_score: e.confidenceScore,
        change_summary: e.changeSummary,
        user_note: e.userNote,
        email_message_id: e.emailMessageId,
        email_subject: e.emailSubject,
        decision_metadata: e.decisionMetadata as Record<string, any> | null,
        model_version: e.modelVersion,
        changed_at: e.changedAt.toISOString(),
      })),
    }));

    const columns = LIFECYCLE_STAGES.map((stage) => {
      const stageApps = appsWithEvents.filter((a) => a.current_stage === stage);
      return {
        stage,
        title: stage.charAt(0).toUpperCase() + stage.slice(1),
        count: stageApps.length,
        applications: stageApps,
      };
    });

    return {
      total_applications: userApps.length,
      columns,
    };
  }

  /**
   * Paginated flat list of applications with optional stage and company/title search filters.
   */
  static async listApplications(userId: string, options: ListApplicationsOptions = {}) {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);

    const conditions = [eq(applications.userId, userId)];
    if (options.stage) {
      conditions.push(eq(applications.currentStage, options.stage));
    }
    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(${ilike(applications.companyName, term)} OR ${ilike(applications.roleTitle, term)})`
      );
    }

    const whereClause = and(...conditions);

    const [items, countResult] = await Promise.all([
      db.query.applications.findMany({
        where: whereClause,
        orderBy: [desc(applications.lastStatusChangeAt)],
        limit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(applications)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count || 0);

    return {
      total,
      limit,
      offset,
      items: items.map((app) => ({
        ...app,
        current_stage: app.currentStage as LifecycleStage,
      })),
    };
  }

  /**
   * Retrieves single application details including chronological audit trail.
   */
  static async getById(userId: string, applicationId: string) {
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    });
    if (!app) {
      const err = new Error("Application not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const events = await db.query.applicationStatusEvents.findMany({
      where: eq(applicationStatusEvents.applicationId, applicationId),
      orderBy: [desc(applicationStatusEvents.changedAt)],
    });

    return {
      ...app,
      current_stage: app.currentStage as LifecycleStage,
      status_events: events.map((e) => ({
        ...e,
        changed_at: e.changedAt.toISOString(),
      })),
    };
  }

  /**
   * Transactionally creates an application and writes an initial audit status event.
   */
  static async create(userId: string, input: ApplicationCreateInput) {
    return await db.transaction(async (tx) => {
      const targetStage = input.current_stage || "applied";

      const [newApp] = await tx
        .insert(applications)
        .values({
          userId,
          companyName: input.company_name.trim(),
          companyDomain: input.company_domain?.trim() || null,
          roleTitle: input.role_title.trim(),
          jobUrl: input.job_url || null,
          location: input.location?.trim() || null,
          salaryRange: input.salary_range?.trim() || null,
          currentStage: targetStage,
          stageLocked: false,
          appliedDate: input.applied_date ? new Date(input.applied_date) : new Date(),
          nextStep: input.next_step?.trim() || null,
          nextStepDeadline: input.next_step_deadline ? new Date(input.next_step_deadline) : null,
          interviewLink: input.interview_link || null,
          manualNotes: input.manual_notes?.trim() || null,
          tags: input.tags || [],
          lastStatusChangeSource: "initial_ingest",
        })
        .returning();

      const [initialEvent] = await tx
        .insert(applicationStatusEvents)
        .values({
          applicationId: newApp.id,
          fromStage: null,
          toStage: targetStage,
          triggerSource: "initial_ingest",
          confidenceScore: 1.0,
          changeSummary: `Application created in ${targetStage.toUpperCase()} stage`,
          userNote: input.manual_notes?.trim() || null,
        })
        .returning();

      return {
        ...newApp,
        current_stage: newApp.currentStage as LifecycleStage,
        status_events: [initialEvent],
      };
    });
  }

  /**
   * Transactionally updates application lifecycle stage with pessimistic locking (FOR UPDATE)
   * and records an immutable audit status event.
   */
  static async updateStage(userId: string, applicationId: string, input: ApplicationStageUpdateInput) {
    return await db.transaction(async (tx) => {
      // Pessimistic lock against concurrent lost updates
      const [existing] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
        .for("update");

      if (!existing) {
        const err = new Error("Application not found");
        (err as any).statusCode = 404;
        throw err;
      }

      const fromStage = existing.currentStage as LifecycleStage;
      const toStage = input.to_stage;

      // Reject identical no-op transitions
      if (fromStage === toStage) {
        const events = await tx.query.applicationStatusEvents.findMany({
          where: eq(applicationStatusEvents.applicationId, applicationId),
          orderBy: [desc(applicationStatusEvents.changedAt)],
        });
        return {
          ...existing,
          current_stage: existing.currentStage as LifecycleStage,
          status_events: events,
        };
      }

      // Enforce valid lifecycle transitions
      if (!isStageTransitionAllowed(fromStage, toStage, false)) {
        const err = new Error(
          `Cannot transition application from '${fromStage}' to '${toStage}'. Invalid lifecycle transition.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      const now = new Date();

      const [updated] = await tx
        .update(applications)
        .set({
          currentStage: toStage,
          lastStatusChangeAt: now,
          lastStatusChangeSource: "manual_user_override",
          nextStep: input.next_step !== undefined ? input.next_step : existing.nextStep,
          nextStepDeadline: input.next_step_deadline ? new Date(input.next_step_deadline) : existing.nextStepDeadline,
          interviewLink: input.interview_link !== undefined ? input.interview_link : existing.interviewLink,
          pendingSuggestion: null, // Clear any pending suggestions on explicit manual override
          updatedAt: now,
        })
        .where(eq(applications.id, applicationId))
        .returning();

      await tx.insert(applicationStatusEvents).values({
        applicationId,
        fromStage,
        toStage,
        triggerSource: "manual_user_override",
        confidenceScore: 1.0,
        changeSummary: `Stage manually updated from ${fromStage.toUpperCase()} to ${toStage.toUpperCase()}`,
        userNote: input.user_note?.trim() || null,
        changedAt: now,
      });

      const events = await tx.query.applicationStatusEvents.findMany({
        where: eq(applicationStatusEvents.applicationId, applicationId),
        orderBy: [desc(applicationStatusEvents.changedAt)],
      });

      return {
        ...updated,
        current_stage: updated.currentStage as LifecycleStage,
        status_events: events,
      };
    });
  }

  /**
   * Applies an automated background stage update (e.g. from Gmail sync).
   * Enforces the Stage Lock invariant: if stage_locked is true, mutates pendingSuggestion
   * and does NOT override currentStage.
   */
  static async applyAutomatedStageUpdate(
    userId: string,
    applicationId: string,
    update: AutomatedStageUpdateInput
  ) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
        .for("update");

      if (!existing) {
        const err = new Error("Application not found");
        (err as any).statusCode = 404;
        throw err;
      }

      const now = new Date();

      const fromStage = existing.currentStage as LifecycleStage;
      const toStage = update.target_stage;
      const isAllowed = isStageTransitionAllowed(fromStage, toStage, true);

      if (existing.stageLocked || !isAllowed) {
        // INVARIANT PRESERVED: Do not override currentStage when stage is locked or transition is disallowed automatically.
        const suggestionPayload = {
          suggested_stage: update.target_stage,
          reason: existing.stageLocked
            ? update.reason
            : `Automated transition from '${fromStage}' to '${toStage}' is restricted. Manual review required.`,
          confidence: update.confidence_score,
          detected_at: now.toISOString(),
          email_subject: update.email_subject,
          email_message_id: update.email_message_id,
        };

        const [updated] = await tx
          .update(applications)
          .set({
            pendingSuggestion: suggestionPayload,
            updatedAt: now,
          })
          .where(eq(applications.id, applicationId))
          .returning();

        return {
          application: updated,
          stage_overridden: false,
          suggestion_queued: true,
        };
      }

      const [updated] = await tx
        .update(applications)
        .set({
          currentStage: toStage,
          lastStatusChangeAt: now,
          lastStatusChangeSource: "mailbox_auto",
          pendingSuggestion: null,
          updatedAt: now,
        })
        .where(eq(applications.id, applicationId))
        .returning();

      await tx.insert(applicationStatusEvents).values({
        applicationId,
        fromStage,
        toStage,
        triggerSource: "mailbox_auto",
        confidenceScore: update.confidence_score,
        changeSummary: update.reason,
        emailMessageId: update.email_message_id,
        emailSubject: update.email_subject,
        decisionMetadata: update.decision_metadata || null,
        changedAt: now,
      });

      return {
        application: updated,
        stage_overridden: true,
        suggestion_queued: false,
      };
    });
  }

  /**
   * Toggles stage locking to safeguard against automated background sync overwrites.
   */
  static async toggleLock(userId: string, applicationId: string) {
    const existing = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    });
    if (!existing) {
      const err = new Error("Application not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const [updated] = await db
      .update(applications)
      .set({
        stageLocked: !existing.stageLocked,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))
      .returning();

    return updated;
  }

  /**
   * Transactionally reverts an application stage back to a historical audit event.
   */
  static async revertToEvent(userId: string, applicationId: string, eventId: string) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
        .for("update");

      if (!existing) {
        const err = new Error("Application not found");
        (err as any).statusCode = 404;
        throw err;
      }

      const targetEvent = await tx.query.applicationStatusEvents.findFirst({
        where: and(
          eq(applicationStatusEvents.id, eventId),
          eq(applicationStatusEvents.applicationId, applicationId)
        ),
      });
      if (!targetEvent) {
        const err = new Error("Target status event not found for this application");
        (err as any).statusCode = 404;
        throw err;
      }

      const fromStage = existing.currentStage;
      const toStage = targetEvent.toStage;
      const now = new Date();

      const [updated] = await tx
        .update(applications)
        .set({
          currentStage: toStage,
          lastStatusChangeAt: now,
          lastStatusChangeSource: "undo_action",
          pendingSuggestion: null,
          updatedAt: now,
        })
        .where(eq(applications.id, applicationId))
        .returning();

      await tx.insert(applicationStatusEvents).values({
        applicationId,
        fromStage,
        toStage,
        triggerSource: "undo_action",
        confidenceScore: 1.0,
        changeSummary: `Reverted stage back to ${toStage.toUpperCase()} from historical event`,
        userNote: `Revert triggered by user to event ${eventId}`,
        changedAt: now,
      });

      const events = await tx.query.applicationStatusEvents.findMany({
        where: eq(applicationStatusEvents.applicationId, applicationId),
        orderBy: [desc(applicationStatusEvents.changedAt)],
      });

      return {
        ...updated,
        current_stage: updated.currentStage as LifecycleStage,
        status_events: events,
      };
    });
  }

  /**
   * Updates general application attributes.
   */
  static async updateDetails(userId: string, applicationId: string, input: ApplicationUpdateInput) {
    const [existing] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)));

    if (!existing) {
      const err = new Error("Application not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const [updated] = await db
      .update(applications)
      .set({
        companyName: input.company_name !== undefined ? input.company_name : existing.companyName,
        companyDomain: input.company_domain !== undefined ? input.company_domain : existing.companyDomain,
        roleTitle: input.role_title !== undefined ? input.role_title : existing.roleTitle,
        jobUrl: input.job_url !== undefined ? input.job_url : existing.jobUrl,
        location: input.location !== undefined ? input.location : existing.location,
        salaryRange: input.salary_range !== undefined ? input.salary_range : existing.salaryRange,
        nextStep: input.next_step !== undefined ? input.next_step : existing.nextStep,
        nextStepDeadline: input.next_step_deadline ? new Date(input.next_step_deadline) : existing.nextStepDeadline,
        interviewLink: input.interview_link !== undefined ? input.interview_link : existing.interviewLink,
        manualNotes: input.manual_notes !== undefined ? input.manual_notes : existing.manualNotes,
        tags: input.tags !== undefined ? input.tags : existing.tags,
        stageLocked: input.stage_locked !== undefined ? input.stage_locked : existing.stageLocked,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))
      .returning();

    return updated;
  }

  /**
   * Deletes an application and cascades deletion of its status events.
   */
  static async delete(userId: string, applicationId: string) {
    const existing = await db.query.applications.findFirst({
      where: and(eq(applications.id, applicationId), eq(applications.userId, userId)),
    });
    if (!existing) {
      const err = new Error("Application not found");
      (err as any).statusCode = 404;
      throw err;
    }

    await db.delete(applications).where(eq(applications.id, applicationId));
    return { success: true };
  }
}
