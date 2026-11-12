import { FastifyInstance } from "fastify";
import { buildServer } from "./server";
import { OutboxService } from "./modules/queue/outbox.service";
import { WorkerRegistry } from "./modules/queue/worker.registry";

let app: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = buildServer();
    await app.ready();
  }
  return app;
}

export interface APIGatewayEventLike {
  version?: string;
  routeKey?: string;
  rawPath?: string;
  rawQueryString?: string;
  cookies?: string[];
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
      protocol?: string;
      sourceIp?: string;
      userAgent?: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
  // REST API v1 fields fallback:
  httpMethod?: string;
  path?: string;
  multiValueHeaders?: Record<string, string[] | undefined>;
  // Scheduled event fields:
  "detail-type"?: string;
  source?: string;
  action?: string;
}

/**
 * Universal AWS Lambda Handler:
 * 1. Serves API Gateway HTTP API (payload v2) & REST API (payload v1) requests
 * 2. Processes EventBridge / CloudWatch scheduled cron events for background queue draining
 */
export async function handler(event: APIGatewayEventLike, _context?: any) {
  // 1. Handle EventBridge scheduled rule for background outbox & queue processing
  if (
    event["detail-type"] === "Scheduled Event" ||
    event.source === "aws.events" ||
    event.action === "process_queue"
  ) {
    const outboxResult = await OutboxService.dispatchPending(50);
    const workerResult = await WorkerRegistry.drainBatch(20);
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "queue_processed",
        dispatchedOutbox: outboxResult.dispatchedCount,
        jobsProcessed: workerResult.processed,
        errors: workerResult.errors,
      }),
    };
  }

  const fastifyApp = await getApp();

  // 2. Normalize HTTP Method & Path
  const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
  const path = event.rawPath || event.path || "/";
  const query = event.rawQueryString || undefined;
  const url = query ? `${path}?${query}` : path;

  // 3. Normalize Headers & Cookies
  const headers: Record<string, string> = {};
  if (event.headers) {
    for (const [k, v] of Object.entries(event.headers)) {
      if (v !== undefined) {
        headers[k.toLowerCase()] = v;
      }
    }
  }

  if (event.cookies && event.cookies.length > 0) {
    headers["cookie"] = event.cookies.join("; ");
  }

  // 4. Normalize Body
  let payload: string | Buffer | undefined = undefined;
  if (event.body) {
    payload = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
  }

  // 5. Inject Request into Fastify via light-my-request
  const response = await fastifyApp.inject({
    method: method as any,
    url,
    headers,
    payload,
    query: event.queryStringParameters as any,
  });

  // 6. Format Response for API Gateway
  const responseHeaders: Record<string, string> = {};
  const cookies: string[] = [];

  for (const [key, val] of Object.entries(response.headers)) {
    if (key.toLowerCase() === "set-cookie") {
      if (Array.isArray(val)) {
        cookies.push(...val.map(String));
      } else if (val) {
        cookies.push(String(val));
      }
    } else if (val !== undefined) {
      responseHeaders[key] = String(val);
    }
  }

  return {
    statusCode: response.statusCode,
    headers: responseHeaders,
    cookies: cookies.length > 0 ? cookies : undefined,
    body: response.body,
    isBase64Encoded: false,
  };
}

