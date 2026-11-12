import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import {
  Search,
  Building2,
  MapPin,
  DollarSign,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Plus,
  Globe,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  RefreshCw,
  Database,
  Sliders,
} from "lucide-react";

interface DiscoveredJob {
  externalId: string;
  source: string;
  companyName: string;
  title: string;
  url: string;
  location?: string | null;
  remoteClassification?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryRange?: string | null;
  currency?: string | null;
  skills?: string[] | null;
  publishedAt?: string | null;
  saved?: boolean;
}

interface SavedJob {
  id: string;
  jobPostingId: string;
  notes?: string | null;
  createdAt: string;
  posting: {
    id: string;
    companyName: string;
    title: string;
    url: string;
    location?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string | null;
    skills?: string[] | null;
  };
}

interface CareerPage {
  id: string;
  name: string;
  slug: string;
  provider: string;
  domain?: string | null;
  careerUrl?: string | null;
  isActive: boolean;
  syncFrequencyHours: number;
  lastSyncedAt?: string | null;
  lastSyncStatus: string;
  lastErrorMessage?: string | null;
  totalJobsFound: number;
}

export const JobDiscoveryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"search" | "extract" | "saved" | "admin">("search");
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [careerPages, setCareerPages] = useState<CareerPage[]>([]);
  const [loadingCareerPages, setLoadingCareerPages] = useState(false);
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);
  const [seedingPresets, setSeedingPresets] = useState(false);

  // New Board Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardSlug, setNewBoardSlug] = useState("");
  const [newBoardProvider, setNewBoardProvider] = useState("greenhouse");
  const [newBoardDomain, setNewBoardDomain] = useState("");
  const [savingBoard, setSavingBoard] = useState(false);

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [extractUrl, setExtractUrl] = useState("");
  const [extractedJob, setExtractedJob] = useState<DiscoveredJob | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const sources = [
    { id: "all", label: "All Aggregators" },
    { id: "remoteok", label: "RemoteOK" },
    { id: "remotive", label: "Remotive" },
    { id: "arbeitnow", label: "Arbeitnow" },
    { id: "greenhouse", label: "Greenhouse Boards" },
    { id: "lever", label: "Lever Boards" },
    { id: "ashby", label: "Ashby Boards" },
  ];

  const curatedCompanies = ["Stripe", "Figma", "Datadog", "Linear", "Vercel", "OpenAI", "Airbnb"];

  useEffect(() => {
    fetchCareerPages();
  }, []);

  useEffect(() => {
    if (activeTab === "search") {
      fetchJobs();
    } else if (activeTab === "saved") {
      fetchSavedJobs();
    } else if (activeTab === "admin") {
      fetchCareerPages();
    }
  }, [activeTab, selectedSource]);

  const fetchCareerPages = async () => {
    setLoadingCareerPages(true);
    try {
      const data = await apiFetch<CareerPage[]>("/api/jobs/career-pages");
      setCareerPages(Array.isArray(data) ? data : []);
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingCareerPages(false);
    }
  };

  const handleSyncCareerPage = async (page: CareerPage) => {
    setSyncingPageId(page.id);
    setError(null);
    try {
      const res = await apiFetch<any>(`/api/jobs/career-pages/${page.id}/sync`, {
        method: "POST",
      });
      setSuccessMsg(
        `Synchronized ${page.name}! Discovered ${res?.totalScraped || 0} roles (${res?.createdCount || 0} new, ${res?.observationsCount || 0} market observations recorded).`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
      await fetchCareerPages();
    } catch (err: any) {
      setError(err?.message || `Failed to sync ${page.name}. Ensure you are signed in.`);
    } finally {
      setSyncingPageId(null);
    }
  };

  const handleSeedPresets = async () => {
    setSeedingPresets(true);
    setError(null);
    try {
      const res = await apiFetch<any>("/api/jobs/career-pages/seed-presets", {
        method: "POST",
      });
      setSuccessMsg(`Registered ${res.added} preset companies into continuous discovery!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchCareerPages();
    } catch (err: any) {
      setError(err?.message || "Failed to seed preset companies. Ensure you are signed in.");
    } finally {
      setSeedingPresets(false);
    }
  };

  const handleCreateCareerPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim() || !newBoardSlug.trim()) return;
    setSavingBoard(true);
    setError(null);
    try {
      await apiFetch("/api/jobs/career-pages", {
        method: "POST",
        body: JSON.stringify({
          name: newBoardName.trim(),
          slug: newBoardSlug.trim().toLowerCase(),
          provider: newBoardProvider,
          domain: newBoardDomain.trim() || null,
          career_url: newBoardDomain.trim() ? `https://${newBoardDomain.trim()}/careers` : null,
          is_active: true,
          sync_frequency_hours: 24,
        }),
      });
      setSuccessMsg(`Registered ${newBoardName} for automated discovery!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setShowAddModal(false);
      setNewBoardName("");
      setNewBoardSlug("");
      setNewBoardDomain("");
      await fetchCareerPages();
    } catch (err: any) {
      setError(err?.message || "Failed to register career page. Make sure you are signed in.");
    } finally {
      setSavingBoard(false);
    }
  };

  const fetchJobs = async (queryToUse?: string, sourceToUse?: string) => {
    const qStr = queryToUse !== undefined ? queryToUse : searchQuery;
    const sStr = sourceToUse !== undefined ? sourceToUse : selectedSource;

    setLoading(true);
    setError(null);
    try {
      const q = qStr ? `&query=${encodeURIComponent(qStr)}` : "";
      const s = sStr !== "all" ? `&source=${encodeURIComponent(sStr)}` : "";
      const data = await apiFetch<any>(`/api/jobs/live-search?limit=24${q}${s}`);
      const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.items)
        ? data.items
        : [];

      const parsed: DiscoveredJob[] = list.map((j: any) => ({
        externalId: j.external_job_id || j.id || j.externalId,
        source: j.source_type || j.source || "aggregator",
        companyName: j.company_name || j.companyName || "Unknown",
        title: j.role_title || j.title || "Job Opportunity",
        url: j.job_url || j.url || "#",
        location: j.location || "Remote",
        remoteClassification: j.remote_type || j.remoteClassification || "Remote",
        salaryMin: j.salary_min ?? j.salaryMin ?? null,
        salaryMax: j.salary_max ?? j.salaryMax ?? null,
        salaryRange: j.salary_range ?? j.salaryRange ?? null,
        currency: j.currency || "USD",
        skills: j.skills || [],
        publishedAt: j.first_seen_at || j.publishedAt || j.posted_at || null,
        saved: j.saved || false,
      }));

      setJobs(parsed);
    } catch (err: any) {
      setError(err?.message || "Failed to search jobs from public APIs");
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedJobs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SavedJob[]>("/api/jobs/saved");
      setSavedJobs(data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load saved jobs");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJob = async (job: DiscoveredJob) => {
    try {
      const salaryRange =
        job.salaryRange ||
        (job.salaryMin && job.salaryMax
          ? `$${job.salaryMin.toLocaleString()} - $${job.salaryMax.toLocaleString()}`
          : job.salaryMin
          ? `$${job.salaryMin.toLocaleString()}+`
          : null);

      await apiFetch("/api/jobs/saved", {
        method: "POST",
        body: JSON.stringify({
          title: job.title,
          company_name: job.companyName,
          location: job.location || null,
          salary_range: salaryRange,
          job_url: job.url || null,
          tags: job.skills || [],
        }),
      });
      setSuccessMsg(`Saved "${job.title}" at ${job.companyName}`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setJobs(jobs.map((j) => (j.url === job.url ? { ...j, saved: true } : j)));
    } catch (err: any) {
      setError(err?.message || "Failed to save job");
    }
  };

  const handleImportToApplication = async (job: {
    companyName: string;
    title: string;
    url: string;
    location?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryRange?: string | null;
    currency?: string | null;
  }) => {
    try {
      const salaryRange =
        job.salaryRange ||
        (job.salaryMin && job.salaryMax
          ? `$${job.salaryMin.toLocaleString()} - $${job.salaryMax.toLocaleString()}`
          : job.salaryMin
          ? `$${job.salaryMin.toLocaleString()}+`
          : null);

      await apiFetch("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          company_name: job.companyName,
          role_title: job.title,
          job_url: job.url || null,
          location: job.location || null,
          salary_range: salaryRange,
          current_stage: "applied",
          tags: ["public-api-import"],
        }),
      });
      setSuccessMsg(`Added "${job.title}" at ${job.companyName} to your Tracked Applications!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to import job to applications. Ensure you are signed in.");
    }
  };

  const handleDeleteSavedJob = async (savedId: string) => {
    try {
      await apiFetch(`/api/jobs/saved/${savedId}`, { method: "DELETE" });
      setSavedJobs(savedJobs.filter((j) => j.id !== savedId));
    } catch (err: any) {
      setError(err?.message || "Failed to remove saved job");
    }
  };

  const handleExtractUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractUrl.trim()) return;
    setExtracting(true);
    setError(null);
    setExtractedJob(null);

    try {
      const data = await apiFetch<any>("/api/jobs/extract", {
        method: "POST",
        body: JSON.stringify({ url: extractUrl }),
      });
      if (data) {
        setExtractedJob({
          externalId: data.externalId || data.id || "extracted-1",
          source: data.source_type || data.source || "web_extract",
          companyName: data.company_name || data.companyName || "Unknown",
          title: data.role_title || data.title || "Job Opportunity",
          url: data.job_url || data.url || extractUrl,
          location: data.location || "Remote",
          remoteClassification: data.remote_type || "Remote",
          salaryMin: data.salary_min ?? data.salaryMin ?? null,
          salaryMax: data.salary_max ?? data.salaryMax ?? null,
          currency: data.currency || "USD",
          skills: data.skills || [],
          publishedAt: data.first_seen_at || new Date().toISOString(),
          saved: false,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to extract job from URL. Ensure the link is accessible.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f1ede6]">
            Job Discovery & Market Intelligence
          </h1>
          <p className="text-xs text-[#8f9cb5] mt-0.5">
            Discover roles across curated ATS boards, remote aggregators, or extract any external career posting.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-[#131926] border border-[#253048] rounded-md p-0.5">
          <button
            onClick={() => setActiveTab("search")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "search"
                ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Live Market Search
          </button>
          <button
            onClick={() => setActiveTab("extract")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "extract"
                ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Extract from URL
          </button>
          <button
            onClick={() => setActiveTab("saved")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "saved"
                ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Saved Roles ({savedJobs.length})
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "admin"
                ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Tracked ATS Boards ({careerPages.length})</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 rounded-md bg-[#34d399]/10 border border-[#34d399]/30 text-[#34d399] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: Live Market Search */}
      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Search bar & Aggregator Filters */}
          <div className="surface-card border-[#253048] p-4 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchJobs();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="text"
                  placeholder="Search by title (e.g. Senior Backend Engineer, Staff React)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-[#d4a853] text-[#080b12] text-sm font-semibold rounded-md hover:bg-[#e6c06a] transition-colors"
              >
                Search
              </button>
            </form>

            {/* Aggregator chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-[#57647d] mr-1 font-mono">Aggregator:</span>
              {sources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => {
                    setSelectedSource(src.id);
                    fetchJobs(searchQuery, src.id);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedSource === src.id
                      ? "bg-[#d4a853]/15 border-[#d4a853] text-[#d4a853] font-medium"
                      : "bg-[#1a2235] border-[#253048] text-[#8f9cb5] hover:text-[#f1ede6]"
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            {/* Quick Company Filters */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#253048]/60">
              <span className="text-[11px] text-[#57647d] mr-1 font-mono">Curated:</span>
              {curatedCompanies.map((comp) => (
                <button
                  key={comp}
                  onClick={() => {
                    setSearchQuery(comp);
                    fetchJobs(comp, selectedSource);
                  }}
                  className="text-xs px-2 py-0.5 rounded bg-[#0c1019] border border-[#253048] text-[#8f9cb5] hover:text-[#d4a853] hover:border-[#d4a853]/40 transition-colors"
                >
                  {comp}
                </button>
              ))}
            </div>
          </div>

          {/* Job Listings Grid */}
          {loading ? (
            <div className="py-24 text-center text-sm text-[#8f9cb5]">
              Querying job aggregators and parsing ATS feeds...
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#8f9cb5] surface-card border-[#253048]">
              No active job postings matched your query. Try adjusting your title search or select another aggregator.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job, idx) => (
                <div
                  key={`${job.externalId}-${idx}`}
                  className="surface-card border-[#253048] p-4 flex flex-col justify-between hover:border-[#3b4d73] transition-colors group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[#a78bfa] block mb-0.5">
                          {job.source}
                        </span>
                        <h3 className="text-sm font-semibold text-[#f1ede6] group-hover:text-[#d4a853] transition-colors leading-snug">
                          {job.title}
                        </h3>
                        <span className="text-xs font-medium text-[#8f9cb5] mt-1 block">
                          {job.companyName}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[#8f9cb5]">
                      {job.location && (
                        <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048]">
                          <MapPin className="w-2.5 h-2.5 text-[#d4a853]" />
                          {job.location}
                        </span>
                      )}
                      {job.remoteClassification && (
                        <span className="bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048] text-[#38bdf8] uppercase">
                          {job.remoteClassification}
                        </span>
                      )}
                      {(job.salaryMin || job.salaryMax || job.salaryRange) && (
                        <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048] text-[#34d399] font-mono">
                          <DollarSign className="w-2.5 h-2.5" />
                          {job.salaryRange
                            ? job.salaryRange
                            : job.salaryMin && job.salaryMax
                            ? `${job.salaryMin.toLocaleString("en-US")} - ${job.salaryMax.toLocaleString("en-US")}`
                            : `${job.salaryMin?.toLocaleString("en-US")}+`}
                        </span>
                      )}
                    </div>

                    {job.skills && job.skills.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {job.skills.slice(0, 4).map((sk) => (
                          <span
                            key={sk}
                            className="text-[10px] bg-[#0c1019] text-[#8f9cb5] px-1.5 py-0.5 rounded border border-[#253048]"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-[#253048]/60 flex items-center justify-between">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#60a5fa] hover:underline flex items-center gap-1"
                    >
                      Listing <ExternalLink className="w-3 h-3" />
                    </a>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSaveJob(job)}
                        className={`p-1.5 rounded border transition-colors ${
                          job.saved
                            ? "bg-[#34d399]/15 border-[#34d399] text-[#34d399]"
                            : "bg-[#1a2235] border-[#253048] text-[#8f9cb5] hover:text-[#f1ede6]"
                        }`}
                        title="Save Job"
                      >
                        {job.saved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => handleImportToApplication(job)}
                        className="px-2.5 py-1 text-xs font-medium rounded bg-[#1a2235] text-[#d4a853] border border-[#253048] hover:border-[#d4a853] transition-colors"
                      >
                        + Track
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Extract from URL */}
      {activeTab === "extract" && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="surface-card border-[#253048] p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#f1ede6]">
                Generic Career Page Extractor
              </h2>
              <p className="text-xs text-[#8f9cb5] mt-1">
                Paste any job posting or career URL. Track executes SSRF-safe HTML streaming, extracts Schema.org JSON-LD / OpenGraph metadata, and normalizes compensation and skill requirements.
              </p>
            </div>

            <form onSubmit={handleExtractUrl} className="space-y-3">
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="url"
                  required
                  placeholder="https://jobs.lever.co/example/uuid or https://company.com/careers/role"
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <button
                type="submit"
                disabled={extracting}
                className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
              >
                {extracting ? "Extracting & Normalizing..." : "Extract Job Listing"}
              </button>
            </form>
          </div>

          {/* Extracted Preview Result */}
          {extractedJob && (
            <div className="surface-card border-[#253048] p-5 space-y-4 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-[#34d399] uppercase block mb-1">
                    Extraction Succeeded ({extractedJob.source})
                  </span>
                  <h3 className="text-base font-bold text-[#f1ede6]">
                    {extractedJob.title}
                  </h3>
                  <p className="text-xs text-[#8f9cb5] mt-0.5">
                    {extractedJob.companyName}
                  </p>
                </div>
                <button
                  onClick={() => handleImportToApplication(extractedJob)}
                  className="px-3.5 py-1.5 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors"
                >
                  + Add to Tracker
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#253048]/60 text-xs">
                {extractedJob.location && (
                  <div>
                    <span className="text-[10px] text-[#57647d] font-mono block">Location</span>
                    <span className="text-[#f1ede6]">{extractedJob.location}</span>
                  </div>
                )}
                {extractedJob.remoteClassification && (
                  <div>
                    <span className="text-[10px] text-[#57647d] font-mono block">Workplace Type</span>
                    <span className="text-[#38bdf8] uppercase font-semibold">{extractedJob.remoteClassification}</span>
                  </div>
                )}
                {(extractedJob.salaryMin || extractedJob.salaryMax) && (
                  <div>
                    <span className="text-[10px] text-[#57647d] font-mono block">Compensation</span>
                    <span className="text-[#34d399] font-mono">
                      ${extractedJob.salaryMin?.toLocaleString("en-US")} - ${extractedJob.salaryMax?.toLocaleString("en-US")}
                    </span>
                  </div>
                )}
              </div>

              {extractedJob.skills && extractedJob.skills.length > 0 && (
                <div>
                  <span className="text-[10px] text-[#57647d] font-mono block mb-1">Detected Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {extractedJob.skills.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-[#1a2235] text-[#8f9cb5] border border-[#253048]">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Saved Jobs */}
      {activeTab === "saved" && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-20 text-center text-sm text-[#8f9cb5]">
              Loading saved positions...
            </div>
          ) : savedJobs.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#8f9cb5] surface-card border-[#253048]">
              No saved jobs found. Browse live roles and click the bookmark icon to save opportunities.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedJobs.map((item) => (
                <div
                  key={item.id}
                  className="surface-card border-[#253048] p-4 flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-[#f1ede6]">
                      {item.posting.title}
                    </h3>
                    <span className="text-xs text-[#8f9cb5] mt-0.5 block">
                      {item.posting.companyName}
                    </span>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[#8f9cb5]">
                      {item.posting.location && (
                        <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048]">
                          <MapPin className="w-2.5 h-2.5 text-[#d4a853]" />
                          {item.posting.location}
                        </span>
                      )}
                      {(item.posting.salaryMin || item.posting.salaryMax) && (
                        <span className="text-[#34d399] font-mono bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048]">
                          ${item.posting.salaryMin?.toLocaleString("en-US")} - ${item.posting.salaryMax?.toLocaleString("en-US")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#253048]/60 flex items-center justify-between">
                    <button
                      onClick={() => handleDeleteSavedJob(item.id)}
                      className="text-xs text-[#fb7185] hover:text-[#fb7185]/80 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>

                    <button
                      onClick={() => handleImportToApplication(item.posting)}
                      className="px-3 py-1 rounded bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors"
                    >
                      + Move to Tracker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Tracked Career Pages & Discovery Admin */}
      {activeTab === "admin" && (
        <div className="space-y-6">
          {/* Header Actions */}
          <div className="surface-card border-[#253048] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#f1ede6] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#d4a853]" />
                Tracked ATS Career Pages & Continuous Discovery
              </h2>
              <p className="text-xs text-[#8f9cb5] mt-1 max-w-2xl">
                Configure direct ATS integrations (Greenhouse, Lever, Ashby, Workable) for automated discovery. Track scrapes open jobs, performs deduplication, and records market observations into your database.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSeedPresets}
                disabled={seedingPresets}
                className="px-3.5 py-2 rounded-md bg-[#1a2235] text-[#d4a853] text-xs font-medium border border-[#253048] hover:border-[#d4a853]/60 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{seedingPresets ? "Seeding Presets..." : "Seed Tech Presets"}</span>
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="px-3.5 py-2 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Register Board</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="surface-card border-[#253048] p-4 rounded-xl">
              <span className="text-[11px] text-[#8f9cb5] font-mono">Tracked Company Boards</span>
              <div className="text-xl font-bold text-[#f1ede6] mt-1">{careerPages.length}</div>
            </div>
            <div className="surface-card border-[#253048] p-4 rounded-xl">
              <span className="text-[11px] text-[#8f9cb5] font-mono">Total Positions Discovered</span>
              <div className="text-xl font-bold text-[#34d399] mt-1 font-mono">
                {careerPages.reduce((acc, p) => acc + (p.totalJobsFound || 0), 0)}
              </div>
            </div>
            <div className="surface-card border-[#253048] p-4 rounded-xl">
              <span className="text-[11px] text-[#8f9cb5] font-mono">Discovery Synchronization</span>
              <div className="text-xl font-bold text-[#38bdf8] mt-1 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Every 24h
              </div>
            </div>
          </div>

          {/* Boards List */}
          {loadingCareerPages ? (
            <div className="py-20 text-center text-sm text-[#8f9cb5]">
              Loading tracked company career boards...
            </div>
          ) : careerPages.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#8f9cb5] surface-card border-[#253048] space-y-3">
              <Building2 className="w-8 h-8 text-[#57647d] mx-auto" />
              <p>No company ATS career pages registered in your database yet.</p>
              <button
                onClick={handleSeedPresets}
                disabled={seedingPresets}
                className="px-4 py-2 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors inline-flex items-center gap-1.5"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Seed 10 Curated Tech Presets (Stripe, Figma, OpenAI...)</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {careerPages.map((page) => {
                const isSyncing = syncingPageId === page.id;
                const providerColor =
                  page.provider === "greenhouse"
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : page.provider === "lever"
                    ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : page.provider === "ashby"
                    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    : "text-sky-400 border-sky-500/30 bg-sky-500/10";

                return (
                  <div
                    key={page.id}
                    className="surface-card border-[#253048] p-4 flex flex-col justify-between hover:border-[#3b4d73] transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#f1ede6]">{page.name}</h3>
                            <span
                              className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border font-semibold ${providerColor}`}
                            >
                              {page.provider}
                            </span>
                          </div>
                          <span className="text-xs text-[#8f9cb5] font-mono mt-1 block">
                            board slug: {page.slug}
                          </span>
                        </div>

                        {page.domain && (
                          <a
                            href={`https://${page.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[#57647d] hover:text-[#d4a853] transition-colors"
                            title={`Visit ${page.domain}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="mt-3.5 space-y-1.5 text-xs text-[#8f9cb5]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#57647d]">Jobs Found:</span>
                          <span className="font-mono text-[#f1ede6] font-semibold">
                            {page.totalJobsFound || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#57647d]">Sync Status:</span>
                          <span
                            className={`text-[10px] uppercase font-mono px-1.5 py-0.2 rounded ${
                              page.lastSyncStatus === "syncing"
                                ? "text-amber-400 bg-amber-500/10"
                                : page.lastSyncStatus === "error"
                                ? "text-rose-400 bg-rose-500/10"
                                : "text-emerald-400 bg-emerald-500/10"
                            }`}
                          >
                            {page.lastSyncStatus || "idle"}
                          </span>
                        </div>
                        {page.lastSyncedAt && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#57647d]">Last Synced:</span>
                            <span className="text-[#8f9cb5]">
                              {new Date(page.lastSyncedAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {page.lastErrorMessage && (
                          <p className="text-[10px] text-rose-400 mt-1 line-clamp-1">
                            {page.lastErrorMessage}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#253048]/60 flex items-center justify-end">
                      <button
                        onClick={() => handleSyncCareerPage(page)}
                        disabled={isSyncing}
                        className="px-3 py-1.5 rounded bg-[#1a2235] text-[#d4a853] text-xs font-semibold border border-[#253048] hover:border-[#d4a853] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                        <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Board Modal */}
          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
              <div className="surface-card border-[#253048] max-w-md w-full p-6 space-y-4 rounded-xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#253048] pb-3">
                  <h3 className="text-base font-bold text-[#f1ede6]">
                    Register Company Career Board
                  </h3>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="text-xs text-[#8f9cb5] hover:text-[#f1ede6]"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateCareerPage} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[#8f9cb5] mb-1 font-medium">Company Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. OpenAI, Stripe, Linear"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8f9cb5] mb-1 font-medium">ATS Provider *</label>
                    <select
                      value={newBoardProvider}
                      onChange={(e) => setNewBoardProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
                    >
                      <option value="greenhouse">Greenhouse (boards-api.greenhouse.io)</option>
                      <option value="lever">Lever (api.lever.co)</option>
                      <option value="ashby">Ashby (api.ashbyhq.com)</option>
                      <option value="workable">Workable (apply.workable.com)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#8f9cb5] mb-1 font-medium">
                      Board Slug / Subdomain *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. stripe (for boards.greenhouse.io/stripe)"
                      value={newBoardSlug}
                      onChange={(e) => setNewBoardSlug(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8f9cb5] mb-1 font-medium">Domain (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. stripe.com"
                      value={newBoardDomain}
                      onChange={(e) => setNewBoardDomain(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#253048]/60">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-3.5 py-1.5 rounded text-xs text-[#8f9cb5] hover:text-[#f1ede6]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingBoard}
                      className="px-4 py-2 rounded bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
                    >
                      {savingBoard ? "Registering..." : "Register Career Board"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

