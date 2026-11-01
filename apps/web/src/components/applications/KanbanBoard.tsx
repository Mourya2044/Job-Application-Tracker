import React from "react";
import { LIFECYCLE_STAGES, VALID_STAGE_TRANSITIONS } from "@track/shared";
import { Lock, MapPin, DollarSign, ExternalLink, ChevronRight } from "lucide-react";

export interface KanbanApplication {
  id: string;
  companyName: string;
  roleTitle: string;
  currentStage: string;
  stageLocked: boolean;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  jobUrl?: string | null;
  updatedAt: string;
}

interface KanbanBoardProps {
  applications: KanbanApplication[];
  onSelectApplication: (id: string) => void;
  onMoveStage: (id: string, newStage: string) => void;
}

const STAGE_LABELS: Record<string, { label: string; accent: string }> = {
  saved: { label: "Saved", accent: "border-slate-500/40 text-slate-300" },
  applied: { label: "Applied", accent: "border-blue-500/40 text-blue-300" },
  screening: { label: "Screening", accent: "border-sky-500/40 text-sky-300" },
  interviewing: { label: "Interviewing", accent: "border-purple-500/40 text-purple-300" },
  offer: { label: "Offer", accent: "border-emerald-500/40 text-emerald-300" },
  accepted: { label: "Accepted", accent: "border-teal-500/40 text-teal-300" },
  rejected: { label: "Rejected", accent: "border-rose-500/40 text-rose-300" },
  withdrawn: { label: "Withdrawn", accent: "border-gray-500/40 text-gray-400" },
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  applications,
  onSelectApplication,
  onMoveStage,
}) => {
  return (
    <div className="flex gap-4 overflow-x-auto pb-6 pt-1 select-none">
      {LIFECYCLE_STAGES.map((stage) => {
        const stageApps = applications.filter((a) => a.currentStage === stage);
        const meta = STAGE_LABELS[stage] || { label: stage, accent: "border-[#253048]" };

        return (
          <div
            key={stage}
            className="w-72 shrink-0 bg-[#0e131f] border border-[#253048] rounded-xl flex flex-col max-h-[calc(100vh-14rem)]"
          >
            {/* Column Header */}
            <div className="p-3.5 border-b border-[#253048] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${meta.accent}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] font-mono font-medium px-1.5 py-0.2 rounded bg-[#1a2235] text-[#8f9cb5] border border-[#253048]">
                  {stageApps.length}
                </span>
              </div>
            </div>

            {/* Column Cards */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {stageApps.length === 0 ? (
                <div className="py-8 text-center text-[11px] text-[#57647d] italic">
                  No applications
                </div>
              ) : (
                stageApps.map((app) => {
                  const allowed = VALID_STAGE_TRANSITIONS[app.currentStage as keyof typeof VALID_STAGE_TRANSITIONS] || [];
                  return (
                    <div
                      key={app.id}
                      onClick={() => onSelectApplication(app.id)}
                      className="p-3.5 surface-card border-[#253048] hover:border-[#d4a853]/60 cursor-pointer transition-all hover:shadow-lg group"
                    >
                      {/* Company & Role */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-semibold text-[#f1ede6] group-hover:text-[#d4a853] transition-colors leading-tight">
                            {app.roleTitle}
                          </h4>
                          <span className="text-[11px] text-[#8f9cb5] font-medium mt-0.5 block">
                            {app.companyName}
                          </span>
                        </div>
                        {app.stageLocked && (
                          <span
                            title="Stage Locked: Protected from automated sync"
                            className="p-1 rounded bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/30"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      {/* Details / Badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[#8f9cb5]">
                        {app.location && (
                          <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048]">
                            <MapPin className="w-2.5 h-2.5 text-[#d4a853]" />
                            {app.location}
                          </span>
                        )}
                        {(app.salaryMin || app.salaryMax) && (
                          <span className="flex items-center gap-1 bg-[#1a2235] px-2 py-0.5 rounded border border-[#253048] text-[#34d399]">
                            <DollarSign className="w-2.5 h-2.5" />
                            {app.salaryMin ? `${Math.round(app.salaryMin / 1000)}k` : ""}
                            {app.salaryMin && app.salaryMax ? "-" : ""}
                            {app.salaryMax ? `${Math.round(app.salaryMax / 1000)}k` : ""}
                          </span>
                        )}
                      </div>

                      {/* Next Stage Shortcuts */}
                      {allowed.length > 0 && (
                        <div
                          className="mt-3 pt-2.5 border-t border-[#253048]/60 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-[#57647d] font-mono">Move:</span>
                          <div className="flex items-center gap-1">
                            {allowed.slice(0, 2).map((next) => (
                              <button
                                key={next}
                                onClick={() => onMoveStage(app.id, next)}
                                className="text-[10px] px-2 py-0.5 rounded bg-[#1a2235] hover:bg-[#d4a853] hover:text-[#080b12] text-[#8f9cb5] hover:text-[#080b12] border border-[#253048] transition-colors"
                              >
                                → {next.charAt(0).toUpperCase() + next.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

