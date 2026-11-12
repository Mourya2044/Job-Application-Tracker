import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

// Load .env from api module, root, or legacy paths if present
dotenv.config({ path: path.resolve(configDir, "../.env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "8000", 10),
  host: process.env.HOST || "0.0.0.0",

  db: {
    url: process.env.DATABASE_URL,
  },

  auth: {
    jwtSecret:
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === "production"
        ? (() => {
          throw new Error("JWT_SECRET environment variable is mandatory in production.");
        })()
        : "dev-jwt-secret-min-32-chars-long-track-app-key"),
    cookieSecret:
      process.env.COOKIE_SECRET ||
      (process.env.NODE_ENV === "production"
        ? (() => {
          throw new Error("COOKIE_SECRET environment variable is mandatory in production.");
        })()
        : "dev-cookie-secret-min-32-chars-long-key"),
    saltRounds: 10,
    sessionExpiresIn: "7d",
  },

  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || "",
    webhookSecret: process.env.GMAIL_WEBHOOK_SECRET || "dev-webhook-secret",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/mailbox/callback",
    pubsubTopic: process.env.GMAIL_PUBSUB_TOPIC || "projects/gmail-summarise-503906/topics/gmail-event",
  },

  aiService: {
    url: process.env.AI_SERVICE_URL || "http://127.0.0.1:8001",
    timeoutMs: 30000,
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,https://track.mourya.tech").split(","),
  },
} as const;

