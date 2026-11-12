import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

export default fp(async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Track API",
        description: "Enterprise-grade Career Intelligence Platform & Automated Application Tracker API",
        version: "2.0.0",
      },
      servers: [
        {
          url: "http://localhost:8000",
          description: "Local Development Server",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  // Only mount Swagger UI when not in AWS Lambda (static assets are not bundled in single-file lambda)
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    await fastify.register(fastifySwaggerUi, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
      staticCSP: true,
    });
  }
});

