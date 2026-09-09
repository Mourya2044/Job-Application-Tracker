import React from "react"
import { Draggable } from "@hello-pangea/dnd"
import { 
  MapPin, 
  Lock, 
  Unlock, 
  MoreHorizontal, 
  Sparkles, 
  Trash2, 
  Mail,
  Check,
  X
} from "lucide-react"
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
  stageColor = "var(--accent)",
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

  const getCompanyInitial = (name) => {
    return name ? name.trim().charAt(0).toUpperCase() : "A"
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return "Recently"
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }

  const isAutoTracked = application.last_status_change_source === "mailbox_auto"

  return (
    <Draggable draggableId={application.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="outline-none select-none"
        >
          <div 
            onClick={() => onOpenDetails(application)}
            className={`group relative bg-[#0c1019] border border-[#253048] hover:border-[#212d45] rounded-lg p-3.5 text-left transition-all duration-200 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lg ${
              snapshot.isDragging 
                ? "border-[#d4a853] bg-[#131926] shadow-2xl ring-1 ring-[#d4a853]/40 rotate-1 scale-[1.02]" 
                : ""
            } ${pendingSuggestion ? "border-[#fbbf24]/50 bg-[#131926]" : ""}`}
          >
            {/* Left colored status indicator bar */}
            <div 
              className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-sm"
              style={{ backgroundColor: stageColor }}
            />

            {/* Top row: Logo, Company & Menu */}
            <div className="flex items-center justify-between gap-2.5 mb-2 pl-1">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div 
                  className="w-7 h-7 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0"
                  style={{ 
                    backgroundColor: `${stageColor}20`, 
                    color: stageColor 
                  }}
                >
                  {getCompanyInitial(application.company_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-semibold text-xs text-[#e8e4dc] truncate tracking-tight">
                      {application.company_name}
                    </h4>
                    {isLocked && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex text-[#fbbf24] shrink-0">
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-[10px]">Locked — auto-sync won't change stage</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Menu */}
              <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-6 w-6 rounded flex items-center justify-center text-[#556178] hover:text-[#e8e4dc] hover:bg-[#1a2235] transition-colors">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 text-xs bg-[#131926] border-[#253048] text-[#e8e4dc]">
                    <DropdownMenuLabel className="text-[10px] text-[#556178] uppercase font-mono">Move Stage</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "applied")} className="hover:bg-[#1a2235]">
                      Applied
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "screening")} className="hover:bg-[#1a2235]">
                      Screening
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "interview")} className="hover:bg-[#1a2235]">
                      Interview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "offer")} className="hover:bg-[#1a2235]">
                      Offer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(application.id, "rejected")} className="hover:bg-[#1a2235]">
                      Rejected
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[#253048]" />
                    <DropdownMenuItem onClick={() => onToggleLock(application.id)} className="hover:bg-[#1a2235]">
                      {isLocked ? (
                        <>
                          <Unlock className="w-3 h-3 mr-2 text-[#4ade80]" />
                          Unlock Stage
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 mr-2 text-[#fbbf24]" />
                          Lock Stage
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[#253048]" />
                    <DropdownMenuItem 
                      onClick={() => onDelete(application.id)}
                      className="text-[#fb7185] hover:bg-[rgba(251,113,133,0.1)] focus:text-[#fb7185]"
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Position Title */}
            <div className="text-xs text-[#8a94a8] mb-2.5 truncate pl-1">
              {application.role_title}
            </div>

            {/* Tags line */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5 pl-1">
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#1a2235] text-[#8a94a8] border border-[#253048]">
                {isAutoTracked ? "Auto-tracked" : "Manual"}
              </span>
              {application.next_step && (
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(167,139,250,0.1)] text-[#a78bfa] border border-[rgba(167,139,250,0.2)] truncate max-w-[140px]">
                  {application.next_step}
                </span>
              )}
            </div>

            {/* Proposed Stage Suggestion (When stage locked) */}
            {pendingSuggestion && (
              <div 
                onClick={(e) => e.stopPropagation()}
                className="mb-2.5 p-2 rounded-md bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.25)] flex items-center justify-between gap-1.5"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="w-3 h-3 text-[#fbbf24] shrink-0" />
                  <span className="text-[10px] text-[#fbbf24] truncate">
                    Suggested: <strong>{pendingSuggestion.proposed_stage}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={() => onAcceptSuggestion && onAcceptSuggestion(application.id)}
                    className="p-1 rounded bg-[#4ade80]/20 text-[#4ade80] hover:bg-[#4ade80]/30"
                    title="Accept update"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => onDismissSuggestion && onDismissSuggestion(application.id)}
                    className="p-1 rounded bg-[#fb7185]/20 text-[#fb7185] hover:bg-[#fb7185]/30"
                    title="Dismiss update"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Bottom: Location & Date */}
            <div className="flex items-center justify-between font-mono text-[10px] text-[#556178] pt-2 border-t border-[#253048] pl-1">
              <span className="flex items-center gap-1 truncate max-w-[140px]">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{application.location || "Remote"}</span>
              </span>
              <span className="shrink-0">
                {formatDate(application.last_status_change_at || application.created_at)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Draggable>
  )
}
