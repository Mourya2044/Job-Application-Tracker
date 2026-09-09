import React, { useState } from "react"
import { Mail, Check, X, Inbox } from "lucide-react"

export function ApprovalsView({ 
  discoveries = [], 
  onAccept, 
  onDismiss,
  onSyncMailbox,
  isSyncing
}) {
  const [removingIds, setRemovingIds] = useState(new Set())

  const handleApprove = (id) => {
    setRemovingIds(prev => new Set(prev).add(id))
    setTimeout(() => {
      onAccept(id)
    }, 300)
  }

  const handleDismiss = (id) => {
    setRemovingIds(prev => new Set(prev).add(id))
    setTimeout(() => {
      onDismiss(id)
    }, 300)
  }

  const parseRaw = (item) => {
    if (!item.raw_classification) return {}
    if (typeof item.raw_classification === "object") return item.raw_classification
    try {
      return JSON.parse(item.raw_classification)
    } catch {
      return {}
    }
  }

  return (
    <div className="space-y-6 animate-fadeUp max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold font-serif text-[#e8e4dc]">
            Pending Approvals
          </h1>
          <p className="text-[#8a94a8] text-sm mt-1.5">
            New applications detected from your inbox. Approve to start tracking.
          </p>
        </div>

        <button
          onClick={onSyncMailbox}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#131926] border border-[#253048] hover:border-[#d4a853] text-[#e8e4dc] text-xs font-mono transition-all self-start sm:self-auto disabled:opacity-50"
        >
          <Mail className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[#d4a853]" : "text-[#8a94a8]"}`} />
          <span>{isSyncing ? "Scanning Inbox..." : "Scan Inbox Now"}</span>
        </button>
      </div>

      {/* List or Empty State */}
      {(!discoveries || discoveries.length === 0) ? (
        <div className="text-center py-20 px-6 bg-[#131926] border border-[#253048] rounded-2xl flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(212,168,53,0.06)] border border-[#253048] flex items-center justify-center text-[#556178] mb-4">
            <Inbox className="w-7 h-7 stroke-1" />
          </div>
          <h3 className="font-serif text-lg font-semibold text-[#e8e4dc] mb-1.5">
            All caught up
          </h3>
          <p className="text-[#8a94a8] text-xs max-w-sm leading-relaxed">
            No new applications detected in your email. We'll automatically capture updates when new emails arrive.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {discoveries.map((item) => {
            const raw = parseRaw(item)
            const itemId = item.id || item.log_id
            const company = item.company_name || item.detected_company || raw.company_name || "Unknown Company"
            const role = item.role_title || raw.role_title || "Software Engineer"
            const snippet = item.snippet || raw.summary_sentence || "Application confirmation detected."
            const receivedDate = item.received_at
              ? new Date(item.received_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
              : "Recent"
            const isRemoving = removingIds.has(itemId)

            return (
              <div 
                key={itemId}
                className={`bg-[#131926] border border-[#253048] hover:border-[#212d45] rounded-xl p-6 transition-all duration-300 ${
                  isRemoving ? "opacity-0 translate-x-10 max-h-0 overflow-hidden py-0 my-0 border-0" : ""
                }`}
              >
                {/* Source Pill */}
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#556178] mb-3">
                  <Mail className="w-3.5 h-3.5 text-[#d4a853]" />
                  <span>Detected from email</span>
                  <span className="px-2 py-0.5 rounded bg-[rgba(212,168,53,0.12)] text-[#d4a853] text-[10px] uppercase tracking-wider font-semibold">
                    Auto-detected
                  </span>
                </div>

                {/* Body */}
                <div className="mb-5">
                  <h3 className="font-serif text-xl font-bold text-[#e8e4dc] mb-1">
                    {company}
                  </h3>
                  <div className="text-xs text-[#8a94a8] mb-3.5">
                    {role}
                  </div>

                  {/* Email Snippet Preview */}
                  <div className="bg-[#0c1019] border border-[#253048] rounded-lg p-3.5 text-xs text-[#8a94a8] leading-relaxed italic mb-3">
                    "{snippet}"
                  </div>

                  {/* Meta */}
                  <div className="font-mono text-[11px] text-[#556178]">
                    Received: {receivedDate} &middot; From: {item.sender || "careers@company.com"}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-[#253048]">
                  <button
                    onClick={() => handleApprove(itemId)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#d4a853] hover:bg-[#e6c06a] text-[#080b12] font-mono text-xs font-semibold transition-all shadow-sm hover:-translate-y-0.5"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Approve & Track</span>
                  </button>

                  <button
                    onClick={() => handleDismiss(itemId)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#253048] hover:border-[#fb7185] text-[#8a94a8] hover:text-[#fb7185] hover:bg-[rgba(251,113,133,0.08)] font-mono text-xs transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
