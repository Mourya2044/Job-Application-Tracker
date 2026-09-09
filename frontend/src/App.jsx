import React, { useState, useEffect } from "react"
import { Toaster, toast } from "sonner"
import { fetchApi } from "@/config/api"
import { KanbanBoard } from "@/components/board/KanbanBoard"
import { ApplicationListView } from "@/components/board/ApplicationListView"
import { ApplicationDetailModal } from "@/components/board/ApplicationDetailModal"
import { DashboardView } from "@/components/dashboard/DashboardView"
import { ApprovalsView } from "@/components/approvals/ApprovalsView"
import { ConsentDialog } from "@/components/mailbox/ConsentDialog"
import { SimulateEmailModal } from "@/components/mailbox/SimulateEmailModal"
import { SyncActivityDrawer } from "@/components/mailbox/SyncActivityDrawer"
import { AddApplicationModal } from "@/components/board/AddApplicationModal"
import { JobScraperView } from "@/components/jobs/JobScraperView"
import { 
  Bell, 
  TrendingUp, 
  Search, 
  Mail, 
  Kanban, 
  ListFilter, 
  Plus, 
  RefreshCw, 
  Sparkles, 
  Activity, 
  Trash2, 
  MoreVertical, 
  X,
  LayoutGrid,
  Lock,
  LogOut
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function App() {
  const [boardData, setBoardData] = useState({ columns: [], total_applications: 0 })
  const [pendingDiscoveries, setPendingDiscoveries] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isConsentOpen, setIsConsentOpen] = useState(false)
  const [isSimulateOpen, setIsSimulateOpen] = useState(false)
  const [isActivityOpen, setIsActivityOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [consentStatus, setConsentStatus] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [currentView, setCurrentView] = useState("dashboard") // dashboard, approvals, tracking, search
  const [trackingMode, setTrackingMode] = useState("kanban") // kanban, list

  useEffect(() => {
    // Check for OAuth redirect return params (?oauth=success or ?oauth=error)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get("oauth") === "success") {
      toast.success("Google Account successfully connected!")
      loadConsentStatus()
      setIsLoggedIn(true)
      const cleanUrl = window.location.pathname + (window.location.hash || "")
      window.history.replaceState({}, document.title, cleanUrl)
    } else if (urlParams.get("oauth") === "error") {
      const msg = urlParams.get("msg") || "Authentication failed"
      toast.error(`Google Login failed: ${msg}`)
      const cleanUrl = window.location.pathname + (window.location.hash || "")
      window.history.replaceState({}, document.title, cleanUrl)
    }

    loadBoard()
    loadConsentStatus()
    loadPendingDiscoveries()

    // Periodic telemetry poll every 15 seconds to capture background sync events
    const interval = setInterval(async () => {
      try {
        const data = await fetchApi("/api/mailbox/status")
        if (data) {
          setConsentStatus(prev => {
            const prevUpdates = prev?.background_sync?.total_updates_detected || 0
            const newUpdates = data?.background_sync?.total_updates_detected || 0
            if (newUpdates > prevUpdates) {
              loadBoard()
              loadPendingDiscoveries()
              toast.info(`Background Mailbox Sync: ${newUpdates - prevUpdates} status update(s) detected!`)
            }
            return data
          })
        }
      } catch {
        // ignore background poll errors
      }
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  const loadBoard = async () => {
    try {
      const data = await fetchApi("/api/applications")
      setBoardData(data)
    } catch (err) {
      console.error("Failed to load application board:", err)
      toast.error("Could not load tracking board. Ensure backend API is running.")
    }
  }

  const loadConsentStatus = async () => {
    try {
      const data = await fetchApi("/api/mailbox/status")
      setConsentStatus(data)
    } catch (err) {
      console.error("Failed to load consent status:", err)
    }
  }

  const loadPendingDiscoveries = async () => {
    try {
      const data = await fetchApi("/api/mailbox/pending-discoveries")
      setPendingDiscoveries(data || [])
    } catch (err) {
      console.error("Failed to load pending discoveries:", err)
    }
  }

  const handleOpenDetails = async (app) => {
    try {
      const fullApp = await fetchApi(`/api/applications/${app.id}`)
      setSelectedApp(fullApp)
      setIsDetailsOpen(true)
    } catch {
      setSelectedApp(app)
      setIsDetailsOpen(true)
    }
  }

  const handleAddApplication = async (newAppPayload) => {
    try {
      await fetchApi("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAppPayload),
      })
      await loadBoard()
      toast.success(`Application added: ${newAppPayload.company_name}`)
    } catch (err) {
      toast.error(err.message || "Failed to add application")
    }
  }

  const handleAcceptDiscovery = async (id) => {
    try {
      const newApp = await fetchApi(`/api/mailbox/accept-discovery/${id}`, { method: "POST" })
      await loadBoard()
      await loadPendingDiscoveries()
      await loadConsentStatus()
      toast.success(`Tracking started for ${newApp.company_name} — ${newApp.role_title}`)
    } catch (err) {
      toast.error(err.message || "Could not track discovered application")
    }
  }

  const handleDismissDiscovery = async (id) => {
    try {
      await fetchApi(`/api/mailbox/dismiss-discovery/${id}`, { method: "POST" })
      await loadPendingDiscoveries()
      await loadConsentStatus()
      toast.info("Application discovery dismissed")
    } catch (err) {
      toast.error(err.message || "Failed to dismiss")
    }
  }

  const handleClearAllData = async () => {
    if (!window.confirm("Are you sure you want to clear all tracked applications and history?")) return
    try {
      await fetchApi("/api/applications/clear", { method: "POST" })
      await loadBoard()
      await loadPendingDiscoveries()
      toast.info("All applications cleared")
    } catch (err) {
      toast.error(err.message || "Failed to clear data")
    }
  }

  const handleStageChange = async (appId, newStage, userNote = "", nextStep = null) => {
    try {
      const updatedApp = await fetchApi(`/api/applications/${appId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_stage: newStage,
          user_note: userNote || undefined,
          next_step: nextStep || undefined,
        }),
      })

      await loadBoard()

      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(updatedApp)
      }

      toast.success(`${updatedApp.company_name} moved to ${newStage.toUpperCase()}`)
    } catch (err) {
      toast.error(err.message || "Failed to change status")
    }
  }

  const handleToggleLock = async (appId) => {
    try {
      const updatedApp = await fetchApi(`/api/applications/${appId}/lock`, { method: "POST" })
      await loadBoard()
      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(updatedApp)
      }
      toast.info(
        updatedApp.stage_locked ? "Status Locked" : "Status Unlocked",
        {
          description: updatedApp.stage_locked 
            ? "Mailbox sync will not auto-override this stage." 
            : "Mailbox sync can update this stage.",
        }
      )
    } catch (err) {
      toast.error(err.message || "Failed to toggle stage lock")
    }
  }

  const handleRevertStage = async (appId, eventId) => {
    try {
      const updatedApp = await fetchApi(`/api/applications/${appId}/revert/${eventId}`, { method: "POST" })
      await loadBoard()
      setSelectedApp(updatedApp)
      toast.success(`Reverted to ${updatedApp.current_stage.toUpperCase()}`)
    } catch (err) {
      toast.error(err.message || "Could not revert")
    }
  }

  const handleUpdateDetails = async (appId, patchPayload) => {
    try {
      const updatedApp = await fetchApi(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      })
      await loadBoard()
      setSelectedApp(updatedApp)
      toast.success("Application details updated")
    } catch (err) {
      toast.error(err.message || "Failed to update application")
    }
  }

  const handleDeleteApplication = async (appId) => {
    try {
      await fetchApi(`/api/applications/${appId}`, { method: "DELETE" })
      await loadBoard()
      if (selectedApp && selectedApp.id === appId) {
        setIsDetailsOpen(false)
        setSelectedApp(null)
      }
      toast.info("Application deleted")
    } catch (err) {
      toast.error(err.message || "Failed to delete application")
    }
  }

  const handleSyncMailbox = async () => {
    setIsSyncing(true)
    try {
      const result = await fetchApi("/api/mailbox/sync", { method: "POST" })
      await loadBoard()
      await loadPendingDiscoveries()
      await loadConsentStatus()
      toast.success("Inbox status sync complete", {
        description: `${result.updates_detected || 0} update(s) detected across ${result.emails_processed || 0} email(s).`,
      })
    } catch (err) {
      toast.error(err.message || "Mailbox sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLoginClick = () => {
    setIsSigningIn(true)
    setTimeout(() => {
      setIsLoggedIn(true)
      setIsSigningIn(false)
      toast.success("Signed in to Hired.")
    }, 800)
  }

  // Calculate pipeline metrics
  const allApplications = (boardData.columns || []).flatMap(c => c.applications || [])
  const pipelineCounts = { applied: 0, screening: 0, interview: 0, offer: 0 }
  allApplications.forEach(a => {
    const st = a.current_stage?.toLowerCase()
    if (st === "applied") pipelineCounts.applied++
    else if (st === "screening") pipelineCounts.screening++
    else if (st === "interview" || st === "interviewing") pipelineCounts.interview++
    else if (st === "offer" || st === "accepted") pipelineCounts.offer++
  })

  // User details
  const isConnected = !!(consentStatus?.consent_given && consentStatus?.is_sync_enabled)
  const userDisplayName = consentStatus?.user_email
    ? consentStatus.user_email.split("@")[0].replace(".", " ")
    : (isConnected ? "Connected User" : "My Account")
  const userEmailDisplay = consentStatus?.user_email || (isConnected ? "Mailbox Sync Active" : "No mailbox connected")
  const userInitials = consentStatus?.user_email
    ? consentStatus.user_email.slice(0, 2).toUpperCase()
    : "ME"

  return (
    <div className="min-h-screen bg-[#0c1019] text-[#e8e4dc] font-serif flex">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* ============================================
          SIDEBAR NAVIGATION (matching code.html)
          ============================================ */}
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#131926] border-r border-[#253048] flex flex-col p-6 pb-5 z-40 hidden md:flex">
        {/* Brand */}
        <div className="px-3 mb-1">
          <div className="font-serif text-2xl font-bold text-[#d4a853]">
            Hired<span className="opacity-40">.</span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178] mt-0.5">
            Application Tracker
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="mt-8 space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178] px-3 mb-2">
            Main
          </div>

          <button
            onClick={() => setCurrentView("dashboard")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-serif transition-all ${
              currentView === "dashboard"
                ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] border border-[rgba(212,168,53,0.25)] font-semibold"
                : "text-[#8a94a8] hover:bg-[#1a2235] hover:text-[#e8e4dc] border border-transparent"
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setCurrentView("approvals")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-serif transition-all ${
              currentView === "approvals"
                ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] border border-[rgba(212,168,53,0.25)] font-semibold"
                : "text-[#8a94a8] hover:bg-[#1a2235] hover:text-[#e8e4dc] border border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 shrink-0" />
              <span>Approvals</span>
            </div>
            {pendingDiscoveries.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#d4a853] text-[#080b12] font-mono text-[10px] font-bold flex items-center justify-center pulse-badge">
                {pendingDiscoveries.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentView("tracking")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-serif transition-all ${
              currentView === "tracking"
                ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] border border-[rgba(212,168,53,0.25)] font-semibold"
                : "text-[#8a94a8] hover:bg-[#1a2235] hover:text-[#e8e4dc] border border-transparent"
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>Tracking</span>
          </button>

          <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178] px-3 pt-6 mb-2">
            Discover
          </div>

          <button
            onClick={() => setCurrentView("search")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-serif transition-all ${
              currentView === "search"
                ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] border border-[rgba(212,168,53,0.25)] font-semibold"
                : "text-[#8a94a8] hover:bg-[#1a2235] hover:text-[#e8e4dc] border border-transparent"
            }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Job Search</span>
          </button>
        </nav>

        {/* Sidebar Spacer */}
        <div className="flex-1" />

        {/* User Card at bottom */}
        <div 
          onClick={() => setIsConsentOpen(true)}
          className="pt-4 border-t border-[#253048] flex items-center gap-3 cursor-pointer hover:bg-[#1a2235] -mx-2 px-2 py-2 rounded-xl transition-colors group"
          title="Click to manage Gmail connection"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#d4a853] to-[#8b6914] flex items-center justify-center font-mono font-bold text-xs text-[#080b12] shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#e8e4dc] truncate capitalize">
              {userDisplayName}
            </div>
            <div className="font-mono text-[10px] text-[#556178] truncate flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-[#4ade80]" : "bg-[#556178]"}`} />
              <span className="truncate">{userEmailDisplay}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================
          MAIN CONTENT AREA
          ============================================ */}
      <div className="flex-1 md:ml-[260px] min-h-screen flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#0c1019]/90 backdrop-blur-md border-b border-[#253048] px-6 py-3.5 flex items-center justify-between gap-4">
          {/* Mobile brand & Quick Search */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="font-serif font-bold text-[#d4a853] md:hidden text-lg">
              Hired.
            </div>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#556178]" />
              <input
                type="text"
                placeholder="Search company or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-9 pr-8 bg-[#131926] border border-[#253048] rounded-lg text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-serif"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#556178] hover:text-[#e8e4dc]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            {/* Auto-Sync status */}
            <button
              onClick={() => setIsConsentOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors"
              title="Mailbox Sync Status"
            >
              <span className={`w-2 h-2 rounded-full ${consentStatus?.background_sync?.is_running ? "bg-[#4ade80] animate-pulse" : "bg-[#556178]"}`} />
              <span className="text-[11px]">
                {consentStatus?.background_sync?.is_running ? "Auto-Sync Live" : "Auto-Sync Off"}
              </span>
            </button>

            {/* Sync Now */}
            <button
              onClick={handleSyncMailbox}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors disabled:opacity-50"
              title="Sync Mailbox"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[#d4a853]" : ""}`} />
              <span className="hidden md:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
            </button>

            {/* Add Application Button */}
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all shadow-sm hover:-translate-y-0.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New</span>
            </button>

            {/* More Options Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#131926] flex items-center justify-center transition-colors">
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-xs bg-[#131926] border-[#253048] text-[#e8e4dc]">
                <DropdownMenuLabel className="text-[10px] text-[#556178] uppercase font-mono">Tools & Utilities</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setIsSimulateOpen(true)} className="hover:bg-[#1a2235]">
                  <Sparkles className="w-3.5 h-3.5 mr-2 text-[#a78bfa]" />
                  Simulate Email Event
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsActivityOpen(true)} className="hover:bg-[#1a2235]">
                  <Activity className="w-3.5 h-3.5 mr-2 text-[#60a5fa]" />
                  Sync Activity Stream
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsConsentOpen(true)} className="hover:bg-[#1a2235]">
                  <Mail className="w-3.5 h-3.5 mr-2 text-[#4ade80]" />
                  Mailbox Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#253048]" />
                <DropdownMenuItem onClick={() => setIsLoggedIn(false)} className="hover:bg-[#1a2235]">
                  <LogOut className="w-3.5 h-3.5 mr-2 text-[#8a94a8]" />
                  Switch Account / Sign In
                </DropdownMenuItem>
                {allApplications.length > 0 && (
                  <>
                    <DropdownMenuSeparator className="bg-[#253048]" />
                    <DropdownMenuItem onClick={handleClearAllData} className="text-[#fb7185] hover:bg-[rgba(251,113,133,0.1)] focus:text-[#fb7185]">
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Clear All Applications
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* View Router Body */}
        <main className="flex-1 p-6 md:p-10 max-w-7xl w-full mx-auto">
          {/* 1. DASHBOARD VIEW */}
          {currentView === "dashboard" && (
            <DashboardView
              boardData={boardData}
              pendingDiscoveries={pendingDiscoveries}
              consentStatus={consentStatus}
              onSwitchView={setCurrentView}
              onOpenDetails={handleOpenDetails}
            />
          )}

          {/* 2. APPROVALS VIEW */}
          {currentView === "approvals" && (
            <ApprovalsView
              discoveries={pendingDiscoveries}
              onAccept={handleAcceptDiscovery}
              onDismiss={handleDismissDiscovery}
              onSyncMailbox={handleSyncMailbox}
              isSyncing={isSyncing}
            />
          )}

          {/* 3. TRACKING VIEW */}
          {currentView === "tracking" && (
            <div className="space-y-6 animate-fadeUp">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold font-serif text-[#e8e4dc]">
                    Application Tracking
                  </h1>
                  <p className="text-[#8a94a8] text-sm mt-1.5">
                    Real-time status updates. Click cards to view details, or drag between columns in board view.
                  </p>
                </div>

                {/* View Toggle (Board vs List) matching code.html */}
                <div className="inline-flex bg-[#131926] border border-[#253048] rounded-lg overflow-hidden self-start sm:self-auto">
                  <button
                    onClick={() => setTrackingMode("kanban")}
                    className={`px-4 py-2 font-mono text-xs flex items-center gap-2 transition-colors ${
                      trackingMode === "kanban"
                        ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] font-semibold"
                        : "text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#1a2235]"
                    }`}
                  >
                    <Kanban className="w-3.5 h-3.5" />
                    <span>Board</span>
                  </button>
                  <button
                    onClick={() => setTrackingMode("list")}
                    className={`px-4 py-2 font-mono text-xs flex items-center gap-2 border-l border-[#253048] transition-colors ${
                      trackingMode === "list"
                        ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] font-semibold"
                        : "text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#1a2235]"
                    }`}
                  >
                    <ListFilter className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                </div>
              </div>

              {/* Shared Pipeline Bar matching code.html */}
              <div className="flex items-center gap-0 p-6 bg-[#131926] border border-[#253048] rounded-xl overflow-x-auto shadow-sm">
                <div 
                  onClick={() => { setTrackingMode("list"); }}
                  className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-colors min-w-[100px]"
                >
                  <span className="font-serif text-3xl font-bold block text-[#60a5fa] leading-none">
                    {pipelineCounts.applied}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                    Applied
                  </span>
                </div>

                <div className="pipeline-connector hidden sm:block" />

                <div 
                  onClick={() => { setTrackingMode("list"); }}
                  className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-colors min-w-[100px]"
                >
                  <span className="font-serif text-3xl font-bold block text-[#fbbf24] leading-none">
                    {pipelineCounts.screening}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                    Screening
                  </span>
                </div>

                <div className="pipeline-connector hidden sm:block" />

                <div 
                  onClick={() => { setTrackingMode("list"); }}
                  className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-colors min-w-[100px]"
                >
                  <span className="font-serif text-3xl font-bold block text-[#a78bfa] leading-none">
                    {pipelineCounts.interview}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                    Interview
                  </span>
                </div>

                <div className="pipeline-connector hidden sm:block" />

                <div 
                  onClick={() => { setTrackingMode("list"); }}
                  className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-colors min-w-[100px]"
                >
                  <span className="font-serif text-3xl font-bold block text-[#4ade80] leading-none">
                    {pipelineCounts.offer}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                    Offer
                  </span>
                </div>
              </div>

              {/* Board Mode */}
              {trackingMode === "kanban" && (
                <KanbanBoard
                  columns={boardData.columns || []}
                  onStageChange={handleStageChange}
                  onOpenDetails={handleOpenDetails}
                  onToggleLock={handleToggleLock}
                  onDelete={handleDeleteApplication}
                />
              )}

              {/* List Mode */}
              {trackingMode === "list" && (
                <ApplicationListView
                  applications={allApplications}
                  onOpenDetails={handleOpenDetails}
                  searchQuery={searchQuery}
                />
              )}
            </div>
          )}

          {/* 4. JOB SEARCH VIEW */}
          {currentView === "search" && (
            <JobScraperView onImportJob={loadBoard} />
          )}
        </main>
      </div>

      {/* ============================================
          MODALS & DRAWERS
          ============================================ */}
      <ApplicationDetailModal
        application={selectedApp}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false)
          setSelectedApp(null)
        }}
        onStageChange={handleStageChange}
        onToggleLock={handleToggleLock}
        onRevertStage={handleRevertStage}
        onUpdateDetails={handleUpdateDetails}
        onDelete={handleDeleteApplication}
      />

      <AddApplicationModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAddApplication={handleAddApplication}
      />

      <ConsentDialog
        isOpen={isConsentOpen}
        onClose={() => setIsConsentOpen(false)}
        consentStatus={consentStatus}
        onConsentUpdated={loadConsentStatus}
      />

      <SimulateEmailModal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        onSimulated={() => {
          loadBoard()
          loadPendingDiscoveries()
        }}
      />

      <SyncActivityDrawer
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
      />
    </div>
  )
}
