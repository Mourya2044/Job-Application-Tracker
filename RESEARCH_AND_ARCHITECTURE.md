# Job Discovery, Deduplication Architecture, and API/Model Research

## 1. System Architecture: Why Each Component and Technique is Used

### 1.1 Admin Career Pages Management (`CompanyCareerPage`)
* **What is used**: A relational SQLAlchemy model (`company_career_pages`) paired with FastAPI CRUD and synchronization endpoints (`/api/admin/career-pages`) and an administrative UI modal in React.
* **Why it is used**:
  * **Eliminating Hardcoded Configurations**: Previously, monitored companies were static arrays in Python and React. Storing them in the database allows administrators to add, disable, edit, or delete company career portals at runtime without redeploying code.
  * **Direct ATS API Routing**: Each company record stores `provider` (`greenhouse`, `lever`, `ashby`, `workable`, `json_ld`) and `slug`. Querying an ATS provider's public JSON endpoint returns structured data (title, location, department, compensation, canonical URL, timestamps) with 100% parsing accuracy and zero HTML layout breakage.
  * **Health and Telemetry Tracking**: Fields such as `last_synced_at`, `last_sync_status`, `last_error_message`, and `total_jobs_found` allow administrators to detect broken company slugs or rate-limited portals immediately.

---

### 1.2 Multi-API Job Deduplication Engine (`JobDeduplicator`)
When aggregating job listings across multiple job search APIs (such as RemoteOK, Remotive, Arbeitnow, and direct ATS feeds), the same job opening is frequently syndicated across multiple boards with slight variations in title formatting, punctuation, or company suffixes.

Comparing all $N$ jobs pairwise with a neural network has $O(N^2)$ complexity, which is too slow for real-time search responses. Therefore, a staged **Blocking + 3-Tier Cascade Architecture** is used:

#### Stage 0: Company Name Normalization & Blocking (Partitioning)
* **What is used**: Regex stripping of corporate suffixes (`Inc.`, `LLC`, `Corp.`, `Ltd.`, `Technologies`) and punctuation to group jobs into company buckets (`normalize_company_name`).
* **Why it is used**: Two postings from different companies (e.g., `"Senior Backend Engineer"` at Stripe vs. `"Senior Backend Engineer"` at Figma) are never duplicates of the same opening. Partitioning by normalized company name reduces pairwise comparisons from $O(N^2)$ across the entire dataset to $O(k^2)$ within small per-company buckets where $k \ll N$.

#### Technique 1: Jaccard Similarity (Intersection over Union)
* **Formula**:
  $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
* **What is used**: A weighted combination of **Word-Token Jaccard** ($60\%$ weight, after removing role stopwords) and **Character 3-Gram Shingle Jaccard** ($40\%$ weight).
* **Why it is used**:
  * Word-token Jaccard measures set overlap regardless of word order (e.g., `{"backend", "python", "engineer"}` vs `{"python", "backend", "engineer"}` yields $1.0$).
  * Pure word-token Jaccard fails on compound words or morphological variants (e.g., `"Fullstack"` vs `"Full-Stack"` has $0$ word overlap). Adding character 3-gram shingles (`"ful"`, `"ull"`, `"lls"`, `"sta"`, `"tac"`, `"ack"`) captures sub-word overlap in $O(L)$ linear time.
  * **Threshold**: Pairs with combined Jaccard score $\ge 0.82$ are immediately marked as duplicates without running heavier algorithms.

#### Technique 2: Levenshtein Edit Distance (Token Sort Ratio)
* **Formula**:
  $$\text{Ratio}(S_1, S_2) = 1 - \frac{\text{Levenshtein}(\text{sort}(S_1), \text{sort}(S_2))}{\max(|S_1|, |S_2|)}$$
* **What is used**: `rapidfuzz.fuzz.token_sort_ratio` (implemented in C++ with `difflib.SequenceMatcher` fallback).
* **Why it is used**:
  * Different job APIs often invert title modifiers or introduce minor typos/abbreviations (e.g., `"Senior Software Engineer - Backend"` vs `"Backend Software Engineer, Senior"`).
  * Standard Levenshtein distance penalizes word swaps heavily because every character position shifts. Sorting tokens alphabetically before computing character edit distance resolves word-order inversions while still measuring exact character-level insertions, deletions, and substitutions.
  * **Threshold**: Pairs with Edit Distance ratio $\ge 0.86$ (or combined lexical average $\ge 0.76$) are marked as duplicates.

