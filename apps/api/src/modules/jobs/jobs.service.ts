import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  companyCareerPages,
  jobPostings,
  savedJobs,
  JobPosting,
  CompanyCareerPage,
  SavedJob,
} from "../../db/schema/jobs";
import {
  CompanyCareerPageCreateInput,
  JobSearchQueryInput,
  ScrapedJobDto,
} from "@track/shared";
import { AdapterRegistry, CURATED_COMPANIES } from "./adapters";
import { GenericCareerPageExtractor } from "./extractor/genericExtractor";
import { JobDeduplicator } from "./deduplication/deduplicator";
import { JobIntelligenceService, ReconciliationSummary } from "./intelligence/intelligence.service";
import { JobNormalizer } from "./normalization/normalizer";

export class JobsService {
  /**
   * Retrieves curated preset companies for quick testing and automated discovery.
   */
  static getCuratedCompanies() {
    return CURATED_COMPANIES;
  }

  /**
   * Searches and filters globally discovered market jobs.
   */
  static async searchJobs(params: JobSearchQueryInput & { includeExpired?: boolean; offset?: number }) {
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);

    const conditions = [];

    if (!params.includeExpired) {
      conditions.push(eq(jobPostings.isExpired, false));
    }

    if (params.query && params.query.trim()) {
      const term = `%${params.query.trim().toLowerCase()}%`;
      conditions.push(
        sql`(${ilike(jobPostings.roleTitle, term)} OR ${ilike(jobPostings.companyName, term)} OR ${ilike(jobPostings.department, term)})`
      );
    }

