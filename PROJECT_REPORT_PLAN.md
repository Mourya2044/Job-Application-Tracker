# Final Year Project Report Plan (Semester 4.1)
**Project Title**: Track — Career Intelligence Platform  
**Target Document**: Final Project Report / Capstone Dissertation & Presentation Dossier  

---

## 📑 Structure & Checklist for the 4.1 Project Report

### 1. Preliminary Pages (Standard Academic Formatting)
- [ ] **Title Page**: Project title, student details, supervisor/guide details, department, institution, submission date.
- [ ] **Certificate of Authenticity / Recommendation**: Signed by supervisor and head of department.
- [ ] **Declaration**: Student statement of original work.
- [ ] **Acknowledgements**: Mentors, faculty, and peers.
- [ ] **Abstract**:
  - Concise summary (250–350 words): Problem, proposed system architecture, key contributions (3-tier cascade deduplication, automated email state machine, local SLM inference), and key performance results.
- [ ] **Keywords**: *Career Intelligence, Multi-ATS Scraping, Cascade Deduplication, State Machine Audit, Zero-Shot NER, Dense Vector Embeddings, Fastify, Microservices*.
- [ ] **Table of Contents**, **List of Figures**, **List of Tables**, **List of Abbreviations / Acronyms**.

---

### 2. Chapter 1: Introduction
- [ ] **1.1 Problem Statement**:
  - Fragmentation of career portals and applicant tracking systems (Greenhouse, Lever, Ashby, Workable).
  - Lack of auditability and automated lifecycle tracking for job applications.
  - Redundant job syndication and "ghost jobs" across job boards.
  - Privacy and cost concerns of sending candidate resumes and career data to cloud LLMs.
- [ ] **1.2 Motivation**:
  - Why job seekers need unified, automated, privacy-conscious tooling for tracking and optimization.
- [ ] **1.3 Project Objectives**:
  - Build a multi-tenant career intelligence platform with multi-ATS ingestion.
  - Implement a formal application lifecycle state machine with immutable audit trail.
  - Design a low-latency, scalable $O(N^2) \to O(k^2)$ multi-tier deduplication engine.
  - Implement zero-shot recruiter email parsing via Gmail webhooks with human-in-the-loop protection.
  - Provide an on-premise/CPU-friendly AI copilot using Small Language Models (SLMs) and dense embeddings.
- [ ] **1.4 Scope & Limitations**:
  - In-scope: Web-based platform, automated scraping, OAuth2 email synchronization, ATS fit scoring.
  - Out-of-scope / Limitations: Automated auto-applying (CAPTCHA bypass), support for legacy platforms without public feeds.

---

### 3. Chapter 2: Literature Review & Background Study
- [ ] **2.1 Review of Existing Platforms**:
  - Commercial job trackers (Huntr, Teal, Simplify, Careerflow) — comparative analysis of features, privacy, and limitations.
- [ ] **2.2 State of Job Board Ingestion & ATS APIs**:
  - Comparison between Direct ATS APIs (Greenhouse/Lever/Ashby), Aggregator feeds, and legacy enterprise systems (Workday/Taleo).
- [ ] **2.3 String Matching & Deduplication Algorithms**:
  - Set-based matching (Jaccard similarity, character $n$-gram shingling).
  - Sequence-based matching (Levenshtein distance, Token Sort Ratio via RapidFuzz).
  - Semantic vector matching (Bi-encoders vs Cross-encoders, MTEB benchmarks).
- [ ] **2.4 Information Extraction & Small Language Models (SLMs)**:
  - Transition from heavy LLMs (GPT-4) to parameter-efficient SLMs (<1.5B parameters: `Qwen2.5-0.5B`, `GLiNER`, `bge-small-en-v1.5`).
  - Zero-shot Named Entity Recognition (NER) for resume and email attribute extraction.

---

### 4. Chapter 3: System Requirements & Feasibility Analysis
- [ ] **3.1 Functional Requirements**:
  - Multi-user authentication & session management (HTTP-only cookies, JWT).
  - Multi-source job discovery & company career portal management.
  - Interactive application kanban board with stage lock.
  - Background recruiter email listening & state transition suggestion.
  - Resume bullet critique & ATS semantic fit scoring.
- [ ] **3.2 Non-Functional Requirements**:
  - Security (Fernet OAuth encryption, SSRF URL validator).
  - Latency & performance (sub-50ms deduplication, sub-second embedding retrieval).
  - Auditability & immutability of status changes.
- [ ] **3.3 Technology Stack & Feasibility**:
  - Backend: Node.js, Fastify 5, TypeScript, Drizzle ORM, PostgreSQL.
  - Frontend: React 18, Vite, Tailwind CSS, Lucide icons.
  - AI Service: Python 3.10+, FastAPI, Hugging Face Transformers, GLiNER, RapidFuzz.
  - Queue: PostgreSQL-native ACID background outbox queue.

---

### 5. Chapter 4: System Architecture & Design
- [ ] **4.1 High-Level Architecture Diagram**:
  - Monorepo structure, decoupled frontend, Fastify API, PostgreSQL, and Python AI microservice.
- [ ] **4.2 Database Schema & ER Diagram**:
  - `users`, `applications`, `application_status_events`, `company_career_pages`, `job_postings`, `mailbox_messages`, `ai_executions`.
