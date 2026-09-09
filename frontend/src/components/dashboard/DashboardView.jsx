import React from "react"
import { 
  Briefcase, 
  Clock, 
  Calendar, 
  Trophy, 
  ArrowRight, 
  ExternalLink,
  Sparkles
} from "lucide-react"

export function DashboardView({ 
  boardData, 
  pendingDiscoveries, 
  consentStatus, 
  onSwitchView, 
  onOpenDetails 
}) {
  const allApps = boardData.columns.flatMap(col => col.applications)
  const totalApps = boardData.total_applications || allApps.length
  const pendingCount = pendingDiscoveries?.length || 0

  const interviewApps = boardData.columns.find(c => c.stage === "interviewing" || c.stage === "interview")?.applications || []
  const offerApps = boardData.columns.find(c => c.stage === "offer" || c.stage === "accepted")?.applications || []

  // Extract recent activities from applications' status events
  const activities = []
  allApps.forEach(app => {
    if (app.status_events && app.status_events.length > 0) {
      app.status_events.forEach(evt => {
        activities.push({
          appId: app.id,
          company: app.company_name,
          stage: evt.to_stage,
          summary: evt.change_summary,
          time: new Date(evt.changed_at),
          source: evt.trigger_source,
          app: app
        })
      })
    } else {
      activities.push({
        appId: app.id,
        company: app.company_name,
        stage: app.current_stage,
        summary: `Tracking in ${app.current_stage} stage`,
        time: new Date(app.last_status_change_at || app.created_at),
        source: app.last_status_change_source,
        app: app
      })
    }
  })

  // Sort descending by time and take top 6
  activities.sort((a, b) => b.time - a.time)
  const recentActivities = activities.slice(0, 6)

  // Extract upcoming interviews or deadlines
  const upcomingInterviews = allApps
    .filter(app => app.next_step || app.next_step_deadline || app.interview_link || app.current_stage === "interviewing")
    .map(app => {
      const dateObj = app.next_step_deadline ? new Date(app.next_step_deadline) : null
      return {
        app,
        company: app.company_name,
        round: app.next_step || "Technical Interview",
        date: dateObj,
        timeStr: dateObj ? dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time TBD",
        day: dateObj ? dateObj.getDate() : "—",
        month: dateObj ? dateObj.toLocaleDateString(undefined, { month: "short" }) : "Upcoming",
        interviewLink: app.interview_link
      }
    })
    .slice(0, 5)

  const formatTimeAgo = (date) => {
    const diff = Math.floor((new Date() - date) / 1000)
    if (diff < 60) return "Just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const getStageColor = (stage) => {
    switch (stage?.toLowerCase()) {
      case "applied": return "var(--info)"
      case "screening": return "var(--warning)"
      case "interview":
      case "interviewing": return "var(--interview)"
      case "offer":
      case "accepted": return "var(--success)"
      case "rejected": return "var(--danger)"
      default: return "var(--accent)"
    }
  }

  const userDisplayName = consentStatus?.user_email 
    ? consentStatus.user_email.split("@")[0].replace(".", " ")
    : null

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-serif text-[#e8e4dc]">
            Dashboard
          </h1>
          <p className="text-[#8a94a8] text-sm mt-1.5 capitalize">
            {userDisplayName ? `Welcome back, ${userDisplayName}. ` : "Welcome back. "}Here's your job search at a glance.
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            onClick={() => onSwitchView("approvals")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(212,168,53,0.12)] border border-[rgba(212,168,53,0.3)] text-[#d4a853] hover:bg-[rgba(212,168,53,0.2)] text-xs font-mono transition-all self-start sm:self-auto"
          >
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>{pendingCount} Pending Approval{pendingCount > 1 ? "s" : ""}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </button>
        )}
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Applications */}
        <div 
          onClick={() => onSwitchView("tracking")}
          className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-[rgba(96,165,250,0.1)] text-[#60a5fa]">
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="font-serif text-3xl font-bold text-[#60a5fa] leading-none mb-1">
            {totalApps}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#556178]">
            Applications Tracked
          </div>
        </div>

        {/* Pending Review */}
        <div 
          onClick={() => onSwitchView("approvals")}
          className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-[rgba(251,191,36,0.1)] text-[#fbbf24]">
            <Clock className="w-4 h-4" />
          </div>
          <div className="font-serif text-3xl font-bold text-[#fbbf24] leading-none mb-1">
            {pendingCount}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#556178]">
            Pending Review
          </div>
        </div>

        {/* Interviews Scheduled */}
        <div 
          onClick={() => onSwitchView("tracking")}
          className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-[rgba(167,139,250,0.1)] text-[#a78bfa]">
            <Calendar className="w-4 h-4" />
          </div>
          <div className="font-serif text-3xl font-bold text-[#a78bfa] leading-none mb-1">
            {interviewApps.length}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#556178]">
            Interviews Scheduled
          </div>
        </div>

        {/* Offers Received */}
        <div 
          onClick={() => onSwitchView("tracking")}
          className="bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4 bg-[rgba(74,222,128,0.1)] text-[#4ade80]">
            <Trophy className="w-4 h-4" />
          </div>
          <div className="font-serif text-3xl font-bold text-[#4ade80] leading-none mb-1">
            {offerApps.length}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#556178]">
            Offers Received
          </div>
        </div>
      </div>

      {/* 2-Column Grid: Recent Activity & Upcoming Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-7 bg-[#131926] border border-[#253048] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#556178]">
              Recent Activity
            </h3>
            <button
              onClick={() => onSwitchView("tracking")}
              className="text-xs font-mono text-[#d4a853] hover:text-[#e6c06a] flex items-center gap-1"
            >
              View Board <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentActivities.length === 0 ? (
            <div className="py-12 text-center text-[#556178] text-xs font-mono">
              No recent status events recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-[#253048]">
              {recentActivities.map((act, idx) => (
                <div 
                  key={idx} 
                  className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3.5 cursor-pointer hover:bg-[rgba(26,34,53,0.4)] px-2 -mx-2 rounded-lg transition-colors"
                  onClick={() => onOpenDetails(act.app)}
                >
                  <div 
                    className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                    style={{ backgroundColor: getStageColor(act.stage) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#e8e4dc] leading-relaxed">
                      <strong className="text-[#d4a853] font-semibold">{act.company}</strong>{" "}
                      {act.summary.toLowerCase().includes("moved") || act.summary.toLowerCase().includes("stage") 
                        ? act.summary 
                        : `updated to ${act.stage}`}
                    </div>
                    <div className="font-mono text-[10px] text-[#556178] mt-1">
                      {formatTimeAgo(act.time)} &middot; {act.source === "mailbox_auto" ? "Gmail Auto-detected" : "Manual update"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Interviews & Deadlines */}
        <div className="lg:col-span-5 bg-[#131926] border border-[#253048] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-mono text-xs uppercase tracking-wider text-[#556178]">
              Upcoming Interviews & Next Steps
            </h3>
            <span className="font-mono text-xs text-[#8a94a8]">
              {upcomingInterviews.length} pending
            </span>
          </div>

          {upcomingInterviews.length === 0 ? (
            <div className="py-12 text-center text-[#556178] text-xs font-mono">
              No upcoming interview deadlines.
            </div>
          ) : (
            <div className="divide-y divide-[#253048]">
              {upcomingInterviews.map((item, idx) => (
                <div 
                  key={idx} 
                  className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5 cursor-pointer hover:bg-[rgba(26,34,53,0.4)] px-2 -mx-2 rounded-lg transition-colors"
                  onClick={() => onOpenDetails(item.app)}
                >
                  <div className="w-11 h-11 rounded-lg bg-[rgba(167,139,250,0.1)] text-[#a78bfa] flex flex-col items-center justify-center shrink-0 border border-[rgba(167,139,250,0.2)]">
                    <span className="font-mono text-sm font-semibold leading-none">{item.day}</span>
                    <span className="font-mono text-[9px] uppercase opacity-75 mt-0.5">{item.month}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#e8e4dc] truncate">
                      {item.company}
                    </div>
                    <div className="font-mono text-[11px] text-[#8a94a8] truncate mt-0.5">
                      {item.round}
                    </div>
                    {item.interviewLink ? (
                      <a 
                        href={item.interviewLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-[#60a5fa] hover:underline mt-1"
                      >
                        Join Meeting <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <div className="font-mono text-[10px] text-[#556178] mt-0.5">
                        {item.timeStr}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

