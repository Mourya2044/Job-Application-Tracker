import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { encryptToken, decryptToken } from "../src/modules/mailbox/encryption";
import { GoogleOAuthService } from "../src/modules/mailbox/googleOAuth.service";
import { EmailHeuristicFilter } from "../src/modules/mailbox/heuristicFilter";
import { ApplicationResolver } from "../src/modules/mailbox/applicationResolver";
import { GmailWebhookHandler } from "../src/modules/mailbox/webhook.handler";
import { FastifyInstance } from "fastify";
import { buildServer } from "../src/server";
import { QueueService } from "../src/modules/queue/queue.service";

describe("Phase C: Gmail Integration & Mailbox Intelligence", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Token Encryption at Rest (AES-256-GCM)", () => {
    it("encrypts and decrypts sensitive OAuth tokens successfully", () => {
      const sampleRefreshToken = "1//04abc123DEF456_GoogleRefreshTokenSecret";
      const encrypted = encryptToken(sampleRefreshToken);

      expect(encrypted).not.toBeNull();
      expect(encrypted).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);
      expect(encrypted).not.toContain(sampleRefreshToken);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(sampleRefreshToken);
    });

    it("returns null on tampered or invalid ciphertext", () => {
      const tampered = "enc:v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:baddeadbeef";
      const decrypted = decryptToken(tampered);
      expect(decrypted).toBeNull();
    });
  });

  describe("Google OAuth State Token Security", () => {
    const testUserId = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";

    it("generates and verifies valid state tokens", () => {
      const state = GoogleOAuthService.generateStateToken(testUserId);
      expect(state).toBeDefined();

      const extractedUserId = GoogleOAuthService.validateStateToken(state);
      expect(extractedUserId).toBe(testUserId);
    });

    it("rejects tampered state tokens", () => {
      const state = GoogleOAuthService.generateStateToken(testUserId);
      const forgedState = state.slice(0, -4) + "AAAA";

      expect(() => GoogleOAuthService.validateStateToken(forgedState)).toThrow(/State verification failed/);
    });

    it("rejects expired state tokens", () => {
      const state = GoogleOAuthService.generateStateToken(testUserId);
      // Validate with negative maxAge to simulate expiration
      expect(() => GoogleOAuthService.validateStateToken(state, -1000)).toThrow(/expired/);
    });
  });

  describe("Heuristic Email Pre-filtering", () => {
    it("detects interview, offer, and status updates as recruiting-related", () => {
      const res1 = EmailHeuristicFilter.inspectEmail(
        "recruiting@stripe.com",
        "Invitation to Interview with Stripe",
        "We would love to schedule a 45-minute technical screen with our engineering team."
      );
      expect(res1.isRecruitmentRelated).toBe(true);
      expect(res1.confidence).toBeGreaterThanOrEqual(0.85);

      const res2 = EmailHeuristicFilter.inspectEmail(
        "talent@figma.com",
        "Offer details - Figma",
        "Congratulations on receiving an offer to join Figma!"
      );
      expect(res2.isRecruitmentRelated).toBe(true);
      expect(res2.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("filters out automated non-recruiting senders and notifications", () => {
      const res1 = EmailHeuristicFilter.inspectEmail(
        "notifications@github.com",
        "[GitHub] A new release was published",
        "v2.1.0 is now available."
      );
      expect(res1.isRecruitmentRelated).toBe(false);

      const res2 = EmailHeuristicFilter.inspectEmail(
        "billing@aws.amazon.com",
        "Your AWS Monthly Invoice",
        "Your invoice for the period is ready."
      );
      expect(res2.isRecruitmentRelated).toBe(false);
    });
  });

  describe("Application Resolution & Stage Lock Invariants", () => {
    const userId = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";

    it("matches email to existing application via domain and updates stage when unlocked", async () => {
      const dbModule = await import("../src/db");

      const existingApp = {
        id: "app-stripe-1",
        userId,
        companyName: "Stripe",
        companyDomain: "stripe.com",
        roleTitle: "Backend Software Engineer",
        currentStage: "applied",
        stageLocked: false,
      };

      const querySpy = vi.spyOn(dbModule.db.query.applications, "findMany").mockResolvedValueOnce([
        existingApp as any,
      ]);

      const insertSpy = vi.spyOn(dbModule.db, "insert").mockReturnValue({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      } as any);

      const { ApplicationsService } = await import("../src/modules/applications/applications.service");
      const stageSpy = vi.spyOn(ApplicationsService, "applyAutomatedStageUpdate").mockResolvedValueOnce({
        application: { ...existingApp, currentStage: "interview" } as any,
        stage_overridden: true,
        suggestion_queued: false,
      });

      const resolution = await ApplicationResolver.resolveAndApply(
        userId,
        "msg-12345",
        "sarah.recruiter@stripe.com",
        "Stripe: Scheduling your Technical Interview",
        {
          detectedCompany: "Stripe",
          detectedRole: "Backend Software Engineer",
          detectedStage: "interview",
          confidenceScore: 0.95,
        },
        "mailbox-1"
      );

      expect(resolution.matchStatus).toBe("matched_auto");
      expect(resolution.matchedApplicationId).toBe("app-stripe-1");
      expect(resolution.stageUpdated).toBe(true);
      expect(stageSpy).toHaveBeenCalledWith(
        userId,
        "app-stripe-1",
        expect.objectContaining({ target_stage: "interview" })
      );

      querySpy.mockRestore();
      insertSpy.mockRestore();
      stageSpy.mockRestore();
    });

    it("respects stage lock invariant: does not mutate stage when locked, queues suggestion", async () => {
      const dbModule = await import("../src/db");

      const lockedApp = {
        id: "app-locked-2",
        userId,
        companyName: "Figma",
        companyDomain: "figma.com",
        roleTitle: "Staff Designer",
        currentStage: "interview",
        stageLocked: true, // LOCKED
      };

      const querySpy = vi.spyOn(dbModule.db.query.applications, "findMany").mockResolvedValueOnce([
        lockedApp as any,
      ]);

      const insertSpy = vi.spyOn(dbModule.db, "insert").mockReturnValue({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      } as any);

      const { ApplicationsService } = await import("../src/modules/applications/applications.service");
      const stageSpy = vi.spyOn(ApplicationsService, "applyAutomatedStageUpdate").mockResolvedValueOnce({
        application: lockedApp as any,
        stage_overridden: false,
        suggestion_queued: true,
      });

      const resolution = await ApplicationResolver.resolveAndApply(
        userId,
        "msg-locked-99",
        "recruiting@figma.com",
        "Offer of Employment - Figma",
        {
          detectedCompany: "Figma",
          detectedStage: "offer",
          confidenceScore: 0.98,
        },
        "mailbox-1"
      );

      expect(resolution.matchStatus).toBe("matched_auto");
      expect(resolution.stageUpdated).toBe(false);
      expect(resolution.suggestionQueued).toBe(true);

      querySpy.mockRestore();
      insertSpy.mockRestore();
      stageSpy.mockRestore();
    });

    it("queues untracked candidate when email indicates new application and no match exists", async () => {
      const dbModule = await import("../src/db");

      // No existing applications
      const querySpy = vi.spyOn(dbModule.db.query.applications, "findMany").mockResolvedValueOnce([]);

      const mailboxSelectSpy = vi.spyOn(dbModule.db, "select").mockReturnValue({
        from: () => ({
          where: () => [
            {
              id: "mailbox-1",
              userId,
              autoCreateApplications: false, // Do not auto-create without approval
            },
          ],
        }),
      } as any);

      const insertSpy = vi.spyOn(dbModule.db, "insert").mockReturnValue({
        values: () => ({
          onConflictDoUpdate: () => Promise.resolve(),
        }),
      } as any);

      const resolution = await ApplicationResolver.resolveAndApply(
        userId,
        "msg-new-app",
        "jobs@datadoghq.com",
        "Thank you for applying to Datadog",
        {
          detectedCompany: "Datadog",
          detectedRole: "Distributed Systems Engineer",
          detectedStage: "applied",
          confidenceScore: 0.95,
        },
        "mailbox-1"
      );

      expect(resolution.matchStatus).toBe("untracked_candidate");
      expect(resolution.matchedApplicationId).toBeNull();
      expect(resolution.suggestionQueued).toBe(true);

      querySpy.mockRestore();
      mailboxSelectSpy.mockRestore();
      insertSpy.mockRestore();
    });
  });

  describe("Fast Webhook Ingestion & Acknowledgement", () => {
    it("responds HTTP 204 immediately to valid Google Pub/Sub push notification", async () => {
      const dbModule = await import("../src/db");

      const mailboxAccount = {
        id: "mb-active-1",
        userId: "user-1",
        emailAddress: "user@example.com",
        isSyncEnabled: true,
      };

      const querySpy = vi
        .spyOn(dbModule.db.query.userMailboxAccounts, "findFirst")
        .mockResolvedValueOnce(mailboxAccount as any);

      const queueSpy = vi.spyOn(QueueService, "send").mockResolvedValueOnce({ id: "q-1" } as any);

      const pubSubData = Buffer.from(
        JSON.stringify({
          emailAddress: "user@example.com",
          historyId: "998877",
        })
      ).toString("base64");

      const start = Date.now();
      const res = await app.inject({
        method: "POST",
        url: "/api/mailbox/webhook?secret=dev-webhook-secret",
        payload: {
          message: {
            data: pubSubData,
            messageId: "pubsub-msg-101",
            publishTime: new Date().toISOString(),
          },
          subscription: "projects/track/subscriptions/gmail-sub",
        },
      });
      const duration = Date.now() - start;

      // Fast acknowledgement: HTTP 204 in under 100ms
      expect(res.statusCode).toBe(204);
      expect(duration).toBeLessThan(200);

      expect(queueSpy).toHaveBeenCalledWith(
        "gmail_sync",
        expect.objectContaining({
          userId: "user-1",
          mailboxAccountId: "mb-active-1",
          historyId: "998877",
        }),
        expect.anything()
      );

      querySpy.mockRestore();
      queueSpy.mockRestore();
    });
  });
});