- [ ] **4.3 Application Lifecycle State Machine**:
  - State diagram: `saved` $\to$ `applied` $\to$ `screening` $\to$ `interviewing` $\to$ `offer` / `rejected`.
  - Immutable event log and revert-to-stage mechanism.
  - "Stage Lock" architecture preventing automated email sync from overriding manual user adjustments.
- [ ] **4.4 Multi-Tier Job Deduplication Pipeline (Detailed Algorithm Flowchart)**:
  - Stage 0: Corporate suffix stripping & company name blocking ($O(N^2) \to O(k^2)$).
  - Tier 1: Combined token & 3-gram character Jaccard similarity ($J \ge 0.82$).
  - Tier 2: Token Sort Levenshtein edit distance ($\text{Ratio} \ge 0.86$).
  - Tier 3: Dense vector cosine similarity via `bge-small-en-v1.5` for ambiguous candidate pairs ($0.35 \le \text{lexical} < 0.76$).
- [ ] **4.5 Security Architecture**:
  - Server-Side Request Forgery (SSRF) defense with RFC1918 & metadata IP filtering.
  - Fernet AES-128-CBC authenticated token encryption for OAuth credentials at rest.

---

### 6. Chapter 5: Implementation Details
- [ ] **5.1 API Gateway & Backend Services (Fastify + TypeScript)**:
  - Modular directory architecture (`auth`, `applications`, `jobs`, `mailbox`, `ai`, `queue`).
  - Drizzle ORM schema definition and migration pipeline.
- [ ] **5.2 Frontend Client (React + Vite)**:
  - Kanban board and list view synchronized with backend state machine.
  - Live AI Copilot drawer for resume scoring and bullet rewriting.
  - Recruiter mailbox review panel with diff preview.
- [ ] **5.3 AI Microservice Implementation (FastAPI + PyTorch)**:
  - Modular capability design: `embeddings`, `extraction`, `generation`, `resume`.
  - Dynamic fallback architecture: Local neural providers with graceful heuristic fallback.
- [ ] **5.4 Asynchronous Background Worker & Mailbox Sync**:
  - Gmail OAuth2 token refresh & Google Cloud Pub/Sub webhook endpoint.
  - Transactional outbox worker pattern using PostgreSQL `FOR UPDATE SKIP LOCKED`.

---

### 7. Chapter 6: Experimental Evaluation & Results
- [ ] **6.1 Analysis Metrics Framework**:
  - *Pipeline Funnel Metrics*: Conversion rates, stage dwell time (velocity), time-to-first-response (TTFR), ghosting rate.
  - *Deduplication Performance*: Pairwise search space reduction ratio, cascade tier breakdown, precision/recall/F1 on benchmark pairs.
  - *Email Parser Reliability*: Intent classification accuracy, suggestion acceptance rate, stage lock protection count.
  - *System & AI Telemetry*: Inference latency (p50, p95, p99), memory footprint, execution cost (USD).
- [ ] **6.2 Comparative Experiments & Benchmarks**:
  - Table: Latency and accuracy comparison across Jaccard vs Levenshtein vs Dense Embeddings vs 3-Tier Cascade.
  - Table: Local SLM (`Qwen2.5-0.5B` / `bge-small-en-v1.5`) vs Cloud API (`OpenAI gpt-4o-mini`) in latency, cost, and memory.
- [ ] **6.3 System Testing & Quality Assurance**:
  - Unit and integration testing results (Vitest integration test suite with 72+ test cases).
  - TypeScript strict compile-time verification across monorepo packages.

---

### 8. Chapter 7: Discussion, Screenshots & User Interfaces
- [ ] **8.1 Screenshots of Working Prototype**:
  - Kanban Board with drag-and-drop & status change history modal.
  - Job Discovery & Career Portal admin screen.
  - Inbound Recruiter Email Sync and automated stage transition suggestion drawer.
  - AI Resume Fit & Bullet Point Rewriter (Google XYZ formula).
- [ ] **8.2 Discussion on Challenges Overcome**:
  - Handling rate limits and schema changes across multiple public job board APIs.
  - Preventing destructive overwrites on recruiter email automated transitions.
  - Packaging neural ML models into low-memory footprint deployments.

---

### 9. Chapter 8: Conclusion & Future Work
- [ ] **8.1 Summary of Contributions**:
  - Production-ready, end-to-end full-stack solution for career intelligence.
  - Multi-tier deduplication algorithm demonstrating significant computational savings.
  - Explainable, auditable AI application tracking with strict security controls.
- [ ] **8.2 Future Enhancements**:
  - Autonomous application submission via headless browser workers (with human approval).
  - Real-time interview question generation based on company interview reviews.
  - Calendar integration for automated interview scheduling.

---

### 10. References & Appendices
- [ ] **References (IEEE / APA format)**:
  - Relevant academic papers on text similarity, vector embeddings, NER, and ATS architectures.
- [ ] **Appendix A**: Database Schema DDL / Migration scripts.
- [ ] **Appendix B**: API Specification (Swagger/OpenAPI route summary).
- [ ] **Appendix C**: Sample Test Suite execution logs.

