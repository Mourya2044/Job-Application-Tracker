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
  SlidersHorizontal
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
  
  // Advanced scraper states
  const [atsProvider, setAtsProvider] = useState("greenhouse")
  const [atsSlug, setAtsSlug] = useState("stripe")

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
  }, [])

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

        <button
          onClick={() => setShowAdvancedScraper(!showAdvancedScraper)}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors self-start sm:self-auto"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{showAdvancedScraper ? "Hide ATS Explorer" : "Direct ATS Explorer"}</span>
        </button>
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

      {/* Quick ATS Source Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="text-[#556178] text-[11px]">Explore Live ATS:</span>
        {POPULAR_COMPANIES.map(comp => (
          <button
            key={comp.slug}
            type="button"
            onClick={() => handleExploreCompany(comp)}
            disabled={isSearching}
            className="px-2.5 py-1 rounded-md bg-[#131926] border border-[#253048] hover:border-[#d4a853] text-[#8a94a8] hover:text-[#d4a853] transition-colors disabled:opacity-50"
          >
            {comp.name}
          </button>
        ))}
      </div>

      {/* Filter Pills matching code.html */}
      <div className="flex flex-wrap gap-2">
        {filters.map(f => {
          const isActive = activeFilter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`font-mono text-xs px-3.5 py-1.5 rounded-full border transition-all ${
                isActive
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
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                      isSaved
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
    </div>
  )
}
