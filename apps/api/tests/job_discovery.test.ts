import { describe, it, expect, vi } from "vitest";
import { isRestrictedIp, validateSafeUrl } from "../src/modules/jobs/extractor/ssrf";
import { GenericCareerPageExtractor } from "../src/modules/jobs/extractor/genericExtractor";
import { JobNormalizer } from "../src/modules/jobs/normalization/normalizer";
import { JobDeduplicator } from "../src/modules/jobs/deduplication/deduplicator";
import { AdapterRegistry } from "../src/modules/jobs/adapters";
import { ScrapedJobDto } from "@track/shared";

describe("Phase A: Job Discovery & Market Intelligence", () => {
  describe("SSRF Protection Engine", () => {
    it("flags loopback, private, link-local, and cloud metadata IPs as restricted", () => {
      // IPv4 loopback & local
      expect(isRestrictedIp("127.0.0.1")).toBe(true);
      expect(isRestrictedIp("127.0.0.2")).toBe(true);
      expect(isRestrictedIp("0.0.0.0")).toBe(true);

      // IPv4 Private
      expect(isRestrictedIp("10.0.0.1")).toBe(true);
      expect(isRestrictedIp("172.16.0.1")).toBe(true);
      expect(isRestrictedIp("172.31.255.255")).toBe(true);
      expect(isRestrictedIp("192.168.1.1")).toBe(true);

      // Link-local & AWS/GCP Metadata
      expect(isRestrictedIp("169.254.169.254")).toBe(true);

      // Multicast & Broadcast
      expect(isRestrictedIp("224.0.0.1")).toBe(true);
      expect(isRestrictedIp("255.255.255.255")).toBe(true);

      // IPv6 Loopback & Link-local
      expect(isRestrictedIp("::1")).toBe(true);
      expect(isRestrictedIp("fe80::1")).toBe(true);
      expect(isRestrictedIp("fc00::1")).toBe(true);

      // Public Valid IPs
      expect(isRestrictedIp("8.8.8.8")).toBe(false);
      expect(isRestrictedIp("1.1.1.1")).toBe(false);
      expect(isRestrictedIp("104.244.42.1")).toBe(false);
    });

    it("validateSafeUrl rejects prohibited schemes and private IP targets", async () => {
      await expect(validateSafeUrl("ftp://example.com/file")).rejects.toThrow(/Unsupported URL scheme/i);
      await expect(validateSafeUrl("file:///etc/passwd")).rejects.toThrow(/Unsupported URL scheme/i);
      await expect(validateSafeUrl("http://localhost:8000")).rejects.toThrow(/Restricted hostname 'localhost'/i);
      await expect(validateSafeUrl("http://127.0.0.1:3000")).rejects.toThrow(/restricted/i);
      await expect(validateSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Restricted hostname/i);
      await expect(validateSafeUrl("http://metadata.google.internal/computeMetadata/v1")).rejects.toThrow(/Restricted hostname/i);
    });

    it("validateSafeUrl allows valid external public URLs", async () => {
      const dns = await import("dns/promises");
      const lookupSpy = vi.spyOn(dns.default, "lookup").mockResolvedValueOnce([
        { address: "104.244.42.1", family: 4 },
      ] as any);

      const parsed = await validateSafeUrl("https://stripe.com/jobs");
      expect(parsed.hostname).toBe("stripe.com");
      expect(parsed.protocol).toBe("https:");

      lookupSpy.mockRestore();
    });
  });

  describe("Job Normalization & Skill Extraction", () => {
    it("normalizes company names by stripping corporate and legal suffixes", () => {
      expect(JobNormalizer.normalizeCompany("Stripe, Inc.")).toBe("stripe");
      expect(JobNormalizer.normalizeCompany("Figma Corporation")).toBe("figma");
      expect(JobNormalizer.normalizeCompany("Airbnb LLC")).toBe("airbnb");
      expect(JobNormalizer.normalizeCompany("Vercel Technologies Ltd.")).toBe("vercel");
      expect(JobNormalizer.normalizeCompany("Linear Labs Co.")).toBe("linear");
    });

    it("normalizes job titles by removing noise flags and tags", () => {
      expect(JobNormalizer.normalizeTitle("Staff Software Engineer (Remote)")).toBe("Staff Software Engineer");
      expect(JobNormalizer.normalizeTitle("Senior Backend Engineer [WFH] - Full Time")).toBe("Senior Backend Engineer");
      expect(JobNormalizer.normalizeTitle("Full Stack Developer (m/f/d)")).toBe("Full Stack Developer");
      expect(JobNormalizer.normalizeTitle("Engineering Manager | Remote")).toBe("Engineering Manager");
    });

    it("classifies remote, hybrid, and onsite roles accurately", () => {
      expect(JobNormalizer.classifyRemoteType("San Francisco, CA (Remote)", "Software Engineer", "")).toBe("remote");
      expect(JobNormalizer.classifyRemoteType("New York, NY", "Backend Engineer - Hybrid", "")).toBe("hybrid");
      expect(JobNormalizer.classifyRemoteType("London, UK", "Site Reliability Engineer", "Fully onsite in central London office")).toBe("onsite");
    });

    it("parses currency and bounds from salary strings", () => {
      const parsed = JobNormalizer.parseSalary("$140,000 - $185,000 USD");
      expect(parsed?.currency).toBe("USD");
      expect(parsed?.minValue).toBe(140000);
      expect(parsed?.maxValue).toBe(185000);

      const eur = JobNormalizer.parseSalary("€80,000 - €95,000");
      expect(eur?.currency).toBe("EUR");
      expect(eur?.minValue).toBe(80000);
      expect(eur?.maxValue).toBe(95000);
    });

    it("extracts recognized technical skills from title and description", () => {
      const text = "Looking for a Staff Engineer experienced in TypeScript, React, PostgreSQL, Docker, and Python.";
      const skills = JobNormalizer.extractSkills(text);
      expect(skills).toContain("typescript");
      expect(skills).toContain("react");
      expect(skills).toContain("postgresql");
      expect(skills).toContain("docker");
      expect(skills).toContain("python");
    });
  });

  describe("Hybrid Deduplication Pipeline", () => {
    it("computes Jaccard index on token sets and character shingles", () => {
      const setA = new Set(["senior", "backend", "engineer"]);
      const setB = new Set(["backend", "engineer", "senior"]);
      const setC = new Set(["frontend", "designer"]);

      expect(JobDeduplicator.jaccardSimilarity(setA, setB)).toBe(1.0);
      expect(JobDeduplicator.jaccardSimilarity(setA, setC)).toBe(0.0);
    });

    it("computes token-sort Levenshtein ratio neutralizing word ordering", () => {
      // Reordered words have high token sort ratio
      const ratio = JobDeduplicator.tokenSortRatio(
        "Staff Software Engineer Backend",
        "Backend Staff Software Engineer"
      );
      expect(ratio).toBe(1.0);

      const ratioMinorDiff = JobDeduplicator.tokenSortRatio(
        "Senior Software Engineer",
        "Senior Software Engineer II"
      );
      expect(ratioMinorDiff).toBeGreaterThan(0.7);

      // With normalization, abbreviations are expanded to identical stems
      const normA = JobNormalizer.normalizeTitle("Senior Software Engineer");
      const normB = JobNormalizer.normalizeTitle("Sr. Software Engineer");
      expect(JobDeduplicator.tokenSortRatio(normA, normB)).toBe(1.0);
    });

    it("identifies duplicates between identical canonical URLs", () => {
      const jobA: ScrapedJobDto = {
        id: "gh-1",
        title: "Staff Engineer",
        company_name: "Stripe",
        url: "https://stripe.com/jobs/123?gh_src=linkedin",
        location: "Remote",
        remote_type: "remote",
        source_type: "greenhouse",
      };
      const jobB: ScrapedJobDto = {
        id: "gh-2",
        title: "Staff Software Engineer",
        company_name: "Stripe",
        url: "https://stripe.com/jobs/123",
        location: "Remote",
        remote_type: "remote",
        source_type: "greenhouse",
      };

      const result = JobDeduplicator.compareJobs(jobA, jobB);
      expect(result.isDuplicate).toBe(true);
      expect(result.confidenceScore).toBe(1.0);
      expect(result.explanation).toMatch(/Exact canonical job URL match/);
    });

    it("identifies duplicates across different titles within the same company using fuzzy similarity", () => {
      const jobA: ScrapedJobDto = {
        id: "j1",
        title: "Senior Backend Software Engineer (Remote)",
        company_name: "Figma, Inc.",
        url: "https://jobs.lever.co/figma/111",
        location: "Remote",
        remote_type: "remote",
        source_type: "lever",
      };
      const jobB: ScrapedJobDto = {
        id: "j2",
        title: "Senior Backend Software Engineer",
        company_name: "Figma",
        url: "https://remoteok.com/remote-jobs/222",
        location: "Remote",
        remote_type: "remote",
        source_type: "remoteok",
      };

      const result = JobDeduplicator.compareJobs(jobA, jobB);
      expect(result.isDuplicate).toBe(true);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(result.explanation).toMatch(/Duplicate identified/);
    });

    it("does not flag distinct roles in the same company as duplicates", () => {
      const jobA: ScrapedJobDto = {
        id: "j1",
        title: "Senior Backend Engineer",
        company_name: "Airbnb",
        url: "https://airbnb.com/careers/backend",
        location: "Remote",
        remote_type: "remote",
        source_type: "greenhouse",
      };
      const jobB: ScrapedJobDto = {
        id: "j2",
        title: "Product Marketing Manager",
        company_name: "Airbnb",
        url: "https://airbnb.com/careers/marketing",
        location: "Remote",
        remote_type: "remote",
        source_type: "greenhouse",
      };

      const result = JobDeduplicator.compareJobs(jobA, jobB);
      expect(result.isDuplicate).toBe(false);
      expect(result.confidenceScore).toBeLessThan(0.5);
    });

    it("deduplicateBatch isolates unique jobs and gathers duplicate pairs", () => {
      const batch: ScrapedJobDto[] = [
        {
          id: "1",
          title: "Senior Infrastructure Engineer",
          company_name: "Cloudflare",
          url: "https://cloudflare.com/jobs/1",
          location: "Remote",
          remote_type: "remote",
          source_type: "greenhouse",
        },
        {
          id: "2",
          title: "Senior Infrastructure Engineer (Remote)",
          company_name: "Cloudflare, Inc.",
          url: "https://remoteok.com/jobs/cloudflare-infra",
          location: "Remote",
          remote_type: "remote",
          source_type: "remoteok",
        },
        {
          id: "3",
          title: "Product Designer",
          company_name: "Cloudflare",
          url: "https://cloudflare.com/jobs/design",
          location: "Remote",
          remote_type: "remote",
          source_type: "greenhouse",
        },
      ];

      const { uniqueJobs, duplicates } = JobDeduplicator.deduplicateBatch(batch, []);
      expect(uniqueJobs.length).toBe(2);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].newJob.id).toBe("2");
      expect(duplicates[0].existingId).toBe("1");
    });
  });

  describe("Schema.org JSON-LD and Generic Extraction", () => {
    it("extracts JobPosting JSON-LD from HTML string", () => {
      const htmlFixture = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Careers at Acme</title>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Principal Distributed Systems Engineer",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "Acme Technologies"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "San Francisco",
                "addressRegion": "CA",
                "addressCountry": "US"
              }
            },
            "baseSalary": {
              "@type": "MonetaryAmount",
              "currency": "USD",
              "value": {
                "@type": "QuantitativeValue",
                "minValue": 190000,
                "maxValue": 240000,
                "unitText": "YEAR"
              }
            },
            "description": "<p>We are hiring a Principal Engineer to scale our transactional systems.</p>",
            "occupationalCategory": "Infrastructure",
            "datePosted": "2026-10-15T00:00:00Z"
          }
          </script>
        </head>
        <body><h1>Job Post</h1></body>
        </html>
      `;

      const extracted = GenericCareerPageExtractor.extractSchemaOrgJsonLd(
        htmlFixture,
        "https://acme.com/jobs/principal-engineer"
      );

      expect(extracted).not.toBeNull();
      expect(extracted?.title).toBe("Principal Distributed Systems Engineer");
      expect(extracted?.company_name).toBe("Acme Technologies");
      expect(extracted?.location).toContain("San Francisco");
      expect(extracted?.salary_range).toBe("USD 190,000 - 240,000");
      expect(extracted?.department).toBe("Infrastructure");
      expect(extracted?.source_type).toBe("json_ld");
    });

    it("falls back to OpenGraph and semantic HTML tags when JSON-LD is absent", () => {
      const htmlFixture = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:title" content="Data Platform Engineer - Stripe" />
          <meta property="og:site_name" content="Stripe" />
          <meta property="og:description" content="Build reliable stream processing pipelines with Kafka and Flink." />
        </head>
        <body>
          <h1>Data Platform Engineer</h1>
          <p>Join our foundational data infrastructure group.</p>
        </body>
        </html>
      `;

      const extracted = GenericCareerPageExtractor.extractSemanticDomFallback(
        htmlFixture,
        "https://stripe.com/jobs/data-platform"
      );

      expect(extracted.title).toContain("Data Platform Engineer");
      expect(extracted.company_name).toBe("Stripe");
      expect(extracted.description_snippet).toContain("Kafka and Flink");
      expect(extracted.source_type).toBe("html_heuristic");
    });
  });

  describe("ATS Adapter Registry", () => {
    it("registers and resolves all required ATS and public aggregators", () => {
      const providers = AdapterRegistry.getSupportedProviders();
      expect(providers).toContain("greenhouse");
      expect(providers).toContain("lever");
      expect(providers).toContain("ashby");
      expect(providers).toContain("workable");
      expect(providers).toContain("remoteok");
      expect(providers).toContain("remotive");
      expect(providers).toContain("arbeitnow");

      expect(AdapterRegistry.getAdapter("greenhouse").provider).toBe("greenhouse");
      expect(AdapterRegistry.getAdapter("lever").provider).toBe("lever");
      expect(AdapterRegistry.getAdapter("ashby").provider).toBe("ashby");
      expect(AdapterRegistry.getAdapter("workable").provider).toBe("workable");
      expect(AdapterRegistry.getAdapter("remoteok").provider).toBe("remoteok");
      expect(AdapterRegistry.getAdapter("remotive").provider).toBe("remotive");
      expect(AdapterRegistry.getAdapter("arbeitnow").provider).toBe("arbeitnow");
    });

    it("throws clear error on unsupported adapter provider", () => {
      expect(() => AdapterRegistry.getAdapter("unsupported-ats")).toThrow(
        /Unsupported job provider: 'unsupported-ats'/
      );
    });
  });
});
