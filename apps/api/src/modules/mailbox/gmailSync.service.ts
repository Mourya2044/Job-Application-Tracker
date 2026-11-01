import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { userMailboxAccounts, UserMailboxAccount } from "../../db/schema/mailbox";
import { GoogleOAuthService } from "./googleOAuth.service";
import { EmailHeuristicFilter } from "./heuristicFilter";
import { ApplicationResolver } from "./applicationResolver";
import { config } from "../../config";
import { LifecycleStage } from "@track/shared";

export interface SyncResult {
  mailboxId: string;
  historyId: string | null;
  messagesProcessed: number;
  matchedCount: number;
  suggestionsCount: number;
  untrackedCount: number;
  skippedNonRecruitingCount: number;
  recoveredFromExpiration: boolean;
}

export class GmailSyncService {
  /**
   * Sets up Google Cloud Pub/Sub push watch on user's mailbox.
   */
  static async setupWatch(mailbox: UserMailboxAccount): Promise<{ historyId: string; expiration: Date }> {
    const accessToken = await GoogleOAuthService.getValidAccessToken(mailbox);
    const pubsubTopic = mailbox.pubsubTopic || config.google.pubsubTopic;

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: pubsubTopic,
        labelIds: ["INBOX"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gmail watch registration failed: ${errText}`);
    }

    const data = (await response.json()) as { historyId: string; expiration: string };
    const expiration = new Date(Number(data.expiration));

    await db
      .update(userMailboxAccounts)
      .set({
        lastHistoryId: data.historyId,
        watchExpiration: expiration,
        updatedAt: new Date(),
      })
      .where(eq(userMailboxAccounts.id, mailbox.id));

    return { historyId: data.historyId, expiration };
  }

  /**
   * Incremental synchronization based on Gmail history ID with automatic recovery on expiration.
   */
  static async syncMailbox(
    mailboxId: string,
    options: { fullReconciliation?: boolean } = {}
  ): Promise<SyncResult> {
    const [mailbox] = await db
      .select()
      .from(userMailboxAccounts)
      .where(eq(userMailboxAccounts.id, mailboxId));

    if (!mailbox || !mailbox.isSyncEnabled) {
      throw new Error("Mailbox not found or sync is disabled");
    }

    const accessToken = await GoogleOAuthService.getValidAccessToken(mailbox);
    const startHistoryId = mailbox.lastHistoryId;

    let messageIdsToProcess: string[] = [];
    let newHistoryId: string | null = null;
    let recoveredFromExpiration = false;

    if (!startHistoryId || options.fullReconciliation) {
      // Full reconciliation: fetch recent inbox messages
      messageIdsToProcess = await this.fetchRecentMessageIds(accessToken, 30);
    } else {
      // Incremental history sync
      try {
        const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`;
        const resp = await fetch(historyUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (resp.status === 404 || resp.status === 400) {
          // History ID has expired or is invalid -> trigger full reconciliation
          recoveredFromExpiration = true;
          messageIdsToProcess = await this.fetchRecentMessageIds(accessToken, 30);
        } else if (!resp.ok) {
          throw new Error(`Gmail history fetch failed with HTTP ${resp.status}`);
        } else {
          const historyData = (await resp.json()) as {
            historyId?: string;
            history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
          };
          newHistoryId = historyData.historyId || null;

          for (const record of historyData.history || []) {
            for (const added of record.messagesAdded || []) {
              if (added.message?.id) {
                messageIdsToProcess.push(added.message.id);
              }
            }
          }
        }
      } catch (err: any) {
        if (err.message?.includes("HistoryId not found") || err.message?.includes("404")) {
          recoveredFromExpiration = true;
          messageIdsToProcess = await this.fetchRecentMessageIds(accessToken, 30);
        } else {
          throw err;
        }
      }
    }

    // Deduplicate message IDs
    const uniqueMessageIds = Array.from(new Set(messageIdsToProcess));

    let matchedCount = 0;
    let suggestionsCount = 0;
    let untrackedCount = 0;
    let skippedCount = 0;

    for (const msgId of uniqueMessageIds) {
      try {
        const msg = await this.fetchMessageDetails(accessToken, msgId);
        if (!msg) continue;

        // 1. Fast heuristic filtering
        const filterResult = EmailHeuristicFilter.inspectEmail(msg.sender, msg.subject, msg.snippet);
        if (!filterResult.isRecruitmentRelated) {
          skippedCount++;
          continue;
        }

        // 2. Classify email stage & extract hiring signals
        const signals = this.classifyHiringSignals(msg.subject, msg.snippet, filterResult.confidence);

        // 3. Resolve against applications
        const res = await ApplicationResolver.resolveAndApply(
          mailbox.userId,
          msgId,
          msg.sender,
          msg.subject,
          signals,
          mailbox.id
        );

        if (res.matchStatus === "matched_auto") matchedCount++;
        else if (res.matchStatus === "suggested") suggestionsCount++;
        else if (res.matchStatus === "untracked_candidate") untrackedCount++;
      } catch (err) {
        // Log individual message processing failure and continue with other messages
        console.error(`Error processing Gmail message ${msgId}:`, err);
      }
    }

    // Update checkpoint
    if (newHistoryId) {
      await db
        .update(userMailboxAccounts)
        .set({
          lastHistoryId: newHistoryId,
          updatedAt: new Date(),
        })
        .where(eq(userMailboxAccounts.id, mailbox.id));
    }

    return {
      mailboxId: mailbox.id,
      historyId: newHistoryId || startHistoryId,
      messagesProcessed: uniqueMessageIds.length,
      matchedCount,
      suggestionsCount,
      untrackedCount,
      skippedNonRecruitingCount: skippedCount,
      recoveredFromExpiration,
    };
  }

