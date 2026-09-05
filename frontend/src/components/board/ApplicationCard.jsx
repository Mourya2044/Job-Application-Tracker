import React from "react"
import { Draggable } from "@hello-pangea/dnd"
import { 
  Building2, 
  MapPin, 
  DollarSign, 
  Clock, 
  Lock, 
  Unlock, 
  MoreHorizontal, 
  Sparkles, 
  History, 
  Trash2, 
  Mail,
  Check,
  X
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function ApplicationCard({ 
  application, 
  index, 
  onOpenDetails, 
  onStageChange, 
  onToggleLock, 
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion
}) {
  const isLocked = application.stage_locked
  const pendingSuggestion = application.pending_suggestion 
    ? (typeof application.pending_suggestion === 'string' ? JSON.parse(application.pending_suggestion) : application.pending_suggestion)
    : null

  const getSourceDisplay = (source) => {
    switch (source) {
      case "mailbox_auto":
        return { label: "Gmail", icon: Mail, color: "text-violet-400" }
      case "manual_user_override":
        return { label: "Manual", icon: null, color: "text-zinc-400" }
      case "undo_action":
        return { label: "Reverted", icon: null, color: "text-amber-400" }
      default:
        return { label: "Tracked", icon: null, color: "text-zinc-400" }
    }
  }

  const sourceInfo = getSourceDisplay(application.last_status_change_source)
  const SourceIcon = sourceInfo.icon

  const formatDate = (dateStr) => {
    if (!dateStr) return ""
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }

  return (
    <Draggable draggableId={application.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="mb-2.5 outline-none select-none"
        >
          <div 
            className={`group relative rounded-lg border bg-card/90 p-3 text-left transition-all duration-150 cursor-grab active:cursor-grabbing ${
              snapshot.isDragging 
                ? "border-primary/80 bg-card shadow-xl ring-1 ring-primary/40 rotate-1 scale-[1.02]" 
                : "border-border/60 hover:border-zinc-700 hover:bg-zinc-900/90 shadow-sm"
            } ${pendingSuggestion ? "border-amber-500/40 bg-amber-950/10" : ""}`}
            onClick={() => onOpenDetails(application)}
          >
            {/* Header: Company Name, Role & Options */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-xs text-foreground truncate tracking-tight">
                    {application.company_name}
                  </h3>
                  {isLocked && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex text-amber-400/90 shrink-0">
                            <Lock className="w-3 h-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-[11px]">Locked — auto-sync will not override status</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {application.role_title}
                </p>
              </div>

              {/* Discreet Action Menu */}
              <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="iconSm" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 text-xs">
                    <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase font-semibold">Move Stage</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "screening")}>
                      Screening / OA
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "interviewing")}>
                      Interviewing
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "offer")}>
                      Offer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "rejected")}>
                      Rejected
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggleLock(application.id)}>
                      {isLocked ? (
                        <span className="flex items-center gap-1.5 text-amber-400"><Unlock className="w-3.5 h-3.5" /> Unlock</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Lock Status</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onOpenDetails(application)}>
                      <History className="w-3.5 h-3.5 mr-1.5" /> View Timeline
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onDelete(application.id)} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Location / Salary Metadata (Minimal Inline) */}
            {(application.location || application.salary_range) && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80 mb-2">
                {application.location && (
                  <span className="flex items-center gap-0.5 truncate max-w-[140px]">
                    <MapPin className="w-2.5 h-2.5 opacity-60 shrink-0" />
                    {application.location}
                  </span>
                )}
                {application.salary_range && (
                  <span className="flex items-center gap-0.5 text-emerald-400/90 font-medium">
                    <DollarSign className="w-2.5 h-2.5 opacity-70 shrink-0" />
                    {application.salary_range}
                  </span>
                )}
              </div>
            )}

            {/* Next Step / Deadline Callout */}
            {application.next_step && (
              <div className="mb-2 rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11px] flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3 h-3 text-primary/80 shrink-0" />
                <span className="truncate text-foreground/90 font-medium">{application.next_step}</span>
                {application.next_step_deadline && (
                  <span className="text-[10px] text-muted-foreground/70 shrink-0 ml-auto">
                    {formatDate(application.next_step_deadline)}
                  </span>
                )}
              </div>
            )}

            {/* Pending Email Status Change Suggestion (Clean & Compact) */}
            {pendingSuggestion && (
              <div 
                className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 space-y-1.5 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-[11px] text-amber-400 font-medium">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Move to {pendingSuggestion.suggested_stage?.toUpperCase()}?
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onAcceptSuggestion(application.id, pendingSuggestion.suggested_stage)}
                      className="p-1 rounded hover:bg-amber-500/20 text-amber-300"
                      title="Apply change"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDismissSuggestion(application.id)}
                      className="p-1 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-zinc-300"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {pendingSuggestion.reason && (
                  <p className="text-[10px] text-amber-200/70 leading-snug line-clamp-2">
                    {pendingSuggestion.reason}
                  </p>
                )}
              </div>
            )}

            {/* Card Footer: Source & Date */}
            <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 font-medium">
              <span className={`flex items-center gap-1 ${sourceInfo.color}`}>
                {SourceIcon && <SourceIcon className="w-2.5 h-2.5" />}
                {sourceInfo.label}
              </span>
              <span>{formatDate(application.last_status_change_at)}</span>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
