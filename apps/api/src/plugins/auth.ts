import fp from "fastify-plugin";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { config } from "../config";

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  // Register cookie parser
  await fastify.register(fastifyCookie, {
    secret: config.auth.cookieSecret,
    hook: "onRequest",
  });

  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
    cookie: {
      cookieName: "access_token",
      signed: false,
    },
  });

  // Decorate fastify with authenticate hook
  fastify.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      // 1. Check Bearer Authorization header
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        await request.jwtVerify();
        return;
      }

      // 2. Check HTTP-only cookie
      const token = request.cookies.access_token;
      if (token) {
        // Enforce strict Origin / Referer validation on mutating cookie-authenticated requests (CSRF mitigation)
        const method = request.method.toUpperCase();
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          let requestOrigin = request.headers.origin;
          if (!requestOrigin && request.headers.referer) {
            try {
              requestOrigin = new URL(request.headers.referer).origin;
            } catch {
              requestOrigin = undefined;
            }
          }

          if (!requestOrigin) {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "Cross-site request blocked: missing Origin or Referer header on cookie authentication.",
            });
          }

          let isAllowed = false;
          try {
            const parsed = new URL(requestOrigin);
            const isLocal =
              !config.isProduction &&
              (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

            isAllowed =
              isLocal ||
              config.cors.origins.some((allowed) => {
                try {
                  return new URL(allowed).origin === parsed.origin;
                } catch {
                  return allowed === requestOrigin;
                }
              });
          } catch {
            isAllowed = false;
          }

          if (!isAllowed) {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "Cross-site request blocked by CSRF protection.",
            });
          }
        }

        const decoded = fastify.jwt.verify<AuthUser>(token);
        request.user = decoded;
        return;
      }

      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required. Please log in.",
      });
    } catch (err) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or expired authentication session.",
      });
    }
  });
});
