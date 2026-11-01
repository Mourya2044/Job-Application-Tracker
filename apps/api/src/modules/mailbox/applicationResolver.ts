import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../../db";
import { applications, ApplicationRecord } from "../../db/schema/applications";
import { emailLogs, userMailboxAccounts } from "../../db/schema/mailbox";
import { LifecycleStage, MatchStatus } from "@track/shared";
import { ApplicationsService } from "../applications/applications.service";
import { JobNormalizer } from "../jobs/normalization/normalizer";
import { JobDeduplicator } from "../jobs/deduplication/deduplicator";

export interface ExtractedEmailSignals {
  detectedCompany?: string | null;
  detectedRole?: string | null;
  detectedStage?: LifecycleStage | null;
  recruiterName?: string | null;
  interviewDate?: string | null;
  meetingLink?: string | null;
  nextStep?: string | null;
  confidenceScore: number;
}

export interface ResolutionResult {
  matchStatus: MatchStatus;
  matchedApplicationId?: string | null;
  stageUpdated: boolean;
  suggestionQueued: boolean;
  explanation: string;
}

export class ApplicationResolver {
  /**
   * Resolves an incoming email against the user's existing tracked applications:
   * 1. Extracts sender domain and company
   * 2. Matches against user's applications by domain and normalized company
   * 3. Respects stage lock invariants and terminal state restrictions
   * 4. Enqueues suggestions if confidence is below threshold
   * 5. Handles new untracked application candidates
   */
  static async resolveAndApply(
    userId: string,
    messageId: string,
    sender: string,
    subject: string,
    signals: ExtractedEmailSignals,
    mailboxAccountId: string
  ): Promise<ResolutionResult> {
    // 1. Extract sender domain
    let senderDomain: string | null = null;
    const emailMatch = sender.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      senderDomain = emailMatch[1].toLowerCase();
    }

    const companyGuess = signals.detectedCompany || this.extractCompanyFromSubjectOrSender(subject, senderDomain);
    const normalizedCompany = JobNormalizer.normalizeCompany(companyGuess);

    // 2. Query user's existing applications
    const userApps = await db.query.applications.findMany({
      where: eq(applications.userId, userId),
      orderBy: [desc(applications.lastStatusChangeAt)],
    });

    let bestMatch: ApplicationRecord | null = null;
    let matchScore = 0.0;
    let matchReason = "";

    for (const app of userApps) {
      let currentScore = 0.0;
      let reasons: string[] = [];

      // Check Domain Match (high precision)
      if (
        senderDomain &&
        app.companyDomain &&
        (senderDomain === app.companyDomain || senderDomain.endsWith(`.${app.companyDomain}`))
      ) {
        currentScore += 0.50;
        reasons.push("domain match");
      }

      // Check Company Name Similarity
      const appNormComp = JobNormalizer.normalizeCompany(app.companyName);
      if (normalizedCompany && appNormComp) {
        if (normalizedCompany === appNormComp) {
          currentScore += 0.40;
          reasons.push("exact company match");
        } else {
          const sim = JobDeduplicator.tokenSortRatio(normalizedCompany, appNormComp);
          if (sim > 0.8) {
            currentScore += 0.30;
            reasons.push(`${Math.round(sim * 100)}% company similarity`);
          }
        }
      }

      // Check Role Similarity if role was detected
      if (signals.detectedRole && app.roleTitle) {
        const titleSim = JobDeduplicator.tokenSortRatio(
          JobNormalizer.normalizeTitle(signals.detectedRole),
          JobNormalizer.normalizeTitle(app.roleTitle)
        );
        if (titleSim > 0.7) {
          currentScore += 0.20;
          reasons.push("role title match");
        }
      }

      if (currentScore > matchScore) {
        matchScore = currentScore;
        bestMatch = app;
        matchReason = reasons.join(", ");
      }
    }

