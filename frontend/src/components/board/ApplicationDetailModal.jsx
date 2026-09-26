import React, { useState, useEffect } from "react"
import { 
  X, 
  Check, 
  Lock, 
  Unlock, 
  RotateCcw, 
  Trash2, 
  ExternalLink,
  MapPin,
  DollarSign,
  Calendar,
  Globe,
  Sparkles,
  Copy,
  CheckCheck,
  RefreshCw,
  Send,
  FileText,
  Cpu
} from "lucide-react"
import { toast } from "sonner"
import { fetchApi } from "@/config/api"

export function ApplicationDetailModal({ 
  application, 
  isOpen, 
  onClose, 
  onStageChange, 
  onToggleLock, 
  onRevertStage, 
  onUpdateDetails,
  onDelete
}) {
  const [activeTab, setActiveTab] = useState("details") // "details" | "copilot"
  const [selectedStage, setSelectedStage] = useState(application?.current_stage || "applied")
  const [userNote, setUserNote] = useState("")
  const [manualNotes, setManualNotes] = useState(application?.manual_notes || "")
  const [nextStep, setNextStep] = useState(application?.next_step || "")

  // AI Copilot state
  const [resumeText, setResumeText] = useState(() => {
    return localStorage.getItem("job_tracker_user_resume") || 
      "Full-stack software engineer with experience in Python, FastAPI, React, PostgreSQL, Docker, AWS, and system design."
  })
  const [isAnalyzingFit, setIsAnalyzingFit] = useState(false)
  const [fitResult, setFitResult] = useState(null)
  
  const [coverTone, setCoverTone] = useState("Professional")
  const [isGeneratingCover, setIsGeneratingCover] = useState(false)
  const [coverResult, setCoverResult] = useState(null)
  const [copiedLetter, setCopiedLetter] = useState(false)
  const [copiedOutreach, setCopiedOutreach] = useState(false)

  useEffect(() => {
    if (application) {
      setSelectedStage(application.current_stage || "applied")
      setManualNotes(application.manual_notes || "")
      setNextStep(application.next_step || "")
      setUserNote("")
      setFitResult(null)
      setCoverResult(null)
    }
  }, [application])

  if (!isOpen || !application) return null

  const handleResumeChange = (e) => {
    const val = e.target.value
    setResumeText(val)
    localStorage.setItem("job_tracker_user_resume", val)
  }

  const handleAnalyzeFit = async () => {
    if (!resumeText.trim()) {
      toast.error("Please provide your resume summary or skills.")
      return
    }

    setIsAnalyzingFit(true)
    try {
      const data = await fetchApi("/api/ai/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText.trim(),
          job_description: manualNotes || application.role_title,
          job_title: application.role_title,
          company: application.company_name,
        }),
      })
      setFitResult(data)
      toast.success("Job fit analysis complete!")
    } catch (err) {
      toast.error(err.message || "Failed to analyze job fit")
    } finally {
      setIsAnalyzingFit(false)
    }
  }

  const handleGenerateCover = async () => {
    if (!resumeText.trim()) {
      toast.error("Please provide your resume summary or skills.")
      return
    }

    setIsGeneratingCover(true)
    try {
      const data = await fetchApi("/api/ai/generate-cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText.trim(),
          job_title: application.role_title,
          company: application.company_name,
          job_description: manualNotes || "",
          tone: coverTone.toLowerCase(),
        }),
      })
      setCoverResult(data)
      toast.success("Cover letter and outreach note generated!")
    } catch (err) {
      toast.error(err.message || "Failed to generate cover letter")
    } finally {
      setIsGeneratingCover(false)
    }
  }

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    if (type === "letter") {
      setCopiedLetter(true)
      setTimeout(() => setCopiedLetter(false), 2000)
      toast.success("Cover letter copied to clipboard!")
    } else {
      setCopiedOutreach(true)
      setTimeout(() => setCopiedOutreach(false), 2000)
      toast.success("LinkedIn message copied to clipboard!")
    }
  }

  const getCompanyInitial = (name) => {
    return name ? name.trim().charAt(0).toUpperCase() : "A"
  }

  const stages = [
    { key: "applied", label: "Applied", color: "#60a5fa", bg: "rgba(96, 165, 250, 0.1)" },
    { key: "screening", label: "Screening", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)" },
    { key: "interviewing", label: "Interview", color: "#a78bfa", bg: "rgba(167, 139, 250, 0.1)" },
    { key: "offer", label: "Offer", color: "#4ade80", bg: "rgba(74, 222, 128, 0.1)" },
    { key: "rejected", label: "Rejected", color: "#fb7185", bg: "rgba(251, 113, 133, 0.1)" },
  ]

  const isStageChanged = selectedStage !== application.current_stage
  const isNotesChanged = manualNotes !== (application.manual_notes || "") || nextStep !== (application.next_step || "")
  const canSave = isStageChanged || isNotesChanged || userNote.trim().length > 0

  const handleSave = async () => {
    if (isStageChanged) {
      await onStageChange(application.id, selectedStage, userNote || manualNotes, nextStep)
    }
    if (isNotesChanged && !isStageChanged) {
      await onUpdateDetails(application.id, {
        manual_notes: manualNotes,
        next_step: nextStep
      })
    }
    onClose()
  }

  const appliedDateStr = application.applied_date || application.created_at
  const formattedAppliedDate = appliedDateStr
    ? new Date(appliedDateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Recently"

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.8)] backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-[#131926] border border-[#253048] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fadeUp overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-[#253048]">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[rgba(212,168,53,0.12)] border border-[rgba(212,168,53,0.25)] text-[#d4a853] flex items-center justify-center font-mono font-bold text-lg shrink-0">
              {getCompanyInitial(application.company_name)}
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-2xl font-bold text-[#e8e4dc] truncate">
                {application.company_name}
              </h2>
              <div className="text-sm text-[#8a94a8] truncate mt-0.5">
                {application.role_title}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleLock(application.id)}
              className={`p-2 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 ${
                application.stage_locked
                  ? "bg-[rgba(251,191,36,0.12)] border-[#fbbf24] text-[#fbbf24]"
                  : "border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc]"
              }`}
              title={application.stage_locked ? "Status locked" : "Click to lock status"}
            >
              {application.stage_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{application.stage_locked ? "Locked" : "Lock"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-[#253048] text-[#8a94a8] hover:text-[#e8e4dc] hover:border-[#556178] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigator */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#253048] bg-[#0c1019]/60">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`font-mono text-xs px-4 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "details"
                ? "border-[#d4a853] text-[#d4a853]"
                : "border-transparent text-[#8a94a8] hover:text-[#e8e4dc]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Application Details</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab("copilot")}
            className={`font-mono text-xs px-4 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "copilot"
                ? "border-[#d4a853] text-[#d4a853]"
                : "border-transparent text-[#8a94a8] hover:text-[#e8e4dc]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#d4a853]" />
            <span>AI Copilot & Advisor</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[rgba(212,168,53,0.15)] text-[#d4a853] font-bold">
              GPU
            </span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "details" ? (
            <>
              {/* Section: Change Status */}
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[#556178] mb-3">
                  Change Status
                </div>
                <div className="flex flex-wrap gap-2">
                  {stages.map((st) => {
                    const isSelected = selectedStage === st.key || (st.key === "interviewing" && selectedStage === "interview")
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setSelectedStage(st.key)}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border font-mono text-xs transition-all ${
                          isSelected
                            ? "border-current font-semibold shadow-sm"
                            : "border-[#253048] text-[#8a94a8] hover:border-[#556178] hover:text-[#e8e4dc]"
                        }`}
                        style={isSelected ? { color: st.color, backgroundColor: st.bg, borderColor: st.color } : {}}
                      >
                        <span 
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: st.color }}
                        />
                        <span>{st.label}</span>
                        {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                      </button>
                    )
                  })}
                </div>

                {isStageChanged && (
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Optional note for this status transition..."
                      value={userNote}
                      onChange={(e) => setUserNote(e.target.value)}
                      className="w-full bg-[#0c1019] border border-[#253048] rounded-lg px-3.5 py-2 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-sans"
                    />
                  </div>
                )}
              </div>

              {/* Section: Details Grid */}
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[#556178] mb-3">
                  Details
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#0c1019] border border-[#253048] rounded-xl p-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase text-[#556178] mb-1">
                      Location
                    </div>
                    <div className="text-xs text-[#e8e4dc] flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-[#d4a853]" />
                      <span>{application.location || "Remote / Not specified"}</span>
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-[10px] uppercase text-[#556178] mb-1">
                      Applied Date
                    </div>
                    <div className="text-xs text-[#e8e4dc] flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-[#d4a853]" />
                      <span>{formattedAppliedDate}</span>
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-[10px] uppercase text-[#556178] mb-1">
                      Salary Range
                    </div>
                    <div className="text-xs text-[#e8e4dc] flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3 text-[#4ade80]" />
                      <span>{application.salary_range || "Competitive / Not listed"}</span>
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-[10px] uppercase text-[#556178] mb-1">
                      Job URL & Link
                    </div>
                    <div className="text-xs text-[#e8e4dc]">
                      {application.job_url ? (
                        <a
                          href={application.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#60a5fa] hover:underline flex items-center gap-1 truncate"
                        >
                          <Globe className="w-3 h-3 shrink-0" />
                          <span className="truncate">View Posting</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-[#556178]">No URL provided</span>
                      )}
                    </div>
                  </div>

                  {application.interview_link && (
                    <div className="sm:col-span-2 pt-2 border-t border-[#253048]">
                      <div className="font-mono text-[10px] uppercase text-[#556178] mb-1">
                        Meeting Link
                      </div>
                      <a
                        href={application.interview_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#a78bfa] hover:underline flex items-center gap-1 text-xs truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{application.interview_link}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Section: Next Step */}
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[#556178] mb-2">
                  Next Step & Action Item
                </div>
                <input
                  type="text"
                  placeholder="e.g. Technical screen with engineering manager..."
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  className="w-full bg-[#0c1019] border border-[#253048] rounded-lg px-3.5 py-2.5 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              {/* Section: History Timeline */}
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[#556178] mb-3">
                  History & Audit Trail
                </div>

                {(!application.status_events || application.status_events.length === 0) ? (
                  <div className="text-xs font-mono text-[#556178] py-4 pl-2">
                    No previous history events recorded.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#253048]">
                    {application.status_events.map((evt, idx) => (
                      <div key={evt.id || idx} className="relative">
                        <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-[#131926] ${
                          idx === 0 ? "bg-[#d4a853] ring-2 ring-[#d4a853]/30" : "bg-[#253048]"
                        }`} />

                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[#e8e4dc] capitalize">
                              {evt.to_stage}
                            </span>
                            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold bg-[#1a2235] text-[#8a94a8]">
                              {evt.trigger_source === "mailbox_auto" ? "Auto" : "Manual"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-[#556178]">
                              {new Date(evt.changed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                            {idx > 0 && onRevertStage && (
                              <button
                                onClick={() => onRevertStage(application.id, evt.id)}
                                className="text-[10px] font-mono text-[#8a94a8] hover:text-[#fbbf24] flex items-center gap-0.5"
                                title="Revert to this stage"
                              >
                                <RotateCcw className="w-2.5 h-2.5" /> Revert
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-[#8a94a8] italic mt-0.5">
                          {evt.change_summary || evt.user_note || "Status updated"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Notes */}
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-[#556178] mb-2">
                  Personal Notes / Job Requirements
                </div>
                <textarea
                  rows={3}
                  placeholder="Add personal notes, recruiter details, questions for interviewers, or job requirements..."
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full bg-[#0c1019] border border-[#253048] rounded-lg p-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-serif resize-y"
                />
              </div>
            </>
          ) : (
            /* AI Copilot Tab Content */
            <div className="space-y-6">
              {/* ZeroGPU Badge Banner */}
              <div className="bg-[rgba(212,168,53,0.08)] border border-[rgba(212,168,53,0.2)] rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(212,168,53,0.15)] flex items-center justify-center text-[#d4a853]">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#e8e4dc] flex items-center gap-1.5 font-mono">
                      <span>ZeroGPU Intelligence Suite</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#d4a853] text-[#080b12] font-bold">
                        Blackwell RTX Pro
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8a94a8]">
                      On-demand model inference for role fit assessment and customized cover letters.
                    </div>
                  </div>
                </div>
              </div>

              {/* Candidate Resume Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-mono text-xs uppercase tracking-wider text-[#556178]">
                    Candidate Skills & Resume Profile
                  </label>
                  <span className="font-mono text-[10px] text-[#8a94a8]">Saved locally</span>
                </div>
                <textarea
                  rows={3}
                  value={resumeText}
                  onChange={handleResumeChange}
                  placeholder="Paste your resume summary, tech skills, and key projects..."
                  className="w-full bg-[#0c1019] border border-[#253048] rounded-lg p-3 text-xs text-[#e8e4dc] placeholder:text-[#556178] focus:outline-none focus:border-[#d4a853] font-mono resize-y"
                />
              </div>

              {/* 1. Job Fit & Gap Analysis */}
              <div className="bg-[#0c1019] border border-[#253048] rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-serif text-sm font-semibold text-[#e8e4dc] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#d4a853]" />
                    <span>Role Fit & Skill Match</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzeFit}
                    disabled={isAnalyzingFit}
                    className="px-3.5 py-1.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isAnalyzingFit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Analyze Fit</span>
                      </>
                    )}
                  </button>
                </div>

                {fitResult && (
                  <div className="pt-3 border-t border-[#253048] space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#8a94a8]">Match Assessment</span>
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(212,168,53,0.15)] text-[#d4a853] border border-[rgba(212,168,53,0.3)]">
                        {fitResult.fit_level} — {fitResult.match_score}%
                      </span>
                    </div>

                    <p className="text-xs text-[#e8e4dc] leading-relaxed">
                      {fitResult.summary}
                    </p>

                    {fitResult.matching_skills?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-[#4ade80] mb-1.5">
                          Matching Qualifications ({fitResult.matching_skills.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {fitResult.matching_skills.map((s, idx) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(74,222,128,0.1)] text-[#4ade80] border border-[rgba(74,222,128,0.25)]"
                            >
                              ✓ {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {fitResult.missing_skills?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase text-[#fbbf24] mb-1.5">
                          Missing Requirements to Address ({fitResult.missing_skills.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {fitResult.missing_skills.map((s, idx) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(251,191,36,0.1)] text-[#fbbf24] border border-[rgba(251,191,36,0.25)]"
                            >
                              ! {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {fitResult.recommendations?.length > 0 && (
                      <div className="pt-2 border-t border-[#1a2235]">
                        <div className="text-[10px] font-mono uppercase text-[#8a94a8] mb-1.5">
                          Strategic Preparation Advice
                        </div>
                        <ul className="text-xs text-[#8a94a8] space-y-1 list-disc pl-4 font-sans">
                          {fitResult.recommendations.map((rec, idx) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Tailored Cover Letter & Outreach Generator */}
              <div className="bg-[#0c1019] border border-[#253048] rounded-xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-serif text-sm font-semibold text-[#e8e4dc] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#60a5fa]" />
                    <span>Tailored Cover Letter & Outreach</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#131926] p-0.5 rounded-lg border border-[#253048]">
                      {["Professional", "Enthusiastic", "Confident"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCoverTone(t)}
                          className={`font-mono text-[10px] px-2 py-1 rounded transition-colors ${
                            coverTone === t
                              ? "bg-[#253048] text-[#e8e4dc] font-semibold"
                              : "text-[#8a94a8] hover:text-[#e8e4dc]"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateCover}
                      disabled={isGeneratingCover}
                      className="px-3.5 py-1.5 rounded-lg bg-[#60a5fa] hover:bg-[#3b82f6] text-[#080b12] font-mono text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isGeneratingCover ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Writing...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Generate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {coverResult && (
                  <div className="pt-3 border-t border-[#253048] space-y-4 animate-fadeIn">
                    {/* Cover Letter Box */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[10px] uppercase text-[#8a94a8]">
                          Custom Cover Letter
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(coverResult.cover_letter, "letter")}
                          className="font-mono text-[10px] text-[#d4a853] hover:underline flex items-center gap-1"
                        >
                          {copiedLetter ? <CheckCheck className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedLetter ? "Copied!" : "Copy Letter"}</span>
                        </button>
                      </div>
                      <pre className="w-full bg-[#131926] border border-[#253048] rounded-lg p-3 text-xs text-[#e8e4dc] font-serif whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {coverResult.cover_letter}
                      </pre>
                    </div>

                    {/* LinkedIn Outreach Box */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[10px] uppercase text-[#8a94a8]">
                          LinkedIn / Recruiter Cold Outreach (&lt;300 chars)
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(coverResult.outreach_message, "outreach")}
                          className="font-mono text-[10px] text-[#60a5fa] hover:underline flex items-center gap-1"
                        >
                          {copiedOutreach ? <CheckCheck className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedOutreach ? "Copied!" : "Copy Note"}</span>
                        </button>
                      </div>
                      <div className="w-full bg-[#131926] border border-[#253048] rounded-lg p-3 text-xs text-[#e8e4dc] font-sans leading-relaxed">
                        {coverResult.outreach_message}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-[#253048] flex items-center justify-between gap-3 bg-[#0c1019]">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete application for ${application.company_name}?`)) {
                onDelete(application.id)
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#fb7185] hover:bg-[rgba(251,113,133,0.1)] font-mono text-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#253048] hover:border-[#556178] text-[#8a94a8] hover:text-[#e8e4dc] font-mono text-xs transition-colors"
            >
              Close
            </button>
            {activeTab === "details" && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="px-5 py-2 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all shadow-sm hover:-translate-y-0.5 disabled:opacity-40 disabled:pointer-events-none disabled:transform-none"
              >
                Save Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
