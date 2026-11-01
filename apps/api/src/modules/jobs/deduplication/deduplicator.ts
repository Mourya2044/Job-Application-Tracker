import { ScrapedJobDto } from "@track/shared";
import { JobNormalizer, NormalizedJob } from "../normalization/normalizer";

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "in",
  "at",
  "for",
  "with",
  "to",
  "of",
  "remote",
  "fulltime",
  "full",
  "time",
  "hybrid",
  "onsite",
  "role",
  "position",
  "job",
  "senior",
  "junior",
  "staff",
  "lead",
  "principal",
  "ii",
  "iii",
  "iv",
]);

export interface DuplicateMatchResult {
  isDuplicate: boolean;
  confidenceScore: number;
  jaccardScore: number;
  editDistanceScore: number;
  embeddingScore?: number;
  matchedJobId?: string;
  explanation: string;
}

export class JobDeduplicator {
  /**
   * Cleans text and extracts token set stripped of stopwords and punctuation.
   */
  static extractTokens(text?: string | null): Set<string> {
    if (!text) return new Set();
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, " ");
    const tokens = cleaned
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
    return new Set(tokens);
  }

  /**
   * Generates character n-gram shingles for sub-word Jaccard similarity.
   */
  static extractCharShingles(text?: string | null, n = 3): Set<string> {
    if (!text) return new Set();
    const s = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (s.length < n) return new Set([s]);
    const shingles = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) {
      shingles.add(s.slice(i, i + n));
    }
    return shingles;
  }

  /**
   * Calculates Jaccard Index: J(A, B) = |A ∩ B| / |A ∪ B|.
   */
  static jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    let intersectionCount = 0;
    for (const elem of setA) {
      if (setB.has(elem)) intersectionCount++;
    }
    const unionCount = setA.size + setB.size - intersectionCount;
    return unionCount > 0 ? intersectionCount / unionCount : 0.0;
  }

  /**
   * Computes Levenshtein edit distance between two strings.
   */
  static levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let prevRow = Array.from({ length: n + 1 }, (_, i) => i);
    let currRow = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;
      const c1 = s1.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const c2 = s2.charCodeAt(j - 1);
        const cost = c1 === c2 ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1, // deletion
          currRow[j - 1] + 1, // insertion
          prevRow[j - 1] + cost // substitution
        );
      }
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  /**
   * Computes Token-Sort Levenshtein similarity ratio between 0.0 and 1.0.
   * Words in both strings are sorted alphabetically to neutralize word-order differences
   * (e.g. "Software Engineer, Backend" vs "Backend Software Engineer").
   */
  static tokenSortRatio(strA: string, strB: string): number {
    const cleanA = strA.toLowerCase().replace(/[^\w\s]/g, " ").trim();
    const cleanB = strB.toLowerCase().replace(/[^\w\s]/g, " ").trim();

    if (cleanA === cleanB) return 1.0;

    const sortedA = cleanA.split(/\s+/).filter(Boolean).sort().join(" ");
    const sortedB = cleanB.split(/\s+/).filter(Boolean).sort().join(" ");

    if (sortedA === sortedB) return 1.0;

    const maxLen = Math.max(sortedA.length, sortedB.length);
    if (maxLen === 0) return 1.0;

    const dist = this.levenshteinDistance(sortedA, sortedB);
    return Math.max(0, 1.0 - dist / maxLen);
  }

  /**
   * Computes cosine similarity between two dense embedding vectors.
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) {
      return 0.0;
    }

    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0.0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Evaluates whether two job postings represent the same physical job opportunity.
   */
  static compareJobs(
    jobA: ScrapedJobDto | NormalizedJob,
    jobB: ScrapedJobDto | NormalizedJob,
    embeddingA?: number[] | null,
    embeddingB?: number[] | null
  ): DuplicateMatchResult {
    const normA = "normalizedCompany" in jobA ? jobA : JobNormalizer.normalizeJob(jobA);
    const normB = "normalizedCompany" in jobB ? jobB : JobNormalizer.normalizeJob(jobB);

    // 1. Exact canonical URL or external identifier match
    const urlA = normA.raw.url.split("?")[0].replace(/\/+$/, "").toLowerCase();
    const urlB = normB.raw.url.split("?")[0].replace(/\/+$/, "").toLowerCase();
    if (urlA && urlB && urlA === urlB) {
      return {
        isDuplicate: true,
        confidenceScore: 1.0,
        jaccardScore: 1.0,
        editDistanceScore: 1.0,
        matchedJobId: normB.raw.id,
        explanation: "Exact canonical job URL match.",
      };
    }

    // 2. Company blocking (must share company name or domain)
    const companyMatch =
      normA.normalizedCompany === normB.normalizedCompany ||
      (normA.raw.company_domain &&
        normB.raw.company_domain &&
        normA.raw.company_domain.toLowerCase() === normB.raw.company_domain.toLowerCase());

    if (!companyMatch) {
      return {
        isDuplicate: false,
        confidenceScore: 0.0,
        jaccardScore: 0.0,
        editDistanceScore: 0.0,
        explanation: "Different companies; skipped comparison.",
      };
    }

    // 3. Jaccard similarity (Tokens and 3-gram shingles)
    const tokensA = this.extractTokens(normA.normalizedTitle);
    const tokensB = this.extractTokens(normB.normalizedTitle);
    const tokenJaccard = this.jaccardSimilarity(tokensA, tokensB);

    const shinglesA = this.extractCharShingles(normA.normalizedTitle);
    const shinglesB = this.extractCharShingles(normB.normalizedTitle);
    const shingleJaccard = this.jaccardSimilarity(shinglesA, shinglesB);

    const jaccardScore = tokenJaccard * 0.6 + shingleJaccard * 0.4;

    // 4. Token-Sort Levenshtein edit distance
    const editDistanceScore = this.tokenSortRatio(normA.normalizedTitle, normB.normalizedTitle);

    // 5. Semantic vector embedding (if provided)
    let embeddingScore: number | undefined;
    let compositeScore: number;

    if (embeddingA && embeddingB && embeddingA.length === embeddingB.length) {
      embeddingScore = this.cosineSimilarity(embeddingA, embeddingB);
      compositeScore = jaccardScore * 0.35 + editDistanceScore * 0.35 + embeddingScore * 0.30;
    } else {
      compositeScore = jaccardScore * 0.50 + editDistanceScore * 0.50;
    }

    const isDuplicate = compositeScore >= 0.85;

    let explanation = `Company match ('${normA.normalizedCompany}') with ${Math.round(compositeScore * 100)}% composite title similarity ('${normA.normalizedTitle}' vs '${normB.normalizedTitle}').`;
    if (isDuplicate) {
      explanation = `Duplicate identified: ${explanation}`;
    } else {
      explanation = `Distinct roles: ${explanation}`;
    }

    return {
      isDuplicate,
      confidenceScore: Math.round(compositeScore * 1000) / 1000,
      jaccardScore: Math.round(jaccardScore * 1000) / 1000,
      editDistanceScore: Math.round(editDistanceScore * 1000) / 1000,
      embeddingScore: embeddingScore !== undefined ? Math.round(embeddingScore * 1000) / 1000 : undefined,
      matchedJobId: isDuplicate ? normB.raw.id : undefined,
      explanation,
    };
  }

  /**
   * Deduplicates a list of candidate scraped jobs against existing market postings.
   */
  static deduplicateBatch(
    newJobs: ScrapedJobDto[],
    existingPostings: Array<{ id: string; role_title: string; company_name: string; job_url: string; company_domain?: string | null }>
  ): { uniqueJobs: ScrapedJobDto[]; duplicates: Array<{ newJob: ScrapedJobDto; existingId: string; result: DuplicateMatchResult }> } {
    const uniqueJobs: ScrapedJobDto[] = [];
    const duplicates: Array<{ newJob: ScrapedJobDto; existingId: string; result: DuplicateMatchResult }> = [];

    for (const newJob of newJobs) {
      let matchedDuplicate: { existingId: string; result: DuplicateMatchResult } | null = null;

      // Check against existing postings
      for (const existing of existingPostings) {
        const result = this.compareJobs(newJob, {
          id: existing.id,
          title: existing.role_title,
          company_name: existing.company_name,
          url: existing.job_url,
          company_domain: existing.company_domain || null,
          location: "Remote",
          remote_type: "Remote",
          source_type: "existing_db",
        });

        if (result.isDuplicate) {
          matchedDuplicate = { existingId: existing.id, result };
          break;
        }
      }

      // If not duplicate against existing DB, check against already accepted unique jobs in this batch
      if (!matchedDuplicate) {
        for (const accepted of uniqueJobs) {
          const result = this.compareJobs(newJob, accepted);
          if (result.isDuplicate) {
            matchedDuplicate = { existingId: accepted.id, result };
            break;
          }
        }
      }

      if (matchedDuplicate) {
        duplicates.push({ newJob, ...matchedDuplicate });
      } else {
        uniqueJobs.push(newJob);
      }
    }

    return { uniqueJobs, duplicates };
  }
}
