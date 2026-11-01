import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class GreenhouseAdapter implements JobAdapter {
  readonly provider = "greenhouse" as const;

  async fetchJobs(companySlug: string, options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const slug = companySlug.trim().toLowerCase();
    const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
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
        throw new Error(`Greenhouse API error: HTTP ${response.status} for board ${slug}`);
      }

      const data = (await response.json()) as { jobs?: any[] };
      const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);
      const jobs: ScrapedJobDto[] = [];

      for (const item of data.jobs || []) {
        const jobId = String(item.id);
        const title = item.title || "Untitled Role";
        const jobUrl = item.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${jobId}`;

        const locData = item.location || {};
        const location = locData.name || "Remote / Not Specified";
        const isRemote =
          location.toLowerCase().includes("remote") || title.toLowerCase().includes("remote");

        const departments = item.departments || [];
        const deptName = departments[0]?.name || null;
        const snippet = cleanHtmlSnippet(item.content);

        jobs.push({
          id: `gh-${slug}-${jobId}`,
          title,
          company_name: companyName,
          company_domain: `${slug}.com`,
          location,
          remote_type: isRemote ? "remote" : "hybrid/onsite",
          department: deptName,
          url: jobUrl,
          salary_range: null,
          description_snippet: snippet,
          source_type: "ats_greenhouse",
          posted_at: item.updated_at || new Date().toISOString(),
        });
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Greenhouse adapter timed out after ${timeoutMs}ms for ${slug}`);
      }
      throw err;
    }
  }
}
