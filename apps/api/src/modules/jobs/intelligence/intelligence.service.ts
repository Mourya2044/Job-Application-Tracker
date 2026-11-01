import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../../../db";
import { jobPostings, jobPostingObservations, JobPosting, companyCareerPages } from "../../../db/schema/jobs";
import { ScrapedJobDto } from "@track/shared";
import { JobNormalizer } from "../normalization/normalizer";

export interface ReconciliationSummary {
  companyName: string;
  totalScraped: number;
  createdCount: number;
  updatedCount: number;
  revivedCount: number;
  expiredCount: number;
  repostsCount: number;
  observationsRecorded: number;
}

export class JobIntelligenceService {
  /**
   * Reconciles incoming scraped postings for a company with historical database records:
   * - Tracks first_seen_at and updates last_seen_at
   * - Detects job expiration when active roles vanish
   * - Detects job revival when previously expired roles reappear
   * - Detects reposting when identical titles appear with new external identifiers
   * - Records granular change observations in job_posting_observations
   */
  static async reconcileCompanyPostings(
    companyName: string,
    scrapedJobs: ScrapedJobDto[],
    companyDomain?: string | null,
    careerPageId?: string | null
  ): Promise<ReconciliationSummary> {
    const normalizedTargetComp = JobNormalizer.normalizeCompany(companyName);
    const now = new Date();

    return await db.transaction(async (tx) => {
      // 1. Fetch all existing postings for this company
      const existingRecords = await tx
        .select()
        .from(jobPostings)
        .where(sql`lower(${jobPostings.companyName}) = ${companyName.trim().toLowerCase()}`);

      const byExtId = new Map<string, JobPosting>();
      const byUrl = new Map<string, JobPosting>();
      const byNormalizedTitle = new Map<string, JobPosting>();

      for (const p of existingRecords) {
        if (p.externalJobId) byExtId.set(p.externalJobId, p);
        if (p.jobUrl) {
          const cleanUrl = p.jobUrl.split("?")[0].replace(/\/+$/, "").toLowerCase();
          byUrl.set(cleanUrl, p);
        }
        const normTitle = JobNormalizer.normalizeTitle(p.roleTitle).toLowerCase();
        if (!byNormalizedTitle.has(normTitle) || !p.isExpired) {
          byNormalizedTitle.set(normTitle, p);
        }
      }

      const seenPostingIds = new Set<string>();
      let createdCount = 0;
      let updatedCount = 0;
      let revivedCount = 0;
      let repostsCount = 0;
      let observationsCount = 0;

      for (const scraped of scrapedJobs) {
        const cleanUrl = scraped.url.split("?")[0].replace(/\/+$/, "").toLowerCase();
        const extId = scraped.id || null;
        const norm = JobNormalizer.normalizeJob(scraped);

        let matched: JobPosting | undefined;
        if (extId && byExtId.has(extId)) {
          matched = byExtId.get(extId);
        } else if (cleanUrl && byUrl.has(cleanUrl)) {
          matched = byUrl.get(cleanUrl);
        }

        if (matched) {
          // Existing posting seen again
          seenPostingIds.add(matched.id);

          const isRevived = matched.isExpired;
          const salaryChanged = Boolean(
            norm.parsedSalary?.raw && norm.parsedSalary.raw !== matched.salaryRange
          );

          await tx
            .update(jobPostings)
            .set({
              lastSeenAt: now,
              isExpired: false,
              expiredAt: null,
              salaryRange: norm.parsedSalary?.raw || matched.salaryRange,
              location: norm.normalizedLocation || matched.location,
              department: scraped.department || matched.department,
              updatedAt: now,
            })
            .where(eq(jobPostings.id, matched.id));

          if (isRevived) {
            revivedCount++;
            await tx.insert(jobPostingObservations).values({
              jobPostingId: matched.id,
              observedAt: now,
              salaryRange: norm.parsedSalary?.raw || matched.salaryRange,
              location: norm.normalizedLocation || matched.location,
              isActiveDuringScrape: true,
              changeType: "revived",
            });
            observationsCount++;
          } else if (salaryChanged) {
            await tx.insert(jobPostingObservations).values({
              jobPostingId: matched.id,
              observedAt: now,
              salaryRange: norm.parsedSalary?.raw || matched.salaryRange,
              location: norm.normalizedLocation || matched.location,
              isActiveDuringScrape: true,
              changeType: "salary_changed",
            });
            observationsCount++;
          }

          updatedCount++;
        } else {
          // New posting or Reposting
          const normTitleLower = norm.normalizedTitle.toLowerCase();
          const prior = byNormalizedTitle.get(normTitleLower);

          let repostDetected = false;
          let originalPostingId: string | null = null;

          if (prior && prior.id !== extId) {
            repostDetected = true;
            originalPostingId = prior.id;
            repostsCount++;
          }

          const [created] = await tx
            .insert(jobPostings)
            .values({
              externalJobId: extId,
              sourceType: scraped.source_type,
              companyCareerPageId: careerPageId || null,
              companyName: companyName.trim(),
              companyDomain: companyDomain || scraped.company_domain || null,
              roleTitle: scraped.title,
              location: norm.normalizedLocation || null,
              salaryRange: norm.parsedSalary?.raw || null,
              jobUrl: scraped.url,
              department: scraped.department || null,
              descriptionSnippet: scraped.description_snippet || null,
              firstSeenAt: now,
              lastSeenAt: now,
              isExpired: false,
              expiredAt: null,
              repostDetected,
              originalPostingId,
            })
            .returning();

          seenPostingIds.add(created.id);
          createdCount++;

          await tx.insert(jobPostingObservations).values({
            jobPostingId: created.id,
            observedAt: now,
            salaryRange: norm.parsedSalary?.raw || null,
            location: norm.normalizedLocation || null,
            isActiveDuringScrape: true,
            changeType: repostDetected ? "repost" : "initial_discovery",
          });
          observationsCount++;
        }
      }

      // 2. Identify expired jobs: existing active jobs for this company not seen in this scrape
      let expiredCount = 0;
      for (const p of existingRecords) {
        if (!p.isExpired && !seenPostingIds.has(p.id)) {
          await tx
            .update(jobPostings)
            .set({
              isExpired: true,
              expiredAt: now,
              updatedAt: now,
            })
            .where(eq(jobPostings.id, p.id));

          await tx.insert(jobPostingObservations).values({
            jobPostingId: p.id,
            observedAt: now,
            salaryRange: p.salaryRange,
            location: p.location,
            isActiveDuringScrape: false,
            changeType: "expired",
          });

          expiredCount++;
          observationsCount++;
        }
      }

      // 3. Update career page statistics if careerPageId provided
      if (careerPageId) {
        await tx
          .update(companyCareerPages)
          .set({
            lastSyncedAt: now,
            lastSyncStatus: "success",
            totalJobsFound: scrapedJobs.length,
            updatedAt: now,
          })
          .where(eq(companyCareerPages.id, careerPageId));
      }

      return {
        companyName,
        totalScraped: scrapedJobs.length,
        createdCount,
        updatedCount,
        revivedCount,
        expiredCount,
        repostsCount,
        observationsRecorded: observationsCount,
      };
    });
  }

  /**
   * Retrieves historical observation timeline for a specific job posting.
   */
  static async getJobHistory(jobId: string) {
    return await db.query.jobPostingObservations.findMany({
      where: eq(jobPostingObservations.jobPostingId, jobId),
      orderBy: [desc(jobPostingObservations.observedAt)],
    });
  }
}
