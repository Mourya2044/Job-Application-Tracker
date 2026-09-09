import React, { useState } from "react"
import { MapPin, Calendar, Clock, Lock, Sparkles, Building2 } from "lucide-react"

export function ApplicationListView({ 
  applications, 
  onOpenDetails, 
  searchQuery = "" 
}) {
  const [filter, setFilter] = useState("all")

  const stages = [
    { key: "all", label: "All" },
    { key: "applied", label: "Applied" },
    { key: "screening", label: "Screening" },
    { key: "interviewing", label: "Interview" },
    { key: "offer", label: "Offer" },
    { key: "rejected", label: "Rejected" },
  ]

  const getCompanyInitial = (name) => {
    return name ? name.trim().charAt(0).toUpperCase() : "A"
  }

  const getStatusColor = (stage) => {
    switch (stage?.toLowerCase()) {
      case "applied":
        return { color: "var(--info)", bg: "var(--info-muted)", badge: "text-[#60a5fa] bg-[rgba(96,165,250,0.12)] border-[rgba(96,165,250,0.2)]" }
      case "screening":
        return { color: "var(--warning)", bg: "var(--warning-muted)", badge: "text-[#fbbf24] bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.2)]" }
      case "interview":
      case "interviewing":
        return { color: "var(--interview)", bg: "var(--interview-muted)", badge: "text-[#a78bfa] bg-[rgba(167,139,250,0.12)] border-[rgba(167,139,250,0.2)]" }
      case "offer":
      case "accepted":
        return { color: "var(--success)", bg: "var(--success-muted)", badge: "text-[#4ade80] bg-[rgba(74,222,128,0.12)] border-[rgba(74,222,128,0.2)]" }
      case "rejected":
        return { color: "var(--danger)", bg: "var(--danger-muted)", badge: "text-[#fb7185] bg-[rgba(251,113,133,0.12)] border-[rgba(251,113,133,0.2)]" }
      default:
        return { color: "var(--accent)", bg: "var(--accent-muted)", badge: "text-[#d4a853] bg-[rgba(212,168,53,0.12)] border-[rgba(212,168,53,0.2)]" }
    }
  }

  const pipelineStages = ["applied", "screening", "interviewing", "offer"]

  const filtered = applications.filter((app) => {
    const matchesFilter = filter === "all" || 
      app.current_stage?.toLowerCase() === filter.toLowerCase() ||
      (filter === "interviewing" && app.current_stage?.toLowerCase() === "interview")
    const matchesSearch = !searchQuery ||
      app.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.role_title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* Filter Pills & Count */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {stages.map((s) => {
            const isActive = filter === s.key
            return (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`font-mono text-xs px-3.5 py-1.5 rounded-full border transition-all ${
                  isActive
                    ? "bg-[rgba(212,168,53,0.15)] border-[#d4a853] text-[#d4a853] shadow-sm font-semibold"
                    : "border-[#253048] text-[#8a94a8] hover:border-[#556178] hover:text-[#e8e4dc]"
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        <span className="font-mono text-xs text-[#556178]">
          {filtered.length} application{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid of Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#131926] border border-[#253048] rounded-xl text-[#556178] font-mono text-xs">
          No applications match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((app) => {
            const statusConfig = getStatusColor(app.current_stage)
            const currentIdx = pipelineStages.indexOf(app.current_stage?.toLowerCase())
            const isRejected = app.current_stage?.toLowerCase() === "rejected"

            const appliedDateStr = app.applied_date || app.created_at
            const appliedDate = appliedDateStr
              ? new Date(appliedDateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
              : "Recently"

            const updatedDate = app.last_status_change_at
              ? new Date(app.last_status_change_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : appliedDate

            return (
              <div
                key={app.id}
                onClick={() => onOpenDetails(app)}
                className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg group flex flex-col justify-between"
              >
                <div>
                  {/* Card Header: Logo + Status Badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm shrink-0 border border-white/5"
                      style={{ backgroundColor: statusConfig.bg, color: statusConfig.color }}
                    >
                      {getCompanyInitial(app.company_name)}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {app.stage_locked && (
                        <span className="text-[#fbbf24] p-1" title="Stage locked">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                      <span className={`font-mono text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border ${statusConfig.badge}`}>
                        {app.current_stage}
                      </span>
                    </div>
                  </div>

                  {/* Company & Role */}
                  <h4 className="font-serif text-base font-bold text-[#e8e4dc] group-hover:text-[#d4a853] transition-colors line-clamp-1 mb-1">
                    {app.company_name}
                  </h4>
                  <div className="text-xs text-[#8a94a8] line-clamp-1 mb-3.5">
                    {app.role_title}
                  </div>

                  {/* Multi-step Pipeline Progress Bar */}
                  <div className="flex items-center gap-1.5 mb-3.5">
                    {pipelineStages.map((stage, idx) => {
                      let barColor = "bg-[#253048]"
                      if (isRejected) {
                        barColor = idx === 0 ? "bg-[#d4a853]" : "bg-[#253048]"
                      } else if (currentIdx >= 0) {
                        if (idx < currentIdx) barColor = "bg-[#d4a853]"
                        else if (idx === currentIdx) barColor = "bg-[#a78bfa]"
                      }

                      return (
                        <div
                          key={stage}
                          className={`h-1 flex-1 rounded-full transition-colors ${barColor}`}
                        />
                      )
                    })}
                  </div>

                  {/* Meta: Location & Applied Date */}
                  <div className="flex items-center gap-4 font-mono text-[11px] text-[#556178] mb-3">
                    {app.location && (
                      <span className="flex items-center gap-1 truncate max-w-[140px]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {app.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 truncate">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {appliedDate}
                    </span>
                  </div>
                </div>

                {/* Card Footer: Last Updated & Hint */}
                <div className="pt-3 border-t border-[#253048] flex items-center justify-between text-[10px] font-mono text-[#556178]">
                  <span>
                    Updated {updatedDate} &middot; {app.last_status_change_source === "mailbox_auto" ? "Auto" : "Manual"}
                  </span>
                  <span className="text-[#d4a853] opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Edit &rarr;
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

