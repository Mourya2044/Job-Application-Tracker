import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { NavTab } from "../layout/Navbar";
import {
  Briefcase,
  TrendingUp,
  Award,
  Clock,
  ArrowRight,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface Application {
  id: string;
  companyName: string;
  roleTitle: string;
  currentStage: string;
  stageLocked: boolean;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  updatedAt: string;
}

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onOpenNewApp: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewApp,
}) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const data = await apiFetch<any>("/api/applications");
      if (Array.isArray(data)) {
        setApplications(data);
      } else if (data && Array.isArray(data.columns)) {
        const flattened = data.columns.flatMap((col: any) =>
          (col.applications || []).map((app: any) => ({
            id: app.id,
            companyName: app.company_name || app.companyName,
            roleTitle: app.role_title || app.roleTitle,
            currentStage: app.current_stage || app.currentStage,
            stageLocked: app.stage_locked ?? app.stageLocked ?? false,
            location: app.location,
            salaryMin: app.salary_min ?? app.salaryMin ?? null,
            salaryMax: app.salary_max ?? app.salaryMax ?? null,
            currency: app.currency ?? "USD",
            updatedAt: app.updated_at || app.updatedAt || new Date().toISOString(),
          }))
        );
        setApplications(flattened);
      } else {
        setApplications([]);
      }
    } catch {
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const total = applications.length;
  const interviewing = applications.filter((a) => a.currentStage === "interviewing" || a.currentStage === "screening").length;
  const offers = applications.filter((a) => a.currentStage === "offer" || a.currentStage === "accepted").length;
  const applied = applications.filter((a) => a.currentStage === "applied").length;

  const interviewRate = total > 0 ? Math.round(((interviewing + offers) / total) * 100) : 0;
  const offerRate = (interviewing + offers) > 0 ? Math.round((offers / (interviewing + offers)) * 100) : 0;

  const stageColors: Record<string, string> = {
    saved: "bg-[#94a3b8] text-[#080b12]",
    applied: "bg-[#60a5fa] text-[#080b12]",
    screening: "bg-[#38bdf8] text-[#080b12]",
    interviewing: "bg-[#a78bfa] text-[#080b12]",
    offer: "bg-[#34d399] text-[#080b12]",
    accepted: "bg-[#10b981] text-[#080b12]",
    rejected: "bg-[#fb7185] text-[#080b12]",
    withdrawn: "bg-[#64748b] text-[#080b12]",
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 surface-card border-[#253048]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#f1ede6]">
            Career Intelligence Dashboard
          </h1>
          <p className="text-sm text-[#8f9cb5] mt-1">
            Real-time telemetry across your job search pipeline, market signals, and AI optimizations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("jobs")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#1a2235] text-[#f1ede6] text-sm border border-[#253048] hover:border-[#d4a853] transition-colors"
          >
            <Search className="w-4 h-4 text-[#d4a853]" />
            Find Jobs
          </button>
          <button
            onClick={onOpenNewApp}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] transition-colors"
          >
            + Add Application
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 surface-card border-[#253048]">
          <div className="flex items-center justify-between text-[#8f9cb5] mb-2">
            <span className="text-xs uppercase tracking-wider font-mono">Total Tracked</span>
            <Briefcase className="w-4 h-4 text-[#d4a853]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#f1ede6]">{total}</div>
          <div className="text-xs text-[#8f9cb5] mt-1.5 flex items-center gap-1">
            <span>{applied} awaiting response</span>
          </div>
        </div>

        <div className="p-5 surface-card border-[#253048]">
          <div className="flex items-center justify-between text-[#8f9cb5] mb-2">
            <span className="text-xs uppercase tracking-wider font-mono">In Interviews</span>
            <Clock className="w-4 h-4 text-[#a78bfa]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#f1ede6]">{interviewing}</div>
          <div className="text-xs text-[#8f9cb5] mt-1.5 flex items-center gap-1">
            <span>Technical screens & final rounds</span>
          </div>
        </div>

        <div className="p-5 surface-card border-[#253048]">
          <div className="flex items-center justify-between text-[#8f9cb5] mb-2">
            <span className="text-xs uppercase tracking-wider font-mono">Offers & Accepts</span>
            <Award className="w-4 h-4 text-[#34d399]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#f1ede6]">{offers}</div>
          <div className="text-xs text-[#8f9cb5] mt-1.5 flex items-center gap-1">
            <span className="text-[#34d399]">{offerRate}% final conversion</span>
          </div>
        </div>

        <div className="p-5 surface-card border-[#253048]">
          <div className="flex items-center justify-between text-[#8f9cb5] mb-2">
            <span className="text-xs uppercase tracking-wider font-mono">Response Rate</span>
            <TrendingUp className="w-4 h-4 text-[#60a5fa]" />
          </div>
          <div className="text-3xl font-bold font-mono text-[#f1ede6]">{interviewRate}%</div>
          <div className="text-xs text-[#8f9cb5] mt-1.5 flex items-center gap-1">
            <span>Interview progression velocity</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Launch Cards */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-[#8f9cb5] uppercase tracking-wider font-mono">
            Platform Capabilities
          </h2>

          <div
            onClick={() => onNavigate("ai")}
            className="p-4 surface-card border-[#253048] hover:border-[#d4a853]/60 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a2235] border border-[#253048] flex items-center justify-center text-[#d4a853] group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#f1ede6] group-hover:text-[#d4a853] transition-colors">
                  AI Fit & Resume Improver
                </h3>
                <p className="text-xs text-[#8f9cb5] mt-0.5">
                  Google XYZ impact bullet rewrites & job fit scoring.
                </p>
              </div>
            </div>
          </div>

          <div
            onClick={() => onNavigate("jobs")}
            className="p-4 surface-card border-[#253048] hover:border-[#d4a853]/60 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a2235] border border-[#253048] flex items-center justify-center text-[#60a5fa] group-hover:scale-105 transition-transform">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#f1ede6] group-hover:text-[#60a5fa] transition-colors">
                  Multi-ATS Job Scraper
                </h3>
                <p className="text-xs text-[#8f9cb5] mt-0.5">
                  Greenhouse, Lever, Ashby, Workable, & remote boards.
                </p>
              </div>
            </div>
          </div>

          <div
            onClick={() => onNavigate("mailbox")}
            className="p-4 surface-card border-[#253048] hover:border-[#d4a853]/60 cursor-pointer transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a2235] border border-[#253048] flex items-center justify-center text-[#a78bfa] group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#f1ede6] group-hover:text-[#a78bfa] transition-colors">
                  Gmail Background Sync
                </h3>
                <p className="text-xs text-[#8f9cb5] mt-0.5">
                  Pub/Sub webhooks & heuristic stage transitions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Applications Feed */}
        <div className="lg:col-span-2 surface-card border-[#253048] p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#253048]">
            <h2 className="text-sm font-semibold text-[#f1ede6]">
              Active Pipeline Items
            </h2>
            <button
              onClick={() => onNavigate("applications")}
              className="text-xs text-[#d4a853] hover:text-[#e6c06a] flex items-center gap-1 font-medium"
            >
              View Full Board
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[#8f9cb5]">
              Loading application pipeline...
            </div>
          ) : applications.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[#8f9cb5]">No tracked applications yet.</p>
              <button
                onClick={onOpenNewApp}
                className="mt-3 text-xs px-3 py-1.5 rounded bg-[#1a2235] text-[#d4a853] border border-[#253048] hover:border-[#d4a853] transition-colors"
              >
                + Track Your First Role
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#253048]/60">
              {applications.slice(0, 5).map((app) => (
                <div
                  key={app.id}
                  onClick={() => onNavigate("applications")}
                  className="py-3 flex items-center justify-between hover:bg-[#1a2235]/40 px-2 rounded-md cursor-pointer transition-colors"
                >
                  <div>
                    <h3 className="text-sm font-medium text-[#f1ede6]">
                      {app.roleTitle}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8f9cb5]">
                      <span className="text-[#f1ede6]/80">{app.companyName}</span>
                      {app.location && <span>• {app.location}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                        stageColors[app.currentStage] || "bg-[#253048] text-[#f1ede6]"
                      }`}
                    >
                      {app.currentStage}
                    </span>
                    {app.stageLocked && (
                      <span className="text-[10px] text-[#fbbf24] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/30">
                        Locked
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

