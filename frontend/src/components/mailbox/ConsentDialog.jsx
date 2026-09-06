import React, { useState } from "react"
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  RefreshCw, 
  Check, 
  Mail,
  Zap,
  Clock,
  Radio,
  Sliders,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

function GoogleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

export function ConsentDialog({
  isOpen,
  onClose,
  consentStatus,
  onGrantConsent,
  onDisconnect,
  onSyncMailbox,
  isSyncing,
  onReloadStatus,
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [bgSyncInterval, setBgSyncInterval] = useState(
    consentStatus?.background_sync?.interval_seconds || 120
  )
  const [isBgToggling, setIsBgToggling] = useState(false)

  const isConnected = consentStatus?.consent_given && consentStatus?.is_sync_enabled
  const bgWorker = consentStatus?.background_sync

  const handleConnectGoogle = async () => {
    setIsProcessing(true)
    setStatusMessage("Opening Google Login in browser...")
    try {
      await onGrantConsent()
    } finally {
      setIsProcessing(false)
      setStatusMessage("")
    }
  }

  const handleDisconnectGoogle = async () => {
    setIsProcessing(true)
    setStatusMessage("Revoking access tokens...")
    try {
      await onDisconnect()
    } finally {
      setIsProcessing(false)
      setStatusMessage("")
    }
  }

  const handleToggleBackgroundSync = async () => {
    setIsBgToggling(true)
    try {
      const endpoint = bgWorker?.is_running
        ? "/api/mailbox/background-sync/stop"
        : "/api/mailbox/background-sync/start"
      const res = await fetch(endpoint, { method: "POST" })
      if (!res.ok) throw new Error("Could not toggle background sync")
      toast.success(
        bgWorker?.is_running ? "Background auto-sync paused" : "Background auto-sync activated!"
      )
      if (onReloadStatus) onReloadStatus()
    } catch (err) {
      toast.error(err.message || "Failed to toggle background sync")
    } finally {
      setIsBgToggling(false)
    }
  }

  const handleChangeInterval = async (newSecs) => {
    setBgSyncInterval(newSecs)
    try {
      const res = await fetch("/api/mailbox/background-sync/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval_seconds: newSecs }),
      })
      if (!res.ok) throw new Error("Failed to configure interval")
      toast.success(`Sync frequency set to ${newSecs} seconds`)
      if (onReloadStatus) onReloadStatus()
    } catch (err) {
      toast.error(err.message || "Failed to set frequency")
    }
  }

  const handleTriggerBackgroundCycle = async () => {
    setIsProcessing(true)
    try {
      const res = await fetch("/api/mailbox/background-sync/trigger", { method: "POST" })
      const data = await res.json()
      const updates = data.result?.cycle_updates || 0
      toast.success(`Background cycle complete: ${updates} updates detected`)
      if (onReloadStatus) onReloadStatus()
    } catch (err) {
      toast.error("Failed to run cycle")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border/80 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-400" />
            <span>Mailbox Settings & Event Sync</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage your Google connection, background event synchronization, and OAuth scopes.
          </DialogDescription>
        </DialogHeader>

        {/* Account Connection Status Card */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
            <div>
              <span className="text-xs font-semibold text-foreground block">
                {isConnected ? (consentStatus.user_email || "Google Account Connected") : "Not Connected"}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {isConnected && consentStatus.last_synced_at
                  ? `Last manual sync: ${new Date(consentStatus.last_synced_at).toLocaleTimeString()}`
                  : isConnected
                  ? "OAuth authorized for status updates"
                  : "Sign in with Google to enable automated tracking"}
              </p>
            </div>
          </div>

          {isConnected && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-border/60"
              onClick={onSyncMailbox}
              disabled={isSyncing || isProcessing}
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-primary" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>

        {/* Background Event-Based Worker Section */}
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${bgWorker?.is_running ? "text-amber-400" : "text-muted-foreground"}`} />
              <div>
                <span className="text-xs font-semibold text-foreground block">Background Auto-Sync</span>
                <span className="text-[11px] text-muted-foreground">
                  Periodic history event synchronization in background
                </span>
              </div>
            </div>

            <Button
              size="sm"
              variant={bgWorker?.is_running ? "outline" : "default"}
              onClick={handleToggleBackgroundSync}
              disabled={isBgToggling}
              className="h-7 text-xs px-3"
            >
              {bgWorker?.is_running ? "Pause" : "Enable"}
            </Button>
          </div>

          {/* Telemetry row */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40 text-[11px]">
            <div className="p-2 rounded bg-muted/20 border border-border/40">
              <span className="text-muted-foreground block text-[10px]">Worker Status</span>
              <span className={`font-semibold capitalize ${bgWorker?.is_running ? "text-emerald-400" : "text-muted-foreground"}`}>
                {bgWorker?.is_running ? bgWorker?.last_status || "Active" : "Paused"}
              </span>
            </div>
            <div className="p-2 rounded bg-muted/20 border border-border/40">
              <span className="text-muted-foreground block text-[10px]">Total Cycles</span>
              <span className="font-semibold text-foreground">
                {bgWorker?.total_cycles || 0}
              </span>
            </div>
            <div className="p-2 rounded bg-muted/20 border border-border/40">
              <span className="text-muted-foreground block text-[10px]">Auto Updates</span>
              <span className="font-semibold text-sky-400">
                {bgWorker?.total_updates_detected || 0}
              </span>
            </div>
          </div>

          {/* Interval Selector */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Check frequency:
            </span>

            <div className="flex items-center gap-1">
              {[
                { label: "1m", sec: 60 },
                { label: "2m", sec: 120 },
                { label: "5m", sec: 300 },
                { label: "15m", sec: 900 },
              ].map(opt => (
                <button
                  key={opt.sec}
                  onClick={() => handleChangeInterval(opt.sec)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-all ${
                    (bgWorker?.interval_seconds || bgSyncInterval) === opt.sec
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Real-Time Push / Pub-Sub Watch Status */}
        <div className="p-3 rounded-lg border border-border/50 bg-muted/10 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground text-[11px] flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-violet-400" />
              Real-Time Pub/Sub Push Watch
            </span>
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60">
              {consentStatus?.watch_expiration ? "Active" : "Standby (Polling)"}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {consentStatus?.watch_expiration
              ? `Subscribed to Google Cloud Pub/Sub push notifications until ${new Date(consentStatus.watch_expiration).toLocaleDateString()}.`
              : "Google Cloud Pub/Sub receives instant push notifications when external users receive recruiter emails."}
          </p>
        </div>

        {isProcessing && statusMessage && (
          <div className="p-2 rounded-md border border-border/60 bg-muted/30 text-muted-foreground text-xs flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Privacy Note */}
        <div className="space-y-1.5 text-xs text-muted-foreground border-t border-border/40 pt-3">
          <span className="font-medium text-foreground text-[11px] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Privacy & Security
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Uses read-only (<code className="text-[10px] bg-muted/60 px-1 py-0.5 rounded">gmail.readonly</code>) access to inspect employer & ATS emails. Your personal emails are never stored. You can disconnect at any time.
          </p>
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs" disabled={isProcessing}>
            Close
          </Button>

          {isConnected ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnectGoogle}
              disabled={isProcessing}
              className="text-xs h-7 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleConnectGoogle}
              disabled={isProcessing}
              className="text-xs font-medium h-7 gap-2 bg-foreground text-background hover:bg-zinc-200"
            >
              <GoogleIcon className="w-3.5 h-3.5" />
              {isProcessing ? "Connecting..." : "Sign in with Google"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
