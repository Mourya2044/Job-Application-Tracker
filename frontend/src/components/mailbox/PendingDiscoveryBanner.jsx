import React from "react"
import { Sparkles, Check, X, Building2, Briefcase, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function PendingDiscoveryBanner({
  discoveries,
  onAccept,
  onDismiss,
}) {
  if (!discoveries || discoveries.length === 0) return null

  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center justify-between text-xs font-medium text-violet-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Discovered Applications ({discoveries.length} awaiting confirmation)
        </span>
        <span className="text-[11px] text-muted-foreground">
          Found in your mailbox
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {discoveries.map((item) => (
          <div
            key={item.log_id}
            className="rounded-lg border border-violet-500/30 bg-violet-950/10 p-3 flex flex-col justify-between gap-2 shadow-sm hover:border-violet-500/50 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-foreground truncate">
                    {item.company_name}
                  </h4>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.role_title}
                  </p>
                </div>
                <Badge variant="purple" className="text-[10px] uppercase font-medium">
                  {item.suggested_stage}
                </Badge>
              </div>

              {item.subject && (
                <p className="text-[11px] text-muted-foreground/90 truncate italic">
                  "{item.subject}"
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-violet-500/20">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDismiss(item.log_id)}
                className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Ignore
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept(item.log_id)}
                className="h-6 text-[11px] font-medium bg-foreground text-background hover:bg-zinc-200 gap-1"
              >
                <Check className="w-3 h-3" />
                Track Application
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
