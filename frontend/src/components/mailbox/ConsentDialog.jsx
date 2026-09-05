import React, { useState } from "react"
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  RefreshCw, 
  Check, 
  Mail
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
}) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")

  const isConnected = consentStatus?.consent_given && consentStatus?.is_sync_enabled

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border/80 p-6 space-y-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground">Gmail Connection</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Automatically track job application status updates and interview invites.
          </DialogDescription>
        </DialogHeader>

        {/* Status Card */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <div>
              <span className="text-xs font-semibold text-foreground block">
                {isConnected ? (consentStatus.user_email || "Google Connected") : "Not Connected"}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {isConnected && consentStatus.last_synced_at
                  ? `Last sync: ${new Date(consentStatus.last_synced_at).toLocaleTimeString()}`
                  : isConnected
                  ? "Read-only sync active"
                  : "Sign in to enable mailbox status capture"}
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
