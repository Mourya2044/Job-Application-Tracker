import json
import logging
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
import httpx

from app.schemas.job import ScrapedJobPosting

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

DEFAULT_TIMEOUT = 10.0

# Curated company presets for quick discovery & testing
CURATED_COMPANIES = [
    {"name": "Stripe", "slug": "stripe", "provider": "greenhouse", "domain": "stripe.com"},
    {"name": "Figma", "slug": "figma", "provider": "lever", "domain": "figma.com"},
    {"name": "Airbnb", "slug": "airbnb", "provider": "greenhouse", "domain": "airbnb.com"},
    {"name": "Vercel", "slug": "vercel", "provider": "greenhouse", "domain": "vercel.com"},
    {"name": "Cloudflare", "slug": "cloudflare", "provider": "greenhouse", "domain": "cloudflare.com"},
    {"name": "Linear", "slug": "linear", "provider": "ashby", "domain": "linear.app"},
    {"name": "OpenAI", "slug": "openai", "provider": "greenhouse", "domain": "openai.com"},
    {"name": "Datadog", "slug": "datadog", "provider": "greenhouse", "domain": "datadoghq.com"},
    {"name": "GitHub", "slug": "github", "provider": "greenhouse", "domain": "github.com"},
    {"name": "Twitch", "slug": "twitch", "provider": "greenhouse", "domain": "twitch.tv"},
]


def clean_html_snippet(raw_html: Optional[str], max_chars: int = 400) -> str:
    if not raw_html:
        return ""
    try:
        soup = BeautifulSoup(raw_html, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]
    except Exception:
        return (raw_html or "")[:max_chars]


