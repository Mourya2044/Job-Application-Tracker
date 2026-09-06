# Job Scraping: Technical Exploration & Architectural Strategies

## Executive Summary

Job application tracking platforms require reliable pipelines to ingest job postings. This document explores modern job scraping methodologies, evaluates their architectural trade-offs, benchmarks reliability and latency, and documents the multi-tiered scraping engine implemented in this system.

---

## 1. The Job Posting & ATS Landscape

Over 75% of modern technology companies do not build custom career portals from scratch. Instead, they license **Applicant Tracking Systems (ATS)** such as **Greenhouse**, **Lever**, **Ashby**, and **Workday**. 

```
                               ┌──────────────────────────────────────────────┐
                               │             Target Career Target             │
                               └──────────────────────────────────────────────┘
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           ▼                                                       ▼
            ┌─────────────────────────────┐                         ┌─────────────────────────────┐
            │   Hosted ATS Career Board   │                         │    Custom Corporate Site    │
            │  (boards.greenhouse.io,     │                         │  (e.g., stripe.com/jobs)    │
            │   jobs.lever.co, ashbyhq)   │                         │                             │
            └─────────────────────────────┘                         └─────────────────────────────┘
                           │                                                       │
            ┌──────────────┴──────────────┐                         ┌──────────────┴──────────────┐
            ▼                             ▼                         ▼                             ▼
   Direct Public JSON API         Clean DOM / JSON-LD       Schema.org JSON-LD       Heuristic DOM Parsing /
   (Sub-second, 100% fidelity)    (Standard Microdata)      (Google Jobs Standard)   LLM Semantic Extraction
```

---

## 2. Deep-Dive: 5 Job Scraping Techniques

### Technique 1: Direct ATS REST / JSON API Reverse-Engineering
* **Target Platforms**: Greenhouse, Lever, Ashby, SmartRecruiters.
* **How It Works**:
  ATS platforms provide backend APIs that power their web embeds and client-side frontends. These endpoints are public, unauthenticated, and return structured JSON.
  - **Greenhouse**: `GET https://boards-api.greenhouse.io/v1/boards/{company_token}/jobs?content=true`
    - Returns: Array of jobs with `id`, `title`, `location.name`, `departments`, `absolute_url`, `updated_at`, and full HTML `content`.
  - **Lever**: `GET https://api.lever.co/v0/postings/{company_slug}?mode=json`
    - Returns: Array of postings with `text` (title), `categories` (team, department, location, commitment), `hostedUrl`, `descriptionPlain`, `createdAt`.
  - **Ashby**: `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
    - Returns: Team hierarchies, location metadata, job posting tokens, compensation tiers.
* **Advantages**:
  - **100% Data Fidelity**: Zero parsing guesswork; exact field mappings for title, team, location, and description.
  - **Ultra Low Latency**: Average response time is 100ms - 250ms.
  - **Zero Anti-Bot Blocks**: These are legitimate public API endpoints designed for web integration, with no CAPTCHAs or Cloudflare challenge screens.
  - **Zero Compute / Token Cost**: No headless browser execution, no LLM inference fees.
* **Limitations**:
  - Requires knowing the company's ATS slug (e.g. `stripe` on Greenhouse, `figma` on Lever). However, this slug is easily parsed from any career page URL or preset directory.

---

### Technique 2: Schema.org `JobPosting` JSON-LD Extraction
* **Target Platforms**: Any modern employer career page or job listing compliant with Google Jobs SEO.
* **How It Works**:
  To appear in Google Jobs search results, employers embed standard Schema.org structured data inside an HTML `<script type="application/ld+json">` tag:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Senior Software Engineer",
    "description": "We are seeking a backend engineer...",
    "datePosted": "2026-08-15T00:00:00Z",
    "validThrough": "2026-10-15T00:00:00Z",
    "employmentType": "FULL_TIME",
    "hiringOrganization": {
      "@type": "Organization",
      "name": "Acme Corp",
      "sameAs": "https://acme.com"
    },
    "jobLocation": {
      "@type": "Place",
      "address": { "addressLocality": "San Francisco", "addressRegion": "CA" }
    },
    "baseSalary": {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": { "minValue": 160000, "maxValue": 210000, "unitText": "YEAR" }
    }
  }
  ```
* **Advantages**:
  - **Universal Standard**: Backed by W3C, Google, Microsoft, and Yahoo.
  - **Resilient to Redesigns**: CSS selector changes or HTML redesigns do not break the scraper because JSON-LD data remains invariant.
  - **Captures Rich Metadata**: Often contains salary bands, application deadlines, and remote workplace classification that may not be prominently visible in the UI.
* **Limitations**:
  - Primarily found on individual job detail pages rather than top-level career directory pages.

---

### Technique 3: Heuristic DOM & HTML Scraping with CSS Selectors
* **Target Platforms**: Custom career websites that do not expose public APIs or JSON-LD.
* **How It Works**:
  1. Fetch raw HTML via standard HTTP clients (`httpx` or `requests`) with realistic browser User-Agent headers.
  2. Parse the DOM tree using `BeautifulSoup`.
  3. Decompose non-content nodes (`<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`).
  4. Query semantic landmarks: `h1` for role title, OpenGraph tags (`og:title`, `og:site_name`, `og:description`), meta description tags, and keyword heuristic regexes.
  5. Optionally pass the cleaned text snippet to an LLM (such as GPT-4o-mini or Groq) with structured output schema for ambiguous layouts.