    if (params.location && params.location.trim()) {
      const locTerm = `%${params.location.trim().toLowerCase()}%`;
      conditions.push(ilike(jobPostings.location, locTerm));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countRes] = await Promise.all([
      db
        .select()
        .from(jobPostings)
        .where(whereClause)
        .orderBy(desc(jobPostings.lastSeenAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobPostings)
        .where(whereClause),
    ]);

    const total = Number(countRes[0]?.count || 0);

    return {
      total,
      limit,
      offset,
      items: items.map((p) => ({
        ...p,
        first_seen_at: p.firstSeenAt.toISOString(),
        last_seen_at: p.lastSeenAt.toISOString(),
        expired_at: p.expiredAt ? p.expiredAt.toISOString() : null,
        created_at: p.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Retrieves a single job posting by ID including historical change observations.
   */
  static async getJobById(jobId: string) {
    const [job] = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, jobId));

    if (!job) {
      const err = new Error("Job posting not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const observations = await JobIntelligenceService.getJobHistory(jobId);

    return {
      ...job,
      first_seen_at: job.firstSeenAt.toISOString(),
      last_seen_at: job.lastSeenAt.toISOString(),
      expired_at: job.expiredAt ? job.expiredAt.toISOString() : null,
      created_at: job.createdAt.toISOString(),
      observations: observations.map((o) => ({
        ...o,
        observed_at: o.observedAt.toISOString(),
      })),
    };
  }

  /**
   * Manages tracked company career pages.
   */
  static async listCareerPages(): Promise<CompanyCareerPage[]> {
    return await db.query.companyCareerPages.findMany({
      orderBy: [desc(companyCareerPages.updatedAt)],
    });
  }

  /**
   * Registers a new company career page for continuous discovery.
   */
  static async createCareerPage(input: CompanyCareerPageCreateInput): Promise<CompanyCareerPage> {
    const existing = await db.query.companyCareerPages.findFirst({
      where: eq(companyCareerPages.name, input.name.trim()),
    });

    if (existing) {
      const err = new Error(`A career page for '${input.name}' is already registered.`);
      (err as any).statusCode = 409;
      throw err;
    }

    const [created] = await db
      .insert(companyCareerPages)
      .values({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        provider: input.provider,
        domain: input.domain?.trim() || null,
        careerUrl: input.career_url || null,
        logoColor: input.logo_color || "#60a5fa",
        isActive: input.is_active ?? true,
        syncFrequencyHours: input.sync_frequency_hours ?? 24,
      })
      .returning();

    return created;
  }

  /**
   * Synchronizes a company career page using its configured adapter,
   * performs deduplication, and reconciles into market intelligence records.
   */
  static async syncCareerPage(pageId: string): Promise<ReconciliationSummary> {
    const [page] = await db
      .select()
      .from(companyCareerPages)
      .where(eq(companyCareerPages.id, pageId));

    if (!page) {
      const err = new Error("Company career page not found");
      (err as any).statusCode = 404;
      throw err;
    }

    const adapter = AdapterRegistry.getAdapter(page.provider);

    await db
      .update(companyCareerPages)
      .set({ lastSyncStatus: "syncing", lastErrorMessage: null })
      .where(eq(companyCareerPages.id, page.id));

    try {
      const scraped = await adapter.fetchJobs(page.slug);

      // Perform internal batch deduplication against duplicate postings
      const { uniqueJobs } = JobDeduplicator.deduplicateBatch(scraped, []);

      // Reconcile with historical market observations
      const summary = await JobIntelligenceService.reconcileCompanyPostings(
        page.name,
        uniqueJobs,
        page.domain,
        page.id
      );

      return summary;
    } catch (err: any) {
      await db
        .update(companyCareerPages)
        .set({
          lastSyncStatus: "error",
          lastErrorMessage: err.message,
          updatedAt: new Date(),
        })
        .where(eq(companyCareerPages.id, page.id));
      throw err;
    }
  }

  /**
   * Safely inspects and extracts job posting details from an arbitrary URL.
   */
  static async extractFromUrl(targetUrl: string) {
    return await GenericCareerPageExtractor.extractFromUrl(targetUrl);
  }

  /**
   * Aggregates live jobs across public feeds (RemoteOK, Remotive, Arbeitnow) with deduplication.
   */
  static async searchLiveAggregators(query = "software", limit = 20): Promise<ScrapedJobDto[]> {
    const results = await Promise.allSettled([
      AdapterRegistry.getAdapter("remoteok").fetchJobs(query, { limit }),
      AdapterRegistry.getAdapter("remotive").fetchJobs(query, { limit }),
      AdapterRegistry.getAdapter("arbeitnow").fetchJobs(query, { limit }),
    ]);

    const allScraped: ScrapedJobDto[] = [];
    for (const res of results) {
      if (res.status === "fulfilled") {
        allScraped.push(...res.value);
      }
    }

    // Deduplicate cross-source duplicates
    const { uniqueJobs } = JobDeduplicator.deduplicateBatch(allScraped, []);
    return uniqueJobs.slice(0, limit);
  }

  /**
   * Saves a job for a specific user (isolated from global market listings).
   */
  static async saveJob(
    userId: string,
    input: {
      jobPostingId?: string;
      title: string;
      companyName: string;
      location?: string;
      salaryRange?: string;
      jobUrl?: string;
      tags?: string[];
    }
  ): Promise<SavedJob> {
    const [saved] = await db
      .insert(savedJobs)
      .values({
        userId,
        jobPostingId: input.jobPostingId || null,
        title: input.title.trim(),
        companyName: input.companyName.trim(),
        location: input.location?.trim() || null,
        salaryRange: input.salaryRange?.trim() || null,
        jobUrl: input.jobUrl || null,
        tags: input.tags || [],
      })
      .returning();

    return saved;
  }

  /**
   * Retrieves all saved jobs for the authenticated user.
   */
  static async listSavedJobs(userId: string): Promise<SavedJob[]> {
    return await db.query.savedJobs.findMany({
      where: eq(savedJobs.userId, userId),
      orderBy: [desc(savedJobs.createdAt)],
    });
  }

  /**
   * Removes a saved job owned by the user.
   */
  static async removeSavedJob(userId: string, savedJobId: string): Promise<{ success: boolean }> {
    const [existing] = await db
      .select()
      .from(savedJobs)
      .where(and(eq(savedJobs.id, savedJobId), eq(savedJobs.userId, userId)));

    if (!existing) {
      const err = new Error("Saved job not found");
      (err as any).statusCode = 404;
      throw err;
    }

    await db.delete(savedJobs).where(eq(savedJobs.id, savedJobId));
    return { success: true };
  }
}
