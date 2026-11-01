import { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function setupErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | ZodError | Error, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Zod validation errors (use name check to support cross-package instances)
    if (error instanceof ZodError || error.name === "ZodError" || ("issues" in error && Array.isArray((error as any).issues))) {
      const issues = (error as any).issues || [];
      const response: ApiErrorResponse = {
        statusCode: 400,
        error: "Bad Request",
        message: "Request validation failed",
        details: issues.map((i: any) => ({
          path: Array.isArray(i.path) ? i.path.join(".") : String(i.path || ""),
          message: i.message,
        })),
      };
      return reply.status(400).send(response);
    }

    // 2. Fastify schema validation errors
    if ("validation" in error && error.validation) {
      const response: ApiErrorResponse = {
        statusCode: 400,
        error: "Bad Request",
        message: error.message,
        details: error.validation,
      };
      return reply.status(400).send(response);
    }

    // 3. Fastify HTTP errors with explicit statusCode
    const statusCode = (error as FastifyError).statusCode || 500;
    if (statusCode < 500) {
      const errorName =
        HTTP_STATUS_NAMES[statusCode] ||
        (error as FastifyError).name ||
        "Error";

      const response: ApiErrorResponse = {
        statusCode,
        error: errorName,
        message: error.message,
      };
      return reply.status(statusCode).send(response);
    }

    // 4. Uncaught internal server errors (mask details in production)
    request.log.error(error);
    const response: ApiErrorResponse = {
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred while processing your request.",
    };
    return reply.status(500).send(response);
  });
}

