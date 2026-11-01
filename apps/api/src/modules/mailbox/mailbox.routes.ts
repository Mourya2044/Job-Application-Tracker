import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GoogleOAuthService } from "./googleOAuth.service";
import { GmailSyncService } from "./gmailSync.service";
import { GmailWebhookHandler } from "./webhook.handler";
import { db } from "../../db";
import { emailLogs, userMailboxAccounts } from "../../db/schema/mailbox";
import { and, desc, eq } from "drizzle-orm";
import { ApplicationsService } from "../applications/applications.service";
import { LifecycleStage } from "@track/shared";

const IdParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

const CallbackQuerySchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  state: z.string().min(1, "State token is required"),
});

export const mailboxRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Google OAuth Connect (Authenticated)
  fastify.get(
    "/connect",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Generate Google OAuth2 authorization URL with least-privilege Gmail scopes",
        tags: ["mailbox"],
        summary: "Connect Gmail account",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const url = GoogleOAuthService.getAuthorizationUrl(request.user.id);
      return reply.send({ url });
    }
  );

  // 2. Google OAuth Callback (Public redirect endpoint)
  fastify.get(
    "/callback",
    {
      schema: {
        description: "Google OAuth2 callback redirect handler",
        tags: ["mailbox"],
        summary: "OAuth callback handler",
      },
    },
    async (request, reply) => {
      const { code, state } = CallbackQuerySchema.parse(request.query);
      const mailbox = await GoogleOAuthService.handleCallback(code, state);

      // Register Gmail push watch
      try {
        await GmailSyncService.setupWatch(mailbox);
      } catch (err) {
        request.log.warn({ err }, "Could not set up Gmail watch during initial callback");
      }

      return reply.send({
        success: true,
        message: "Gmail account connected successfully.",
        mailboxId: mailbox.id,
        emailAddress: mailbox.emailAddress,
      });
    }
  );

  // 3. Pub/Sub Push Webhook Receiver (Public, authenticated via token/secret)
  fastify.post(
    "/webhook",
    {
      schema: {
        description: "Google Cloud Pub/Sub push notification webhook receiver",
        tags: ["mailbox"],
        summary: "Pub/Sub webhook",
      },
    },
    GmailWebhookHandler.handlePushNotification
  );

  // 4. Mailbox Connection Status (Authenticated)
  fastify.get(
    "/status",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get connected Gmail accounts and synchronization health for current user",
        tags: ["mailbox"],
        summary: "Get mailbox status",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const accounts = await db.query.userMailboxAccounts.findMany({
        where: eq(userMailboxAccounts.userId, request.user.id),
        orderBy: [desc(userMailboxAccounts.createdAt)],
      });

      return reply.send({
        connectedAccounts: accounts.map((a) => ({
          id: a.id,
          provider: a.provider,
          email_address: a.emailAddress,
          is_sync_enabled: a.isSyncEnabled,
          auto_create_applications: a.autoCreateApplications,
          last_history_id: a.lastHistoryId,
          watch_expiration: a.watchExpiration ? a.watchExpiration.toISOString() : null,
          created_at: a.createdAt.toISOString(),
          updated_at: a.updatedAt.toISOString(),
        })),
      });
    }
  );

  // 5. Trigger Manual Sync (Authenticated)
  fastify.post(
    "/sync",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Trigger manual mailbox reconciliation and sync",
        tags: ["mailbox"],
        summary: "Sync mailbox",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const mailbox = await db.query.userMailboxAccounts.findFirst({
        where: eq(userMailboxAccounts.userId, request.user.id),
      });

      if (!mailbox) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "No connected mailbox found for this user.",
        });
      }

      const result = await GmailSyncService.syncMailbox(mailbox.id, { fullReconciliation: false });
      return reply.send(result);
    }
  );

  // 6. Disconnect Mailbox (Authenticated)
  fastify.delete(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Disconnect mailbox account and revoke OAuth tokens",
        tags: ["mailbox"],
        summary: "Disconnect mailbox",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await GoogleOAuthService.disconnectMailbox(request.user.id, id);
      return reply.status(204).send();
    }
  );

  // 7. List Pending Application Suggestions & Discoveries (Authenticated)
  fastify.get(
    "/suggestions",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "List detected candidate applications and pending stage updates for review",
        tags: ["mailbox"],
        summary: "Get mailbox suggestions",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const logs = await db.query.emailLogs.findMany({
        where: and(
          eq(emailLogs.userId, request.user.id),
          eq(emailLogs.processingStatus, "processed")
        ),
        orderBy: [desc(emailLogs.processedAt)],
      });

      const pending = logs.filter(
        (l) => l.matchStatus === "untracked_candidate" || l.matchStatus === "suggested"
      );

      return reply.send({
        total: pending.length,
        suggestions: pending.map((p) => ({
          id: p.id,
          message_id: p.messageId,
          sender: p.sender,
          subject: p.subject,
          detected_company: p.detectedCompany,
          detected_stage: p.detectedStage,
          match_status: p.matchStatus,
          matched_application_id: p.matchedApplicationId,
          processed_at: p.processedAt.toISOString(),
          signals: p.rawClassification,
        })),
      });
    }
  );

  // 8. Approve Suggestion (Authenticated)
  fastify.post(
    "/suggestions/:id/approve",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Approve a detected candidate application or stage update",
        tags: ["mailbox"],
        summary: "Approve suggestion",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      const [log] = await db
        .select()
        .from(emailLogs)
        .where(and(eq(emailLogs.id, id), eq(emailLogs.userId, request.user.id)));

      if (!log) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Suggestion not found",
        });
      }

      if (log.matchStatus === "untracked_candidate") {
        // Create new application
        const created = await ApplicationsService.create(request.user.id, {
          company_name: log.detectedCompany || "Discovered Company",
          role_title: (log.rawClassification as any)?.detectedRole || "Applied Position",
          current_stage: (log.detectedStage as LifecycleStage) || "applied",
          tags: [],
          manual_notes: `Approved discovery from email: ${log.subject}`,
        });

        await db
          .update(emailLogs)
          .set({
            matchStatus: "matched_auto",
            matchedApplicationId: created.id,
          })
          .where(eq(emailLogs.id, log.id));

        return reply.send({ success: true, application: created });
      } else if (log.matchedApplicationId && log.detectedStage) {
        // Apply stage update
        const updated = await ApplicationsService.updateStage(request.user.id, log.matchedApplicationId, {
          to_stage: log.detectedStage as LifecycleStage,
          user_note: `Approved suggestion from email: ${log.subject}`,
        });

        await db
          .update(emailLogs)
          .set({ matchStatus: "matched_auto" })
          .where(eq(emailLogs.id, log.id));

        return reply.send({ success: true, application: updated });
      }

      return reply.send({ success: true });
    }
  );

  // 9. Reject Suggestion (Authenticated)
  fastify.post(
    "/suggestions/:id/reject",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Reject an email suggestion",
        tags: ["mailbox"],
        summary: "Reject suggestion",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      await db
        .update(emailLogs)
        .set({ matchStatus: "ignored" })
        .where(and(eq(emailLogs.id, id), eq(emailLogs.userId, request.user.id)));

      return reply.send({ success: true });
    }
  );
};
