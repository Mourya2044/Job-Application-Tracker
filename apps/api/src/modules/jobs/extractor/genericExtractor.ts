import { ScrapedJobDto } from "@track/shared";
import { cleanHtmlSnippet, DEFAULT_TIMEOUT_MS, USER_AGENT } from "../adapters/base";
import { AdapterRegistry } from "../adapters";
import { validateSafeUrl } from "./ssrf";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB safety ceiling
const MAX_REDIRECTS = 5;

export interface ExtractedJobResult {
  job: ScrapedJobDto;
  technique: "ats_direct" | "schema_org_json_ld" | "semantic_dom_fallback";
  rawJsonLd?: Record<string, any> | null;
}

export class GenericCareerPageExtractor {
  /**
   * Safely fetches an external URL with SSRF validation at every hop,
   * size limits, and Content-Type verification.
   */
  static async fetchSafeHtml(targetUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ html: string; finalUrl: string }> {
    let currentUrl = targetUrl;
    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      const validatedUrl = await validateSafeUrl(currentUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(validatedUrl.toString(), {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "manual", // Handle redirects manually for SSRF verification
          signal: controller.signal,
        });

        // Handle HTTP redirects safely
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const locationHeader = response.headers.get("location");
          if (!locationHeader) {
            throw new Error(`Received HTTP ${response.status} redirect without Location header`);
          }
          currentUrl = new URL(locationHeader, validatedUrl).toString();
          redirectCount++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status} ${response.statusText} fetching ${validatedUrl.hostname}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (
          !contentType.includes("text/html") &&
          !contentType.includes("application/xhtml") &&
          !contentType.includes("text/plain")
        ) {
          throw new Error(`Unsupported response Content-Type: '${contentType}'. Expected HTML document.`);
        }

        // Stream reader enforcing MAX_RESPONSE_BYTES
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Unable to read response body stream.");
        }

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              controller.abort();
              throw new Error(`Response size exceeded safe limit of ${MAX_RESPONSE_BYTES / (1024 * 1024)}MB.`);
            }
            chunks.push(value);
          }
        }

        const buffer = Buffer.concat(chunks);
        const html = buffer.toString("utf-8");
        return { html, finalUrl: validatedUrl.toString() };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new Error(`Exceeded maximum redirect limit of ${MAX_REDIRECTS} hops.`);
  }

  /**
   * Main entrypoint: Extracts job posting details from an arbitrary career page URL.
   */
  static async extractFromUrl(targetUrl: string): Promise<ExtractedJobResult> {
    const parsed = await validateSafeUrl(targetUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/^\/+/g, "");

    // 1. Check for native ATS direct integration URLs
    if (hostname.includes("greenhouse.io")) {
      const slug = pathname.split("/")[0];
      if (slug) {
        try {
          const jobs = await AdapterRegistry.getAdapter("greenhouse").fetchJobs(slug);
          const matched = jobs.find((j) => j.url.includes(targetUrl) || targetUrl.includes(j.url));
          if (matched) {
            return { job: matched, technique: "ats_direct" };
          }
          if (jobs.length > 0) {
            return { job: jobs[0], technique: "ats_direct" };
          }
        } catch {
          // Fall back to HTML extraction on error
        }
      }
    } else if (hostname.includes("lever.co")) {
      const slug = pathname.split("/")[0];
      if (slug) {
        try {
          const jobs = await AdapterRegistry.getAdapter("lever").fetchJobs(slug);
          const matched = jobs.find((j) => j.url.includes(targetUrl) || targetUrl.includes(j.url));
          if (matched) {
            return { job: matched, technique: "ats_direct" };
          }
          if (jobs.length > 0) {
            return { job: jobs[0], technique: "ats_direct" };
          }
        } catch {
          // Fall back
        }
      }
    } else if (hostname.includes("ashbyhq.com")) {
      const slug = pathname.split("/")[0];
      if (slug) {
        try {
          const jobs = await AdapterRegistry.getAdapter("ashby").fetchJobs(slug);
          const matched = jobs.find((j) => j.url.includes(targetUrl) || targetUrl.includes(j.url));
          if (matched) {
            return { job: matched, technique: "ats_direct" };
          }
          if (jobs.length > 0) {
            return { job: jobs[0], technique: "ats_direct" };
          }
        } catch {
          // Fall back
        }
      }
    } else if (hostname.includes("workable.com")) {
      const slug = pathname.split("/")[0];
      if (slug) {
        try {
          const jobs = await AdapterRegistry.getAdapter("workable").fetchJobs(slug);
          const matched = jobs.find((j) => j.url.includes(targetUrl) || targetUrl.includes(j.url));
          if (matched) {
            return { job: matched, technique: "ats_direct" };
          }
          if (jobs.length > 0) {
            return { job: jobs[0], technique: "ats_direct" };
          }
        } catch {
          // Fall back
        }
      }
    }

    // 2. Fetch HTML content safely
    const { html, finalUrl } = await this.fetchSafeHtml(targetUrl);

    // 3. Extract Schema.org JSON-LD (@type: "JobPosting")
    const jsonLdResult = this.extractSchemaOrgJsonLd(html, finalUrl);
    if (jsonLdResult) {
      return {
        job: jsonLdResult,
        technique: "schema_org_json_ld",
      };
    }

    // 4. Fallback: Semantic DOM & OpenGraph metadata extraction
    const domResult = this.extractSemanticDomFallback(html, finalUrl);
    return {
      job: domResult,
      technique: "semantic_dom_fallback",
    };
  }

  /**
   * Searches HTML for <script type="application/ld+json"> containing @type: "JobPosting".
   */
  static extractSchemaOrgJsonLd(html: string, pageUrl: string): ScrapedJobDto | null {
    const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;

    const parsedUrl = new URL(pageUrl);
    const domainFallback = parsedUrl.hostname;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      const rawContent = match[1]?.trim();
      if (!rawContent) continue;

      try {
        const parsed = JSON.parse(rawContent);
        let jobObj: any = null;

        if (Array.isArray(parsed)) {
          jobObj = parsed.find((item) => item?.["@type"] === "JobPosting");
        } else if (typeof parsed === "object" && parsed !== null) {
          if (parsed["@type"] === "JobPosting") {
            jobObj = parsed;
          } else if (Array.isArray(parsed["@graph"])) {
            jobObj = parsed["@graph"].find((item: any) => item?.["@type"] === "JobPosting");
          }
        }

        if (jobObj) {
          const title = String(jobObj.title || "Untitled Role").trim();

          let company = "Company";
          const org = jobObj.hiringOrganization;
          if (typeof org === "object" && org !== null) {
            company = org.name || "Company";
          } else if (typeof org === "string") {
            company = org;
          }

          let location = "Remote";
          const locVal = jobObj.jobLocation;
          if (locVal) {
            if (typeof locVal === "object") {
              const addr = Array.isArray(locVal) ? locVal[0]?.address : locVal.address;
              if (typeof addr === "object" && addr !== null) {
                const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
                if (parts.length > 0) location = parts.join(", ");
              } else if (typeof addr === "string") {
                location = addr;
              }
            } else if (typeof locVal === "string") {
              location = locVal;
            }
          }

          let salary: string | null = null;
          const baseSal = jobObj.baseSalary;
          if (baseSal && typeof baseSal === "object") {
            const curr = baseSal.currency || "USD";
            const val = baseSal.value;
            if (val && typeof val === "object") {
              if (val.minValue && val.maxValue) {
                salary = `${curr} ${Number(val.minValue).toLocaleString("en-US")} - ${Number(val.maxValue).toLocaleString("en-US")}`;
              } else if (val.value) {
                salary = `${curr} ${Number(val.value).toLocaleString("en-US")}`;
              }
            }
          }

          const snippet = cleanHtmlSnippet(jobObj.description);
          const isRemote =
            location.toLowerCase().includes("remote") ||
            title.toLowerCase().includes("remote") ||
            jobObj.jobLocationType === "TELECOMMUTE";

          return {
            id: `jsonld-${Math.abs(this.hashCode(pageUrl))}`,
            title,
            company_name: company,
            company_domain: domainFallback,
            location: location || "Remote",
            remote_type: isRemote ? "remote" : "hybrid/onsite",
            department: jobObj.occupationalCategory || null,
            url: pageUrl,
            salary_range: salary,
            description_snippet: snippet,
            source_type: "json_ld",
            posted_at: jobObj.datePosted ? new Date(jobObj.datePosted).toISOString() : new Date().toISOString(),
          };
        }
      } catch {
        // Skip malformed JSON-LD scripts
      }
    }

    return null;
  }

  /**
   * Fallback extractor using HTML semantic tags, OpenGraph metadata, and meta tags.
   */
  static extractSemanticDomFallback(html: string, pageUrl: string): ScrapedJobDto {
    const parsedUrl = new URL(pageUrl);
    const domainFallback = parsedUrl.hostname;

    // 1. Title: og:title -> <h1> -> <title>
    let title = this.extractMetaContent(html, "property", "og:title") || this.extractMetaContent(html, "name", "twitter:title");
    if (!title) {
      const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
      if (h1Match) {
        title = cleanHtmlSnippet(h1Match[1], 100);
      }
    }
    if (!title) {
      const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (titleMatch) {
        title = cleanHtmlSnippet(titleMatch[1], 100);
        // Clean common suffix patterns: "Software Engineer - Stripe Careers"
        if (title.includes(" - ")) title = title.split(" - ")[0].trim();
        else if (title.includes(" | ")) title = title.split(" | ")[0].trim();
      }
    }
    if (!title) title = "Role Opportunity";

    // 2. Company: og:site_name -> meta author -> domain
    let company = this.extractMetaContent(html, "property", "og:site_name") || this.extractMetaContent(html, "name", "author");
    if (!company) {
      const parts = domainFallback.split(".");
      company = parts.length >= 2 ? parts[parts.length - 2] : "Company";
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }

    // 3. Description: og:description -> meta description -> first paragraphs
    let description = this.extractMetaContent(html, "property", "og:description") || this.extractMetaContent(html, "name", "description");
    if (!description) {
      const pMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
      const paragraphs: string[] = [];
      let p: RegExpExecArray | null;
      while ((p = pMatch.exec(html)) !== null && paragraphs.length < 3) {
        const text = cleanHtmlSnippet(p[1], 200);
        if (text.length > 20) paragraphs.push(text);
      }
      description = paragraphs.join(" ");
    }
    const snippet = cleanHtmlSnippet(description, 350);

    const isRemote =
      title.toLowerCase().includes("remote") ||
      snippet.toLowerCase().includes("remote") ||
      snippet.toLowerCase().includes("work from anywhere");

    return {
      id: `dom-${Math.abs(this.hashCode(pageUrl))}`,
      title,
      company_name: company,
      company_domain: domainFallback,
      location: isRemote ? "Remote" : "See Job URL",
      remote_type: isRemote ? "remote" : "hybrid/onsite",
      department: "General",
      url: pageUrl,
      salary_range: null,
      description_snippet: snippet,
      source_type: "html_heuristic",
      posted_at: new Date().toISOString(),
    };
  }

  private static extractMetaContent(html: string, attrName: "property" | "name", attrVal: string): string | null {
    const regex = new RegExp(`<meta\\b[^>]*${attrName}=["']${attrVal}["'][^>]*content=["']([^"']*)["']`, "i");
    const match = regex.exec(html);
    if (match && match[1]) {
      return cleanHtmlSnippet(match[1]);
    }
    // Check reversed content before property/name
    const revRegex = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrVal}["']`, "i");
    const revMatch = revRegex.exec(html);
    if (revMatch && revMatch[1]) {
      return cleanHtmlSnippet(revMatch[1]);
    }
    return null;
  }

  private static hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }
}
