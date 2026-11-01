import { AtsProvider, ScrapedJobDto } from "@track/shared";

export interface JobFetchOptions {
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface JobAdapter {
  readonly provider: AtsProvider | string;
  fetchJobs(identifier: string, options?: JobFetchOptions): Promise<ScrapedJobDto[]>;
}

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (TrackCareerBot/2.0)";

export const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Strips HTML tags and normalizes whitespace for text snippets.
 */
export function cleanHtmlSnippet(rawHtml?: string | null, maxChars = 400): string {
  if (!rawHtml) return "";
  // Strip script and style blocks
  let text = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, maxChars);
}