* **Advantages**:
  - Works on any static or server-rendered HTML page.
* **Limitations**:
  - Fragile to UI changes if relying on hardcoded CSS selectors.
  - Does not execute client-side JavaScript (SPAs built on React/Vue require hydration).

---

### Technique 4: Public Aggregator & Remote Job Feeds
* **Target Platforms**: Tech-focused job boards (RemoteOK, WeWorkRemotely, HackerNews "Who is Hiring" threads).
* **How It Works**:
  Query public JSON/RSS feeds exposed by job aggregators:
  - `GET https://remoteok.com/api`
  - `GET https://weworkremotely.com/categories/remote-programming-jobs.rss`
* **Advantages**:
  - Ingest thousands of active postings across hundreds of companies in a single request.
  - Pre-tagged by technology stack (e.g., Python, React, DevOps, AI).
* **Limitations**:
  - Aggregators lag direct company career pages by several hours or days.
  - Higher risk of outdated or expired postings.

---

### Technique 5: Headless Browser Automation (Playwright / Puppeteer)
* **Target Platforms**: Anti-bot protected platforms (LinkedIn, Indeed, Glassdoor, Workday SPAs).
* **How It Works**:
  Spawns a headless Chromium/Firefox instance via Playwright or Selenium, injects evasive patches (`playwright-stealth` to mask `navigator.webdriver`, WebGL, and canvas fingerprints), renders JavaScript, and handles user interactions (pagination, infinite scroll).
* **Advantages**:
  - Bypasses basic bot protection; renders 100% of client-side JavaScript.
* **Limitations**:
  - **Resource Intensive**: Requires ~100MB - 300MB RAM per worker thread; high CPU footprint.
  - **Slow**: Page loads take 3s - 8s compared to <200ms for direct HTTP requests.
  - **Anti-Bot Arms Race**: Cloudflare Turnstile, DataDome, and PerimeterX continuously update challenge heuristics, leading to frequent pipeline failure without costly rotating residential proxy infrastructure.

---

## 3. Comparative Evaluation Matrix

| Criterion | Technique 1: Direct ATS API | Technique 2: Schema.org JSON-LD | Technique 3: Heuristic DOM | Technique 4: Aggregator Feeds | Technique 5: Headless Browser |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Response Latency** | **< 200 ms** *(Fastest)* | **~ 350 ms** | **~ 400 ms** | **~ 600 ms** | **3,000 - 8,000 ms** *(Slowest)* |
| **Data Fidelity** | **100% (Structured)** | **95% (Standardized)** | 70% - 85% | 85% | 80% - 90% |
| **Anti-Bot Resistance** | **Immune** (Public API) | **High** | Medium | High | **Fragile** (Arms race) |
| **Maintenance Cost** | **Very Low** | **Very Low** | Medium / High | Low | **Very High** |
| **Compute / Infra Cost** | **Zero** (Lightweight HTTP) | **Zero** | Zero / Low | Zero | **High** (RAM/CPU/Proxies) |
| **Coverage Scope** | ~75% of Tech Roles | All Google-indexed jobs | Universal | Multi-company feeds | Walled gardens (LinkedIn) |

---

## 4. Implemented Production Architecture: Multi-Tiered Waterfall

In this project, we implement a **Multi-Tiered Waterfall Engine**:

```
                                  Input (URL or Company Slug)
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │ Tier 1: Is it an ATS Link/Slug?  │
                              │ (Greenhouse, Lever, or Ashby)    │
                              └──────────────────────────────────┘
                                        │               │
                                   YES  │               │ NO
                                        ▼               ▼
                        ┌───────────────────┐  ┌──────────────────────────────────┐
                        │ Execute Direct    │  │ Tier 2: Fetch Page & Extract     │
                        │ ATS REST API      │  │ Schema.org JSON-LD "JobPosting"  │
                        └───────────────────┘  └──────────────────────────────────┘
                                                        │               │
                                                  FOUND │               │ MISSING
                                                        ▼               ▼
                                               ┌─────────────────┐ ┌───────────────────┐
                                               │ Normalized Data │ │ Tier 3: Heuristic │
                                               │ (100% Fidelity) │ │ DOM & OpenGraph   │
                                               └─────────────────┘ └───────────────────┘
                                                        │                   │
                                                        └─────────┬─────────┘
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │  1-Click Tracking     │
                                                      │  Import to Board      │
                                                      └───────────────────────┘
```

### 1-Click Kanban Integration
Every scraped job posting is normalized into a unified `ScrapedJobPosting` schema. When a user clicks **Track Application**, the backend instantly creates an `Application` entry in the `APPLIED` stage, pre-populating:
* Company Name & Domain
* Role Title
* Job Posting URL
* Location & Remote Classification
* Salary Range & Next Step deadlines
* Initial Ingest Audit Event in `ApplicationStatusEvent`

---

## 5. Legal & Ethical Considerations

1. **`robots.txt` Compliance**: Respect crawl delay directives and excluded paths.
2. **Rate Limiting & Exponential Backoff**: Honor standard HTTP `429 Too Many Requests` responses with randomized jitter.
3. **Precedent (hiQ Labs v. LinkedIn)**: The US Ninth Circuit Court of Appeals ruled that scraping publicly accessible data that does not require a login does not violate the Computer Fraud and Abuse Act (CFAA).
4. **Data Minimization**: Store only job-related metadata required for tracking; discard personal recruiter details or irrelevant web assets.
