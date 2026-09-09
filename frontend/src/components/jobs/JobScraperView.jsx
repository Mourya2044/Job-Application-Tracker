import React, { useState, useEffect } from "react"
import { 
  Building2, 
  Search, 
  Globe, 
  Sparkles, 
  ExternalLink, 
  Plus, 
  Check, 
  Layers, 
  RefreshCw, 
  BookOpen, 
  Code2, 
  DollarSign, 
  MapPin, 
  Briefcase,
  SlidersHorizontal,
  ChevronRight,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export function JobScraperView({ onImportJob, trackedUrls = [] }) {
  const [activeTab, setActiveTab] = useState("ats") // ats, url, feed
  const [curatedCompanies, setCuratedCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState("stripe")
  const [selectedProvider, setSelectedProvider] = useState("greenhouse")
  const [customSlug, setCustomSlug] = useState("")
  const [urlInput, setUrlInput] = useState("")
  const [feedQuery, setFeedQuery] = useState("python")
  const [isLoading, setIsLoading] = useState(false)
  const [jobs, setJobs] = useState([])
  const [singleJob, setSingleJob] = useState(null)
  const [importedJobIds, setImportedJobIds] = useState(new Set())
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  useEffect(() => {
    loadCuratedCompanies()
    // Load initial jobs for Stripe
    scrapeAts("greenhouse", "stripe")
  }, [])

  const loadCuratedCompanies = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/jobs/popular-companies")
      const data = await res.json()
      setCuratedCompanies(data)
    } catch (err) {
      console.error("Failed to load company presets:", err)
    }
  }

  const scrapeAts = async (provider, slug) => {
    if (!slug) return
    setIsLoading(true)
    setSingleJob(null)
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/jobs/scrape/ats?provider=${provider}&company=${encodeURIComponent(slug)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Failed to scrape ATS jobs")
      }
      const data = await res.json()
      setJobs(data)
      toast.success(`Found ${data.length} jobs on ${slug.toUpperCase()} (${provider})`)
    } catch (err) {
      toast.error(err.message || "Scraping failed")
      setJobs([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleInspectUrl = async () => {
    if (!urlInput.trim()) return
    setIsLoading(true)
    setJobs([])
    setSingleJob(null)
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/jobs/scrape/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Could not extract job from URL")
      }
      const data = await res.json()
      setSingleJob(data)
      toast.success(`Extracted: ${data.title} at ${data.company_name}`)
    } catch (err) {
      toast.error(err.message || "Failed to inspect URL")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchFeed = async () => {
    if (!feedQuery.trim()) return
    setIsLoading(true)
    setSingleJob(null)
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/jobs/search?query=${encodeURIComponent(feedQuery.trim())}&limit=20`)
      if (!res.ok) throw new Error("Feed query failed")
      const data = await res.json()
      setJobs(data)
      toast.success(`Found ${data.length} live postings for "${feedQuery}"`)
    } catch (err) {
      toast.error("Failed to fetch live job feed")
      setJobs([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleTrackJob = async (job, stage = "applied") => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, target_stage: stage }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Failed to import job")
      }
      const app = await res.json()
      setImportedJobIds(prev => new Set(prev).add(job.id))
      toast.success(`Added ${app.company_name} to Kanban board!`, {
        description: `${app.role_title} • Stage: ${app.current_stage.toUpperCase()}`,
      })
      if (onImportJob) {
        onImportJob(app)
      }
    } catch (err) {
      toast.error(err.message || "Could not add application")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-r from-card/60 via-card/30 to-card/60 p-6 backdrop-blur-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 text-primary">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">Job Discovery & Scraper Engine</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 px-1.5 border-primary/40 text-primary">
              Multi-Strategy
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Extract live job listings directly from public ATS APIs (Greenhouse, Lever, Ashby), Schema.org JSON-LD microdata, or live tech aggregator feeds. Track any role to your Kanban board with 1 click.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsGuideOpen(true)}
          className="h-8 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-foreground shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5 text-violet-400" />
          <span>Exploration & Architecture Guide</span>
        </Button>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab("ats")
              setSingleJob(null)
              scrapeAts(selectedProvider, selectedCompany)
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "ats"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-muted/30"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Direct ATS Career Boards</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("url")
              setJobs([])
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "url"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-muted/30"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Universal URL Inspector (Schema.org)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("feed")
              setSingleJob(null)
              handleSearchFeed()
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "feed"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-muted/30"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Live Tech Jobs Feed</span>
          </button>
        </div>

        <span className="text-xs text-muted-foreground hidden sm:inline">
          {isLoading ? "Fetching postings..." : `${jobs.length || (singleJob ? 1 : 0)} postings loaded`}
        </span>
      </div>

      {/* Tab 1 Controls: Direct ATS Scraping */}
      {activeTab === "ats" && (
        <div className="space-y-4">
          {/* Quick-Select Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Popular Tech Companies
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {curatedCompanies.map(c => {
                const isSelected = selectedCompany === c.slug && selectedProvider === c.provider
                return (
                  <button
                    key={`${c.provider}-${c.slug}`}
                    onClick={() => {
                      setSelectedCompany(c.slug)
                      setSelectedProvider(c.provider)
                      scrapeAts(c.provider, c.slug)
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                      isSelected
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-card/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-zinc-500"
                    }`}
                  >
                    {c.name}
                    <span className="text-[10px] opacity-60 ml-1.5">({c.provider})</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Slug Query Bar */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border/60 bg-card/30">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Custom ATS:</span>
            </div>

            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="h-8 rounded-md border border-border/60 bg-muted/40 px-2.5 text-xs text-foreground focus:outline-none"
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>

            <input
              type="text"
              placeholder="e.g. cloudflare, vercel, figma, stripe"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customSlug.trim()) {
                  setSelectedCompany(customSlug.trim())
                  scrapeAts(selectedProvider, customSlug.trim())
                }
              }}
              className="flex-1 min-w-[180px] h-8 rounded-md border border-border/60 bg-muted/30 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />

            <Button
              size="sm"
              disabled={isLoading || !customSlug.trim()}
              onClick={() => {
                setSelectedCompany(customSlug.trim())
                scrapeAts(selectedProvider, customSlug.trim())
              }}
              className="h-8 text-xs gap-1.5 bg-foreground text-background hover:bg-zinc-200"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              <span>Scrape Board</span>
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2 Controls: Universal URL Inspector */}
      {activeTab === "url" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border/60 bg-card/30 space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground">Paste Job Posting or Career Page URL</span>
              <p className="text-xs text-muted-foreground">
                Extracts standardized Schema.org <code className="text-[11px] bg-muted/60 px-1 py-0.5 rounded">JobPosting</code> JSON-LD metadata or falls back to semantic DOM heuristics.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://boards.greenhouse.io/stripe/jobs/12345 or https://jobs.lever.co/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInspectUrl()}
                className="flex-1 h-9 rounded-md border border-border/60 bg-muted/30 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              <Button
                size="sm"
                disabled={isLoading || !urlInput.trim()}
                onClick={handleInspectUrl}
                className="h-9 text-xs gap-1.5 bg-foreground text-background hover:bg-zinc-200"
              >
                <Search className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Extract Job Info</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3 Controls: Live Tech Job Feed */}
      {activeTab === "feed" && (
        <div className="space-y-4">
          <div className="flex gap-2 p-3 rounded-lg border border-border/60 bg-card/30">
            <input
              type="text"
              placeholder="Search by keyword (e.g. python, react, backend, devops, ai)..."
              value={feedQuery}
              onChange={(e) => setFeedQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchFeed()}
              className="flex-1 h-8 rounded-md border border-border/60 bg-muted/30 px-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <Button
              size="sm"
              disabled={isLoading || !feedQuery.trim()}
              onClick={handleSearchFeed}
              className="h-8 text-xs gap-1.5 bg-foreground text-background hover:bg-zinc-200"
            >
              <Search className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Search Live Feed</span>
            </Button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="py-16 text-center space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted-foreground">Querying job postings and parsing structured metadata...</p>
        </div>
      )}

      {/* Single URL Inspector Card */}
      {!isLoading && singleJob && (
        <div className="rounded-xl border border-primary/40 bg-card/40 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                  {singleJob.source_type.toUpperCase()}
                </Badge>
                {singleJob.department && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60">
                    {singleJob.department}
                  </Badge>
                )}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{singleJob.title}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-medium text-foreground">{singleJob.company_name}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  {singleJob.location}
                </span>
                {singleJob.salary_range && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">{singleJob.salary_range}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={singleJob.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1 rounded border border-border/60"
              >
                <span>View Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <Button
                size="sm"
                onClick={() => handleTrackJob(singleJob)}
                disabled={importedJobIds.has(singleJob.id)}
                className={`h-7 text-xs gap-1.5 ${
                  importedJobIds.has(singleJob.id)
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-foreground text-background hover:bg-zinc-200"
                }`}
              >
                {importedJobIds.has(singleJob.id) ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Tracked</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Track Application</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {singleJob.description_snippet && (
            <div className="p-3.5 rounded-lg border border-border/40 bg-muted/20 text-xs text-muted-foreground/90 leading-relaxed">
              {singleJob.description_snippet}
            </div>
          )}
        </div>
      )}

      {/* Grid of Results */}
      {!isLoading && jobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map((job) => {
            const isImported = importedJobIds.has(job.id) || trackedUrls.includes(job.url)
            return (
              <div
                key={job.id}
                className="rounded-xl border border-border/60 bg-card/40 hover:border-zinc-500/60 transition-all p-4 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-foreground truncate">
                      {job.company_name}
                    </span>
                    <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0 border-border/60 text-muted-foreground">
                      {job.source_type.replace("ats_", "")}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-primary">
                      {job.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <MapPin className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      <span className="truncate">{job.location}</span>
                    </p>
                  </div>

                  {job.salary_range && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <DollarSign className="w-3 h-3 shrink-0" />
                      <span>{job.salary_range}</span>
                    </div>
                  )}

                  {job.description_snippet && (
                    <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                      {job.description_snippet}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <span>Posting</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <Button
                    size="sm"
                    disabled={isImported}
                    onClick={() => handleTrackJob(job)}
                    className={`h-6 text-[11px] px-2.5 gap-1 ${
                      isImported
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-foreground text-background hover:bg-zinc-200"
                    }`}
                  >
                    {isImported ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Tracked</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>Track</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && jobs.length === 0 && !singleJob && (
        <div className="py-16 text-center rounded-xl border border-dashed border-border/60 bg-card/20 max-w-md mx-auto space-y-2">
          <Briefcase className="w-8 h-8 text-muted-foreground/50 mx-auto" />
          <h4 className="text-xs font-semibold text-foreground">No postings to display</h4>
          <p className="text-[11px] text-muted-foreground">
            Select a company above, enter a custom slug, or paste a URL to scrape live jobs.
          </p>
        </div>
      )}

      {/* Exploration & Architecture Guide Modal */}
      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent className="max-w-3xl bg-card border-border/80 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-violet-400" />
              Job Scraping Methodologies & Architecture
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Comparative analysis of modern web scraping techniques, data fidelity, and anti-bot trade-offs.
            </DialogDescription>
          </DialogHeader>

          {/* Matrix Table */}
          <div className="rounded-lg border border-border/60 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-muted/30 text-[11px] font-semibold text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="py-2 px-3">Technique</th>
                  <th className="py-2 px-3">Latency</th>
                  <th className="py-2 px-3">Fidelity</th>
                  <th className="py-2 px-3">Anti-Bot Risk</th>
                  <th className="py-2 px-3">Maintenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-[11px]">
                <tr className="bg-primary/5 font-medium">
                  <td className="py-2 px-3 text-primary">1. Direct ATS API (Greenhouse/Lever)</td>
                  <td className="py-2 px-3 text-emerald-400">&lt; 200 ms</td>
                  <td className="py-2 px-3 text-emerald-400">100% (Structured)</td>
                  <td className="py-2 px-3 text-emerald-400">Zero (Public API)</td>
                  <td className="py-2 px-3 text-emerald-400">Very Low</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">2. Schema.org JSON-LD</td>
                  <td className="py-2 px-3">~ 350 ms</td>
                  <td className="py-2 px-3 text-emerald-400">95% (Standardized)</td>
                  <td className="py-2 px-3">Low</td>
                  <td className="py-2 px-3">Low</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">3. Heuristic DOM & OpenGraph</td>
                  <td className="py-2 px-3">~ 400 ms</td>
                  <td className="py-2 px-3 text-amber-400">70% - 85%</td>
                  <td className="py-2 px-3">Medium</td>
                  <td className="py-2 px-3 text-amber-400">Medium</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">4. Aggregator Feeds (RemoteOK)</td>
                  <td className="py-2 px-3">~ 600 ms</td>
                  <td className="py-2 px-3">85%</td>
                  <td className="py-2 px-3">Low</td>
                  <td className="py-2 px-3">Low</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">5. Headless Browser (Playwright)</td>
                  <td className="py-2 px-3 text-destructive">3,000 - 8,000 ms</td>
                  <td className="py-2 px-3">85% - 90%</td>
                  <td className="py-2 px-3 text-destructive">High (Cloudflare challenges)</td>
                  <td className="py-2 px-3 text-destructive">Very High</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deep-Dive Notes */}
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
              <h5 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-primary" />
                Why Direct ATS APIs are the Gold Standard
              </h5>
              <p className="text-[11px]">
                Over 75% of technology employers use hosted ATS platforms (Greenhouse, Lever, Ashby). These platforms serve career pages via unauthenticated REST/JSON endpoints designed for web integration. Scraping these APIs directly bypasses HTML rendering, eliminates CSS selector fragility, and achieves sub-second latency with zero anti-bot friction.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
              <h5 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                Schema.org "JobPosting" Microdata
              </h5>
              <p className="text-[11px]">
                To rank in Google Jobs, employers embed Schema.org JSON-LD microdata inside <code className="bg-muted/60 px-1 py-0.5 rounded text-[10px]">&lt;script type="application/ld+json"&gt;</code> tags. Our URL Inspector extracts this microdata directly, providing normalized salary ranges, locations, and hiring organizations regardless of HTML redesigns.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
