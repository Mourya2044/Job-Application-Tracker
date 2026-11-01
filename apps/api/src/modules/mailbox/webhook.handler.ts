import { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config";
import { db } from "../../db";
import { userMailboxAccounts } from "../../db/schema/mailbox";
import { eq } from "drizzle-orm";
import { QueueService } from "../queue/queue.service";

export interface PubSubNotificationPayload {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

export class GmailWebhookHandler {
  /**
   * Handles incoming Google Cloud Pub/Sub push notification webhooks.
   * Acknowledges immediately with HTTP 204 after queuing background sync.
   */
  static async handlePushNotification(request: FastifyRequest, reply: FastifyReply) {
    // 1. Authenticate webhook (verify token or secret parameter)
    const secret = (request.query as any)?.secret || request.headers["x-webhook-secret"];
    const authHeader = request.headers.authorization;

    const isAuthorized =
      secret === config.security.webhookSecret ||
      authHeader === `Bearer ${config.security.webhookSecret}` ||
      !config.isProduction; // Allow test invocation in dev

    if (!isAuthorized) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid webhook secret.",
      });
    }

    const payload = request.body as PubSubNotificationPayload;
    if (!payload?.message?.data) {
      // Empty or ping message; acknowledge promptly
      return reply.status(204).send();
    }

    try {
      // 2. Decode base64 Pub/Sub data payload
      const jsonStr = Buffer.from(payload.message.data, "base64").toString("utf-8");
      const data = JSON.parse(jsonStr) as { emailAddress?: string; historyId?: string };

      if (!data.emailAddress) {
        return reply.status(204).send();
      }

      // 3. Find mailbox account
      const mailbox = await db.query.userMailboxAccounts.findFirst({
        where: eq(userMailboxAccounts.emailAddress, data.emailAddress.toLowerCase()),
      });

      if (!mailbox || !mailbox.isSyncEnabled) {
        return reply.status(204).send();
      }

      // 4. Idempotently enqueue background sync job
      const historyId = data.historyId ? String(data.historyId) : undefined;
      const singletonKey = historyId ? `sync-${mailbox.id}-${historyId}` : `sync-${mailbox.id}-${Date.now()}`;

      await QueueService.send(
        "gmail_sync",
        {
          userId: mailbox.userId,
          mailboxAccountId: mailbox.id,
          historyId,
        },
        { singletonKey, priority: 1 }
      );

      // Fast acknowledgement: reply 204 immediately
      return reply.status(204).send();
    } catch (err) {
      // Always return 204 or 200 to Pub/Sub to prevent infinite duplicate delivery retries
      request.log.error(err, "Error ingesting Pub/Sub push notification");
      return reply.status(204).send();
    }
  }
}

