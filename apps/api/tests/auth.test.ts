import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server";
import { FastifyInstance } from "fastify";

describe("Auth Module Endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 and service metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.service).toBe("track-api");
    expect(body.status).toBe("online");
    expect(body.version).toBe("2.0.0");
  });

  it("GET /health/ready returns service readiness probe metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/ready",
    });
    // Returns 200 if connected or 503 degraded without crashing
    expect([200, 503]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.service).toBe("track-api");
    expect(body.database).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it("POST /api/auth/register fails on invalid email with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "not-an-email",
        password: "short",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Bad Request");
    expect(body.details).toBeDefined();
  });

  it("GET /api/auth/me returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });
});

