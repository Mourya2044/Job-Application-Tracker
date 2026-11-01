import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/server";
import { FastifyInstance } from "fastify";
import { config } from "../src/config";

describe("Authentication & Security Hardening", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Rate Limiting", () => {
    it("enforces rate limits on repeated registration attempts (HTTP 429)", async () => {
      // Max for register is 10 requests per minute
      let lastResponse;
      for (let i = 0; i < 12; i++) {
        lastResponse = await app.inject({
          method: "POST",
          url: "/api/auth/register",
          payload: {
            email: "invalid-rate-test",
            password: "short",
          },
        });
      }

      expect(lastResponse?.statusCode).toBe(429);
      const body = JSON.parse(lastResponse!.body);
      expect(body.statusCode).toBe(429);
      expect(body.error).toBe("Too Many Requests");
    });
  });

  describe("JWT Verification & Expiration", () => {
    it("rejects an expired JWT token with 401 Unauthorized", async () => {
      // Sign an already expired token (1 second expiration)
      const expiredToken = app.jwt.sign(
        {
          id: "11111111-1111-1111-1111-111111111111",
          email: "expired@test.com",
        },
        { expiresIn: "1ms" }
      );

      // Wait 10ms to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 15));

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Unauthorized");
      expect(body.message).toMatch(/Invalid or expired authentication session/i);
    });

    it("rejects a tampered or invalid signature JWT token with 401 Unauthorized", async () => {
      // Tampered token (invalid signature)
      const forgedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImVtYWlsIjoiYXR0YWNrZXJAdGVzdC5jb20ifQ.invalid_signature_here";

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${forgedToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("CSRF Protection on Cookie Sessions", () => {
    let validToken: string;

    beforeAll(() => {
      validToken = app.jwt.sign(
        {
          id: "11111111-1111-1111-1111-111111111111",
          email: "test@track.internal",
        },
        { expiresIn: "1h" }
      );
    });

    it("rejects cookie-authenticated mutating request when Origin and Referer are absent (HTTP 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/applications",
        cookies: {
          access_token: validToken,
        },
        payload: {
          company_name: "Test Corp",
          role_title: "Engineer",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Forbidden");
      expect(body.message).toMatch(/missing Origin or Referer header/i);
    });

    it("rejects cookie-authenticated mutating request from unauthorized origin (HTTP 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/applications",
        cookies: {
          access_token: validToken,
        },
        headers: {
          origin: "https://evil-attacker.com",
        },
        payload: {
          company_name: "Test Corp",
          role_title: "Engineer",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Forbidden");
      expect(body.message).toMatch(/Cross-site request blocked by CSRF protection/i);
    });

    it("rejects spoofed origin containing localhost substring (e.g. attacker-localhost.com) (HTTP 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/applications",
        cookies: {
          access_token: validToken,
        },
        headers: {
          origin: "https://attacker-localhost.com",
        },
        payload: {
          company_name: "Test Corp",
          role_title: "Engineer",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Forbidden");
      expect(body.message).toMatch(/Cross-site request blocked by CSRF protection/i);
    });

    it("allows mutating requests when Bearer token is used without CSRF blocking", async () => {
      // Bearer tokens are immune to ambient browser credential CSRF
      const res = await app.inject({
        method: "POST",
        url: "/api/applications",
        headers: {
          authorization: `Bearer ${validToken}`,
          origin: "https://external-client.com",
        },
        payload: {
          // Send bad payload to test authentication pass-through to validation
          company_name: "",
          role_title: "",
        },
      });

      // Status should be 400 Bad Request (schema validation), NOT 403 Forbidden or 401 Unauthorized!
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Logout Endpoint", () => {
    it("clears access_token cookie with correct security attributes", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
      });

      expect(res.statusCode).toBe(200);
      const cookieHeader = res.headers["set-cookie"];
      expect(cookieHeader).toBeDefined();

      const cookieStr = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : String(cookieHeader);
      expect(cookieStr).toMatch(/access_token=/);
      expect(cookieStr).toMatch(/HttpOnly/i);
      expect(cookieStr).toMatch(/Path=\//i);
      expect(cookieStr).toMatch(/SameSite=Lax/i);
    });
  });
});