#### Technique 3: Dense Vector Embeddings (Semantic Cosine Similarity)
* **Formula**:
  $$\cos(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$$
* **What is used**: `BAAI/bge-small-en-v1.5` transformer bi-encoder producing 384-dimensional L2-normalized dense vectors over `title + description_snippet`.
* **Why it is used**:
  * Lexical methods (Jaccard and Edit Distance) only compare surface characters and tokens. They fail when two job aggregators rewrite a title using synonymous terminology for the exact same role (e.g., `"Lead Frontend Architect (React)"` vs `"Senior UI/Web Engineer - React & TypeScript"`).
  * Dense vector embeddings map semantically equivalent phrases to nearby points in vector space.
  * To preserve low latency, vector cosine evaluation is only triggered when the lexical score falls into the ambiguous candidate zone ($0.35 \le \text{lexical\_avg} < 0.76$). Pairs with cosine similarity $\ge 0.85$ are flagged as semantic duplicates.

#### Stage 4: Cross-Source Metadata Merging
* **What is used**: Field-level backfilling (`_merge_duplicate_metadata`) when collapsing a duplicate job into the kept record.
* **Why it is used**: One job API may include a `salary_range` or `department` while another API has a richer `description_snippet`. Merging missing fields into the surviving record prevents data loss during deduplication.

---

## 2. Research: Reliable Public Job Listing APIs

### 2.1 Architectural Categories of Public Job APIs
1. **Direct First-Party ATS Board APIs**: Public, unauthenticated JSON endpoints exposed by Applicant Tracking Systems so companies can embed career portals on their websites. High reliability, zero cost, real-time accuracy, but scoped per company slug.
2. **Public Remote & Tech Aggregator Feeds**: Open JSON endpoints provided by remote/tech job boards. Good for broad keyword discovery without per-company configuration, but often rate-limited or delayed by 24 hours.
3. **Keyed Public & Government Search APIs**: Free-tier REST APIs requiring developer registration (`app_id` / `api_key`). Suitable for regional or public-sector aggregation.

### 2.2 Public Job APIs Comparison Table (2026)

| API Provider | Endpoint Pattern | Auth Required | Cost | Rate Limits & Quotas | Data Freshness | Primary Coverage & Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Greenhouse Board API** | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | No | Free | Unmetered per-company CDN JSON | Real-time | Global tech, SaaS, enterprise. Returns full HTML job description, departments, and office locations. |
| **Lever Postings API** | `https://api.lever.co/v0/postings/{slug}?mode=json` | No | Free | Unmetered per-company JSON | Real-time | Startups and mid-market tech. Includes workplace type (`remote`, `hybrid`, `onsite`), team, and commitment. |
| **Ashby Public Posting API** | `https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | No | Free | Unmetered per-company JSON | Real-time | High-growth startups and AI companies. Natively exposes structured min/max compensation bands. |
| **Workable Widget API** | `https://apply.workable.com/api/v1/widget/accounts/{slug}` | No | Free | Unmetered per-company JSON | Real-time | SMBs and European/US tech companies. Returns role title, shortcode, telecommuting flag, and location. |
| **SmartRecruiters Posting API** | `https://api.smartrecruiters.com/v1/companies/{id}/postings` | No | Free | Paginated public JSON (100 items/page) | Real-time | Large enterprises. Requires second call per posting ID for full description text. |
| **Recruitee Public API** | `https://{slug}.recruitee.com/api/offers` | No | Free | Unmetered per-company JSON | Real-time | European startups and scale-ups. Returns full offer descriptions and tags in one call. |
| **The Muse API** | `https://www.themuse.com/api/public/jobs` | Optional (Free Key) | Free | 500 req/hr (no key); 3,600 req/hr (with free key) | Real-time | US/global tech and corporate roles. Supports category, level, and location filtering. |
| **Himalayas Remote API** | `https://himalayas.app/jobs/api/search` | Optional (Bearer Token) | Free | Shared public pool (no key); 60 req/min & 10,000 req/day (free key) | Real-time | Global remote tech jobs. Includes timezone restrictions, seniority, and salary data. |
| **Arbeitnow API** | `https://www.arbeitnow.com/api/job-board-api` | No | Free | Generous public pagination | Real-time | European and remote tech jobs. Includes explicit `remote` and `visa_sponsorship` boolean fields. |
| **Remotive API** | `https://remotive.com/api/remote-jobs` | No | Free | Max 2 req/min; recommends max 4 fetches/day | 24-hour delay | Remote software, product, and design listings. Requires attribution link. |
| **RemoteOK API** | `https://remoteok.com/api` | No | Free | IP rate-limited; requires custom User-Agent | 24-hour delay | Global remote tech roles. Single JSON feed filterable by `?tag={keyword}`. |
| **Adzuna API** | `https://api.adzuna.com/v1/api/jobs/{country}/search/1` | Yes (`app_id`, `app_key`) | Freemium | Free tier: 25 req/min, 250 req/day, 2,500 req/month | Real-time | Broad aggregator across 16+ countries (US, UK, EU, IN, AU). Commercial use requires paid license after trial. |
| **USAJOBS API** | `https://data.usajobs.gov/api/search` | Yes (`Authorization-Key`) | Free | Standard federal gateway limits | Real-time | Official US Federal Government job listings with exact GS pay grades and clearance requirements. |
| **Reed Developer API** | `https://www.reed.co.uk/api/1.0/search` | Yes (HTTP Basic Auth) | Free | Standard developer rate limits | Real-time | Major UK job board. Returns salary ranges, contract types, and expiration dates. |
| **Findwork API** | `https://findwork.dev/api/jobs/` | Yes (`Authorization: Token`) | Freemium | Free developer tier; 60 req/min limit | Real-time | Aggregates HN Who is Hiring, RemoteOK, and tech boards into a single REST schema. |

---

## 3. Research: Paid Job Listing APIs and Why to Use Them

### 3.1 Paid Job APIs Comparison Table (2026)

| Provider | Primary Data Source | Pricing Model (2026) | Why It Is Used Over Free Public APIs |
| :--- | :--- | :--- | :--- |
| **TheirStack** (`theirstack.com`) | 300,000+ company career pages, ATS boards, and global job portals | **$49/mo** (1,500 credits), **$100/mo** (5,000 credits), **$169/mo** (10,000 credits) | Automatically extracts required tech stack slugs from descriptions, normalizes salaries, deduplicates cross-board listings, and supports webhook push triggers. |
| **Coresignal** (`coresignal.com`) | Multi-source web scraping, major job boards, ATS feeds | From **$49/mo** (API credits); **$1,000+/mo** for bulk historical database dumps | Provides historical job market datasets, firmographic enrichment (headcount, funding), and high-volume enterprise SLAs. |
| **SerpApi — Google Jobs** (`serpapi.com`) | Google for Jobs SERP index (aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter) | **$50–$75/mo** starter plans; **$7.50–$15 per 1,000 searches** at scale | Bypasses anti-bot protections and CAPTCHAs to extract structured JSON from Google Jobs in real time. |
| **JSearch (RapidAPI / OpenWebNinja)** | Google for Jobs real-time index | Free trial (200 req/mo); Paid tiers from **~$25/mo to $150/mo** | Low-barrier monthly subscription to query LinkedIn/Indeed/Glassdoor aggregated results by keyword, radius, and date posted. |
| **Apify Enterprise ATS Actors** (`apify.com`) | Workday, Taleo, iCIMS, SuccessFactors, Greenhouse, Lever | Pay-per-result / compute: **~$0.90 to $2.00 per 1,000 jobs** (plans from **$49/mo**) | Extracts postings from legacy enterprise ATS platforms (such as Workday and Oracle Taleo) that do not expose clean public JSON APIs. |

### 3.2 Engineering Justification: When and Why to Use Paid APIs
1. **Global Keyword Search Without Slug Maintenance**: Free direct ATS endpoints (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) require knowing every target company's slug in advance. Paid APIs index hundreds of thousands of employers continuously, enabling global queries like `"Staff Distributed Systems Engineer in New York"` across all companies simultaneously.
2. **Coverage of Legacy Enterprise ATS Platforms**: While startups use Greenhouse, Lever, and Ashby, Fortune 500 corporations predominantly use **Workday** (`myworkdayjobs.com`), **Oracle Taleo**, **SAP SuccessFactors**, or **iCIMS**. These platforms rely on dynamic session tokens, undocumented POST payloads, and strict WAF rules that block simple HTTP scrapers. Paid providers maintain residential proxy pools and headless browser clusters to index them reliably.
3. **Eliminating the 24-Hour Syndication Delay**: Free remote job feeds (`Remotive`, `RemoteOK`) deliberately delay their public API output by 24 hours to protect their paid subscriber communities. Paid APIs provide near-instant ingestion (minutes after an employer publishes a role).
4. **Commercial Redistribution Rights**: Most free aggregator APIs (`Himalayas`, `Remotive`, `Adzuna Free`) explicitly forbid commercial SaaS monetization or republishing in their Terms of Service. Paid tiers grant commercial usage licenses.

---

## 4. Research: Small Models Catalog (Hugging Face — 2026)

Small models (<1.5B parameters) are selected for this system and future roadmap modules because they can run on standard CPU instances or attach dynamically to shared GPU slices (Hugging Face ZeroGPU) with sub-second cold-start overhead and zero per-token third-party API billing.

### 4.1 Small Models Comparison Matrix

| Hugging Face Model ID | Category | Parameters | Memory (FP16 / Quantized) | Max Context | License | Why to Use / Target Application |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`sentence-transformers/all-MiniLM-L6-v2`** | Dense Text Embedding | 22.7M | ~90 MB (FP32) / ~45 MB (FP16) | 256 tokens | Apache-2.0 | Fastest CPU bi-encoder (<5ms per title). Best choice when deduplicating thousands of short job titles on CPU-only workers. |
| **`BAAI/bge-small-en-v1.5`** *(Active in codebase)* | Dense Text Embedding | 33.4M | ~133 MB (FP32) / ~67 MB (FP16) | 512 tokens | MIT | Higher semantic retrieval precision than MiniLM on MTEB while staying under 150 MB RAM. Used for job deduplication and resume-to-job vector matching. |
| **`Snowflake/snowflake-arctic-embed-s`** | Dense Text Embedding | 33.0M | ~130 MB (FP32) / ~65 MB (FP16) | 512 tokens | Apache-2.0 | Tuned specifically on technical, code, and enterprise search queries; drop-in alternative to `bge-small-en-v1.5`. |
| **`nomic-ai/modernbert-embed-base`** | Long-Context Embedding | 149M | ~300 MB (FP16) | 8,192 tokens | Apache-2.0 | Uses ModernBERT (RoPE + FlashAttention). Can embed an entire multi-page resume and full job description in a single 8k window without truncation. |
| **`Snowflake/snowflake-arctic-embed-m-v2.0`** | Multilingual Long-Context Embedding | 305M | ~610 MB (FP16) | 8,192 tokens | Apache-2.0 | High-precision multilingual embedding model for matching English resumes against European (German/French/Spanish) job postings from Arbeitnow/Adzuna. |
| **`Qwen/Qwen3-Embedding-0.6B`** | Instruction-Aware Embedding | 600M | ~1.2 GB (BF16) | 32,768 tokens | Apache-2.0 | Decoder-based embedding model that accepts task instructions (e.g., `"Instruct: Retrieve duplicate job postings"`), achieving top MTEB scores under 1B parameters. |
| **`urchade/gliner_small-v2.1`** | Zero-Shot NER (Bi-Encoder) | ~50M | ~100 MB (FP16) | 512 tokens | Apache-2.0 | Extracts custom entity types (skills, salaries, visa status, clearance) in a single encoder pass; 10x faster on CPU than autoregressive LLMs. |
| **`fastino/gliner2-multi-v1`** *(Active in codebase)* | Schema-Driven Entity Extractor | ~150M | ~300 MB (FP16) | 1,024 tokens | Apache-2.0 | Extracts categorized technical skills, candidate names, education, and email lifecycle attributes zero-shot without hardcoded dictionaries. |
| **`HuggingFaceTB/SmolLM2-135M-Instruct`** | Ultra-Light Causal SLM | 135M | ~270 MB (BF16) / ~90 MB (INT4) | 8,192 tokens | Apache-2.0 | Smallest viable instruction-following LLM; fits in CPU L3 cache/RAM for ultra-low-resource text normalization. |
| **`HuggingFaceTB/SmolLM2-360M-Instruct`** | Lightweight Causal SLM | 360M | ~720 MB (BF16) / ~220 MB (INT4) | 8,192 tokens | Apache-2.0 | Trained on curated synthetic and technical datasets; strong CPU-friendly fallback for short email or job description summarization. |
| **`Qwen/Qwen2.5-0.5B-Instruct`** *(Active in codebase)* | Causal SLM | 490M | ~1.0 GB (FP16) / ~350 MB (INT4) | 32,768 tokens | Apache-2.0 | Reliable structured JSON output, ATS bullet point critique generation, and cover letter drafting with minimal VRAM (~1 GB). |
| **`Qwen/Qwen3-0.6B`** | Hybrid Reasoning Causal SLM | 600M | ~1.2 GB (BF16) / ~400 MB (INT4) | 32,768 tokens | Apache-2.0 | Next-generation upgrade over `Qwen2.5-0.5B-Instruct`; supports switchable thinking/non-thinking modes for stricter JSON schema adherence in ATS evaluations. |
| **`meta-llama/Llama-3.2-1B-Instruct`** | Causal SLM | 1.23B | ~2.4 GB (BF16) / ~750 MB (INT4) | 128k tokens | Llama 3.2 Community | Strong natural prose fluency for tailored cover letters and recruiter outreach messages when 2+ GB VRAM is available. |

---

## 5. Job Intelligence, Security, and Production Observability Architecture

### 5.1 Separation of Concerns: JobPosting vs Application
A core design principle introduced into the architecture is distinguishing three distinct lifecycle phases:
1. **Market Postings (`JobPosting`)**: Discovered raw positions actively scraped across ATS platforms and job boards. Contains market history, salary disclosures, location, first seen and last seen timestamps, expiration state, and repost linkages.
2. **Bookmarked Roles (`SavedJob`)**: User-curated vacancies flagged for potential follow-up before formal submission.
3. **Active Pipelines (`Application`)**: User applications actively progressing through kanban stages (`applied` -> `screening` -> `interviewing` -> `offer` -> `rejected`), linked optionally to an original `job_posting_id`.

### 5.2 Market Job Intelligence & Expiration Tracking
During career page synchronization (`sync_company_career_page` and `sync_all_active_companies`), the `JobIntelligenceService` reconciles incoming scrapes against historical postings for each employer:
- **Active Postings**: When a known posting re-appears, `last_seen_at` is updated to current UTC time. If it was previously marked expired, `is_expired` is flipped to `False` (position reopened/revived).
- **Expiration Detection**: When a job previously listed under a company disappears from their ATS board, it is marked `is_expired = True` with an `expired_at` timestamp.
- **Reposting Detection**: When a company republicizes an existing role title under a brand new posting ID or URL, `repost_detected` is flagged as `True` and `original_posting_id` points to the prior listing.
- **Compensation History**: Changes to salary ranges between scrapes are detected and updated.

### 5.3 Security & SSRF Defense Architecture
1. **Fernet OAuth Token Encryption at Rest**: Sensitive Google OAuth refresh tokens, access tokens, and credentials are encrypted using `cryptography.fernet.Fernet`. Encrypted strings are marked with an `enc:` prefix for backwards compatibility with legacy plaintext records.
2. **SSRF Guard (`validate_safe_url`)**: Custom career page URLs entered by users or administrators are validated before issuing network requests. Schemes are strictly restricted to HTTP/HTTPS, and hostnames are resolved to verify they do not point to localhost (`127.0.0.1`), loopback, private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local IPs, or cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).

### 5.4 Operational Observability & Audit Trail
1. **System Metrics Endpoint (`/api/system/metrics`)**: Exposes operational telemetry including mailbox sync success rates, dead-letter isolating count, active vs expired market postings, repost counts, and total audit events.
2. **Explainable AI Provenance**: Every automated lifecycle transition records structured `decision_metadata` (matching strategy, confidence score, detected sender domain, role title similarity) alongside `model_version`, which the frontend renders inline on the event audit timeline.


