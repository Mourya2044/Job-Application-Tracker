import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class RemoteOKAdapter implements JobAdapter {
  readonly provider = "remoteok" as const;

  async fetchJobs(tagOrQuery: string = "software", options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const tag = (tagOrQuery || "software").trim().toLowerCase().replace(/\s+/g, "-");
    const url = `https://remoteok.com/api?tag=${encodeURIComponent(tag)}`;
    const limit = options.limit || 25;
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
        throw new Error(`RemoteOK API error: HTTP ${response.status}`);
      }

      const data = (await response.json()) as any[];
      const jobs: ScrapedJobDto[] = [];

      for (const item of Array.isArray(data) ? data : []) {
        if (!item || typeof item !== "object" || !item.position) continue;

        const jobId = String(item.id);
        const title = item.position;
        const company = item.company || "Tech Company";
        const applyUrl = item.url || `https://remoteok.com/remote-jobs/${jobId}`;
        const location = item.location || "Remote";

        let salary: string | null = null;
        if (item.salary) {
          salary = String(item.salary);
        } else if (item.salary_min && item.salary_max) {
          salary = `$${Number(item.salary_min).toLocaleString("en-US")} - $${Number(item.salary_max).toLocaleString("en-US")}`;
        }

        const snippet = cleanHtmlSnippet(item.description);
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const dept = tags[0] || "Engineering";

        jobs.push({
          id: `rok-${jobId}`,
          title,
          company_name: company,
          company_domain: `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          location,
          remote_type: "remote",
          department: dept,
          url: applyUrl,
          salary_range: salary,
          description_snippet: snippet,
          source_type: "remoteok",
          posted_at: item.date || new Date().toISOString(),
        });

        if (jobs.length >= limit) break;
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`RemoteOK adapter timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
