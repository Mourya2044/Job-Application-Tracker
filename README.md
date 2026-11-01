# Track — Career Intelligence Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-black.svg)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-0.38-green.svg)](https://orm.drizzle.team/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)

Track is a production-grade career intelligence platform that automates job discovery, tracks applications through a state machine lifecycle with immutable audit history, parses inbound recruiter emails via Gmail webhooks, and optimizes resumes using AI.

---

## 🏗 Architecture & Monorepo Structure

```
.
├── apps/
│   ├── api/                   # Fastify 5 + TypeScript backend
│   │   ├── src/
│   │   │   ├── db/            # PostgreSQL connection & Drizzle ORM schema/migrations
│   │   │   ├── modules/       # Domain modules (auth, applications, jobs, mailbox, ai)
│   │   │   ├── queue/         # PostgreSQL-native background job processor
│   │   │   └── server.ts      # Fastify HTTP server setup
│   │   └── tests/             # Vitest integration test suite (72+ tests)
│   │
│   └── web/                   # React 18 + Vite + Tailwind CSS frontend
│       ├── src/
│       │   ├── components/    # Dashboard, Kanban, Table, Drawer, Mailbox, AI Copilot
│       │   ├── context/       # Auth context & session management
│       │   └── api/           # Typed client & API fetch utilities
│       └── dist/              # Production static bundle
│
├── packages/
│   └── shared/                # Shared contracts, Zod schemas, lifecycle constants & DTOs
│
└── services/
    └── ai/                    # Python FastAPI AI microservice (GLiNER, BGE, OpenAI)
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20+ (v22+ recommended)
- **npm**: v10+
- **Python**: 3.10+ (for `services/ai`)
- **PostgreSQL**: v14+ (e.g. Neon, Supabase, or local PostgreSQL)

### 2. Environment Variables

Create `.env` inside `apps/api/.env` (or link to your existing `backend/.env`):

```bash
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
JWT_SECRET="super-secret-random-jwt-key"
PORT=8000
HOST="127.0.0.1"
CORS_ORIGIN="http://localhost:3000"

# Optional integrations:
AI_SERVICE_URL="http://127.0.0.1:8001"
GMAIL_CLIENT_ID="your-google-client-id"
GMAIL_CLIENT_SECRET="your-google-client-secret"
GMAIL_REDIRECT_URI="http://localhost:8000/api/mailbox/callback"
```

For `services/ai/.env`:
```bash
OPENAI_API_KEY="sk-..." # Optional (falls back to local heuristic / BGE embeddings)
PORT=8001
```

### 3. Database Migration

Run PostgreSQL migrations using Drizzle ORM:

```bash
npm --workspace=apps/api run db:migrate
```

### 4. Running Locally

Start each component in separate terminals:

```bash
# Terminal 1: Fastify TypeScript API (port 8000)
npm run dev:api

# Terminal 2: React Vite Web Client (port 3000)
npm run dev:web

# Terminal 3 (Optional): Python AI Service (port 8001)
cd services/ai
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

---

## 🛠 Available NPM Scripts

| Command | Description |
|---|---|
| `npm run dev:api` | Starts Fastify API in development mode with `tsx watch` |
| `npm run dev:web` | Starts Vite frontend dev server at `http://localhost:3000` |
| `npm run build` | Compiles `@track/shared`, builds `apps/api`, and bundles `apps/web` |
| `npm run test` | Runs the full Vitest integration suite across all workspaces |
| `npm run typecheck` | Validates TypeScript types across the entire monorepo |
| `npm --workspace=apps/api run db:generate` | Generates new migration SQL files from Drizzle schemas |
| `npm --workspace=apps/api run db:migrate` | Applies pending Drizzle migrations to PostgreSQL |

---

## 🔑 Core Features

1. **Multi-User Multi-Tenant Architecture**:
   - Authentication via signed HTTP-only cookies and JWTs.
   - Strict tenant isolation: every application and audit entry is bound to `user_id`.

2. **Application State Machine & Immutable History**:
   - Transitions follow strict validation (`saved` → `applied` → `screening` → `interviewing` → `offer` / `rejected`).
   - Every single status change writes an immutable audit record to `application_status_events`.
   - Built-in "Revert to Stage" action restores previous states while maintaining full history.

3. **Job Discovery & Multi-ATS Scraper**:
   - Ingests opportunities from Greenhouse, Lever, Ashby, Workable, and remote job feeds.
   - Intelligent deduplication and job observation tracking.

4. **Recruiter Mailbox Sync**:
   - OAuth2 integration with Google Cloud Pub/Sub webhook receivers.
   - Parses incoming recruiter messages to automatically suggest or trigger stage transitions.
   - "Stage Lock" protection prevents automated sync from overriding manual user edits.

5. **AI Career Copilot**:
   - Resume bullet enhancer adhering to Google XYZ impact formula (*"Accomplished [X] as measured by [Y], by doing [Z]"*).
   - ATS semantic fit score and missing keyword extraction.

---

## 🧪 Testing & Verification

Run tests to ensure everything is functioning correctly:

```bash
# Run Fastify API tests (72 passing integration tests)
npm --workspace=apps/api test

# Typecheck monorepo
npm run typecheck
```
