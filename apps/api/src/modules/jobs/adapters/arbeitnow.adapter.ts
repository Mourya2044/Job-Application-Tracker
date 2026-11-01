import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class ArbeitnowAdapter implements JobAdapter {
  readonly provider = "arbeitnow" as const;

  async fetchJobs(query: string = "software", options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const qLower = (query || "software").trim().toLowerCase();
    const limit = options.limit || 25;
    const url = "https://www.arbeitnow.com/api/job-board-api";
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Arbeitnow API error: HTTP ${response.status}`);
      }

      const data = (await response.json()) as { data?: any[] };
      const jobs: ScrapedJobDto[] = [];

      for (const item of data.data || []) {
        if (!item || !item.title) continue;

        const title = item.title;
        const company = item.company_name || "Tech Company";
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const searchable = `${title} ${company} ${tags.join(" ")}`.toLowerCase();

        if (qLower && !searchable.includes(qLower)) {
          continue;
        }

        const slug = String(item.slug || Math.abs(title.length + company.length));
        const applyUrl = item.url || `https://www.arbeitnow.com/jobs/${slug}`;
        const location = item.location || "Remote";
        const isRemote = Boolean(item.remote) || location.toLowerCase().includes("remote");
        const snippet = cleanHtmlSnippet(item.description);
        const dept = tags[0] || "Engineering";

        jobs.push({
          id: `arb-${slug.slice(0, 32)}`,
          title,
          company_name: company,
          company_domain: `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          location,
          remote_type: isRemote ? "remote" : "hybrid/onsite",
          department: dept,
          url: applyUrl,
          salary_range: null,
          description_snippet: snippet,
          source_type: "arbeitnow",
          posted_at: item.created_at ? new Date(item.created_at * 1000).toISOString() : new Date().toISOString(),
        });

        if (jobs.length >= limit) break;
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Arbeitnow adapter timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
