import React, { useState, useEffect } from "react"
import { 
  Building2, 
  MapPin, 
  DollarSign, 
  Calendar, 
  Lock, 
  Unlock, 
  History, 
  RotateCcw, 
  Mail, 
  Check, 
  ExternalLink,
  Save,
  Link,
  FileText
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function TimelineSheet({
  application,
  isOpen,
  onClose,
  onStageChange,
  onToggleLock,
  onRevertStage,
  onUpdateDetails,
}) {
  const [selectedStage, setSelectedStage] = useState("")
  const [userNote, setUserNote] = useState("")
  const [nextStep, setNextStep] = useState("")
  const [interviewLink, setInterviewLink] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (application) {
      setSelectedStage(application.current_stage)
      setNextStep(application.next_step || "")
      setInterviewLink(application.interview_link || "")
      setUserNote(application.manual_notes || "")
    }
  }, [application])

  if (!application) return null

  const handleManualSave = async () => {
    setIsSaving(true)
    try {
      if (selectedStage !== application.current_stage || userNote) {
        await onStageChange(application.id, selectedStage, userNote, nextStep, interviewLink)
      } else {
        await onUpdateDetails(application.id, {
          next_step: nextStep,
          interview_link: interviewLink,
          manual_notes: userNote,
        })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const getSourceDisplay = (source) => {
    switch (source) {
      case "mailbox_auto":
        return { label: "Gmail", icon: Mail, color: "text-violet-400" }
      case "manual_user_override":
        return { label: "Manual", icon: null, color: "text-zinc-400" }
      case "undo_action":
        return { label: "Revert", icon: RotateCcw, color: "text-amber-400" }
      default:
        return { label: "Ingestion", icon: null, color: "text-zinc-400" }
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-card border-border/80 p-6 space-y-6">
        {/* Header */}
        <SheetHeader className="space-y-3 pb-4 border-b border-border/40">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-semibold text-foreground">
                  {application.company_name}
                </SheetTitle>
                {application.company_domain && (
                  <a 
                    href={`https://${application.company_domain}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <SheetDescription className="text-xs text-muted-foreground">
                {application.role_title}
              </SheetDescription>
            </div>

            {/* Lock Toggle Button */}
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-xs gap-1.5 border-border/60 ${
                application.stage_locked ? "text-amber-400 border-amber-500/30" : "text-muted-foreground"
              }`}
              onClick={() => onToggleLock(application.id)}
            >
              {application.stage_locked ? (
                <>
                  <Lock className="w-3 h-3" /> Locked
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" /> Unlocked
                </>
              )}
            </Button>
          </div>

          {/* Quick Meta Items */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/80 pt-1">
            {application.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 opacity-60" />
                {application.location}
              </span>
            )}
            {application.salary_range && (
              <span className="flex items-center gap-1 text-emerald-400/90 font-medium">
                <DollarSign className="w-3 h-3 opacity-70" />
                {application.salary_range}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 opacity-60" />
              Added {new Date(application.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        </SheetHeader>

        {/* Edit Properties Section */}
        <div className="space-y-3.5 rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Application Details</span>
            <span className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
              Stage: {application.current_stage}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Lifecycle Stage</label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="h-8 bg-card border-border/60 text-xs">
                  <SelectValue placeholder="Select Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="screening">Screening / OA</SelectItem>
                  <SelectItem value="interviewing">Interviewing</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Next Step</label>
              <input
                type="text"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="e.g. Technical Round 2"
                className="flex h-8 w-full rounded-md border border-border/60 bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Interview / Meeting URL</label>
            <div className="relative">
              <Link className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
              <input
                type="text"
                value={interviewLink}
                onChange={(e) => setInterviewLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="flex h-8 w-full rounded-md border border-border/60 bg-card pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Notes / Context</label>
            <textarea
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="Add interview feedback, recruiter contact info, or next actions..."
              rows={2}
              className="flex w-full rounded-md border border-border/60 bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button 
              size="sm" 
              onClick={handleManualSave} 
              disabled={isSaving}
              className="h-7 text-xs font-medium gap-1.5 bg-foreground text-background hover:bg-zinc-200"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Change History Timeline */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              Activity & Status History
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {application.status_events?.length || 0} events
            </span>
          </div>

          <div className="relative pl-5 space-y-3.5 border-l border-border/60 ml-2 pt-1">
            {application.status_events && application.status_events.length > 0 ? (
              application.status_events.map((event, idx) => {
                const source = getSourceDisplay(event.trigger_source)
                const EventSourceIcon = source.icon
                return (
                  <div key={event.id} className="relative group">
                    {/* Timeline bullet dot */}
                    <div className="absolute -left-[25px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-background border border-border/80">
                      <div className="h-1 w-1 rounded-full bg-primary" />
                    </div>

                    <div className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-1.5 hover:border-border/80 transition-colors text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground uppercase text-[11px] tracking-tight">
                            {event.to_stage}
                          </span>
                          <span className={`text-[10px] flex items-center gap-1 ${source.color}`}>
                            {EventSourceIcon && <EventSourceIcon className="w-2.5 h-2.5" />}
                            {source.label}
                          </span>
                        </div>

                        {/* Revert Button (if not the latest event) */}
                        {idx > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-amber-400 hover:bg-amber-950/20"
                            onClick={() => onRevertStage(application.id, event.id)}
                          >
                            <RotateCcw className="w-2.5 h-2.5" /> Revert
                          </Button>
                        )}
                      </div>

                      <p className="text-xs text-foreground/80 font-normal">
                        {event.change_summary}
                      </p>

                      {event.user_note && (
                        <p className="text-[11px] text-muted-foreground bg-muted/30 p-1.5 rounded border border-border/30">
                          {event.user_note}
                        </p>
                      )}

                      {/* Email Evidence Snippet */}
                      {event.email_subject && (
                        <div className="rounded border border-violet-500/20 bg-violet-950/10 p-2 space-y-0.5 text-xs">
                          <p className="text-[11px] text-violet-400 font-medium truncate">
                            {event.email_subject}
                          </p>
                          {event.email_snippet && (
                            <p className="text-[10px] text-muted-foreground/80 line-clamp-2 italic">
                              "{event.email_snippet}"
                            </p>
                          )}
                        </div>
                      )}

                      <div className="text-[10px] text-muted-foreground/60 pt-0.5">
                        {new Date(event.changed_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">No events recorded.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
