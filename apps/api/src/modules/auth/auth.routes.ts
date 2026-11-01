import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { config } from "../../config";

const RegisterSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  fullName: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Register
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Register a new user account",
        tags: ["auth"],
        summary: "User registration",
      },
    },
    async (request, reply) => {
      const parsed = RegisterSchema.parse(request.body);
      const user = await AuthService.register(parsed);

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        { expiresIn: config.auth.sessionExpiresIn }
      );

      reply.setCookie("access_token", token, {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.status(201).send({
        user,
        token,
      });
    }
  );

  // 2. Login
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "Log in with email and password",
        tags: ["auth"],
        summary: "User login",
      },
    },
    async (request, reply) => {
      const parsed = LoginSchema.parse(request.body);
      const user = await AuthService.login(parsed);

      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        { expiresIn: config.auth.sessionExpiresIn }
      );

      reply.setCookie("access_token", token, {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return reply.send({
        user,
        token,
      });
    }
  );

  // 3. Current User Profile
  fastify.get(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get authenticated user profile",
        tags: ["auth"],
        summary: "Current user profile",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = await AuthService.findById(request.user.id);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User account no longer exists.",
        });
      }
      return reply.send({ user });
    }
  );

  // 4. Logout
  fastify.post(
    "/logout",
    {
      schema: {
        description: "Clear authentication session and cookies",
        tags: ["auth"],
        summary: "User logout",
      },
    },
    async (request, reply) => {
      reply.clearCookie("access_token", {
        path: "/",
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
      });
      return reply.send({ message: "Successfully logged out." });
    }
  );
};


