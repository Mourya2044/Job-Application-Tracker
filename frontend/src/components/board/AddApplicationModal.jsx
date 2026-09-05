import React, { useState } from "react"
import { Building2, Briefcase, Globe, MapPin, DollarSign, Calendar, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AddApplicationModal({ isOpen, onClose, onAddApplication }) {
  const [companyName, setCompanyName] = useState("")
  const [roleTitle, setRoleTitle] = useState("")
  const [companyDomain, setCompanyDomain] = useState("")
  const [location, setLocation] = useState("")
  const [salaryRange, setSalaryRange] = useState("")
  const [currentStage, setCurrentStage] = useState("applied")
  const [nextStep, setNextStep] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!companyName.trim() || !roleTitle.trim()) return

    setIsSubmitting(true)
    try {
      await onAddApplication({
        company_name: companyName.trim(),
        role_title: roleTitle.trim(),
        company_domain: companyDomain.trim() || undefined,
        location: location.trim() || undefined,
        salary_range: salaryRange.trim() || undefined,
        current_stage: currentStage,
        next_step: nextStep.trim() || undefined,
        manual_notes: notes.trim() || undefined,
      })
      // Reset form
      setCompanyName("")
      setRoleTitle("")
      setCompanyDomain("")
      setLocation("")
      setSalaryRange("")
      setCurrentStage("applied")
      setNextStep("")
      setNotes("")
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border/80 p-6 space-y-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground">New Application</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Track a new job opportunity and automatically capture email updates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-foreground">Company Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. OpenAI, Stripe"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-foreground">Role Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Software Engineer"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Company Domain</label>
              <input
                type="text"
                placeholder="e.g. stripe.com"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Initial Stage</label>
              <Select value={currentStage} onValueChange={setCurrentStage}>
                <SelectTrigger className="h-8 bg-muted/30 border-border/60 text-xs">
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Location</label>
              <input
                type="text"
                placeholder="e.g. Remote, SF"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Salary (Optional)</label>
              <input
                type="text"
                placeholder="e.g. $160k - $190k"
                value={salaryRange}
                onChange={(e) => setSalaryRange(e.target.value)}
                className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Next Step / Note</label>
            <input
              type="text"
              placeholder="e.g. Recruiter phone screen next Tuesday"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="flex h-8 w-full rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !companyName.trim() || !roleTitle.trim()}
              className="text-xs font-medium bg-foreground text-background hover:bg-zinc-200"
            >
              {isSubmitting ? "Adding..." : "Add Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
