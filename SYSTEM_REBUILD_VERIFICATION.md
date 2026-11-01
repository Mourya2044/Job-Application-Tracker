# Track Platform v2.0 — System Rebuild Verification & Architecture

This document records the completed ground-up architectural rebuild of **Track** (`track.mourya.tech`), transforming incremental legacy implementations into a production-grade, modular, and performant monorepo architecture.

---

## 1. Monorepo Architecture Overview

The repository is structured into isolated packages and applications using npm workspaces:

```
├── packages/
│   └── shared/                  # @track/shared (TypeScript contracts, Zod schemas, lifecycle constants)
├── apps/
│   ├── api/                     # @track/api (Fastify 5, Drizzle ORM, PostgreSQL, Auth, Queue, Mailbox, AI)
│   └── web/                     # @track/web (React 18, Vite 6, Tailwind CSS, Kanban, Table, AI Copilot)
├── services/
│   └── ai/                      # services/ai (FastAPI provider-agnostic microservice, GLiNER, BGE, OpenAI)
├── backend/                     # Untouched legacy backend preserved for reference
└── frontend/                    # Untouched legacy frontend preserved for reference
```

---

## 2. Rebuilt System Phases & Status

### Phase A: Job Discovery & Market Intelligence
- **Multi-ATS Adapters**: Production adapters in `apps/api/src/modules/jobs/adapters/`:
  - `GreenhouseAdapter`
  - `LeverAdapter`
  - `AshbyAdapter`
  - `WorkableAdapter`
  - `RemoteOKAdapter`
  - `RemotiveAdapter`
  - `ArbeitnowAdapter`
  - `AdapterRegistry` with curated company pre-configurations (Stripe, Figma, Datadog, Linear, Vercel, OpenAI, Airbnb, etc.).