  private static async fetchRecentMessageIds(accessToken: string, maxResults = 30): Promise<string[]> {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`;
    const resp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      return [];
    }

    const data = (await resp.json()) as { messages?: Array<{ id: string }> };
    return (data.messages || []).map((m) => m.id);
  }

  private static async fetchMessageDetails(
    accessToken: string,
    messageId: string
  ): Promise<{ sender: string; subject: string; snippet: string } | null> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      return null;
    }

    const data = (await resp.json()) as {
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };

    let sender = "unknown@company.com";
    let subject = "No Subject";

    for (const h of data.payload?.headers || []) {
      if (h.name.toLowerCase() === "from") sender = h.value;
      if (h.name.toLowerCase() === "subject") subject = h.value;
    }

    return {
      sender,
      subject,
      snippet: data.snippet || "",
    };
  }

  private static classifyHiringSignals(
    subject: string,
    snippet: string,
    baseConfidence: number
  ) {
    const text = `${subject} ${snippet}`.toLowerCase();
    let detectedStage: LifecycleStage = "applied";
    let confidence = baseConfidence;

    if (
      text.includes("offer") ||
      text.includes("congratulations on the offer") ||
      text.includes("pleased to offer")
    ) {
      detectedStage = "offer";
      confidence = Math.max(confidence, 0.95);
    } else if (
      text.includes("interview") ||
      text.includes("schedule a call") ||
      text.includes("phone screen") ||
      text.includes("video call") ||
      text.includes("technical screen")
    ) {
      detectedStage = "interview";
      confidence = Math.max(confidence, 0.90);
    } else if (
      text.includes("regret to inform") ||
      text.includes("unfortunately") ||
      text.includes("not moving forward") ||
      text.includes("pursuing other candidates")
    ) {
      detectedStage = "rejected";
      confidence = Math.max(confidence, 0.92);
    } else if (text.includes("assessment") || text.includes("coding challenge")) {
      detectedStage = "screening";
      confidence = Math.max(confidence, 0.85);
    }

    // Meeting link extraction
    let meetingLink: string | null = null;
    const linkMatch = snippet.match(/https:\/\/(?:meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com\/l)\/[a-zA-Z0-9_-]+/);
    if (linkMatch) {
      meetingLink = linkMatch[0];
    }

    return {
      detectedStage,
      confidenceScore: confidence,
      meetingLink,
      recruiterName: null,
      interviewDate: null,
      nextStep: detectedStage === "interview" ? "Schedule or prepare for interview" : null,
    };
  }
}

