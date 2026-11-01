import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class RemotiveAdapter implements JobAdapter {
  readonly provider = "remotive" as const;

  async fetchJobs(query: string = "software", options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const q = (query || "software").trim();
    const limit = options.limit || 25;
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=${limit}`;
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
        throw new Error(`Remotive API error: HTTP ${response.status}`);
      }

      const data = (await response.json()) as { jobs?: any[] };
      const jobs: ScrapedJobDto[] = [];

      for (const item of data.jobs || []) {
        if (!item || !item.title) continue;

        const jobId = String(item.id);
        const title = item.title;
        const company = item.company_name || "Tech Company";
        const applyUrl = item.url || `https://remotive.com/remote-jobs/${jobId}`;
        const location = item.candidate_required_location || "Remote";
        const salary = item.salary || null;
        const snippet = cleanHtmlSnippet(item.description);
        const dept = item.category || "Engineering";

        jobs.push({
          id: `rem-${jobId}`,
          title,
          company_name: company,
          company_domain: `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          location,
          remote_type: "remote",
          department: dept,
          url: applyUrl,
          salary_range: salary,
          description_snippet: snippet,
          source_type: "remotive",
          posted_at: item.publication_date || new Date().toISOString(),
        });

        if (jobs.length >= limit) break;
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Remotive adapter timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
