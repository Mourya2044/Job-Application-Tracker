import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class AshbyAdapter implements JobAdapter {
  readonly provider = "ashby" as const;

  async fetchJobs(companySlug: string, options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const slug = companySlug.trim().toLowerCase();
    const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
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
        throw new Error(`Ashby API error: HTTP ${response.status} for board ${slug}`);
      }

      const data = (await response.json()) as { jobs?: any[] };
      const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);
      const jobs: ScrapedJobDto[] = [];

      for (const item of data.jobs || []) {
        const jobId = String(item.id);
        const title = item.title || "Untitled Role";
        const jobUrl = item.jobUrl || `https://jobs.ashbyhq.com/${slug}/${jobId}`;

        const location = item.locationName || "Remote";
        const isRemote =
          Boolean(item.isRemote) || location.toLowerCase().includes("remote");
        const deptName = item.departmentName || null;

        let salaryStr: string | null = null;
        const comp = item.compensation;
        if (comp && comp.minCompensation && comp.maxCompensation) {
          const curr = comp.currency || "USD";
          salaryStr = `${curr} ${Number(comp.minCompensation).toLocaleString("en-US")} - ${Number(comp.maxCompensation).toLocaleString("en-US")}`;
        }

        const snippet = cleanHtmlSnippet(item.descriptionHtml);

        jobs.push({
          id: `ashby-${slug}-${jobId}`,
          title,
          company_name: companyName,
          company_domain: `${slug}.com`,
          location,
          remote_type: isRemote ? "remote" : "hybrid/onsite",
          department: deptName,
          url: jobUrl,
          salary_range: salaryStr,
          description_snippet: snippet,
          source_type: "ats_ashby",
          posted_at: new Date().toISOString(),
        });
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Ashby adapter timed out after ${timeoutMs}ms for ${slug}`);
      }
      throw err;
    }
  }
}
