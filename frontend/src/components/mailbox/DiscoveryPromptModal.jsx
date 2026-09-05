import React from "react"
import { Sparkles, Check, X, Building2, Briefcase, Mail } from "lucide-react"
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

export function DiscoveryPromptModal({
  isOpen,
  onClose,
  discoveries,
  onAccept,
  onDismiss,
}) {
  if (!discoveries || discoveries.length === 0) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border/80 p-6 space-y-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-400" />
            New Applications Discovered
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            We detected correspondence from companies not yet on your board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {discoveries.map((item) => (
            <div
              key={item.log_id}
              className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-2 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    {item.company_name}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {item.role_title}
                  </p>
                </div>
                <Badge variant="purple" className="text-[10px] uppercase font-medium">
                  {item.suggested_stage}
                </Badge>
              </div>

              {item.subject && (
                <p className="text-[11px] text-muted-foreground/80 truncate italic">
                  "{item.subject}"
                </p>
              )}

              {item.summary_sentence && (
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {item.summary_sentence}
                </p>
              )}

              <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-border/40 text-xs">
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

        <DialogFooter className="pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
