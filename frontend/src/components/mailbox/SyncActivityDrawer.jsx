import React, { useState, useEffect } from "react"
import { 
  Mail, 
  Check, 
  Clock, 
  RefreshCw, 
  ShieldCheck 
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchApi } from "@/config/api"

export function SyncActivityDrawer({
  isOpen,
  onClose,
  onSyncMailbox,
  isSyncing,
}) {
  const [activities, setActivities] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const loadActivities = async () => {
    setIsLoading(true)
    try {
      const data = await fetchApi("/api/mailbox/activity?limit=25")
      setActivities(data || [])
    } catch (err) {
      console.error("Failed to load sync activities:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadActivities()
    }
  }, [isOpen])

  const getMatchBadge = (status) => {
    switch (status) {
      case "auto_created":
        return <Badge variant="purple" className="text-[10px]">Discovered</Badge>
      case "matched_auto":
        return <Badge variant="success" className="text-[10px]">Updated</Badge>
      case "suggested":
        return <Badge variant="warning" className="text-[10px]">Suggested</Badge>
      case "ignored":
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">Filtered</Badge>
      default:
        return <Badge variant="secondary" className="text-[10px]">No Match</Badge>
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-card border-border/80 p-6 space-y-5">
        <SheetHeader className="space-y-2 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <SheetTitle className="text-base font-semibold text-foreground">Sync Activity</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Recent email inspection log and matches
              </SheetDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 border-border/60"
              onClick={loadActivities}
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        {/* Activity Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Recent Inspections</span>
            <span>{activities.length} total</span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <p>Loading activity...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
              <p>No activity logged yet.</p>
              <p className="text-[11px] mt-1 text-muted-foreground/60">
                Trigger a sync or simulate an email to see activity here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((item) => (
                <div 
                  key={item.id}
                  className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1.5 hover:border-border/80 transition-colors text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate text-xs">
                        {item.subject || "No Subject"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {item.sender || "Unknown sender"}
                      </p>
                    </div>
                    {getMatchBadge(item.match_status)}
                  </div>

                  {item.matched_company_name && (
                    <div className="rounded bg-muted/30 border border-border/40 px-2 py-1 flex items-center justify-between text-[11px]">
                      <span className="text-foreground/90 font-medium truncate">
                        {item.matched_company_name}
                      </span>
                      {item.detected_stage && (
                        <span className="text-[10px] uppercase font-medium text-muted-foreground">
                          {item.detected_stage}
                        </span>
                      )}
                    </div>
                  )}

                  {item.snippet && (
                    <p className="text-[10px] text-muted-foreground/80 line-clamp-2 italic bg-muted/10 p-1.5 rounded">
                      "{item.snippet}"
                    </p>
                  )}

                  <div className="text-[10px] text-muted-foreground/50 pt-0.5">
                    {new Date(item.processed_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
