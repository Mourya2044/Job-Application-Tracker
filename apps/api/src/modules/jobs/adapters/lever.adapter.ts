import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, JobAdapter, JobFetchOptions, USER_AGENT } from "./base";

export class LeverAdapter implements JobAdapter {
  readonly provider = "lever" as const;

  async fetchJobs(companySlug: string, options: JobFetchOptions = {}): Promise<ScrapedJobDto[]> {
    const slug = companySlug.trim().toLowerCase();
    const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
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
        throw new Error(`Lever API error: HTTP ${response.status} for board ${slug}`);
      }

      const data = (await response.json()) as any[];
      const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);
      const jobs: ScrapedJobDto[] = [];

      for (const item of Array.isArray(data) ? data : []) {
        const jobId = String(item.id);
        const title = item.text || "Untitled Role";
        const jobUrl = item.hostedUrl || `https://jobs.lever.co/${slug}/${jobId}`;

        const categories = item.categories || {};
        const location = categories.location || "Remote / Not Specified";
        const deptName = categories.department || categories.team || null;
        const commitment = categories.commitment || null;

        const isRemote =
          location.toLowerCase().includes("remote") ||
          title.toLowerCase().includes("remote") ||
          categories.workplaceType === "remote";

        const rawDesc = item.descriptionPlain || item.description || "";
        const snippet = cleanHtmlSnippet(rawDesc);

        let postedAt = new Date().toISOString();
        if (item.createdAt && typeof item.createdAt === "number") {
          postedAt = new Date(item.createdAt).toISOString();
        }

        jobs.push({
          id: `lever-${slug}-${jobId}`,
          title,
          company_name: companyName,
          company_domain: `${slug}.com`,
          location: commitment ? `${location} (${commitment})` : location,
          remote_type: isRemote ? "remote" : "hybrid/onsite",
          department: deptName,
          url: jobUrl,
          salary_range: null,
          description_snippet: snippet,
          source_type: "ats_lever",
          posted_at: postedAt,
        });
      }

      return jobs;
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        throw new Error(`Lever adapter timed out after ${timeoutMs}ms for ${slug}`);
      }
      throw err;
    }
  }
}
