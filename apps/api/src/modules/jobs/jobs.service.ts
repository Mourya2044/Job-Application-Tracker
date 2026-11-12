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
   * Searches and filters globally discovered market jobs, falling back to real-time aggregators if database is empty.
   */
  static async searchJobs(
    params: JobSearchQueryInput & { includeExpired?: boolean; offset?: number; source?: string; live?: boolean }
  ) {
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);
    const source = params.source?.toLowerCase().trim();

    // If a specific public aggregator is requested, bypass DB query and fetch directly
    if (source && source !== "all") {
      const liveJobs = await this.searchLiveAggregators(params.query || "software", {
        limit,
        source,
      });
      return {
        total: liveJobs.length,
        limit,
        offset: 0,
        items: liveJobs,
      };
    }

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

    // If database has records and live search was not explicitly forced, return them
    if (total > 0 && !params.live) {
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

    // Fallback: If DB is empty or live search requested, fetch from live public feeds!
    const liveJobs = await this.searchLiveAggregators(params.query || "software", {
      limit,
      source: params.source,
    });

    return {
      total: liveJobs.length,
      limit,
      offset: 0,
      items: liveJobs,
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
   * Seeds curated tech companies into company_career_pages if not already present.
   */
  static async seedPresets(): Promise<{ added: number; existing: number; pages: CompanyCareerPage[] }> {
    let added = 0;
    let existing = 0;
    for (const comp of CURATED_COMPANIES) {
      const found = await db.query.companyCareerPages.findFirst({
        where: eq(companyCareerPages.name, comp.name),
      });
      if (!found) {
        await db.insert(companyCareerPages).values({
          name: comp.name,
          slug: comp.slug,
          provider: comp.provider,
          domain: comp.domain,
          careerUrl: `https://${comp.domain}/careers`,
          logoColor: "#60a5fa",
          isActive: true,
          syncFrequencyHours: 24,
        });
        added++;
      } else {
        existing++;
      }
    }
    const pages = await this.listCareerPages();
    return { added, existing, pages };
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
   * Aggregates live jobs across public feeds (RemoteOK, Remotive, Arbeitnow) and ATS boards with deduplication.
   */
  static async searchLiveAggregators(
    query = "software",
    options: { limit?: number; source?: string } | number = 20
  ): Promise<ScrapedJobDto[]> {
    const opts = typeof options === "number" ? { limit: options } : options || {};
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const source = (opts.source || "all").toLowerCase().trim();
    const q = (query || "software").trim();

    const fetchPromises: Promise<ScrapedJobDto[]>[] = [];

    const safeFetch = async (adapterName: string, identifier: string, fetchOpts: any): Promise<ScrapedJobDto[]> => {
      try {
        const adapter = AdapterRegistry.getAdapter(adapterName);
        return await adapter.fetchJobs(identifier, fetchOpts);
      } catch (err: any) {
        console.warn(`[searchLiveAggregators] ${adapterName} adapter error:`, err?.message || err);
        return [];
      }
    };

    // 1. Check if query matches a curated company name or slug
    const matchedCompany = CURATED_COMPANIES.find(
      (c) =>
        c.name.toLowerCase() === q.toLowerCase() ||
        c.slug.toLowerCase() === q.toLowerCase()
    );

    if (matchedCompany) {
      fetchPromises.push(safeFetch(matchedCompany.provider, matchedCompany.slug, { limit }));
    }

    // 2. Route based on requested source
    if (source === "remoteok") {
      fetchPromises.push(safeFetch("remoteok", q, { limit }));
    } else if (source === "remotive") {
      fetchPromises.push(safeFetch("remotive", q, { limit }));
    } else if (source === "arbeitnow") {
      fetchPromises.push(safeFetch("arbeitnow", q, { limit }));
    } else if (source === "greenhouse") {
      const ghCompanies = CURATED_COMPANIES.filter((c) => c.provider === "greenhouse");
      const target = ghCompanies.find((c) => c.name.toLowerCase() === q.toLowerCase() || c.slug.toLowerCase() === q.toLowerCase()) || ghCompanies[0];
      fetchPromises.push(safeFetch("greenhouse", target.slug, { limit }));
    } else if (source === "lever") {
      const leverCompanies = CURATED_COMPANIES.filter((c) => c.provider === "lever");
      const target = leverCompanies.find((c) => c.name.toLowerCase() === q.toLowerCase() || c.slug.toLowerCase() === q.toLowerCase()) || leverCompanies[0];
      fetchPromises.push(safeFetch("lever", target.slug, { limit }));
    } else if (source === "ashby") {
      const ashbyCompanies = CURATED_COMPANIES.filter((c) => c.provider === "ashby");
      const target = ashbyCompanies.find((c) => c.name.toLowerCase() === q.toLowerCase() || c.slug.toLowerCase() === q.toLowerCase()) || ashbyCompanies[0];
      fetchPromises.push(safeFetch("ashby", target.slug, { limit }));
    } else {
      // "all" or default: query RemoteOK, Remotive, Arbeitnow
      fetchPromises.push(safeFetch("remoteok", q, { limit }));
      fetchPromises.push(safeFetch("remotive", q, { limit }));
      fetchPromises.push(safeFetch("arbeitnow", q, { limit }));

      // If general query and no specific company requested, also query Stripe for rich ATS postings
      if (!matchedCompany && (q === "software" || q.toLowerCase().includes("engineer") || q.toLowerCase().includes("developer"))) {
        fetchPromises.push(safeFetch("greenhouse", "stripe", { limit: 10 }));
      }
    }

    const results = await Promise.allSettled(fetchPromises);
    const allScraped: ScrapedJobDto[] = [];
    for (const res of results) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        allScraped.push(...res.value);
      }
    }

    // Enhance jobs with normalization: salary parsing and skill extraction
    const enhanced: ScrapedJobDto[] = allScraped.map((job) => {
      const norm = JobNormalizer.normalizeJob(job);
      const textToScan = `${job.title} ${job.description_snippet || ""}`;
      const skills = JobNormalizer.extractSkills(textToScan);
      return {
        ...job,
        salary_range: norm.parsedSalary?.raw || job.salary_range || null,
        salary_min: norm.parsedSalary?.minValue ?? null,
        salary_max: norm.parsedSalary?.maxValue ?? null,
        currency: norm.parsedSalary?.currency || "USD",
        skills,
      };
    });

    // Deduplicate cross-source duplicates
    const { uniqueJobs } = JobDeduplicator.deduplicateBatch(enhanced, []);
    const finalJobs = uniqueJobs.slice(0, limit);

    // Cache to DB in background so future DB searches are populated
    this.cacheJobsToDb(finalJobs).catch(() => {});

    return finalJobs;
  }

  /**
   * Caches discovered jobs to the database table in the background.
   */
  private static async cacheJobsToDb(jobs: ScrapedJobDto[]): Promise<void> {
    if (!jobs || jobs.length === 0) return;
    try {
      for (const job of jobs) {
        const existing = await db
          .select({ id: jobPostings.id })
          .from(jobPostings)
          .where(eq(jobPostings.jobUrl, job.url))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(jobPostings).values({
            externalJobId: job.id,
            sourceType: job.source_type,
            companyName: job.company_name,
            companyDomain: job.company_domain || null,
            roleTitle: job.title,
            location: job.location || null,
            salaryRange: job.salary_range || null,
            jobUrl: job.url,
            department: job.department || null,
            descriptionSnippet: job.description_snippet || null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            isExpired: false,
          });
        }
      }
    } catch {
      // Non-blocking background caching
    }
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
