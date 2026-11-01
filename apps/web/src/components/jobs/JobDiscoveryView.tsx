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

export const JobDiscoveryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"search" | "extract" | "saved">("search");
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
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
    if (activeTab === "search") {
      fetchJobs();
    } else if (activeTab === "saved") {
      fetchSavedJobs();
    }
  }, [activeTab, selectedSource]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : "";
      const s = selectedSource !== "all" ? `&source=${selectedSource}` : "";
      const data = await apiFetch<DiscoveredJob[]>(`/api/jobs/search?limit=24${q}${s}`);
      setJobs(data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to search jobs");
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
      await apiFetch("/api/jobs/save", {
        method: "POST",
        body: JSON.stringify({
          source: job.source,
          externalId: job.externalId,
          companyName: job.companyName,
          title: job.title,
          url: job.url,
          location: job.location,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          skills: job.skills,
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
    currency?: string | null;
  }) => {
    try {
      await apiFetch("/api/jobs/import-to-application", {
        method: "POST",
        body: JSON.stringify({
          companyName: job.companyName,
          roleTitle: job.title,
          jobUrl: job.url,
          location: job.location,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          initialStage: "applied",
        }),
      });
      setSuccessMsg(`Added "${job.title}" to your Tracked Applications!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to import job to applications");
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
      const data = await apiFetch<DiscoveredJob>("/api/jobs/extract-url", {
        method: "POST",
        body: JSON.stringify({ url: extractUrl }),
      });
      setExtractedJob(data);
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
                  onClick={() => setSelectedSource(src.id)}
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
                    fetchJobs();
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
                      {(job.salaryMin || job.salaryMax) && (
                        <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048] text-[#34d399] font-mono">
                          <DollarSign className="w-2.5 h-2.5" />
                          {job.salaryMin?.toLocaleString("en-US")} - {job.salaryMax?.toLocaleString("en-US")}
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
    </div>
  );
};

