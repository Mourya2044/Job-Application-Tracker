import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import {
  Mail,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Clock,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Radio,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface MailboxStatus {
  connected: boolean;
  email?: string | null;
  historyId?: string | null;
  lastSyncedAt?: string | null;
}

interface PendingSuggestion {
  id: string;
  applicationId: string;
  suggestedStage: string;
  confidenceScore: number;
  reasonSnippet?: string | null;
  createdAt: string;
  application: {
    id: string;
    companyName: string;
    roleTitle: string;
    currentStage: string;
  };
}

export const MailboxView: React.FC = () => {
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [suggestions, setSuggestions] = useState<PendingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadMailboxData();
  }, []);

  const loadMailboxData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, suggRes] = await Promise.all([
        apiFetch<MailboxStatus>("/api/mailbox/status"),
        apiFetch<PendingSuggestion[]>("/api/mailbox/suggestions").catch(() => []),
      ]);
      setStatus(statusRes);
      setSuggestions(suggRes || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load mailbox status");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const data = await apiFetch<{ url: string }>("/api/mailbox/connect");
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initiate Gmail OAuth flow");
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Gmail integration? Automatic email sync will stop.")) return;
    try {
      await apiFetch("/api/mailbox/disconnect", { method: "DELETE" });
      setSuccessMsg("Disconnected Gmail account successfully");
      await loadMailboxData();
    } catch (err: any) {
      setError(err?.message || "Failed to disconnect Gmail");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await apiFetch<{ message: string; messagesProcessed: number }>("/api/mailbox/sync", {
        method: "POST",
      });
      setSuccessMsg(data.message || `Sync completed: processed ${data.messagesProcessed} messages.`);
      await loadMailboxData();
    } catch (err: any) {
      setError(err?.message || "Mailbox synchronization failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleApproveSuggestion = async (id: string) => {
    try {
      await apiFetch(`/api/mailbox/suggestions/${id}/approve`, { method: "POST" });
      setSuccessMsg("Approved stage suggestion! Application updated.");
      setSuggestions(suggestions.filter((s) => s.id !== id));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to approve suggestion");
    }
  };

  const handleRejectSuggestion = async (id: string) => {
    try {
      await apiFetch(`/api/mailbox/suggestions/${id}/reject`, { method: "POST" });
      setSuggestions(suggestions.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to reject suggestion");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#f1ede6]">
          Mailbox Intelligence & Background Sync
        </h1>
        <p className="text-xs text-[#8f9cb5] mt-0.5">
          Connect your Gmail account for event-driven updates via Google Cloud Pub/Sub, heuristic signal extraction, and automated stage detection.
        </p>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 rounded-md bg-[#34d399]/10 border border-[#34d399]/30 text-[#34d399] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="surface-card border-[#253048] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#253048]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#1a2235] border border-[#253048] flex items-center justify-center text-[#d4a853]">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#f1ede6]">
                  Google Mail Integration
                </h3>
                {status?.connected ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#34d399]/15 text-[#34d399] border border-[#34d399]/30">
                    <Radio className="w-3 h-3 animate-pulse" /> Active Sync
                  </span>
                ) : (
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#57647d]/20 text-[#8f9cb5] border border-[#253048]">
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8f9cb5] mt-1">
                {status?.connected
                  ? `Connected to ${status.email}`
                  : "Connect to automatically discover job applications, interview invitations, and status changes."}
              </p>
            </div>
          </div>

          <div>
            {status?.connected ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1a2235] text-[#fb7185] hover:bg-[#fb7185]/10 border border-[#253048] text-xs font-medium transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGmail}
                className="flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] transition-colors"
              >
                <Mail className="w-4 h-4" />
                Connect Gmail Account
              </button>
            )}
          </div>
        </div>

        {/* Sync Telemetry Metrics */}
        {status?.connected && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-3 surface-card border-[#253048]">
              <span className="text-[10px] font-mono text-[#57647d] uppercase block">
                Last Sync Timestamp
              </span>
              <span className="text-xs text-[#f1ede6] font-mono mt-1 block">
                {status.lastSyncedAt
                  ? new Date(status.lastSyncedAt).toLocaleString()
                  : "Never synced"}
              </span>
            </div>

            <div className="p-3 surface-card border-[#253048]">
              <span className="text-[10px] font-mono text-[#57647d] uppercase block">
                History ID Checkpoint
              </span>
              <span className="text-xs text-[#d4a853] font-mono mt-1 block">
                {status.historyId || "Awaiting first run"}
              </span>
            </div>

            <div className="p-3 surface-card border-[#253048]">
              <span className="text-[10px] font-mono text-[#57647d] uppercase block">
                Pub/Sub Ingestion Security
              </span>
              <span className="text-xs text-[#34d399] font-mono mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> AES-256-GCM At Rest
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Pending Suggestions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#f1ede6]">
              Pending Application Suggestions ({suggestions.length})
            </h2>
            <p className="text-xs text-[#8f9cb5] mt-0.5">
              Updates detected with moderate confidence or on stage-locked applications awaiting your review.
            </p>
          </div>
        </div>

        {suggestions.length === 0 ? (
          <div className="py-12 surface-card border-[#253048] text-center text-sm text-[#8f9cb5]">
            No pending suggestions. Your application pipeline is up to date!
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((item) => (
              <div
                key={item.id}
                className="surface-card border-[#253048] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-[#f1ede6]">
                      {item.application.roleTitle}
                    </h4>
                    <span className="text-xs text-[#8f9cb5]">
                      at {item.application.companyName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 text-xs">
                    <span className="text-[#57647d]">Current:</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#1a2235] text-[#8f9cb5] border border-[#253048] font-mono uppercase text-[10px]">
                      {item.application.currentStage}
                    </span>
                    <span className="text-[#d4a853]">→ Suggested:</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853] border border-[#d4a853]/40 font-mono uppercase text-[10px]">
                      {item.suggestedStage}
                    </span>
                    <span className="text-[#57647d] text-[11px] ml-2">
                      ({Math.round(item.confidenceScore * 100)}% confidence)
                    </span>
                  </div>

                  {item.reasonSnippet && (
                    <p className="text-xs text-[#8f9cb5] bg-[#0c1019] p-2 rounded border border-[#253048] mt-2 italic font-mono text-[11px]">
                      "{item.reasonSnippet}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRejectSuggestion(item.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#1a2235] text-[#fb7185] hover:bg-[#fb7185]/10 border border-[#253048] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleApproveSuggestion(item.id)}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#d4a853] text-[#080b12] hover:bg-[#e6c06a] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve Update
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

