import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  CompanyCareerPageCreateSchema,
  JobSearchQuerySchema,
} from "@track/shared";
import { JobsService } from "./jobs.service";

const IdParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

const ExtractUrlBodySchema = z.object({
  url: z.string().url("A valid URL is required"),
});

const SaveJobBodySchema = z.object({
  job_posting_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, "Title is required"),
  company_name: z.string().min(1, "Company name is required"),
  location: z.string().optional().nullable(),
  salary_range: z.string().optional().nullable(),
  job_url: z.string().url().optional().nullable().or(z.literal("")),
  tags: z.array(z.string()).default([]),
});

export const jobRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Search Discovered Jobs in Market Database
  const handleJobSearch = async (request: any, reply: any) => {
    const rawQuery = request.query as any;
    const searchTerm = rawQuery?.query || rawQuery?.q || "software";
    const query = JobSearchQuerySchema.parse({
      ...rawQuery,
      query: searchTerm,
    });
    const results = await JobsService.searchJobs(query);
    return reply.send(results);
  };

  fastify.get(
    "",
    {
      schema: {
        description: "Search and filter market jobs discovered via continuous crawling",
        tags: ["jobs"],
        summary: "Search market job postings",
      },
    },
    handleJobSearch
  );

  fastify.get(
    "/search",
    {
      schema: {
        description: "Search and filter market jobs discovered via continuous crawling (alias)",
        tags: ["jobs"],
        summary: "Search market job postings alias",
      },
    },
    handleJobSearch
  );

  // 2. Curated Preset Companies
  fastify.get(
    "/presets",
    {
      schema: {
        description: "Get curated list of preset tech companies for discovery testing",
        tags: ["jobs"],
        summary: "Curated company presets",
      },
    },
    async (_request, reply) => {
      return reply.send(JobsService.getCuratedCompanies());
    }
  );

  // 3. Live Aggregator Multi-Source Search
  fastify.get(
    "/live-search",
    {
      schema: {
        description: "Perform real-time multi-source job search with deduplication across RemoteOK, Remotive, and Arbeitnow",
        tags: ["jobs"],
        summary: "Live aggregator search",
      },
    },
    async (request, reply) => {
      const q = (request.query as any)?.query || "software";
      const limit = Number((request.query as any)?.limit || 20);
      const jobs = await JobsService.searchLiveAggregators(q, limit);
      return reply.send({ total: jobs.length, items: jobs });
    }
  );

  // 4. Safe URL Job Extraction (SSRF Protected)
  fastify.post(
    "/extract",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Safely extract structured job information from an arbitrary career page URL",
        tags: ["jobs"],
        summary: "Extract job from URL",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { url } = ExtractUrlBodySchema.parse(request.body);
      const result = await JobsService.extractFromUrl(url);
      return reply.send(result);
    }
  );

  // 5. Tracked Career Pages Management
  fastify.get(
    "/career-pages",
    {
      schema: {
        description: "List all tracked company career pages and synchronization status",
        tags: ["jobs"],
        summary: "List career pages",
      },
    },
    async (_request, reply) => {
      const pages = await JobsService.listCareerPages();
      return reply.send(pages);
    }
  );

  fastify.post(
    "/career-pages",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Register a new company career page for continuous discovery",
        tags: ["jobs"],
        summary: "Register career page",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = CompanyCareerPageCreateSchema.parse(request.body);
      const created = await JobsService.createCareerPage(parsed);
      return reply.status(201).send(created);
    }
  );

  fastify.post(
    "/career-pages/:id/sync",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Trigger synchronization and reconciliation for a company career page",
        tags: ["jobs"],
        summary: "Sync career page",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const summary = await JobsService.syncCareerPage(id);
      return reply.send(summary);
    }
  );

  // 6. User-Specific Saved Jobs
  fastify.get(
    "/saved",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "List saved jobs for authenticated user",
        tags: ["jobs"],
        summary: "List saved jobs",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const saved = await JobsService.listSavedJobs(request.user.id);
      return reply.send(saved);
    }
  );

  fastify.post(
    "/saved",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Save a job posting bookmark for authenticated user",
        tags: ["jobs"],
        summary: "Save job",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const body = SaveJobBodySchema.parse(request.body);
      const saved = await JobsService.saveJob(request.user.id, {
        jobPostingId: body.job_posting_id || undefined,
        title: body.title,
        companyName: body.company_name,
        location: body.location || undefined,
        salaryRange: body.salary_range || undefined,
        jobUrl: body.job_url || undefined,
        tags: body.tags,
      });
      return reply.status(201).send(saved);
    }
  );

  fastify.delete(
    "/saved/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Remove a saved job for authenticated user",
        tags: ["jobs"],
        summary: "Remove saved job",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await JobsService.removeSavedJob(request.user.id, id);
      return reply.status(204).send();
    }
  );

  // 7. Get Single Job Details by ID
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Retrieve single market job posting by ID with historical observation timeline",
        tags: ["jobs"],
        summary: "Get job posting details",
      },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const job = await JobsService.getJobById(id);
      return reply.send(job);
    }
  );
};
