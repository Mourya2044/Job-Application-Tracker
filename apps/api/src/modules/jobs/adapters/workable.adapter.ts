import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class WorkableAdapter implements JobAdapter {
  readonly provider = "workable" as const;

  async fetchJobs(companySlug: string, options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const slug = companySlug.trim().toLowerCase();
    const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 404) {
        return [];
      }
      if (!response.ok) {
        throw new Error(`Workable API error: HTTP ${response.status} for account ${slug}`);
      }

      const data = (await response.json()) as { name?: string; jobs?: any[] };
      const companyName = data.name || slug.charAt(0).toUpperCase() + slug.slice(1);
      const jobs: ScrapedJobDto[] = [];

      for (const item of data.jobs || []) {
        const shortcode = String(item.shortcode || item.id || "");
        const title = item.title || "Untitled Role";
        const jobUrl = item.url || `https://apply.workable.com/${slug}/j/${shortcode}/`;

        const locParts = [item.city, item.country].filter(Boolean);
        const location = locParts.length > 0 ? locParts.join(", ") : "Remote";
        const isRemote =
          Boolean(item.telecommuting) || location.toLowerCase().includes("remote");
        const deptName = item.department || null;
        const snippet = cleanHtmlSnippet(item.description || `${title} at ${companyName}`);

        jobs.push({
          id: `wk-${slug}-${shortcode}`,
          title,
          company_name: companyName,
          company_domain: `${slug}.com`,
          location,
          remote_type: isRemote ? "remote" : "hybrid/onsite",
          department: deptName,
          url: jobUrl,
          salary_range: null,
          description_snippet: snippet,
          source_type: "ats_workable",
          posted_at: new Date().toISOString(),
        });
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Workable adapter timed out after ${timeoutMs}ms for ${slug}`);
      }
      throw err;
    }
  }
}