    // 3. Evaluation of Match
    if (bestMatch && matchScore >= 0.70) {
      // Confident match found
      let stageUpdated = false;
      let suggestionQueued = false;

      if (signals.detectedStage && signals.detectedStage !== bestMatch.currentStage) {
        const updateResult = await ApplicationsService.applyAutomatedStageUpdate(userId, bestMatch.id, {
          target_stage: signals.detectedStage,
          reason: `Email update: ${subject} (${matchReason})`,
          confidence_score: signals.confidenceScore,
          email_message_id: messageId,
          email_subject: subject,
          decision_metadata: {
            sender,
            sender_domain: senderDomain,
            recruiter: signals.recruiterName,
            interview_date: signals.interviewDate,
            meeting_link: signals.meetingLink,
          },
        });

        stageUpdated = updateResult.stage_overridden;
        suggestionQueued = updateResult.suggestion_queued;
      }

      // Record in email_logs
      await this.recordEmailLog(userId, messageId, sender, subject, {
        detectedCompany: companyGuess,
        detectedStage: signals.detectedStage,
        matchedApplicationId: bestMatch.id,
        matchStatus: "matched_auto",
        signals,
      });

      return {
        matchStatus: "matched_auto",
        matchedApplicationId: bestMatch.id,
        stageUpdated,
        suggestionQueued,
        explanation: `Matched existing application '${bestMatch.companyName} - ${bestMatch.roleTitle}' via ${matchReason}.`,
      };
    } else if (bestMatch && matchScore >= 0.40) {
      // Ambiguous / suggestive match: do not auto-mutate
      await this.recordEmailLog(userId, messageId, sender, subject, {
        detectedCompany: companyGuess,
        detectedStage: signals.detectedStage,
        matchedApplicationId: bestMatch.id,
        matchStatus: "suggested",
        signals,
      });

      return {
        matchStatus: "suggested",
        matchedApplicationId: bestMatch.id,
        stageUpdated: false,
        suggestionQueued: true,
        explanation: `Potential match '${bestMatch.companyName}' identified with moderate confidence (${Math.round(matchScore * 100)}%). Queued for user review.`,
      };
    }

    // 4. No existing match found: Untracked Candidate Application
    const [mailbox] = await db
      .select()
      .from(userMailboxAccounts)
      .where(eq(userMailboxAccounts.id, mailboxAccountId));

    if (mailbox && mailbox.autoCreateApplications && companyGuess) {
      // Auto-create is enabled
      const newApp = await ApplicationsService.create(userId, {
        company_name: companyGuess,
        company_domain: senderDomain,
        role_title: signals.detectedRole || "Applied Position",
        current_stage: signals.detectedStage || "applied",
        tags: [],
        manual_notes: `Discovered automatically from email: ${subject}`,
      });

      await this.recordEmailLog(userId, messageId, sender, subject, {
        detectedCompany: companyGuess,
        detectedStage: signals.detectedStage || "applied",
        matchedApplicationId: newApp.id,
        matchStatus: "matched_auto",
        signals,
      });

      return {
        matchStatus: "matched_auto",
        matchedApplicationId: newApp.id,
        stageUpdated: true,
        suggestionQueued: false,
        explanation: `New application created automatically for '${companyGuess}'.`,
      };
    }

    // Otherwise record in pending discoveries
    await this.recordEmailLog(userId, messageId, sender, subject, {
      detectedCompany: companyGuess,
      detectedStage: signals.detectedStage,
      matchedApplicationId: null,
      matchStatus: "untracked_candidate",
      signals,
    });

    return {
      matchStatus: "untracked_candidate",
      matchedApplicationId: null,
      stageUpdated: false,
      suggestionQueued: true,
      explanation: `New potential application for '${companyGuess || "Company"}' detected and queued in pending inbox.`,
    };
  }

  private static extractCompanyFromSubjectOrSender(subject: string, domain?: string | null): string {
    if (domain) {
      const parts = domain.split(".");
      if (parts.length >= 2 && !["gmail", "yahoo", "outlook", "hotmail", "icloud"].includes(parts[0])) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
    }

    // Try extracting from "at [Company]" in subject
    const atMatch = subject.match(/\bat\s+([A-Z][a-zA-Z0-9&]+)/);
    if (atMatch) {
      return atMatch[1];
    }

    // Try extracting from "[Company] application"
    const compMatch = subject.match(/([A-Z][a-zA-Z0-9&]+)\s+(?:application|career|interview)/i);
    if (compMatch) {
      return compMatch[1];
    }

    return "Unknown Company";
  }

  private static async recordEmailLog(
    userId: string,
    messageId: string,
    sender: string,
    subject: string,
    details: {
      detectedCompany?: string | null;
      detectedStage?: string | null;
      matchedApplicationId?: string | null;
      matchStatus: MatchStatus;
      signals: any;
    }
  ) {
    // Idempotent upsert by (user_id, message_id)
    await db
      .insert(emailLogs)
      .values({
        userId,
        messageId,
        sender,
        subject,
        detectedCompany: details.detectedCompany || null,
        detectedStage: details.detectedStage || null,
        matchedApplicationId: details.matchedApplicationId || null,
        matchStatus: details.matchStatus,
        rawClassification: details.signals,
        processingStatus: "processed",
      })
      .onConflictDoUpdate({
        target: [emailLogs.userId, emailLogs.messageId],
        set: {
          detectedCompany: details.detectedCompany || null,
          detectedStage: details.detectedStage || null,
          matchedApplicationId: details.matchedApplicationId || null,
          matchStatus: details.matchStatus,
          rawClassification: details.signals,
          processedAt: new Date(),
        },
      });
  }
}
