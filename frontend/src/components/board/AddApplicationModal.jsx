import React, { useState } from "react"
import { Building2, Plus, X } from "lucide-react"

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

  if (!isOpen) return null

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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.8)] backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-[#131926] border border-[#253048] rounded-2xl w-full max-w-lg p-6 text-[#e8e4dc] shadow-2xl animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-4 border-b border-[#253048] mb-4">
          <div>
            <h2 className="text-xl font-bold font-serif text-[#e8e4dc]">New Application</h2>
            <p className="text-xs text-[#8a94a8] mt-1">
              Track a new job opportunity and automatically capture email updates.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#253048] text-[#556178] hover:text-[#e8e4dc] hover:bg-[#1a2235] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Company Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. OpenAI, Stripe"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Role Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Software Engineer"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Company Domain</label>
              <input
                type="text"
                placeholder="e.g. stripe.com"
                value={companyDomain}
                onChange={(e) => setCompanyDomain(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Initial Stage</label>
              <select
                value={currentStage}
                onChange={(e) => setCurrentStage(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] focus:outline-none focus:border-[#d4a853]"
              >
                <option value="applied">Applied</option>
                <option value="screening">Screening</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Location</label>
              <input
                type="text"
                placeholder="e.g. Remote / San Francisco, CA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono text-[#556178]">Salary Range</label>
              <input
                type="text"
                placeholder="e.g. $160,000 - $190,000"
                value={salaryRange}
                onChange={(e) => setSalaryRange(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono text-[#556178]">Next Step / Deadline</label>
            <input
              type="text"
              placeholder="e.g. Complete HackerRank OA by Friday"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-[#253048] bg-[#0c1019] px-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono text-[#556178]">Personal Notes</label>
            <textarea
              placeholder="Notes about recruiter conversations, links, or prep..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="flex w-full rounded-lg border border-[#253048] bg-[#0c1019] p-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#253048]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc] hover:bg-[#1a2235] font-mono text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !companyName.trim() || !roleTitle.trim()}
              className="px-5 py-2 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
