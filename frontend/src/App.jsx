import React, { useState, useEffect } from "react"
import { Toaster, toast } from "sonner"
import { KanbanBoard } from "@/components/board/KanbanBoard"
import { TimelineSheet } from "@/components/drawer/TimelineSheet"
import { ConsentDialog } from "@/components/mailbox/ConsentDialog"
import { SimulateEmailModal } from "@/components/mailbox/SimulateEmailModal"
import { SyncActivityDrawer } from "@/components/mailbox/SyncActivityDrawer"
import { AddApplicationModal } from "@/components/board/AddApplicationModal"
import { PendingDiscoveryBanner } from "@/components/mailbox/PendingDiscoveryBanner"
import { DiscoveryPromptModal } from "@/components/mailbox/DiscoveryPromptModal"
import { JobScraperView } from "@/components/jobs/JobScraperView"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Building2, 
  Search, 
  Mail, 
  RefreshCw, 
  Sparkles, 
  Kanban, 
  ListFilter, 
  TrendingUp,
  CheckCircle2,
  Activity,
  Clock,
  Plus,
  Trash2,
  MoreVertical,
  X,
  Layers,
  ChevronRight,
  Globe,
  Zap
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
  const [isDiscoveryPromptOpen, setIsDiscoveryPromptOpen] = useState(false)
  const [consentStatus, setConsentStatus] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState("board")

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
        const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/status")
        if (res.ok) {
          const data = await res.json()
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
      } catch (e) {
        // ignore background poll errors
      }
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  const loadBoard = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/applications")
      const data = await res.json()
      setBoardData(data)
    } catch (err) {
      console.error("Failed to load application board:", err)
      toast.error("Could not load tracking board. Ensure backend API is running.")
    }
  }

  const loadConsentStatus = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/status")
      const data = await res.json()
      setConsentStatus(data)
    } catch (err) {
      console.error("Failed to load consent status:", err)
    }
  }

  const loadPendingDiscoveries = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/pending-discoveries")
      const data = await res.json()
      setPendingDiscoveries(data)
    } catch (err) {
      console.error("Failed to load pending discoveries:", err)
    }
  }

  const handleOpenDetails = async (app) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${app.id}`)
      const fullApp = await res.json()
      setSelectedApp(fullApp)
      setIsDetailsOpen(true)
    } catch (err) {
      setSelectedApp(app)
      setIsDetailsOpen(true)
    }
  }

  const handleAddApplication = async (newAppPayload) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAppPayload),
      })
      if (!res.ok) throw new Error("Failed to add application")
      await loadBoard()
      toast.success(`Application added: ${newAppPayload.company_name}`)
    } catch (err) {
      toast.error("Failed to add application")
    }
  }

  const handleAcceptDiscovery = async (logId) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/mailbox/accept-discovery/${logId}`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to accept discovery")
      const newApp = await res.json()
      await loadBoard()
      await loadPendingDiscoveries()
      await loadConsentStatus()
      toast.success(`Tracking ${newApp.company_name}`)
    } catch (err) {
      toast.error("Could not add discovered application")
    }
  }

  const handleDismissDiscovery = async (logId) => {
    try {
      await fetch((import.meta.env.VITE_API_URL || '') + `/api/mailbox/dismiss-discovery/${logId}`, { method: "POST" })
      await loadPendingDiscoveries()
      await loadConsentStatus()
      toast.info("Discovery dismissed")
    } catch (err) {
      toast.error("Failed to dismiss")
    }
  }

  const handleClearAllData = async () => {
    if (!window.confirm("Are you sure you want to clear all tracked applications and history?")) return
    try {
      await fetch((import.meta.env.VITE_API_URL || '') + "/api/applications/clear", { method: "POST" })
      await loadBoard()
      await loadPendingDiscoveries()
      toast.info("All applications cleared")
    } catch (err) {
      toast.error("Failed to clear data")
    }
  }

  const handleStageChange = async (appId, newStage, userNote = "", nextStep = null, interviewLink = null) => {
    let prevStage = "applied"
    for (const col of boardData.columns) {
      const found = col.applications.find(a => a.id === appId)
      if (found) {
        prevStage = found.current_stage
        break
      }
    }

    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${appId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_stage: newStage,
          user_note: userNote || undefined,
          next_step: nextStep || undefined,
          interview_link: interviewLink || undefined,
        }),
      })

      if (!res.ok) throw new Error("Failed to update stage")
      const updatedApp = await res.json()

      await loadBoard()

      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(updatedApp)
      }

      toast.success(
        `Moved to ${newStage.toUpperCase()}`,
        {
          description: `${updatedApp.company_name} — ${updatedApp.role_title}`,
          action: {
            label: "Undo",
            onClick: () => handleStageChange(appId, prevStage, "User clicked Undo"),
          },
        }
      )
    } catch (err) {
      console.error(err)
      toast.error("Failed to change status")
    }
  }

  const handleToggleLock = async (appId) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${appId}/lock`, { method: "POST" })
      const updatedApp = await res.json()
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
      toast.error("Failed to toggle stage lock")
    }
  }

  const handleRevertStage = async (appId, eventId) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${appId}/revert/${eventId}`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to revert")
      const updatedApp = await res.json()
      await loadBoard()
      setSelectedApp(updatedApp)
      toast.success(`Reverted to ${updatedApp.current_stage.toUpperCase()}`)
    } catch (err) {
      toast.error("Could not revert")
    }
  }

  const handleUpdateDetails = async (appId, patchPayload) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      })
      const updatedApp = await res.json()
      await loadBoard()
      setSelectedApp(updatedApp)
      toast.success("Application details updated")
    } catch (err) {
      toast.error("Failed to update application")
    }
  }

  const handleDelete = async (appId) => {
    try {
      await fetch((import.meta.env.VITE_API_URL || '') + `/api/applications/${appId}`, { method: "DELETE" })
      await loadBoard()
      setIsDetailsOpen(false)
      toast.success("Application removed")
    } catch (err) {
      toast.error("Failed to delete application")
    }
  }

  const handleGrantConsent = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/connect-google", { method: "POST" })
      if (!res.ok) throw new Error("Google login failed")
      const data = await res.json()
      if (data.auth_url) {
        // Web / serverless OAuth redirect
        window.location.href = data.auth_url
        return
      }
      setConsentStatus(data)
      await loadConsentStatus()
      toast.success(
        data.user_email ? `Connected as ${data.user_email}` : "Google Account Connected"
      )
    } catch (err) {
      toast.error("Google authentication cancelled or failed.")
    }
  }


  const handleDisconnect = async () => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/disconnect", { method: "POST" })
      const status = await res.json()
      setConsentStatus(status)
      await loadConsentStatus()
      toast.info("Google Account disconnected")
    } catch (err) {
      toast.error("Failed to disconnect")
    }
  }

  const handleSyncMailbox = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/sync", { method: "POST" })
      const result = await res.json()
      await loadBoard()
      await loadConsentStatus()
      const discRes = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/pending-discoveries")
      const discData = await discRes.json()
      setPendingDiscoveries(discData)

      if (discData.length > 0) {
        setIsDiscoveryPromptOpen(true)
      }

      if (result.status === "success") {
        toast.success(`Mailbox synced (${result.updates_count} updates found)`)
      } else {
        toast.info(result.message || "Sync completed")
      }
    } catch (err) {
      toast.error("Mailbox sync failed")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSimulateEmail = async (payload) => {
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/simulate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      await loadBoard()
      await loadConsentStatus()
      const discRes = await fetch((import.meta.env.VITE_API_URL || '') + "/api/mailbox/pending-discoveries")
      const discData = await discRes.json()
      setPendingDiscoveries(discData)

      if (result.matched && result.matched_application) {
        if (result.matched_application.is_pending_confirmation) {
          setIsDiscoveryPromptOpen(true)
          toast.info(
            `New application found: ${result.matched_application.company_name}`,
            {
              description: "Review pending discoveries to watch.",
            }
          )
        } else {
          toast.success(
            `Status Captured: ${result.matched_application.company_name}`,
            {
              description: `Moved from ${result.matched_application.old_stage} -> ${result.matched_application.new_stage}`,
              action: {
                label: "Undo",
                onClick: () => handleStageChange(
                  result.matched_application.application_id, 
                  result.matched_application.old_stage, 
                  "Reverted simulated email capture"
                ),
              },
            }
          )
        }
      } else {
        toast.info(result.message || "Email processed (no active match).")
      }
    } catch (err) {
      toast.error("Simulation failed")
    }
  }

  // Filter columns by search query
  const filteredColumns = boardData.columns.map(col => ({
    ...col,
    applications: col.applications.filter(app => 
      app.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.role_title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }))

  const activePipelineCount = (boardData.columns.find(c => c.stage === 'interviewing')?.applications.length || 0) +
    (boardData.columns.find(c => c.stage === 'screening')?.applications.length || 0)
  const offersCount = (boardData.columns.find(c => c.stage === 'offer')?.applications.length || 0) +
    (boardData.columns.find(c => c.stage === 'accepted')?.applications.length || 0)

  const isConnected = consentStatus?.consent_given && consentStatus?.is_sync_enabled

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      <Toaster position="top-right" theme="dark" richColors closeButton />

      {/* Modern Minimal Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background font-bold text-xs">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-foreground">
            Applications
          </span>
        </div>

        {/* Center Search Input */}
        <div className="flex items-center flex-1 max-w-sm mx-auto">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search company or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex h-7 w-full rounded-md border border-border/60 bg-muted/30 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Background Auto-Sync Live Indicator */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConsentOpen(true)}
            className="h-7 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
            title="Configure Background Auto-Sync"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                consentStatus?.background_sync?.is_running ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
              }`}
            />
            <span className="hidden md:inline text-[11px]">
              {consentStatus?.background_sync?.is_running
                ? `Auto-Sync (${consentStatus?.background_sync?.interval_seconds}s)`
                : "Auto-Sync Paused"}
            </span>
          </Button>

          {/* Mailbox Status Pill */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConsentOpen(true)}
            className="h-7 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <span className="hidden sm:inline">
              {isConnected ? (consentStatus?.user_email ? consentStatus.user_email.split('@')[0] : "Connected") : "Connect Gmail"}
            </span>
          </Button>

          {/* Sync Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncMailbox}
            disabled={isSyncing}
            className="h-7 text-xs gap-1.5 border-border/60 text-muted-foreground hover:text-foreground"
            title="Sync Mailbox"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
          </Button>

          {/* Primary Action: Add Application */}
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="h-7 gap-1 text-xs font-medium bg-foreground text-background hover:bg-zinc-200 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </Button>

          {/* More Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 text-xs">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-semibold">Utilities</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setIsSimulateOpen(true)}>
                <Sparkles className="w-3.5 h-3.5 mr-2 text-violet-400" />
                Simulate Email Event
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsActivityOpen(true)}>
                <Activity className="w-3.5 h-3.5 mr-2 text-primary" />
                Sync Activity Stream
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsConsentOpen(true)}>
                <Mail className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                Mailbox Settings
              </DropdownMenuItem>
              {boardData.total_applications > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleClearAllData} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Clear All Applications
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Minimal Subheader / Status & Metric Bar */}
      <div className="border-b border-border/40 bg-card/20 px-6 py-2 flex flex-wrap items-center justify-between text-xs gap-3">
        {/* Left: View Switcher & Quick Metrics */}
        <div className="flex items-center gap-4">
          {/* Board / Table / Jobs Tabs */}
          <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/40">
            <button
              onClick={() => setActiveTab("board")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "board"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Kanban className="w-3 h-3" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setActiveTab("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "table"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListFilter className="w-3 h-3" />
              <span>List</span>
            </button>
            <button
              onClick={() => setActiveTab("jobs")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === "jobs"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="w-3 h-3 text-sky-400" />
              <span>Discover Jobs</span>
              <span className="text-[9px] bg-primary/20 text-primary px-1 rounded font-bold">New</span>
            </button>
          </div>

          {/* Minimal Stat Indicators */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground border-l border-border/40 pl-4">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{boardData.total_applications}</span> Total
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-sky-400">{activePipelineCount}</span> In Progress
            </span>
            <span className="text-muted-foreground/30">•</span>
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-emerald-400">{offersCount}</span> Offers
            </span>
          </div>
        </div>

        {/* Right: Sync Activity & Discoveries */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {pendingDiscoveries.length > 0 && (
            <button
              onClick={() => setIsDiscoveryPromptOpen(true)}
              className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 font-medium transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>{pendingDiscoveries.length} discovered</span>
            </button>
          )}

          {consentStatus?.last_synced_at && (
            <span className="hidden md:inline text-muted-foreground/60">
              Synced {new Date(consentStatus.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          <button
            onClick={() => setIsActivityOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Activity
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 p-6 space-y-4">
        {/* Prompt Banner for Untracked Discovered Applications */}
        <PendingDiscoveryBanner
          discoveries={pendingDiscoveries}
          onAccept={handleAcceptDiscovery}
          onDismiss={handleDismissDiscovery}
        />

        {/* Empty State when 0 applications */}
        {boardData.total_applications === 0 && pendingDiscoveries.length === 0 && activeTab !== "jobs" ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-12 text-center flex flex-col items-center justify-center space-y-3 max-w-md mx-auto mt-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">No applications tracked yet</h3>
              <p className="text-xs text-muted-foreground">
                Add an application manually or connect Gmail to capture status updates automatically.
              </p>
            </div>
            <Button 
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="gap-1.5 text-xs font-medium mt-2 bg-foreground text-background hover:bg-zinc-200"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Application
            </Button>
          </div>
        ) : (
          <div>
            {/* Job Discovery & Scraper View */}
            {activeTab === "jobs" && (
              <JobScraperView
                onImportJob={async () => {
                  await loadBoard()
                  await loadPendingDiscoveries()
                }}
                trackedUrls={boardData.columns.flatMap(c => c.applications).map(a => a.job_url).filter(Boolean)}
              />
            )}

            {/* Kanban Board View */}
            {activeTab === "board" && (
              <KanbanBoard
                columns={filteredColumns}
                onStageChange={handleStageChange}
                onOpenDetails={handleOpenDetails}
                onToggleLock={handleToggleLock}
                onDelete={handleDelete}
                onAcceptSuggestion={(appId, stage) => handleStageChange(appId, stage, "Accepted email status suggestion")}
                onDismissSuggestion={(appId) => handleUpdateDetails(appId, { pending_suggestion: null })}
              />
            )}

            {/* List / Table View */}
            {activeTab === "table" && (
              <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/20 text-muted-foreground font-medium text-[11px] border-b border-border/40">
                    <tr>
                      <th className="py-2.5 px-4">Company</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Stage</th>
                      <th className="py-2.5 px-4">Next Step</th>
                      <th className="py-2.5 px-4">Source</th>
                      <th className="py-2.5 px-4">Updated</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {boardData.columns.flatMap(c => c.applications).map(app => (
                      <tr 
                        key={app.id} 
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => handleOpenDetails(app)}
                      >
                        <td className="py-3 px-4 font-medium text-foreground">{app.company_name}</td>
                        <td className="py-3 px-4 text-muted-foreground">{app.role_title}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase border border-border/60 bg-muted/30 text-foreground/80">
                            {app.current_stage}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-foreground/80">{app.next_step || "-"}</td>
                        <td className="py-3 px-4 text-muted-foreground/80 text-[11px]">{app.last_status_change_source}</td>
                        <td className="py-3 px-4 text-muted-foreground text-[11px]">
                          {new Date(app.last_status_change_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenDetails(app)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Application Modal */}
      <AddApplicationModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAddApplication={handleAddApplication}
      />

      {/* Slide-over Application Timeline Drawer */}
      <TimelineSheet
        application={selectedApp}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onStageChange={handleStageChange}
        onToggleLock={handleToggleLock}
        onRevertStage={handleRevertStage}
        onUpdateDetails={handleUpdateDetails}
      />

      {/* Mailbox Consent Dialog */}
      <ConsentDialog
        isOpen={isConsentOpen}
        onClose={() => setIsConsentOpen(false)}
        consentStatus={consentStatus}
        onGrantConsent={handleGrantConsent}
        onDisconnect={handleDisconnect}
        onSyncMailbox={handleSyncMailbox}
        isSyncing={isSyncing}
        onReloadStatus={loadConsentStatus}
      />

      {/* Discovery Prompt Modal */}
      <DiscoveryPromptModal
        isOpen={isDiscoveryPromptOpen}
        onClose={() => setIsDiscoveryPromptOpen(false)}
        discoveries={pendingDiscoveries}
        onAccept={handleAcceptDiscovery}
        onDismiss={handleDismissDiscovery}
      />

      {/* Simulation Modal */}
      <SimulateEmailModal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        onSimulate={handleSimulateEmail}
        trackedApplications={boardData.columns.flatMap(c => c.applications)}
      />

      {/* Live Mailbox Sync Activity Drawer */}
      <SyncActivityDrawer
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
        onSyncMailbox={handleSyncMailbox}
        isSyncing={isSyncing}
      />
    </div>
  )
}
