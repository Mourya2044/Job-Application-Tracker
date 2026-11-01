import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server";
import { FastifyInstance } from "fastify";

describe("Application Module Authorization", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/applications returns 401 when no token is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/applications",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /api/applications returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/applications",
      payload: {
        company_name: "Stripe",
        role_title: "Software Engineer",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