class JobScraperService:
    @staticmethod
    def get_curated_companies() -> List[Dict[str, str]]:
        return CURATED_COMPANIES

    # -------------------------------------------------------------------------
    # Technique 1: Direct ATS API Scrapers (Greenhouse, Lever, Ashby)
    # -------------------------------------------------------------------------
    @staticmethod
    async def scrape_greenhouse(company_slug: str) -> List[ScrapedJobPosting]:
        """
        Scrapes Greenhouse via its public JSON API endpoint:
        https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true
        """
        slug = company_slug.strip().lower()
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()

        jobs: List[ScrapedJobPosting] = []
        company_name = slug.capitalize()
        for item in data.get("jobs", []):
            job_id = str(item.get("id"))
            title = item.get("title", "Untitled Role")
            job_url = item.get("absolute_url", f"https://boards.greenhouse.io/{slug}/jobs/{job_id}")

            # Location
            loc_data = item.get("location", {})
            location = loc_data.get("name") or "Remote / Not Specified"

            # Remote classification
            is_remote = "remote" in location.lower() or "remote" in title.lower()

            # Department / Team
            departments = item.get("departments", [])
            dept_name = departments[0].get("name") if departments else None

            # Content preview
            raw_content = item.get("content", "")
            snippet = clean_html_snippet(raw_content)

            # Updated / Posted time
            updated_at_str = item.get("updated_at")
            posted_at = None
            if updated_at_str:
                try:
                    posted_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                except Exception:
                    pass

            jobs.append(
                ScrapedJobPosting(
                    id=f"gh-{slug}-{job_id}",
                    title=title,
                    company_name=company_name,
                    company_domain=f"{slug}.com",
                    location=location,
                    remote_type="remote" if is_remote else "hybrid/onsite",
                    department=dept_name,
                    url=job_url,
                    description_snippet=snippet,
                    source_type="ats_greenhouse",
                    posted_at=posted_at or datetime.now(timezone.utc),
                )
            )
        return jobs

    @staticmethod
    async def scrape_lever(company_slug: str) -> List[ScrapedJobPosting]:
        """
        Scrapes Lever via its public JSON endpoint:
        https://api.lever.co/v0/postings/{company}?mode=json
        """
        slug = company_slug.strip().lower()
        url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()

        jobs: List[ScrapedJobPosting] = []
        company_name = slug.capitalize()
        for item in data:
            job_id = str(item.get("id"))
            title = item.get("text", "Untitled Role")
            job_url = item.get("hostedUrl", f"https://jobs.lever.co/{slug}/{job_id}")

            categories = item.get("categories", {})
            location = categories.get("location") or "Remote / Not Specified"
            dept_name = categories.get("department") or categories.get("team")
            commitment = categories.get("commitment")  # e.g., Full time

            is_remote = "remote" in location.lower() or "remote" in title.lower() or categories.get("workplaceType") == "remote"

            raw_desc = item.get("descriptionPlain", "") or item.get("description", "")
            snippet = clean_html_snippet(raw_desc)

            posted_at = None
            created_at_ms = item.get("createdAt")
            if created_at_ms:
                try:
                    posted_at = datetime.fromtimestamp(created_at_ms / 1000.0, timezone.utc)
                except Exception:
                    pass

            jobs.append(
                ScrapedJobPosting(
                    id=f"lever-{slug}-{job_id}",
                    title=title,
                    company_name=company_name,
                    company_domain=f"{slug}.com",
                    location=f"{location} ({commitment})" if commitment else location,
                    remote_type="remote" if is_remote else "hybrid/onsite",
                    department=dept_name,
                    url=job_url,
                    description_snippet=snippet,
                    source_type="ats_lever",
                    posted_at=posted_at or datetime.now(timezone.utc),
                )
            )
        return jobs

    @staticmethod
    async def scrape_ashby(company_slug: str) -> List[ScrapedJobPosting]:
        """
        Scrapes Ashby via its public posting API:
        https://api.ashbyhq.com/posting-api/job-board/{company}
        """
        slug = company_slug.strip().lower()
        url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()

        jobs: List[ScrapedJobPosting] = []
        company_name = slug.capitalize()
        for item in data.get("jobs", []):
            job_id = str(item.get("id"))
            title = item.get("title", "Untitled Role")
            job_url = item.get("jobUrl", f"https://jobs.ashbyhq.com/{slug}/{job_id}")

            location = item.get("locationName") or "Remote"
            is_remote = item.get("isRemote", False) or "remote" in location.lower()
            dept_name = item.get("departmentName")
            comp_tier = item.get("compensation", {})
            salary_str = None
            if comp_tier:
                min_val = comp_tier.get("minCompensation")
                max_val = comp_tier.get("maxCompensation")
                curr = comp_tier.get("currency", "USD")
                if min_val and max_val:
                    salary_str = f"{curr} {min_val:,.0f} - {max_val:,.0f}"

            snippet = clean_html_snippet(item.get("descriptionHtml", ""))

            jobs.append(
                ScrapedJobPosting(
                    id=f"ashby-{slug}-{job_id}",
                    title=title,
                    company_name=company_name,
                    company_domain=f"{slug}.com",
                    location=location,
                    remote_type="remote" if is_remote else "hybrid/onsite",
                    department=dept_name,
                    url=job_url,
                    salary_range=salary_str,
                    description_snippet=snippet,
                    source_type="ats_ashby",
                    posted_at=datetime.now(timezone.utc),
                )
            )
        return jobs

    # -------------------------------------------------------------------------
    # Technique 2 & 3: Schema.org JSON-LD and Heuristic DOM URL Scraper
    # -------------------------------------------------------------------------
    @staticmethod
    async def scrape_url(target_url: str) -> ScrapedJobPosting:
        """
        Universal URL Inspector:
        1. Checks for direct ATS URL patterns (Greenhouse/Lever/Ashby) and routes to direct API.
        2. Otherwise fetches HTML and extracts Schema.org JSON-LD (@type: JobPosting).
        3. Fallback: Semantic DOM & OpenGraph metadata parsing.
        """
        parsed = urllib.parse.urlparse(target_url)
        netloc = parsed.netloc.lower()
        path = parsed.path.strip("/")

        # Check for direct ATS patterns in URL
        if "greenhouse.io" in netloc:
            parts = path.split("/")
            slug = parts[0] if parts else ""
            if slug:
                try:
                    ats_jobs = await JobScraperService.scrape_greenhouse(slug)
                    for j in ats_jobs:
                        if target_url in j.url or (len(parts) > 2 and parts[2] in j.url):
                            return j
                    if ats_jobs:
                        return ats_jobs[0]
                except Exception as e:
                    logger.warning("ATS Greenhouse URL fallback failed: %s", e)

        if "lever.co" in netloc:
            parts = path.split("/")
            slug = parts[0] if parts else ""
            if slug:
                try:
                    ats_jobs = await JobScraperService.scrape_lever(slug)
                    for j in ats_jobs:
                        if target_url in j.url or (len(parts) > 1 and parts[1] in j.url):
                            return j
                    if ats_jobs:
                        return ats_jobs[0]
                except Exception as e:
                    logger.warning("ATS Lever URL fallback failed: %s", e)

        headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"}
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(target_url, headers=headers)
            resp.raise_for_status()
            html_text = resp.text

        soup = BeautifulSoup(html_text, "html.parser")

        # 1. Try extracting Schema.org JSON-LD (@type: "JobPosting")
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                content = script.string or script.get_text()
                if not content:
                    continue
                data = json.loads(content)
                job_obj = None

                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get("@type") == "JobPosting":
                            job_obj = item
                            break
                elif isinstance(data, dict):
                    if data.get("@type") == "JobPosting":
                        job_obj = data
                    elif "@graph" in data:
                        for item in data["@graph"]:
                            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                                job_obj = item
                                break

                if job_obj:
                    title = job_obj.get("title") or "Untitled Role"
                    hiring_org = job_obj.get("hiringOrganization", {})
                    company = hiring_org.get("name") if isinstance(hiring_org, dict) else str(hiring_org)
                    if not company:
                        company = parsed.netloc.split(".")[-2].capitalize() if "." in parsed.netloc else "Company"

                    # Location
                    loc_val = job_obj.get("jobLocation", {})
                    loc_str = "Remote"
                    if isinstance(loc_val, dict):
                        addr = loc_val.get("address", {})
                        if isinstance(addr, dict):
                            loc_str = f"{addr.get('addressLocality', '')}, {addr.get('addressRegion', '')}".strip(", ")
                        elif isinstance(addr, str):
                            loc_str = addr
                    elif isinstance(loc_val, list) and loc_val:
                        first = loc_val[0]
                        if isinstance(first, dict):
                            addr = first.get("address", {})
                            loc_str = addr.get("addressLocality", "Remote") if isinstance(addr, dict) else str(addr)

                    # Salary
                    salary = None
                    base_sal = job_obj.get("baseSalary", {})
                    if isinstance(base_sal, dict):
                        curr = base_sal.get("currency", "USD")
                        val = base_sal.get("value", {})
                        if isinstance(val, dict):
                            min_v = val.get("minValue")
                            max_v = val.get("maxValue")
                            if min_v and max_v:
                                salary = f"{curr} {min_v:,.0f} - {max_v:,.0f}"

                    desc_snippet = clean_html_snippet(job_obj.get("description", ""))

                    return ScrapedJobPosting(
                        id=f"jsonld-{abs(hash(target_url))}",
                        title=title,
                        company_name=company,
                        company_domain=parsed.netloc,
                        location=loc_str or "Remote",
                        remote_type="remote" if "remote" in (loc_str or "").lower() else "hybrid/onsite",
                        department=job_obj.get("occupationalCategory"),
                        url=target_url,
                        salary_range=salary,
                        description_snippet=desc_snippet,
                        source_type="json_ld",
                        posted_at=datetime.now(timezone.utc),
                    )
            except Exception as ex:
                logger.debug("Could not parse JSON-LD script: %s", ex)

        # 2. Heuristic DOM fallback
        h1_tag = soup.find("h1")
        title = h1_tag.get_text(strip=True) if h1_tag else None
        if not title:
            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else "Software Engineer"
            if " - " in title:
                title = title.split(" - ")[0]
            elif " | " in title:
                title = title.split(" | ")[0]

        og_site = soup.find("meta", property="og:site_name")
        company = og_site.get("content") if og_site else None
        if not company:
            company = parsed.netloc.split(".")[-2].capitalize() if "." in parsed.netloc else "Company"

        og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
        snippet = og_desc.get("content", "") if og_desc else ""
        if not snippet:
            p_tags = soup.find_all("p")
            snippet = " ".join([p.get_text(strip=True) for p in p_tags[:3]])[:300]

        return ScrapedJobPosting(
            id=f"dom-{abs(hash(target_url))}",
            title=title,
            company_name=company,
            company_domain=parsed.netloc,
            location="Remote / See Job URL",
            remote_type="remote",
            department="Engineering",
            url=target_url,
            description_snippet=snippet[:350],
            source_type="html_heuristic",
            posted_at=datetime.now(timezone.utc),
        )

    # -------------------------------------------------------------------------
    # Technique 4: Public Aggregator & Tech Feeds (RemoteOK)
    # -------------------------------------------------------------------------
    @staticmethod
    async def search_remoteok(query: str = "software", limit: int = 15) -> List[ScrapedJobPosting]:
        """
        Fetches live tech jobs from RemoteOK public JSON API:
        https://remoteok.com/api?tag={query}
        """
        tag = query.strip().lower().replace(" ", "-")
        url = f"https://remoteok.com/api?tag={tag}"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}

        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return []
            data = resp.json()

        jobs: List[ScrapedJobPosting] = []
        for item in data:
            if not isinstance(item, dict) or not item.get("position"):
                continue

            job_id = str(item.get("id"))
            title = item.get("position", "Software Engineer")
            company = item.get("company", "Tech Company")
            apply_url = item.get("url", f"https://remoteok.com/remote-jobs/{job_id}")
            location = item.get("location") or "Remote"
            salary = item.get("salary") or (
                f"${item.get('salary_min'):,} - ${item.get('salary_max'):,}"
                if item.get("salary_min") and item.get("salary_max")
                else None
            )
            snippet = clean_html_snippet(item.get("description", ""))

            tags = item.get("tags", [])
            dept = tags[0] if tags else "Tech"

            jobs.append(
                ScrapedJobPosting(
                    id=f"rok-{job_id}",
                    title=title,
                    company_name=company,
                    company_domain=f"{company.lower().replace(' ', '')}.com",
                    location=location,
                    remote_type="remote",
                    department=dept,
                    url=apply_url,
                    salary_range=salary,
                    description_snippet=snippet,
                    source_type="remoteok",
                    posted_at=datetime.now(timezone.utc),
                )
            )
            if len(jobs) >= limit:
                break

        return jobs
