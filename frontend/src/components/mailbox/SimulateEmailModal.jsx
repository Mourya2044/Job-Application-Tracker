import React, { useState, useEffect } from "react"
import { 
  Sparkles, 
  Send, 
  Calendar, 
  FileCode2, 
  Gift, 
  XCircle,
  Building2,
  UserCheck,
  Compass
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

const EVENT_TEMPLATES = [
  {
    type: "interview",
    label: "Interview Invite",
    icon: Calendar,
    generate: (company, role) => ({
      subject: `Interview Invitation: ${company} Technical Round for ${role}`,
      sender: `recruiting@${company.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
      body: `Hi,\n\nWe were very impressed by your background and would like to invite you to a 45-minute technical interview for the ${role} position at ${company}.\n\nPlease schedule your conversation using this link: https://meet.google.com/${company.toLowerCase().replace(/[^a-z0-9]/g, "")}-interview\n\nBest regards,\n${company} Talent Acquisition Team`,
    }),
  },
  {
    type: "assessment",
    label: "Online Assessment",
    icon: FileCode2,
    generate: (company, role) => ({
      subject: `${company} Application: Next Steps - HackerRank Online Assessment`,
      sender: `talent-eval@hackerrank.net`,
      body: `Thank you for your application for the ${role} position at ${company}.\n\nPlease complete the timed coding assessment within 5 business days.\n\nLink: https://hackerrank.net/tests/${company.toLowerCase().replace(/[^a-z0-9]/g, "")}-oa\n\nGood luck,\n${company} Recruiting`,
    }),
  },
  {
    type: "offer",
    label: "Offer Letter",
    icon: Gift,
    generate: (company, role) => ({
      subject: `Congratulations! Offer of Employment at ${company}`,
      sender: `offers@${company.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
      body: `Dear Candidate,\n\nWe are thrilled to extend an offer for the ${role} position at ${company}!\n\nPlease review your formal offer letter and compensation package details attached.\n\nWelcome to ${company}!`,
    }),
  },
  {
    type: "rejection",
    label: "Rejection",
    icon: XCircle,
    generate: (company, role) => ({
      subject: `Update on your application for ${role} at ${company}`,
      sender: `careers@${company.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`,
      body: `Thank you for taking the time to speak with us regarding the ${role} position at ${company}.\n\nAlthough we were impressed with your qualifications, we have decided to move forward with other candidates.\n\nWe wish you the best in your search.\n\n${company} Recruiting`,
    }),
  },
]

export function SimulateEmailModal({ 
  isOpen, 
  onClose, 
  onSimulate,
  trackedApplications = [] 
}) {
  const [targetType, setTargetType] = useState("tracked") // "tracked" | "untracked"
  const [selectedAppId, setSelectedAppId] = useState("")
  const [customCompany, setCustomCompany] = useState("OpenAI")
  const [customRole, setCustomRole] = useState("Software Engineer")
  const [selectedEventType, setSelectedEventType] = useState("interview")

  const [subject, setSubject] = useState("")
  const [sender, setSender] = useState("")
  const [body, setBody] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Initialize tracked selection
  useEffect(() => {
    if (trackedApplications.length > 0 && !selectedAppId) {
      setSelectedAppId(trackedApplications[0].id)
    } else if (trackedApplications.length === 0) {
      setTargetType("untracked")
    }
  }, [trackedApplications, isOpen])

  // Update email text when selection changes
  useEffect(() => {
    let comp = "Company"
    let rol = "Software Engineer"

    if (targetType === "tracked") {
      const app = trackedApplications.find((a) => a.id === selectedAppId) || trackedApplications[0]
      if (app) {
        comp = app.company_name
        rol = app.role_title
      }
    } else if (targetType === "untracked") {
      comp = customCompany || "New Company"
      rol = customRole || "Software Engineer"
    }

    const template = EVENT_TEMPLATES.find((t) => t.type === selectedEventType) || EVENT_TEMPLATES[0]
    const generated = template.generate(comp, rol)
    setSubject(generated.subject)
    setSender(generated.sender)
    setBody(generated.body)
  }, [targetType, selectedAppId, customCompany, customRole, selectedEventType, isOpen])

  const handleSubmit = async () => {
    setIsSending(true)
    try {
      await onSimulate({ subject, sender, body })
      onClose()
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-card border-border/80 p-6 space-y-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-400" />
            Simulate Email Event
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Test how incoming emails trigger automatic stage updates or discovery prompts.
          </DialogDescription>
        </DialogHeader>

        {/* Segmented Control for Tracked vs New */}
        <div className="flex bg-muted/40 p-0.5 rounded-lg border border-border/60 text-xs">
          <button
            type="button"
            onClick={() => setTargetType("tracked")}
            disabled={trackedApplications.length === 0}
            className={`flex-1 py-1.5 text-center rounded-md font-medium transition-all ${
              targetType === "tracked"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tracked Application
          </button>
          <button
            type="button"
            onClick={() => setTargetType("untracked")}
            className={`flex-1 py-1.5 text-center rounded-md font-medium transition-all ${
              targetType === "untracked"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            New / Untracked Company
          </button>
        </div>

        {/* Selected Target Configuration */}
        {targetType === "tracked" && trackedApplications.length > 0 && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Select Target</label>
            <select
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:border-zinc-500"
            >
              {trackedApplications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.company_name} — {app.role_title} ({app.current_stage})
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === "untracked" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Company Name</label>
              <input
                type="text"
                value={customCompany}
                onChange={(e) => setCustomCompany(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Role Title</label>
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        )}

        {/* Event Scenario Chips */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Scenario Template</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {EVENT_TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon
              const isSelected = selectedEventType === tmpl.type
              return (
                <button
                  key={tmpl.type}
                  type="button"
                  onClick={() => setSelectedEventType(tmpl.type)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-medium transition-all ${
                    isSelected
                      ? "border-primary/80 bg-primary/10 text-primary"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="truncate">{tmpl.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Preview Fields */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Sender</label>
              <input
                type="text"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-foreground focus:outline-none focus:border-zinc-500 resize-none font-mono text-[11px]"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={isSending || (!selectedAppId && targetType === "tracked" && trackedApplications.length > 0)}
            className="text-xs font-medium gap-1.5 bg-foreground text-background hover:bg-zinc-200"
          >
            <Send className="w-3 h-3" />
            {isSending ? "Simulating..." : "Send Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
