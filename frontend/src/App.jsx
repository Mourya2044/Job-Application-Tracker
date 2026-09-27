import React, { useState, useEffect, useRef } from "react"
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useLocation,
  useSearchParams
} from "react-router-dom"
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
  Search,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
  Activity,
  Trash2,
  MoreVertical,
  X,
  LayoutGrid,
  LogOut,
  Menu,
  Kanban,
  ListFilter,
  TrendingUp,
  Briefcase
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
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [boardData, setBoardData] = useState({ columns: [], total_applications: 0 })
  const [pendingDiscoveries, setPendingDiscoveries] = useState([])
  const [selectedApp, setSelectedApp] = useState(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isConsentOpen, setIsConsentOpen] = useState(false)
  const [isSimulateOpen, setIsSimulateOpen] = useState(false)
  const [isActivityOpen, setIsActivityOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [consentStatus, setConsentStatus] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSyncing, setIsSyncing] = useState(false)

  // Tracking mode synced with URL search parameter ?mode=kanban|list
  const trackingMode = searchParams.get("mode") === "list" ? "list" : "kanban"

  const setTrackingMode = (mode) => {
    setSearchParams(prev => {
      const updated = new URLSearchParams(prev)
      if (mode === "list") {
        updated.set("mode", "list")
      } else {
        updated.delete("mode")
      }
      return updated
    })
  }

  const prevUpdatesRef = useRef(null)

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    // Check for OAuth redirect return params (?oauth=success or ?oauth=error)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get("oauth") === "success") {
      toast.success("Google Account successfully connected!")
      loadConsentStatus()
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
          const newUpdates = data?.background_sync?.total_updates_detected || 0

          if (prevUpdatesRef.current !== null && newUpdates > prevUpdatesRef.current) {
            loadBoard()
            loadPendingDiscoveries()
            toast.info(`Background Mailbox Sync: ${newUpdates - prevUpdatesRef.current} status update(s) detected!`)
          }
          prevUpdatesRef.current = newUpdates
          setConsentStatus(data)
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
      if (prevUpdatesRef.current === null) {
        prevUpdatesRef.current = data?.background_sync?.total_updates_detected || 0
      }
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

  const handleConnectGoogle = async () => {
    try {
      const res = await fetchApi("/api/mailbox/connect-google", { method: "POST" })
      if (res?.auth_url) {
        window.location.href = res.auth_url
        return
      }
      setConsentStatus(res)
      await loadConsentStatus()
      toast.success(
        res?.user_email ? `Connected as ${res.user_email}` : "Google Account Connected"
      )
    } catch (err) {
      toast.error(err.message || "Google authentication failed.")
    }
  }

  const handleDisconnect = async () => {
    try {
      const res = await fetchApi("/api/mailbox/disconnect", { method: "POST" })
      setConsentStatus(res)
      await loadConsentStatus()
      toast.success("Signed out & Google Account disconnected.")
    } catch (err) {
      toast.error(err.message || "Could not disconnect account.")
    }
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

  // Active navigation styling helper
  const sidebarNavLinkClass = ({ isActive }) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-sans transition-all active:scale-95 ${isActive
      ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] border border-[rgba(212,168,53,0.25)] font-semibold shadow-sm"
      : "text-[#8a94a8] hover:bg-[#1a2235] hover:text-[#e8e4dc] border border-transparent"
    }`

  const bottomNavLinkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center py-1.5 px-3 rounded-lg text-[10px] font-mono transition-colors relative ${isActive
      ? "text-[#d4a853] font-semibold"
      : "text-[#8a94a8] hover:text-[#e8e4dc]"
    }`

  return (
    <div className="min-h-screen bg-[#0c1019] text-[#e8e4dc] font-sans flex flex-col md:flex-row">
      <Toaster position="bottom-right" richColors theme="dark" />

      {/* ============================================
          DESKTOP SIDEBAR NAVIGATION
          ============================================ */}
      <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#131926] border-r border-[#253048] flex-col p-6 pb-5 z-40 hidden md:flex">
        {/* Brand */}
        <div className="px-3 mb-1">
          <div className="font-sans text-2xl font-bold text-[#d4a853] tracking-tight">
            Track<span className="opacity-40">.</span>
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

          <NavLink to="/dashboard" className={sidebarNavLinkClass}>
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/approvals" className={sidebarNavLinkClass}>
            <div className="flex items-center gap-3 flex-1">
              <Bell className="w-4 h-4 shrink-0" />
              <span>Approvals</span>
            </div>
            {pendingDiscoveries.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#d4a853] text-[#080b12] font-mono text-[10px] font-bold flex items-center justify-center pulse-badge">
                {pendingDiscoveries.length}
              </span>
            )}
          </NavLink>

          <NavLink to="/tracking" className={sidebarNavLinkClass}>
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>Tracking</span>
          </NavLink>

          <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178] px-3 pt-6 mb-2">
            Discover
          </div>

          <NavLink to="/jobs" className={sidebarNavLinkClass}>
            <Search className="w-4 h-4 shrink-0" />
            <span>Job Search</span>
          </NavLink>
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
          MOBILE OFF-CANVAS DRAWER MENU
          ============================================ */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#080b12]/80 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="fixed left-0 top-0 bottom-0 w-[280px] bg-[#131926] border-r border-[#253048] flex flex-col p-6 z-50 shadow-2xl animate-fadeUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#253048]">
              <div>
                <div className="font-sans text-2xl font-bold text-[#d4a853]">
                  Track<span className="opacity-40">.</span>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178]">
                  Application Tracker
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Drawer Navigation Links */}
            <nav className="mt-6 space-y-1.5 flex-1 overflow-y-auto">
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#556178] px-2 mb-2">
                Navigation
              </div>

              <NavLink
                to="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className={sidebarNavLinkClass}
              >
                <LayoutGrid className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/approvals"
                onClick={() => setIsMobileMenuOpen(false)}
                className={sidebarNavLinkClass}
              >
                <div className="flex items-center gap-3 flex-1">
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>Approvals</span>
                </div>
                {pendingDiscoveries.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-[#d4a853] text-[#080b12] font-mono text-[10px] font-bold flex items-center justify-center">
                    {pendingDiscoveries.length}
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/tracking"
                onClick={() => setIsMobileMenuOpen(false)}
                className={sidebarNavLinkClass}
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>Tracking Board</span>
              </NavLink>

              <NavLink
                to="/jobs"
                onClick={() => setIsMobileMenuOpen(false)}
                className={sidebarNavLinkClass}
              >
                <Search className="w-4 h-4 shrink-0" />
                <span>Live Job Discovery</span>
              </NavLink>

              <div className="pt-6 border-t border-[#253048] my-4">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    setIsAddOpen(true)
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>New Application</span>
                </button>
              </div>
            </nav>

            {/* Mobile Account Details & Logout */}
            <div className="pt-4 border-t border-[#253048] space-y-3">
              <div
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  setIsConsentOpen(true)
                }}
                className="flex items-center gap-3 cursor-pointer p-2 rounded-xl bg-[#0c1019] border border-[#253048]"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#d4a853] to-[#8b6914] flex items-center justify-center font-mono font-bold text-xs text-[#080b12] shrink-0">
                  {userInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#e8e4dc] truncate capitalize">
                    {userDisplayName}
                  </div>
                  <div className="font-mono text-[10px] text-[#556178] truncate">
                    {userEmailDisplay}
                  </div>
                </div>
              </div>

              {isConnected ? (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    handleDisconnect()
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#253048] text-xs font-mono text-[#fb7185] hover:bg-[rgba(251,113,133,0.1)] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    handleConnectGoogle()
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#d4a853] text-xs font-mono text-[#d4a853] hover:bg-[rgba(212,168,53,0.1)] transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Connect Google</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================
          MAIN CONTENT AREA
          ============================================ */}
      <div className="flex-1 md:ml-[260px] min-h-screen flex flex-col pb-20 md:pb-8">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-[#0c1019]/90 backdrop-blur-md border-b border-[#253048] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          {/* Mobile hamburger + brand + quick search */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc] md:hidden shrink-0"
              aria-label="Open mobile menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div
              onClick={() => navigate("/dashboard")}
              className="font-sans font-bold text-[#d4a853] md:hidden text-lg cursor-pointer shrink-0"
            >
              Track.
            </div>

            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#556178]" />
              <input
                type="text"
                placeholder="Search company or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-9 pr-8 bg-[#131926] border border-[#253048] rounded-lg text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-sans transition-colors"
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
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Auto-Sync status (desktop/tablet) */}
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
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#253048] text-xs font-mono text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-all active:scale-95 disabled:opacity-50"
              title="Sync Mailbox"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[#d4a853]" : ""}`} />
              <span className="hidden md:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
            </button>

            {/* Add Application Button */}
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all active:scale-95 shadow-sm hover:-translate-y-0.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">New</span>
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
                {isConnected ? (
                  <DropdownMenuItem onClick={handleDisconnect} className="hover:bg-[#1a2235] text-[#fb7185] focus:text-[#fb7185]">
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    Sign Out & Disconnect
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleConnectGoogle} className="hover:bg-[#1a2235] text-[#d4a853] focus:text-[#d4a853]">
                    <Mail className="w-3.5 h-3.5 mr-2" />
                    Connect Google Account
                  </DropdownMenuItem>
                )}
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
        <main className="flex-1 p-4 sm:p-6 md:p-10 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* 1. DASHBOARD VIEW */}
            <Route
              path="/dashboard"
              element={
                <DashboardView
                  boardData={boardData}
                  pendingDiscoveries={pendingDiscoveries}
                  consentStatus={consentStatus}
                  onSwitchView={(v) => navigate(v === "search" ? "/jobs" : `/${v}`)}
                  onOpenDetails={handleOpenDetails}
                />
              }
            />

            {/* 2. APPROVALS VIEW */}
            <Route
              path="/approvals"
              element={
                <ApprovalsView
                  discoveries={pendingDiscoveries}
                  onAccept={handleAcceptDiscovery}
                  onDismiss={handleDismissDiscovery}
                  onSyncMailbox={handleSyncMailbox}
                  isSyncing={isSyncing}
                />
              }
            />

            {/* 3. TRACKING VIEW */}
            <Route
              path="/tracking"
              element={
                <div className="space-y-6 animate-fadeUp">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-sans text-[#e8e4dc]">
                        Application Tracking
                      </h1>
                      <p className="text-[#8a94a8] text-xs sm:text-sm mt-1">
                        Real-time status updates. Tap cards to view details, or drag between stages.
                      </p>
                    </div>

                    {/* View Toggle (Board vs List) */}
                    <div className="inline-flex bg-[#131926] border border-[#253048] rounded-lg overflow-hidden self-start sm:self-auto shadow-sm">
                      <button
                        onClick={() => setTrackingMode("kanban")}
                        className={`px-3.5 py-2 font-mono text-xs flex items-center gap-1.5 transition-colors ${trackingMode === "kanban"
                          ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] font-semibold"
                          : "text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#1a2235]"
                          }`}
                      >
                        <Kanban className="w-3.5 h-3.5" />
                        <span>Board</span>
                      </button>
                      <button
                        onClick={() => setTrackingMode("list")}
                        className={`px-3.5 py-2 font-mono text-xs flex items-center gap-1.5 border-l border-[#253048] transition-colors ${trackingMode === "list"
                          ? "bg-[rgba(212,168,53,0.12)] text-[#d4a853] font-semibold"
                          : "text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#1a2235]"
                          }`}
                      >
                        <ListFilter className="w-3.5 h-3.5" />
                        <span>List</span>
                      </button>
                    </div>
                  </div>

                  {/* Shared Pipeline Bar */}
                  <div className="flex items-center gap-1 p-3 sm:p-5 bg-[#131926] border border-[#253048] rounded-xl overflow-x-auto shadow-sm">
                    <div
                      onClick={() => setTrackingMode("list")}
                      className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-all active:scale-95 min-w-[70px]"
                    >
                      <span className="font-sans text-2xl sm:text-3xl font-bold block text-[#60a5fa] leading-none">
                        {pipelineCounts.applied}
                      </span>
                      <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                        Applied
                      </span>
                    </div>

                    <div className="pipeline-connector hidden sm:block" />

                    <div
                      onClick={() => setTrackingMode("list")}
                      className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-all active:scale-95 min-w-[70px]"
                    >
                      <span className="font-sans text-2xl sm:text-3xl font-bold block text-[#fbbf24] leading-none">
                        {pipelineCounts.screening}
                      </span>
                      <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                        Screening
                      </span>
                    </div>

                    <div className="pipeline-connector hidden sm:block" />

                    <div
                      onClick={() => setTrackingMode("list")}
                      className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-all active:scale-95 min-w-[70px]"
                    >
                      <span className="font-sans text-2xl sm:text-3xl font-bold block text-[#a78bfa] leading-none">
                        {pipelineCounts.interview}
                      </span>
                      <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
                        Interview
                      </span>
                    </div>

                    <div className="pipeline-connector hidden sm:block" />

                    <div
                      onClick={() => setTrackingMode("list")}
                      className="flex-1 text-center cursor-pointer p-2 rounded-lg hover:bg-[#1a2235] transition-all active:scale-95 min-w-[70px]"
                    >
                      <span className="font-sans text-2xl sm:text-3xl font-bold block text-[#4ade80] leading-none">
                        {pipelineCounts.offer}
                      </span>
                      <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-[#556178] mt-1.5 block">
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
              }
            />

            {/* 4. JOB SEARCH & DISCOVERY VIEW */}
            <Route
              path="/jobs"
              element={<JobScraperView onImportJob={loadBoard} />}
            />
            <Route
              path="/discover"
              element={<Navigate to="/jobs" replace />}
            />

            {/* Fallback to Dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      {/* ============================================
          MOBILE BOTTOM NAVIGATION BAR
          ============================================ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#131926]/95 backdrop-blur-lg border-t border-[#253048] flex items-center justify-around py-1.5 px-2 md:hidden shadow-2xl safe-bottom">
        <NavLink to="/dashboard" className={bottomNavLinkClass}>
          <LayoutGrid className="w-4 h-4 mb-0.5" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/tracking" className={bottomNavLinkClass}>
          <Kanban className="w-4 h-4 mb-0.5" />
          <span>Tracking</span>
        </NavLink>

        <NavLink to="/approvals" className={bottomNavLinkClass}>
          <div className="relative mb-0.5">
            <Bell className="w-4 h-4" />
            {pendingDiscoveries.length > 0 && (
              <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-[#d4a853] text-[#080b12] text-[8px] font-bold flex items-center justify-center">
                {pendingDiscoveries.length}
              </span>
            )}
          </div>
          <span>Approvals</span>
        </NavLink>

        <NavLink to="/jobs" className={bottomNavLinkClass}>
          <Search className="w-4 h-4 mb-0.5" />
          <span>Jobs</span>
        </NavLink>
      </nav>

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
        onGrantConsent={handleConnectGoogle}
        onDisconnect={handleDisconnect}
        onSyncMailbox={handleSyncMailbox}
        isSyncing={isSyncing}
        onReloadStatus={loadConsentStatus}
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