- **Generic SSRF-Safe HTML Extractor**:
  - `apps/api/src/modules/jobs/extractor/ssrf.ts`: Blocks loopback (`127.0.0.0/8`, `::1`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`, `fe80::/10`), cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), multicast, and non-http(s) schemes.
  - `apps/api/src/modules/jobs/extractor/genericExtractor.ts`: Safe streaming parser (2MB ceiling, abort timeouts, manual redirect evaluation), Schema.org `JobPosting` JSON-LD extraction, and OpenGraph/semantic DOM fallback.
- **Normalization & Intelligence**:
  - Normalization of titles, abbreviations (`sr.` -> `senior`, `mgr` -> `manager`), corporate suffixes, workplace types (`remote`, `hybrid`, `onsite`), and compensation ranges.
  - Staged deduplication cascade: Company blocking -> Shingle Jaccard -> Token-sort Levenshtein distance -> Dense vector cosine similarity.
  - Historical observation tracking in `job_posting_observations` (reposts, compensation adjustments, expirations).

### Phase B: Background Processing & Queues
- **PostgreSQL Native Queue Engine**:
  - `apps/api/src/modules/queue/queue.service.ts`: Implemented using `FOR UPDATE SKIP LOCKED` on PostgreSQL `queue_jobs` table with zero external server dependencies.
  - Configurable exponential backoff retries, dead-letter state tracking, and `singletonKey` idempotency.
- **Transactional Outbox Pattern**:
  - `apps/api/src/modules/queue/outbox.service.ts`: Reliable multi-step event publication writing to `outbox_events` within the application transaction, dispatched asynchronously by background workers.
- **Worker Registry & Handlers**:
  - Concurrency-controlled worker runner (`worker.registry.ts`) handling `career_sync`, `batch_scrape`, `gmail_sync`, `email_process`, `ai_inference`, and `periodic_maintenance`.
  - Queue metrics API at `/api/queue/metrics`.

### Phase C: Gmail Integration & Mailbox Automation
- **AES-256-GCM Token Encryption**:
  - `apps/api/src/modules/mailbox/encryption.ts`: Encrypts Google OAuth refresh tokens at rest with authenticated encryption (`enc:v1:<iv>:<tag>:<cipher>`).
- **OAuth2 & Pub/Sub Ingestion**:
  - `apps/api/src/modules/mailbox/googleOAuth.service.ts`: Least-privilege consent flows with HMAC-signed CSRF state verification and automatic refresh token rotation.
  - `apps/api/src/modules/mailbox/webhook.handler.ts`: Ingests Google Cloud Pub/Sub push webhooks, validates secrets, decodes base64 notifications, and enqueues sync tasks with immediate HTTP 204 response.
- **History Synchronization & Application Resolution**:
  - `gmailSync.service.ts`: Incremental history synchronization with historyId checkpoints and full reconciliation fallback on expiration.
  - `applicationResolver.ts`: Matches incoming recruiter emails against tracked applications by domain, company, and role; strictly enforces terminal state invariants and stage locks (`stageLocked`); queues unconfirmed matches as pending suggestions with confidence scoring.

### Phase D: AI Integration & Telemetry
- **FastAPI Microservice (`services/ai`)**:
  - Capability protocols for text generation, structured entity extraction, and semantic embeddings.
  - Prompt management versioning (`prompts/resume_fit/v1`, `prompts/cover_letter/v1`).
  - Safe prompt sanitization protecting against prompt injection.
- **TypeScript API AI Integration (`apps/api/src/modules/ai`)**:
  - `ai.client.ts`: High-resilience client calling Python AI service with automatic heuristic fallbacks.
  - `ai.service.ts`: AI operations orchestrator with telemetry logging into `ai_executions` table (`capability`, `provider`, `modelName`, `promptId`, `latencyMs`, `promptTokens`, `completionTokens`, `status`).
  - Endpoints:
    - `POST /api/ai/resume/parse`: Structured profile extraction (contact details, summary, technical skills).
    - `POST /api/ai/resume/fit`: Explainable fit scoring (0-100), matching strengths, and missing skills.
    - `POST /api/ai/resume/improve`: Google XYZ framework bullet critiques with quantified impact rewrites.
    - `POST /api/ai/generate`: Personalized cover letters and recruiter outreach messages with configurable tone.
    - `POST /api/ai/email/extract`: Recruiter email event and lifecycle extraction.
    - `GET /api/ai/executions`: Chronological execution telemetry history.

### Phase E: Frontend Rebuild (`apps/web`)
- **Modern React & Vite Architecture**:
  - React 18, Vite 6, TypeScript, Tailwind CSS with dark theme tokens, clean typography (Outfit & JetBrains Mono), responsive layout.
- **Core User Workflows**:
  - **Authentication**: JWT cookie-based session management, login & registration modal with validation.
  - **Dashboard**: High-level funnel metrics (total applications, active interviews, offers, conversion rates) and recent activity feed.
  - **Applications Tracker**:
    - Dual-view switcher: **Kanban Board** & **Data Table**.
    - Stage progression across 8 lifecycle stages (`saved`, `applied`, `screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn`).
    - Stage locking toggle preventing background sync overwrites.
    - Detail Drawer with **Immutable Chronological Audit Trail** and **Revert to this Stage** buttons.
    - Application creation and editing modal.
  - **Job Discovery**:
    - Multi-aggregator search across curated companies and live boards (RemoteOK, Remotive, Arbeitnow, Greenhouse, Lever, Ashby).
    - Save jobs and 1-click import into tracked applications.
    - SSRF-safe URL extractor for any career page.
  - **Mailbox Sync**:
    - Google account connection status, OAuth connect trigger, manual sync trigger.
    - Pending suggestions inbox with 1-click Approve / Reject buttons.
  - **AI Copilot**:
    - Interactive tabs for Resume Fit Matcher, Google XYZ Bullet Improver, Cover Letter Generator, Profile Parser, and AI Telemetry Logs.

### Phase F: Observability & Operations
- Structured JSON logging with request correlation IDs (`reqId`).
- Liveness probe: `GET /health` -> `200 OK` with service metadata.
- Readiness probe: `GET /health/ready` -> Database connectivity check (`SELECT 1`), returning `200 OK` or `503 Service Unavailable`.
- Queue metrics: `GET /api/queue/metrics`.
- AI telemetry history: `GET /api/ai/executions`.

### Phase G & H: Verification & Production Readiness
- **Test Suite Results**:
  - 8 test files, 72 passing tests in `apps/api`.
  - Zero typecheck errors across all packages (`tsc --noEmit`).
  - Production build succeeds cleanly:
    - `@track/shared` (`tsc -b`)
    - `@track/api` (`tsc`)
    - `@track/web` (`vite build`)
- **Zero Regression**: Legacy `backend/` and `frontend/` remain completely untouched as reference.

---

## 3. Automated Test Verification Summary

```bash
> @track/api@2.0.0 test
> vitest run

 ✓ tests/job_discovery.test.ts (18 tests)
 ✓ tests/queue_processing.test.ts (7 tests)
 ✓ tests/applications.test.ts (2 tests)
 ✓ tests/auth.test.ts (4 tests)
 ✓ tests/authorization_and_lifecycle.test.ts (14 tests)
 ✓ tests/auth_security.test.ts (8 tests)
 ✓ tests/gmail_integration.test.ts (11 tests)
 ✓ tests/ai_integration.test.ts (8 tests)

 Test Files  8 passed (8)
      Tests  72 passed (72)
```

