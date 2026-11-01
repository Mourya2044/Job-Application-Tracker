import { ScrapedJobDto } from "@track/shared";

const CORPORATE_SUFFIXES = new Set([
  "inc",
  "inc.",
  "corp",
  "corp.",
  "corporation",
  "llc",
  "ltd",
  "ltd.",
  "limited",
  "co",
  "co.",
  "company",
  "technologies",
  "tech",
  "holdings",
  "group",
  "software",
  "labs",
]);

const TITLE_NOISE_REGEXES = [
  /\s*\((?:remote|hybrid|onsite|wfh)\)\s*/gi,
  /\s*\[(?:remote|hybrid|onsite|wfh)\]\s*/gi,
  /\s*-\s*(?:remote|hybrid|onsite|wfh)\s*$/gi,
  /\s*\|\s*(?:remote|hybrid|onsite|wfh)\s*$/gi,
  /\s*\((?:m\/f\/d|m\/w\/d|f\/m\/d)\)\s*/gi,
  /\s*\[(?:m\/f\/d|m\/w\/d|f\/m\/d)\]\s*/gi,
  /\s*-\s*full\s*time\s*$/gi,
  /\s*-\s*part\s*time\s*$/gi,
  /\s*\((?:full-time|part-time|contract)\)\s*/gi,
];

export interface NormalizedJob {
  raw: ScrapedJobDto;
  normalizedCompany: string;
  normalizedTitle: string;
  normalizedLocation: string;
  remoteType: "remote" | "hybrid" | "onsite";
  parsedSalary: {
    currency: string;
    minValue?: number;
    maxValue?: number;
    raw: string;
  } | null;
  extractedSkills: string[];
}

const COMMON_ABBREVIATIONS: Record<string, string> = {
  "sr": "senior",
  "sr.": "senior",
  "jr": "junior",
  "jr.": "junior",
  "mgr": "manager",
  "eng": "engineer",
  "dev": "developer",
  "swe": "software engineer",
};

export class JobNormalizer {
  /**
   * Normalizes company name for partitioning/blocking (e.g. "Stripe, Inc." -> "stripe").
   */
  static normalizeCompany(companyName?: string | null): string {
    if (!companyName) return "unknown";
    const cleaned = companyName.toLowerCase().replace(/[^\w\s]/g, " ");
    const tokens = cleaned
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !CORPORATE_SUFFIXES.has(t));
    return tokens.join(" ").trim() || cleaned.trim() || "unknown";
  }

  /**
   * Normalizes job titles by removing noise flags, parenthesized metadata, and extra whitespace.
   */
  static normalizeTitle(title?: string | null): string {
    if (!title) return "Untitled Role";
    let normalized = title;
    for (const regex of TITLE_NOISE_REGEXES) {
      normalized = normalized.replace(regex, " ");
    }
    const words = normalized
      .toLowerCase()
      .split(/\s+/)
      .map((w) => COMMON_ABBREVIATIONS[w] || w);
    normalized = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .trim();
    return normalized || "Untitled Role";
  }

  /**
   * Classifies remote status based on title, location, and description keywords.
   */
  static classifyRemoteType(
    location?: string | null,
    title?: string | null,
    description?: string | null
  ): "remote" | "hybrid" | "onsite" {
    const combined = `${location || ""} ${title || ""} ${description || ""}`.toLowerCase();

    if (combined.includes("hybrid") || combined.includes("flexible onsite")) {
      return "hybrid";
    }
    if (
      combined.includes("remote") ||
      combined.includes("telecommute") ||
      combined.includes("work from anywhere") ||
      combined.includes("wfh")
    ) {
      return "remote";
    }
    return "onsite";
  }

  /**
   * Parses free-form salary text into currency and min/max bounds.
   */
  static parseSalary(salaryStr?: string | null): NormalizedJob["parsedSalary"] {
    if (!salaryStr) return null;

    let currency = "USD";
    if (salaryStr.includes("€") || salaryStr.toLowerCase().includes("eur")) currency = "EUR";
    else if (salaryStr.includes("£") || salaryStr.toLowerCase().includes("gbp")) currency = "GBP";
    else if (salaryStr.includes("₹") || salaryStr.toLowerCase().includes("inr")) currency = "INR";
    else if (salaryStr.includes("C$") || salaryStr.toLowerCase().includes("cad")) currency = "CAD";

    // Extract numerical figures
    const numbers = salaryStr
      .replace(/[,]/g, "")
      .match(/\b\d+(?:\.\d+)?\b/g)
      ?.map(Number)
      .filter((n) => n > 100); // Filter out noise like 401(k)

    if (!numbers || numbers.length === 0) {
      return { currency, raw: salaryStr };
    }

    if (numbers.length === 1) {
      return { currency, minValue: numbers[0], maxValue: numbers[0], raw: salaryStr };
    }

    const sorted = [...numbers].sort((a, b) => a - b);
    return {
      currency,
      minValue: sorted[0],
      maxValue: sorted[sorted.length - 1],
      raw: salaryStr,
    };
  }

  /**
   * Extracts prominent technical skills from job title and description.
   */
  static extractSkills(text?: string | null): string[] {
    if (!text) return [];
    const KNOWN_SKILLS = [
      "typescript",
      "javascript",
      "python",
      "golang",
      "rust",
      "java",
      "c++",
      "c#",
      "react",
      "vue",
      "angular",
      "next.js",
      "node.js",
      "fastapi",
      "fastify",
      "django",
      "graphql",
      "rest",
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "docker",
      "kubernetes",
      "aws",
      "gcp",
      "azure",
      "terraform",
      "ci/cd",
      "kafka",
      "rabbitmq",
      "elasticsearch",
      "pytorch",
      "tensorflow",
    ];

    const lower = text.toLowerCase();
    const found = new Set<string>();

    for (const skill of KNOWN_SKILLS) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(lower)) {
        found.add(skill);
      }
    }

    return Array.from(found);
  }

  /**
   * Normalizes a scraped job posting completely.
   */
  static normalizeJob(raw: ScrapedJobDto): NormalizedJob {
    const normalizedCompany = this.normalizeCompany(raw.company_name);
    const normalizedTitle = this.normalizeTitle(raw.title);
    const remoteType = this.classifyRemoteType(raw.location, raw.title, raw.description_snippet);
    const parsedSalary = this.parseSalary(raw.salary_range);
    const extractedSkills = this.extractSkills(`${raw.title} ${raw.description_snippet || ""}`);

    return {
      raw,
      normalizedCompany,
      normalizedTitle,
      normalizedLocation: raw.location || "Remote",
      remoteType,
      parsedSalary,
      extractedSkills,
    };
  }
}
