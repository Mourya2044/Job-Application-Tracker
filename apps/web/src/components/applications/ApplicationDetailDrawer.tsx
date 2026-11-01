import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import {
  X,
  Building2,
  Briefcase,
  MapPin,
  DollarSign,
  Globe,
  Lock,
  Unlock,
  RotateCcw,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { LIFECYCLE_STAGES, VALID_STAGE_TRANSITIONS } from "@track/shared";

interface AuditEvent {
  id: string;
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  source: string;
  notes?: string | null;
  createdAt: string;
}

interface ApplicationDetail {
  id: string;
  companyName: string;
  roleTitle: string;
  currentStage: string;
  stageLocked: boolean;
  jobUrl?: string | null;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  notes?: string | null;
  auditEvents: AuditEvent[];
}

interface ApplicationDetailDrawerProps {
  applicationId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const ApplicationDetailDrawer: React.FC<ApplicationDetailDrawerProps> = ({
  applicationId,
  onClose,
  onUpdated,
}) => {
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  useEffect(() => {
    if (applicationId) {
      loadDetails(applicationId);
    }
  }, [applicationId]);

  const loadDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<any>(`/api/applications/${id}`);
      if (data) {
        setApp({
          id: data.id,
          companyName: data.company_name || data.companyName,
          roleTitle: data.role_title || data.roleTitle,
          currentStage: data.current_stage || data.currentStage,
          stageLocked: data.stage_locked ?? data.stageLocked ?? false,
          jobUrl: data.job_url || data.jobUrl || null,
          location: data.location,
          salaryMin: data.salary_min ?? data.salaryMin ?? null,
          salaryMax: data.salary_max ?? data.salaryMax ?? null,
          currency: data.currency ?? "USD",
          notes: data.manual_notes || data.notes || null,
          auditEvents: (data.status_events || data.auditEvents || []).map((e: any) => ({
            id: e.id,
            eventType: e.event_type || e.eventType || "stage_transition",
            fromStage: e.from_stage ?? e.fromStage ?? null,
            toStage: e.to_stage ?? e.toStage ?? null,
            source: e.trigger_source || e.source || "unknown",
            notes: e.user_note || e.change_summary || e.notes || null,
            createdAt: e.changed_at || e.created_at || e.createdAt || new Date().toISOString(),
          })),
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load application details");
    } finally {
      setLoading(false);
    }
  };

  if (!applicationId) return null;

  const handleStageChange = async (newStage: string) => {
    if (!app) return;
    try {
      await apiFetch(`/api/applications/${app.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ to_stage: newStage }),
      });
      await loadDetails(app.id);
      onUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update stage");
    }
  };

  const handleToggleLock = async () => {
    if (!app) return;
    try {
      const res = await apiFetch<{ stageLocked: boolean }>(`/api/applications/${app.id}/lock`, {
        method: "POST",
      });
      setApp({ ...app, stageLocked: res.stageLocked });
      onUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to toggle stage lock");
    }
  };

  const handleRevert = async (eventId: string) => {
    if (!app) return;
    setRevertingId(eventId);
    try {
      await apiFetch(`/api/applications/${app.id}/revert/${eventId}`, {
        method: "POST",
      });
      await loadDetails(app.id);
      onUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to revert to chosen stage");
    } finally {
      setRevertingId(null);
    }
  };

  const handleDelete = async () => {
    if (!app || !confirm(`Delete application for ${app.roleTitle} at ${app.companyName}?`)) return;
    try {
      await apiFetch(`/api/applications/${app.id}`, { method: "DELETE" });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to delete application");
    }
  };

  const allowedTransitions = app ? VALID_STAGE_TRANSITIONS[app.currentStage as keyof typeof VALID_STAGE_TRANSITIONS] || [] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl h-full bg-[#131926] border-l border-[#253048] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-[#253048] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a2235] border border-[#253048] flex items-center justify-center text-[#d4a853]">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f1ede6] leading-tight">
                {app ? app.roleTitle : "Loading..."}
              </h2>
              <p className="text-xs text-[#8f9cb5] mt-0.5">
                {app?.companyName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#8f9cb5] hover:text-[#f1ede6] hover:bg-[#1a2235] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading || !app ? (
            <div className="py-20 text-center text-sm text-[#8f9cb5]">
              Loading application details...
            </div>
          ) : (
            <>
              {/* Primary Status Card */}
              <div className="p-4 surface-card border-[#253048] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-mono uppercase text-[#8f9cb5] block mb-1">
                      Current Stage
                    </span>
                    <span className="text-sm font-semibold uppercase px-2.5 py-1 rounded bg-[#1a2235] text-[#d4a853] border border-[#d4a853]/40">
                      {app.currentStage}
                    </span>
                  </div>
                  <button
                    onClick={handleToggleLock}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      app.stageLocked
                        ? "bg-[#fbbf24]/10 border-[#fbbf24]/40 text-[#fbbf24]"
                        : "bg-[#1a2235] border-[#253048] text-[#8f9cb5] hover:text-[#f1ede6]"
                    }`}
                  >
                    {app.stageLocked ? (
                      <>
                        <Lock className="w-3.5 h-3.5" /> Stage Locked
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" /> Unlocked
                      </>
                    )}
                  </button>
                </div>

                {/* Stage Progression Buttons */}
                <div className="pt-2 border-t border-[#253048]">
                  <span className="text-[11px] text-[#8f9cb5] block mb-2 font-mono">
                    Move to Stage:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {allowedTransitions.map((stage) => (
                      <button
                        key={stage}
                        onClick={() => handleStageChange(stage)}
                        className="px-2.5 py-1 rounded bg-[#1a2235] text-xs font-medium text-[#f1ede6] hover:bg-[#d4a853] hover:text-[#080b12] border border-[#253048] transition-colors"
                      >
                        → {stage.charAt(0).toUpperCase() + stage.slice(1)}
                      </button>
                    ))}
                    {allowedTransitions.length === 0 && (
                      <span className="text-xs text-[#57647d] italic">
                        Terminal stage (no further forward transitions)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata Details */}
              <div className="grid grid-cols-2 gap-3">
                {app.location && (
                  <div className="p-3 surface-card border-[#253048]">
                    <span className="text-[10px] uppercase font-mono text-[#8f9cb5] block mb-1">
                      Location
                    </span>
                    <div className="text-xs text-[#f1ede6] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#d4a853]" />
                      {app.location}
                    </div>
                  </div>
                )}

                {(app.salaryMin || app.salaryMax) && (
                  <div className="p-3 surface-card border-[#253048]">
                    <span className="text-[10px] uppercase font-mono text-[#8f9cb5] block mb-1">
                      Compensation
                    </span>
                    <div className="text-xs text-[#f1ede6] flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-[#34d399]" />
                      {app.salaryMin?.toLocaleString("en-US")} - {app.salaryMax?.toLocaleString("en-US")} {app.currency || "USD"}
                    </div>
                  </div>
                )}
              </div>

              {app.jobUrl && (
                <div className="p-3 surface-card border-[#253048]">
                  <span className="text-[10px] uppercase font-mono text-[#8f9cb5] block mb-1">
                    Job Listing URL
                  </span>
                  <a
                    href={app.jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#60a5fa] hover:underline flex items-center gap-1.5 break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {app.jobUrl}
                  </a>
                </div>
              )}

              {/* Immutable Chronological Audit Trail */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-[#8f9cb5] uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#d4a853]" />
                    Lifecycle Audit History
                  </h3>
                  <span className="text-[10px] text-[#57647d] font-mono">
                    Immutable Event Log
                  </span>
                </div>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-[#253048]">
                  {app.auditEvents && app.auditEvents.length > 0 ? (
                    app.auditEvents.map((evt) => (
                      <div key={evt.id} className="relative group">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[#d4a853] border-2 border-[#131926]" />
                        <div className="p-3 surface-card border-[#253048] hover:border-[#374768] transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#f1ede6]">
                              {evt.eventType === "revert_transition" ? (
                                <span className="text-[#fbbf24]">Reverted to {evt.toStage}</span>
                              ) : evt.toStage ? (
                                `Transitioned to ${evt.toStage}`
                              ) : (
                                evt.eventType
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-[#57647d]">
                              {new Date(evt.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="text-[11px] text-[#8f9cb5] mt-1 flex items-center justify-between">
                            <span>Source: <code className="text-[10px] text-[#a78bfa]">{evt.source}</code></span>
                            {evt.toStage && evt.toStage !== app.currentStage && (
                              <button
                                onClick={() => handleRevert(evt.id)}
                                disabled={revertingId === evt.id}
                                className="text-[11px] text-[#d4a853] hover:text-[#e6c06a] flex items-center gap-1 border border-[#d4a853]/40 px-2 py-0.5 rounded hover:bg-[#d4a853]/10 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                {revertingId === evt.id ? "Reverting..." : "Revert Here"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#57647d] italic">No prior audit events recorded.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#253048] flex items-center justify-between bg-[#0c1019]">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[#fb7185] hover:bg-[#fb7185]/10 border border-transparent hover:border-[#fb7185]/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Application
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#1a2235] text-xs font-medium text-[#f1ede6] hover:bg-[#253048] border border-[#253048] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

