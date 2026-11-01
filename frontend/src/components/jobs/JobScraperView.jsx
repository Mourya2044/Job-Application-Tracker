import React, { useState, useEffect } from "react"
import {
  Search,
  MapPin,
  Briefcase,
  DollarSign,
  Bookmark,
  ExternalLink,
  Plus,
  Check,
  Sparkles,
  Globe,
  RefreshCw,
  Building2,
  SlidersHorizontal,
  X,
  Settings,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { fetchApi } from "@/config/api"

const POPULAR_COMPANIES = [
  { name: "Stripe", slug: "stripe", provider: "greenhouse", color: "#60a5fa" },
  { name: "Vercel", slug: "vercel", provider: "greenhouse", color: "#e8e4dc" },
  { name: "Figma", slug: "figma", provider: "lever", color: "#d4a853" },
  { name: "Airbnb", slug: "airbnb", provider: "greenhouse", color: "#fb7185" },
  { name: "Cloudflare", slug: "cloudflare", provider: "greenhouse", color: "#fbbf24" },
  { name: "Linear", slug: "linear", provider: "ashby", color: "#a78bfa" },
]

export function JobScraperView({ onImportJob }) {
  const [searchInput, setSearchInput] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [jobs, setJobs] = useState([])
  const [savedJobIds, setSavedJobIds] = useState(new Set())
  const [trackedJobIds, setTrackedJobIds] = useState(new Set())
  const [isSearching, setIsSearching] = useState(false)
  const [showAdvancedScraper, setShowAdvancedScraper] = useState(false)

  // Dynamic Company Career Pages state
  const [companiesList, setCompaniesList] = useState(POPULAR_COMPANIES)
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false)
  const [adminCompanies, setAdminCompanies] = useState([])
  const [adminSearchQuery, setAdminSearchQuery] = useState("")
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false)
  const [syncingCompanyId, setSyncingCompanyId] = useState(null)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState(null)
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: "",
    slug: "",
    provider: "greenhouse",
    domain: "",
    career_url: "",
  })
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCompany, setNewCompany] = useState({
    name: "",
    slug: "",
    provider: "greenhouse",
    domain: "",
    career_url: "",
    logo_color: "#60a5fa",
  })

  // Advanced scraper states
  const [atsProvider, setAtsProvider] = useState("greenhouse")
  const [atsSlug, setAtsSlug] = useState("stripe")

  // AI Fit Inspector states (ZeroGPU enabled)
  const [selectedFitJob, setSelectedFitJob] = useState(null)
  const [isFitModalOpen, setIsFitModalOpen] = useState(false)
  const [isAnalyzingFit, setIsAnalyzingFit] = useState(false)
  const [fitResult, setFitResult] = useState(null)
  const [candidateResume, setCandidateResume] = useState(() => {
    return localStorage.getItem("job_tracker_user_resume") ||
      "Full-stack software engineer with experience in Python, FastAPI, React, PostgreSQL, Docker, AWS, and system design."
  })

  const handleInspectFit = async (job) => {
    setSelectedFitJob(job)
    setIsFitModalOpen(true)
    setIsAnalyzingFit(true)
    setFitResult(null)

    const storedResume = localStorage.getItem("job_tracker_user_resume") || candidateResume

    try {
      const data = await fetchApi("/api/ai/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: storedResume,
          job_description: `${job.title} at ${job.company_name}. Location: ${job.location || 'Remote'}. Tags: ${(job.tags || []).join(', ')}`,
          job_title: job.title,
          company: job.company_name,
        }),
      })
      setFitResult(data)
    } catch {
      toast.error("Failed to analyze job fit")
    } finally {
      setIsAnalyzingFit(false)
    }
  }

  const filters = [
    { key: "all", label: "All" },
    { key: "remote", label: "Remote" },
    { key: "full-time", label: "Full-time" },
    { key: "entry", label: "Entry Level" },
    { key: "senior", label: "Mid-Senior" },
    { key: "100k", label: "$100k+" },
    { key: "150k", label: "$150k+" },
  ]

  useEffect(() => {
    loadSavedJobs()
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    try {
      const data = await fetchApi("/api/jobs/popular-companies")
      if (data && Array.isArray(data) && data.length > 0) {
        setCompaniesList(data)
      }
    } catch {
      // Keep static defaults on error
    }
  }

  const loadAdminCompanies = async () => {
    setIsLoadingAdmin(true)
    try {
      const data = await fetchApi("/api/admin/career-pages")
      if (data && Array.isArray(data)) {
        setAdminCompanies(data)
      }
    } catch {
      toast.error("Failed to load company career pages")
    } finally {
      setIsLoadingAdmin(false)
    }
  }

  const handleCreateCompany = async (e) => {
    e.preventDefault()
    if (!newCompany.name.trim() || (!newCompany.slug.trim() && !newCompany.career_url.trim())) {
      toast.error("Please provide company name and slug or career URL")
      return
    }
    try {
      await fetchApi("/api/admin/career-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCompany.name.trim(),
          slug: newCompany.slug.trim() || newCompany.name.trim().toLowerCase(),
          provider: newCompany.provider,
          domain: newCompany.domain.trim() || undefined,
          career_url: newCompany.career_url.trim() || undefined,
          logo_color: newCompany.logo_color,
          is_active: true,
        }),
      })
      toast.success(`Registered ${newCompany.name} career page`)
      setNewCompany({ name: "", slug: "", provider: "greenhouse", domain: "", career_url: "", logo_color: "#60a5fa" })
      setShowAddForm(false)
      loadAdminCompanies()
      loadCompanies()
    } catch (err) {
      toast.error(err.message || "Failed to add company")
    }
  }

  const handleToggleCompanyActive = async (comp) => {
    try {
      await fetchApi(`/api/admin/career-pages/${comp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !comp.is_active }),
      })
      toast.success(`${comp.name} is now ${!comp.is_active ? "active" : "inactive"}`)
      loadAdminCompanies()
      loadCompanies()
    } catch {
      toast.error("Failed to update status")
    }
  }

  const handleDeleteCompany = async (comp) => {
    if (!window.confirm(`Are you sure you want to remove ${comp.name} from monitored companies?`)) return
    try {
      await fetchApi(`/api/admin/career-pages/${comp.id}`, { method: "DELETE" })
      toast.info(`Removed ${comp.name}`)
      loadAdminCompanies()
      loadCompanies()
    } catch {
      toast.error("Failed to delete company")
    }
  }

  const handleSyncCompany = async (comp) => {
    setSyncingCompanyId(comp.id)
    try {
      const res = await fetchApi(`/api/admin/career-pages/${comp.id}/sync`, { method: "POST" })
      if (res.status === "success") {
        toast.success(`Synced ${comp.name}: found ${res.jobs_count} live postings`)
      } else {
        toast.error(`Sync failed for ${comp.name}: ${res.message}`)
      }
      loadAdminCompanies()
      loadCompanies()
    } catch (err) {
      toast.error(err.message || `Failed to sync ${comp.name}`)
    } finally {
      setSyncingCompanyId(null)
    }
  }

  const handleSyncAllCompanies = async () => {
    setIsSyncingAll(true)
    try {
      const results = await fetchApi("/api/admin/career-pages/sync-all", { method: "POST" })
      const okCount = Array.isArray(results) ? results.filter(r => r.status === "success").length : 0
      toast.success(`Batch sync complete: ${okCount} active portals updated`)
      loadAdminCompanies()
      loadCompanies()
    } catch (err) {
      toast.error(err.message || "Batch sync failed")
    } finally {
      setIsSyncingAll(false)
    }
  }

  const handleStartEditCompany = (comp) => {
    setEditingCompanyId(comp.id)
    setEditCompanyForm({
      name: comp.name || "",
      slug: comp.slug || "",
      provider: comp.provider || "greenhouse",
      domain: comp.domain || "",
      career_url: comp.career_url || "",
    })
  }

  const handleSaveEditCompany = async (compId) => {
    if (!editCompanyForm.name.trim() || !editCompanyForm.slug.trim()) {
      toast.error("Company name and slug are required")
      return
    }
    try {
      await fetchApi(`/api/admin/career-pages/${compId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCompanyForm.name.trim(),
          slug: editCompanyForm.slug.trim(),
          provider: editCompanyForm.provider,
          domain: editCompanyForm.domain.trim() || null,
          career_url: editCompanyForm.career_url.trim() || null,
        }),
      })
      toast.success(`Updated ${editCompanyForm.name}`)
      setEditingCompanyId(null)
      loadAdminCompanies()
      loadCompanies()
    } catch (err) {
      toast.error(err.message || "Failed to update company")
    }
  }

  const loadSavedJobs = async () => {
    try {
      const savedList = await fetchApi("/api/jobs/saved")
      if (savedList && Array.isArray(savedList)) {
        const idSet = new Set(savedList.map(j => j.id || j.title))
        setSavedJobIds(idSet)
      }
    } catch {
      // ignore
    }
  }

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    if (!searchInput.trim()) {
      return
    }

    setIsSearching(true)
    try {
      const data = await fetchApi(`/api/jobs/search?query=${encodeURIComponent(searchInput.trim())}&limit=12`)
      if (data && data.length > 0) {
        const mapped = data.map((d, i) => ({
          id: d.id || `live-${i}`,
          title: d.title,
          company_name: d.company_name,
          logoLetter: d.company_name ? d.company_name.charAt(0).toUpperCase() : "J",
          logoBg: "rgba(212, 168, 53, 0.12)",
          logoColor: "#d4a853",
          location: d.location || "Remote",
          job_type: d.remote_type || "Full-time",
          salary_range: d.salary_range || null,
          tags: d.department ? [d.department, "Tech"] : ["Engineering"],
          posted_date: "Recently",
          url: d.url,
        }))
        setJobs(mapped)
        toast.success(`Found ${mapped.length} jobs for "${searchInput}"`)
      } else {
        setJobs([])
        toast.info(`No live jobs found for "${searchInput}". Try another keyword or popular company.`)
      }
    } catch {
      toast.error("Failed to search live jobs")
    } finally {
      setIsSearching(false)
    }
  }

  const handleExploreCompany = async (comp) => {
    setAtsProvider(comp.provider)
    setAtsSlug(comp.slug)
    setIsSearching(true)
    try {
      const data = await fetchApi(`/api/jobs/scrape/ats?provider=${comp.provider}&company=${encodeURIComponent(comp.slug)}`)
      if (data && data.length > 0) {
        const mapped = data.map((d, i) => ({
          id: d.id || `${comp.slug}-${i}`,
          title: d.title,
          company_name: d.company_name || comp.name,
          logoLetter: comp.name.charAt(0).toUpperCase(),
          logoBg: "rgba(212, 168, 53, 0.12)",
          logoColor: comp.color || "#d4a853",
          location: d.location || "Remote",
          job_type: "Full-time",
          salary_range: d.salary_range || null,
          tags: d.department ? [d.department] : ["Software"],
          posted_date: "Active Posting",
          url: d.url,
        }))
        setJobs(mapped)
        toast.success(`Loaded ${mapped.length} live positions from ${comp.name}`)
      } else {
        toast.info(`No public postings found for ${comp.name}`)
      }
    } catch (err) {
      toast.error(err.message || `Failed to fetch postings from ${comp.name}`)
    } finally {
      setIsSearching(false)
    }
  }

  const toggleSave = async (job) => {
    const isSaved = savedJobIds.has(job.id)
    if (isSaved) {
      setSavedJobIds(prev => {
        const next = new Set(prev)
        next.delete(job.id)
        return next
      })
      toast.info(`Removed ${job.company_name} from saved jobs`)
      try {
        await fetchApi(`/api/jobs/saved/${job.id}`, { method: "DELETE" })
      } catch {
        // ignore
      }
    } else {
      setSavedJobIds(prev => new Set(prev).add(job.id))
      toast.success(`Job saved to your list: ${job.title} at ${job.company_name}`)
      try {
        await fetchApi("/api/jobs/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: job.title,
            company_name: job.company_name,
            location: job.location,
            job_type: job.job_type,
            salary_range: job.salary_range,
            job_url: job.url,
            tags: Array.isArray(job.tags) ? job.tags.join(", ") : job.tags,
            posted_date: job.posted_date,
          }),
        })
      } catch {
        // ignore
      }
    }
  }

  const handleApplyOrTrack = async (job) => {
    try {
      await fetchApi("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: job.company_name,
          role_title: job.title,
          location: job.location,
          salary_range: job.salary_range,
          job_url: job.url,
          current_stage: "applied",
          tags: "Job Search",
          next_step: "Review application confirmation email",
        }),
      })
      setTrackedJobIds(prev => new Set(prev).add(job.id))
      toast.success(`Tracking started for ${job.company_name} — ${job.title}`)
      if (onImportJob) onImportJob()
    } catch {
      // If already tracked or popup direct url
      if (job.url) {
        window.open(job.url, "_blank")
      }
    }
  }

  const handleAtsScrape = async () => {
    if (!atsSlug.trim()) return
    setIsSearching(true)
    try {
      const data = await fetchApi(`/api/jobs/scrape/ats?provider=${atsProvider}&company=${encodeURIComponent(atsSlug.trim())}`)
      if (data && data.length > 0) {
        const mapped = data.map((d, i) => ({
          id: d.id || `ats-${i}`,
          title: d.title,
          company_name: d.company_name,
          logoLetter: d.company_name ? d.company_name.charAt(0).toUpperCase() : "J",
          logoBg: "rgba(96, 165, 250, 0.12)",
          logoColor: "#60a5fa",
          location: d.location || "Remote",
          job_type: "Full-time",
          salary_range: d.salary_range || "$140k – $220k",
          tags: d.department ? [d.department] : ["Software"],
          posted_date: "Posted recently",
          url: d.url,
        }))
        setJobs(mapped)
        toast.success(`Loaded ${mapped.length} positions from ${atsSlug.toUpperCase()} (${atsProvider})`)
      } else {
        toast.info(`No public postings found for ${atsSlug}`)
      }
    } catch (err) {
      toast.error(err.message || "Failed to scrape ATS")
    } finally {
      setIsSearching(false)
    }
  }

  // Filter jobs by search query and filter pills
  const filteredJobs = jobs.filter(j => {
    const q = searchInput.toLowerCase()
    const matchesSearch = !q ||
      j.title.toLowerCase().includes(q) ||
      j.company_name.toLowerCase().includes(q) ||
      (j.tags && j.tags.some(t => t.toLowerCase().includes(q)))

    let matchesFilter = true
    if (activeFilter === "remote") {
      matchesFilter = j.location.toLowerCase().includes("remote")
    } else if (activeFilter === "full-time") {
      matchesFilter = j.job_type.toLowerCase().includes("full-time")
    } else if (activeFilter === "entry") {
      matchesFilter = !j.title.toLowerCase().includes("senior") && !j.title.toLowerCase().includes("staff")
    } else if (activeFilter === "senior") {
      matchesFilter = j.title.toLowerCase().includes("senior") || j.title.toLowerCase().includes("staff") || j.title.toLowerCase().includes("lead")
    } else if (activeFilter === "100k") {
      matchesFilter = true
    } else if (activeFilter === "150k") {
      matchesFilter = j.salary_range && (j.salary_range.includes("150") || j.salary_range.includes("160") || j.salary_range.includes("180") || j.salary_range.includes("200"))
    }

    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-6 animate-fadeUp">
      {/* Header matching code.html */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-serif text-[#e8e4dc]">
            Job Search
          </h1>
          <p className="text-[#8a94a8] text-sm mt-1.5">
            Find your next opportunity. Save listings to track later.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setIsAdminModalOpen(true)
              loadAdminCompanies()
            }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[rgba(212,168,53,0.35)] bg-[rgba(212,168,53,0.08)] text-xs font-mono text-[#d4a853] hover:bg-[rgba(212,168,53,0.16)] transition-all shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Manage Career Pages</span>
          </button>

          <button
            onClick={() => setShowAdvancedScraper(!showAdvancedScraper)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showAdvancedScraper ? "Hide ATS Explorer" : "Direct ATS Explorer"}</span>
          </button>
        </div>
      </div>


      {/* Advanced ATS Explorer Accordion */}
      {showAdvancedScraper && (
        <div className="p-4 rounded-xl bg-[#131926] border border-[#253048] space-y-3 animate-fadeUp">
          <div className="flex items-center gap-2 font-mono text-xs text-[#d4a853]">
            <Building2 className="w-4 h-4" />
            <span>Direct Public ATS Live Extractor</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={atsProvider}
              onChange={(e) => setAtsProvider(e.target.value)}
              className="h-9 rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
              <option value="workable">Workable</option>
            </select>
            <input
              type="text"
              placeholder="Company slug (e.g. stripe, vercel, figma, cloudflare)"
              value={atsSlug}
              onChange={(e) => setAtsSlug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAtsScrape()}
              className="flex-1 min-w-[200px] h-9 rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] font-mono focus:outline-none focus:border-[#d4a853]"
            />
            <button
              onClick={handleAtsScrape}
              disabled={isSearching}
              className="px-4 h-9 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? "animate-spin" : ""}`} />
              <span>Fetch Postings</span>
            </button>
          </div>
        </div>
      )}

      {/* Search Bar Wrap matching code.html */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#556178]" />
          <input
            type="text"
            placeholder="Search roles, companies, or keywords..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full h-12 pl-11 pr-4 bg-[#131926] border border-[#253048] rounded-xl text-sm text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-serif transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="px-7 rounded-xl bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all shadow-sm hover:-translate-y-0.5 disabled:opacity-50"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Quick ATS Source Pills & Deduplication Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#556178] text-[11px]">Explore Live ATS:</span>
          {companiesList.map(comp => (
            <button
              key={comp.slug || comp.id}
              type="button"
              onClick={() => handleExploreCompany(comp)}
              disabled={isSearching}
              className="px-2.5 py-1 rounded-md bg-[#131926] border border-[#253048] hover:border-[#d4a853] text-[#8a94a8] hover:text-[#d4a853] transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: comp.color || comp.logo_color || "#60a5fa" }}
              />
              <span>{comp.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setIsAdminModalOpen(true)
              loadAdminCompanies()
            }}
            className="px-2 py-1 rounded-md border border-dashed border-[#253048] hover:border-[#d4a853] text-[#556178] hover:text-[#d4a853] transition-colors flex items-center gap-1 text-[11px]"
            title="Register new company career portal"
          >
            <Plus className="w-3 h-3" />
            <span>Manage</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.2)] text-[#34d399] text-[11px] font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Deduplication: Jaccard + Edit Dist + Vectors</span>
        </div>
      </div>


      {/* Filter Pills matching code.html */}
      <div className="flex flex-wrap gap-2">
        {filters.map(f => {
          const isActive = activeFilter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`font-mono text-xs px-3.5 py-1.5 rounded-full border transition-all ${isActive
                  ? "bg-[rgba(212,168,53,0.15)] border-[#d4a853] text-[#d4a853] font-semibold"
                  : "border-[#253048] text-[#8a94a8] hover:border-[#556178] hover:text-[#e8e4dc]"
                }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Job Results List matching code.html */}
      <div className="space-y-3.5">
        {filteredJobs.length === 0 ? (
          isSearching ? (
            <div className="text-center py-16 bg-[#131926] border border-[#253048] rounded-xl text-[#d4a853] font-mono text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Fetching live postings...</span>
            </div>
          ) : jobs.length === 0 && !searchInput.trim() ? (
            <div className="text-center py-16 bg-[#131926] border border-[#253048] rounded-xl p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-[rgba(212,168,53,0.08)] border border-[rgba(212,168,53,0.2)] flex items-center justify-center text-[#d4a853] mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-semibold text-[#e8e4dc] mb-1.5">
                Explore Live Tech Job Postings
              </h3>
              <p className="text-[#8a94a8] text-xs max-w-md leading-relaxed mb-6 font-serif">
                Search by keyword or select an ATS source above to extract live job postings in real time.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {POPULAR_COMPANIES.map(comp => (
                  <button
                    key={comp.slug}
                    type="button"
                    onClick={() => handleExploreCompany(comp)}
                    disabled={isSearching}
                    className="px-3.5 py-1.5 rounded-lg bg-[#1a2235] border border-[#253048] hover:border-[#d4a853] hover:text-[#d4a853] text-xs font-mono text-[#e8e4dc] transition-all flex items-center gap-1.5"
                  >
                    <span>{comp.name}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-[#131926] border border-[#253048] rounded-xl text-[#556178] font-mono text-xs">
              No job postings match your criteria.
            </div>
          )
        ) : (
          filteredJobs.map(job => {
            const isSaved = savedJobIds.has(job.id)
            const isTracked = trackedJobIds.has(job.id)

            return (
              <div
                key={job.id}
                className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5"
              >
                {/* Header: Logo, Info & Save Bookmark */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 border border-white/5"
                      style={{ backgroundColor: job.logoBg, color: job.logoColor }}
                    >
                      {job.logoLetter}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif text-base font-bold text-[#e8e4dc] truncate">
                        {job.title}
                      </h4>
                      <div className="text-xs text-[#8a94a8] truncate mt-0.5">
                        {job.company_name}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSave(job)}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all shrink-0 ${isSaved
                        ? "bg-[rgba(212,168,53,0.15)] border-[#d4a853] text-[#d4a853]"
                        : "border-[#253048] text-[#556178] hover:border-[#d4a853] hover:text-[#d4a853]"
                      }`}
                    title={isSaved ? "Saved to your list" : "Save job"}
                  >
                    <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
                  </button>
                </div>

                {/* Job Details Line: Location, Type, Salary */}
                <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-[#556178] mb-3.5">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#d4a853]" />
                    <span>{job.location}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>{job.job_type}</span>
                  </span>
                  {job.salary_range && (
                    <span className="flex items-center gap-1.5 text-[#4ade80]">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>{job.salary_range}</span>
                    </span>
                  )}
                </div>

                {/* Tags */}
                {job.tags && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {job.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-[10px] px-2.5 py-0.5 rounded-full bg-[#1a2235] text-[#8a94a8] border border-[#253048]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer: Posted date & Apply / Track button */}
                <div className="flex items-center justify-between pt-3.5 border-t border-[#253048]">
                  <span className="font-mono text-xs text-[#556178]">
                    {job.posted_date}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleInspectFit(job)}
                      className="px-3 py-1.5 rounded-lg border border-[#253048] hover:border-[#d4a853] text-[#8a94a8] hover:text-[#d4a853] font-mono text-xs flex items-center gap-1.5 transition-colors"
                      title="Analyze your resume fit with ZeroGPU"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
                      <span>AI Fit</span>
                    </button>
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg border border-[#253048] hover:border-[#556178] text-[#8a94a8] hover:text-[#e8e4dc] font-mono text-xs flex items-center gap-1 transition-colors"
                      >
                        <span>Posting</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={() => handleApplyOrTrack(job)}
                      disabled={isTracked}
                      className="px-4 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {isTracked ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Tracked</span>
                        </>
                      ) : (
                        <span>Apply & Track</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ZeroGPU AI Fit Modal */}
      {isFitModalOpen && selectedFitJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.8)] backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsFitModalOpen(false)}
        >
          <div
            className="bg-[#131926] border border-[#253048] rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-fadeUp overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-4 border-b border-[#253048]">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#d4a853] font-semibold mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ZeroGPU Resume Fit Assessment</span>
                </div>
                <h3 className="font-serif text-lg font-bold text-[#e8e4dc]">
                  {selectedFitJob.title}
                </h3>
                <div className="text-xs text-[#8a94a8]">
                  {selectedFitJob.company_name} · {selectedFitJob.location || "Remote"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFitModalOpen(false)}
                className="p-1.5 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {isAnalyzingFit ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#d4a853] font-mono text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Evaluating role fit with local AI model...</span>
                </div>
              ) : fitResult ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-[#0c1019] p-3.5 rounded-xl border border-[#253048]">
                    <span className="text-xs text-[#8a94a8]">Match Assessment</span>
                    <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-[rgba(212,168,53,0.15)] text-[#d4a853] border border-[rgba(212,168,53,0.3)]">
                      {fitResult.fit_level} — {fitResult.match_score}%
                    </span>
                  </div>

                  <p className="text-xs text-[#e8e4dc] leading-relaxed">
                    {fitResult.summary}
                  </p>

                  {fitResult.ats_breakdown && (
                    <div className="bg-[#080b12] border border-[#1a2235] rounded-lg p-2.5 space-y-2">
                      <div className="text-[10px] font-mono text-[#8a94a8]">ATS Evaluation Pillars</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        <div className="bg-[#0f1524] rounded p-1.5 border border-[#253048]/50">
                          <div className="text-[9px] text-[#8a94a8]">Hard Skills</div>
                          <div className="font-mono text-xs font-bold text-[#4ade80]">{fitResult.ats_breakdown.skills_score}%</div>
                        </div>
                        <div className="bg-[#0f1524] rounded p-1.5 border border-[#253048]/50">
                          <div className="text-[9px] text-[#8a94a8]">Experience</div>
                          <div className="font-mono text-xs font-bold text-[#60a5fa]">{fitResult.ats_breakdown.experience_score}%</div>
                        </div>
                        <div className="bg-[#0f1524] rounded p-1.5 border border-[#253048]/50">
                          <div className="text-[9px] text-[#8a94a8]">Education</div>
                          <div className="font-mono text-xs font-bold text-[#a78bfa]">{fitResult.ats_breakdown.education_score}%</div>
                        </div>
                        <div className="bg-[#0f1524] rounded p-1.5 border border-[#253048]/50">
                          <div className="text-[9px] text-[#8a94a8]">ATS Format</div>
                          <div className="font-mono text-xs font-bold text-[#fbbf24]">{fitResult.ats_breakdown.formatting_score}%</div>
                        </div>
                        <div className="bg-[#0f1524] rounded p-1.5 border border-[#253048]/50">
                          <div className="text-[9px] text-[#8a94a8]">Semantic</div>
                          <div className="font-mono text-xs font-bold text-[#38bdf8]">{fitResult.ats_breakdown.semantic_score}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {fitResult.categorized_skills?.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono uppercase text-[#8a94a8]">
                        Categorized Skill Matrix
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {fitResult.categorized_skills.map((cat, idx) => (
                          <div key={idx} className="bg-[#080b12] border border-[#1a2235] rounded-lg p-2 space-y-1">
                            <div className="text-[10px] font-mono font-semibold text-[#e8e4dc]">
                              {cat.category_name}
                            </div>
                            {cat.matching?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {cat.matching.map((s, sIdx) => (
                                  <span key={sIdx} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(74,222,128,0.1)] text-[#4ade80] border border-[rgba(74,222,128,0.25)]">
                                    ✓ {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {cat.missing?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {cat.missing.map((s, sIdx) => (
                                  <span key={sIdx} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[rgba(251,191,36,0.1)] text-[#fbbf24] border border-[rgba(251,191,36,0.25)]">
                                    ! {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {fitResult.matching_skills?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase text-[#4ade80] mb-1.5">
                            Matching Qualifications ({fitResult.matching_skills.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {fitResult.matching_skills.map((s, idx) => (
                              <span
                                key={idx}
                                className="font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(74,222,128,0.1)] text-[#4ade80] border border-[rgba(74,222,128,0.25)]"
                              >
                                ✓ {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {fitResult.missing_skills?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase text-[#fbbf24] mb-1.5">
                            Missing Requirements to Address ({fitResult.missing_skills.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {fitResult.missing_skills.map((s, idx) => (
                              <span
                                key={idx}
                                className="font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(251,191,36,0.1)] text-[#fbbf24] border border-[rgba(251,191,36,0.25)]"
                              >
                                ! {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {fitResult.recommendations?.length > 0 && (
                    <div className="pt-2 border-t border-[#253048]">
                      <div className="text-[10px] font-mono uppercase text-[#8a94a8] mb-1.5">
                        Preparation Recommendations
                      </div>
                      <ul className="text-xs text-[#8a94a8] space-y-1 list-disc pl-4 font-sans">
                        {fitResult.recommendations.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-[#253048] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsFitModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc]"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  handleApplyOrTrack(selectedFitJob)
                  setIsFitModalOpen(false)
                }}
                disabled={trackedJobIds.has(selectedFitJob.id)}
                className="px-4 py-2 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] text-xs font-mono font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {trackedJobIds.has(selectedFitJob.id) ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Already Tracked</span>
                  </>
                ) : (
                  <span>Track This Job</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Career Pages Directory Modal */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[90vh] bg-[#0c1019] border border-[#253048] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#253048] flex items-center justify-between bg-[#131926]/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgba(212,168,53,0.12)] border border-[rgba(212,168,53,0.3)] flex items-center justify-center text-[#d4a853]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#e8e4dc] flex items-center gap-2">
                    <span>Company Career Pages Directory</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#253048] text-[#8a94a8]">
                      Admin
                    </span>
                  </h2>
                  <p className="text-xs text-[#8a94a8] font-sans">
                    Manage ATS integration endpoints, trigger live scrapes, and control monitored company portals.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAdminModalOpen(false)}
                className="w-8 h-8 rounded-lg border border-[#253048] flex items-center justify-center text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-[#080b12] border-b border-[#253048] text-center font-mono">
              <div className="p-2.5 rounded-lg bg-[#131926] border border-[#1e2738]">
                <div className="text-[10px] uppercase text-[#556178]">Total Companies</div>
                <div className="text-base font-bold text-[#e8e4dc] mt-0.5">{adminCompanies.length}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#131926] border border-[#1e2738]">
                <div className="text-[10px] uppercase text-[#556178]">Active Monitored</div>
                <div className="text-base font-bold text-[#34d399] mt-0.5">
                  {adminCompanies.filter(c => c.is_active).length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#131926] border border-[#1e2738]">
                <div className="text-[10px] uppercase text-[#556178]">Total Roles Discovered</div>
                <div className="text-base font-bold text-[#d4a853] mt-0.5">
                  {adminCompanies.reduce((acc, c) => acc + (c.total_jobs_found || 0), 0)}
                </div>
              </div>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Add Company Trigger / Form */}
              <div className="p-4 rounded-xl bg-[#131926] border border-[#253048] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-xs text-[#d4a853] font-semibold">
                    <Plus className="w-4 h-4" />
                    <span>Register New Company Career Page</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] underline"
                  >
                    {showAddForm ? "Collapse Form" : "+ Add Company"}
                  </button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleCreateCompany} className="pt-2 space-y-3 border-t border-[#1e2738]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono text-[#8a94a8] mb-1">Company Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Notion, OpenAI, Datadog"
                          value={newCompany.name}
                          onChange={e => setNewCompany({ ...newCompany, name: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-[#8a94a8] mb-1">ATS Provider</label>
                        <select
                          value={newCompany.provider}
                          onChange={e => setNewCompany({ ...newCompany, provider: e.target.value })}
                          className="w-full h-8 px-2 rounded-lg bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
                        >
                          <option value="greenhouse">Greenhouse (boards-api.greenhouse.io)</option>
                          <option value="lever">Lever (api.lever.co)</option>
                          <option value="ashby">Ashby (api.ashbyhq.com)</option>
                          <option value="workable">Workable</option>
                          <option value="json_ld">JSON-LD / Custom Career URL</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-[#8a94a8] mb-1">Board Slug or Career URL *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 'notion' or 'https://boards.greenhouse.io/notion'"
                          value={newCompany.slug}
                          onChange={e => setNewCompany({ ...newCompany, slug: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-[#8a94a8] mb-1">Domain (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. notion.so"
                          value={newCompany.domain}
                          onChange={e => setNewCompany({ ...newCompany, domain: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-mono text-[#8a94a8] mb-1">Career URL (Optional)</label>
                        <input
                          type="url"
                          placeholder="https://notion.so/careers"
                          value={newCompany.career_url}
                          onChange={e => setNewCompany({ ...newCompany, career_url: e.target.value })}
                          className="w-full h-8 px-2.5 rounded-lg bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono focus:outline-none focus:border-[#d4a853]"
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="w-full h-8 px-4 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Save Company</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* Companies Table / Card List */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-[#556178] px-1">
                  <span>Registered Career Portals ({adminCompanies.length})</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Filter by name, slug, or ATS..."
                      value={adminSearchQuery}
                      onChange={e => setAdminSearchQuery(e.target.value)}
                      className="h-7 px-2.5 rounded-lg bg-[#0c1019] border border-[#253048] text-[11px] text-[#e8e4dc] placeholder:text-[#556178] font-mono focus:outline-none focus:border-[#d4a853]"
                    />
                    <button
                      type="button"
                      onClick={handleSyncAllCompanies}
                      disabled={isSyncingAll || isLoadingAdmin}
                      className="px-2.5 py-1 rounded-lg border border-[rgba(212,168,53,0.35)] bg-[rgba(212,168,53,0.08)] text-[#d4a853] hover:bg-[rgba(212,168,53,0.16)] flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingAll ? "animate-spin" : ""}`} />
                      <span>{isSyncingAll ? "Syncing All..." : "Sync All Active"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={loadAdminCompanies}
                      disabled={isLoadingAdmin}
                      className="hover:text-[#e8e4dc] flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingAdmin ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {isLoadingAdmin && adminCompanies.length === 0 ? (
                  <div className="text-center py-10 font-mono text-xs text-[#8a94a8] flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#d4a853]" />
                    <span>Loading directory...</span>
                  </div>
                ) : adminCompanies.length === 0 ? (
                  <div className="text-center py-8 bg-[#131926] border border-[#253048] rounded-xl text-xs font-mono text-[#556178]">
                    No company career pages registered yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {adminCompanies
                      .filter(comp => {
                        const q = adminSearchQuery.trim().toLowerCase()
                        if (!q) return true
                        return (
                          comp.name?.toLowerCase().includes(q) ||
                          comp.slug?.toLowerCase().includes(q) ||
                          comp.provider?.toLowerCase().includes(q)
                        )
                      })
                      .map(comp => (
                        <div
                          key={comp.id}
                          className="p-3.5 rounded-xl bg-[#131926] border border-[#253048] flex flex-col gap-3 hover:border-[#384666] transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm font-mono shrink-0"
                                style={{
                                  backgroundColor: `${comp.logo_color || "#60a5fa"}20`,
                                  color: comp.logo_color || "#60a5fa",
                                  border: `1px solid ${comp.logo_color || "#60a5fa"}40`,
                                }}
                              >
                                {comp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-serif font-semibold text-sm text-[#e8e4dc]">{comp.name}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#1e2738] text-[#8a94a8]">
                                    {comp.provider}
                                  </span>
                                  {comp.is_active ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#34d399] bg-[rgba(16,185,129,0.1)]">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#f87171] bg-[rgba(248,113,113,0.1)]">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-[#556178] flex flex-wrap items-center gap-3 mt-0.5">
                                  <span>slug: {comp.slug}</span>
                                  {comp.domain && <span>domain: {comp.domain}</span>}
                                  {comp.last_synced_at && (
                                    <span>synced: {new Date(comp.last_synced_at).toLocaleDateString()}</span>
                                  )}
                                  <span>jobs found: {comp.total_jobs_found || 0}</span>
                                </div>
                                {comp.last_sync_status === "failed" && comp.last_error_message && (
                                  <div className="text-[10px] font-mono text-[#f87171] mt-1">
                                    Sync error: {comp.last_error_message}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-xs">
                              <button
                                type="button"
                                onClick={() => handleSyncCompany(comp)}
                                disabled={syncingCompanyId === comp.id}
                                className="px-2.5 py-1 rounded-lg border border-[#253048] hover:border-[#d4a853] hover:text-[#d4a853] text-[#8a94a8] transition-colors flex items-center gap-1.5 text-[11px] disabled:opacity-50"
                                title="Scrape & Sync Postings Now"
                              >
                                <RefreshCw className={`w-3 h-3 ${syncingCompanyId === comp.id ? "animate-spin text-[#d4a853]" : ""}`} />
                                <span>{syncingCompanyId === comp.id ? "Syncing..." : "Sync"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => editingCompanyId === comp.id ? setEditingCompanyId(null) : handleStartEditCompany(comp)}
                                className="px-2.5 py-1 rounded-lg border border-[#253048] hover:border-[#556178] text-[#8a94a8] hover:text-[#e8e4dc] transition-colors text-[11px]"
                              >
                                {editingCompanyId === comp.id ? "Cancel" : "Edit"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleCompanyActive(comp)}
                                className="px-2.5 py-1 rounded-lg border border-[#253048] hover:border-[#556178] text-[#8a94a8] hover:text-[#e8e4dc] transition-colors text-[11px]"
                                title="Toggle active status"
                              >
                                {comp.is_active ? "Disable" : "Enable"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteCompany(comp)}
                                className="p-1 rounded-lg border border-[#253048] hover:border-[#ef4444] text-[#8a94a8] hover:text-[#ef4444] transition-colors"
                                title="Delete Company"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {editingCompanyId === comp.id && (
                            <div className="pt-3 border-t border-[#1e2738] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
                              <div>
                                <label className="block text-[10px] font-mono text-[#8a94a8] mb-1">Name</label>
                                <input
                                  type="text"
                                  value={editCompanyForm.name}
                                  onChange={e => setEditCompanyForm({ ...editCompanyForm, name: e.target.value })}
                                  className="w-full h-7 px-2 rounded bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono text-[#8a94a8] mb-1">Provider</label>
                                <select
                                  value={editCompanyForm.provider}
                                  onChange={e => setEditCompanyForm({ ...editCompanyForm, provider: e.target.value })}
                                  className="w-full h-7 px-2 rounded bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono"
                                >
                                  <option value="greenhouse">Greenhouse</option>
                                  <option value="lever">Lever</option>
                                  <option value="ashby">Ashby</option>
                                  <option value="workable">Workable</option>
                                  <option value="json_ld">JSON-LD</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono text-[#8a94a8] mb-1">Slug</label>
                                <input
                                  type="text"
                                  value={editCompanyForm.slug}
                                  onChange={e => setEditCompanyForm({ ...editCompanyForm, slug: e.target.value })}
                                  className="w-full h-7 px-2 rounded bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono text-[#8a94a8] mb-1">Domain</label>
                                <input
                                  type="text"
                                  value={editCompanyForm.domain}
                                  onChange={e => setEditCompanyForm({ ...editCompanyForm, domain: e.target.value })}
                                  className="w-full h-7 px-2 rounded bg-[#0c1019] border border-[#253048] text-xs text-[#e8e4dc] font-mono"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSaveEditCompany(comp.id)}
                                className="h-7 px-3 rounded bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] text-xs font-mono font-semibold"
                              >
                                Save Changes
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#253048] bg-[#080b12] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#556178]">
                Registered companies dynamically appear in search and live filters.
              </span>
              <button
                type="button"
                onClick={() => setIsAdminModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#253048] hover:bg-[#384666] text-xs font-mono text-[#e8e4dc] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

