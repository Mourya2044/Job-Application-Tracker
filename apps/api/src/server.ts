import Fastify, { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { pool } from "./db";
import { setupErrorHandler } from "./plugins/errorHandler";
import authPlugin from "./plugins/auth";
import swaggerPlugin from "./plugins/swagger";
import { authRoutes } from "./modules/auth/auth.routes";
import { applicationRoutes } from "./modules/applications/applications.routes";
import { jobRoutes } from "./modules/jobs/jobs.routes";
import { queueRoutes } from "./modules/queue/queue.routes";
import { mailboxRoutes } from "./modules/mailbox/mailbox.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { initializeDefaultQueueWorkers } from "./modules/queue/handlers";

export function buildServer(): FastifyInstance {
  const fastify = Fastify({
    logger: {
      level: config.isProduction ? "info" : "debug",
    },
    bodyLimit: 1048576, // 1MB payload ceiling
  });

  // Support empty JSON bodies gracefully without throwing 400
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body: string, done) => {
      if (!body || body.trim() === "") {
        return done(null, {});
      }
      try {
        const parsed = JSON.parse(body);
        done(null, parsed);
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  // 1. Error Handler
  setupErrorHandler(fastify);

  // 2. CORS
  fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);

      let isAllowed = false;
      try {
        const parsed = new URL(origin);
        const isLocal =
          !config.isProduction &&
          (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

        isAllowed =
          isLocal ||
          config.cors.origins.some((allowed) => {
            try {
              return new URL(allowed).origin === parsed.origin;
            } catch {
              return allowed === origin;
            }
          });
      } catch {
        isAllowed = false;
      }

      cb(null, isAllowed);
    },
    credentials: true,
  });

  // 3. Rate Limiting
  fastify.register(fastifyRateLimit, {
    global: false,
    max: 120,
    timeWindow: "1 minute",
  });

  // 4. Plugins
  fastify.register(authPlugin);
  fastify.register(swaggerPlugin);

  // 4. Health & Readiness Probes
  fastify.get("/health", async () => {
    return {
      service: "track-api",
      version: "2.0.0",
      status: "online",
      env: config.env,
    };
  });

  fastify.get("/health/ready", async (request, reply) => {
    let dbStatus = "healthy";
    try {
      await pool.query("SELECT 1");
    } catch {
      dbStatus = "unreachable";
    }

    const isReady = dbStatus === "healthy";
    return reply.status(isReady ? 200 : 503).send({
      service: "track-api",
      version: "2.0.0",
      status: isReady ? "ready" : "degraded",
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // 5. Mount API Routes
  fastify.register(authRoutes, { prefix: "/api/auth" });
  fastify.register(applicationRoutes, { prefix: "/api/applications" });
  fastify.register(jobRoutes, { prefix: "/api/jobs" });
  fastify.register(queueRoutes, { prefix: "/api/queue" });
  fastify.register(mailboxRoutes, { prefix: "/api/mailbox" });
  fastify.register(aiRoutes, { prefix: "/api/ai" });

  // 6. Initialize Background Queue Handlers
  initializeDefaultQueueWorkers();

  return fastify;
}

// Start server if executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const server = buildServer();

  server.listen({ port: config.port, host: config.host }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`Server listening at ${address}`);
  });
}

