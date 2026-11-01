import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import {
  Sparkles,
  FileText,
  Target,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  TrendingUp,
  Cpu,
  Clock,
  Briefcase,
  Layers,
} from "lucide-react";
import type {
  CoverLetterResponseDto,
  ParsedResumeProfileDto,
  ResumeFitEvaluationDto,
  ResumeImproveResponseDto,
} from "@track/shared";

interface AIExecutionRecord {
  id: string;
  capability: string;
  provider: string;
  modelName: string;
  promptId?: string | null;
  latencyMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  status: string;
  createdAt: string;
}

export const AICopilotView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"fit" | "improve" | "letter" | "parse" | "telemetry">("fit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 1. Resume Fit State
  const [fitResume, setFitResume] = useState("");
  const [fitJd, setFitJd] = useState("");
  const [fitRole, setFitRole] = useState("");
  const [fitCompany, setFitCompany] = useState("");
  const [fitResult, setFitResult] = useState<ResumeFitEvaluationDto | null>(null);

  // 2. Resume Improve State
  const [improveResume, setImproveResume] = useState("");
  const [improveRole, setImproveRole] = useState("");
  const [improveResult, setImproveResult] = useState<ResumeImproveResponseDto | null>(null);

  // 3. Cover Letter State
  const [letterResume, setLetterResume] = useState("");
  const [letterRole, setLetterRole] = useState("");
  const [letterCompany, setLetterCompany] = useState("");
  const [letterTone, setLetterTone] = useState<"Professional" | "Enthusiastic" | "Technical" | "Direct">("Professional");
  const [letterResult, setLetterResult] = useState<CoverLetterResponseDto | null>(null);

  // 4. Parse Resume State
  const [parseText, setParseText] = useState("");
  const [parseResult, setParseResult] = useState<ParsedResumeProfileDto | null>(null);

  // 5. Telemetry State
  const [telemetry, setTelemetry] = useState<AIExecutionRecord[]>([]);

  useEffect(() => {
    if (activeTab === "telemetry") {
      loadTelemetry();
    }
  }, [activeTab]);

  const loadTelemetry = async () => {
    try {
      const data = await apiFetch<AIExecutionRecord[]>("/api/ai/executions");
      setTelemetry(data || []);
    } catch {
      setTelemetry([]);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Handlers
  const handleEvaluateFit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFitResult(null);

    try {
      const data = await apiFetch<ResumeFitEvaluationDto>("/api/ai/resume/fit", {
        method: "POST",
        body: JSON.stringify({
          resume_text: fitResume,
          job_description: fitJd,
          job_title: fitRole || undefined,
          company: fitCompany || undefined,
        }),
      });
      setFitResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to evaluate job fit");
    } finally {
      setLoading(false);
    }
  };

  const handleImproveResume = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setImproveResult(null);

    try {
      const data = await apiFetch<ResumeImproveResponseDto>("/api/ai/resume/improve", {
        method: "POST",
        body: JSON.stringify({
          resume_text: improveResume,
          target_role: improveRole || undefined,
        }),
      });
      setImproveResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to improve resume");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setLetterResult(null);

    try {
      const data = await apiFetch<CoverLetterResponseDto>("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          resume_text: letterResume,
          job_title: letterRole,
          company: letterCompany,
          tone: letterTone,
        }),
      });
      setLetterResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to generate cover letter");
    } finally {
      setLoading(false);
    }
  };

  const handleParseResume = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setParseResult(null);

    try {
      const data = await apiFetch<ParsedResumeProfileDto>("/api/ai/resume/parse", {
        method: "POST",
        body: JSON.stringify({ resume_text: parseText }),
      });
      setParseResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to parse resume text");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#f1ede6]">
              AI Career Copilot
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#d4a853]/15 text-[#d4a853] border border-[#d4a853]/40">
              Provider-Agnostic
            </span>
          </div>
          <p className="text-xs text-[#8f9cb5] mt-0.5">
            Optimize your candidacy with explainable job fit scoring, Google XYZ impact bullet rewrites, and custom outreach generation.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center bg-[#131926] border border-[#253048] rounded-md p-0.5">
          <button
            onClick={() => setActiveTab("fit")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "fit" ? "bg-[#1a2235] text-[#d4a853] shadow-sm" : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Job Fit Match
          </button>
          <button
            onClick={() => setActiveTab("improve")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "improve" ? "bg-[#1a2235] text-[#d4a853] shadow-sm" : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            XYZ Bullet Improver
          </button>
          <button
            onClick={() => setActiveTab("letter")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "letter" ? "bg-[#1a2235] text-[#d4a853] shadow-sm" : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Cover Letter & Outreach
          </button>
          <button
            onClick={() => setActiveTab("parse")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "parse" ? "bg-[#1a2235] text-[#d4a853] shadow-sm" : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Resume Parser
          </button>
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === "telemetry" ? "bg-[#1a2235] text-[#d4a853] shadow-sm" : "text-[#8f9cb5] hover:text-[#f1ede6]"
            }`}
          >
            Execution Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: Job Fit Matcher */}
      {activeTab === "fit" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleEvaluateFit} className="surface-card border-[#253048] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#f1ede6] flex items-center gap-2">
              <Target className="w-4 h-4 text-[#d4a853]" />
              Match Resume Against Role
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Company</label>
                <input
                  type="text"
                  placeholder="e.g. Stripe"
                  value={fitCompany}
                  onChange={(e) => setFitCompany(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Job Title</label>
                <input
                  type="text"
                  placeholder="e.g. Senior Backend Engineer"
                  value={fitRole}
                  onChange={(e) => setFitRole(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Resume Text *</label>
              <textarea
                required
                rows={6}
                placeholder="Paste your experience bullet points or full resume content..."
                value={fitResume}
                onChange={(e) => setFitResume(e.target.value)}
                className="w-full p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] font-mono focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Job Description *</label>
              <textarea
                required
                rows={6}
                placeholder="Paste the target job description and requirements..."
                value={fitJd}
                onChange={(e) => setFitJd(e.target.value)}
                className="w-full p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] font-mono focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
            >
              {loading ? "Analyzing Semantic Match..." : "Evaluate Fit Score"}
            </button>
          </form>

          {/* Results Panel */}
          <div className="surface-card border-[#253048] p-5">
            {fitResult ? (
              <div className="space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between pb-4 border-b border-[#253048]">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#8f9cb5] block">Overall Alignment</span>
                    <h3 className="text-2xl font-bold font-mono text-[#f1ede6]">
                      {fitResult.match_score} <span className="text-xs text-[#8f9cb5]">/ 100</span>
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono uppercase text-[#8f9cb5] block">Model Inference</span>
                    <span className="text-xs font-mono text-[#a78bfa]">{fitResult.model_name || "FastAPI LLM"}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#8f9cb5] uppercase tracking-wider font-mono mb-1">Summary</h4>
                  <p className="text-xs text-[#f1ede6] bg-[#0c1019] p-3 rounded-md border border-[#253048]">
                    {fitResult.summary}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#34d399] uppercase tracking-wider font-mono mb-2">Matching Strengths</h4>
                  <ul className="space-y-1.5 text-xs text-[#f1ede6]">
                    {fitResult.strengths.map((str, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-[#34d399] shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#fbbf24] uppercase tracking-wider font-mono mb-2">Identified Skill Gaps</h4>
                  <div className="space-y-2">
                    {fitResult.missing_skills.map((gap, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#0c1019] border border-[#253048] text-xs">
                        <span className="font-semibold text-[#f1ede6]">{gap.category}:</span>{" "}
                        <span className="text-[#8f9cb5]">{gap.missing_skills.join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#d4a853] uppercase tracking-wider font-mono mb-2">Recommended XYZ Impact Bullets</h4>
                  <div className="space-y-2">
                    {fitResult.xyz_bullet_recommendations.map((rec, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#1a2235] border border-[#d4a853]/30 text-xs text-[#f1ede6] font-mono leading-relaxed">
                        • {rec}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center">
                <Target className="w-10 h-10 text-[#253048] mb-2" />
                <p className="text-xs text-[#8f9cb5]">Enter your resume and job description to inspect explainable fit scoring.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Google XYZ Bullet Improver */}
      {activeTab === "improve" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleImproveResume} className="surface-card border-[#253048] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#f1ede6] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#d4a853]" />
              Google XYZ Impact Bullet Improver
            </h2>
            <p className="text-xs text-[#8f9cb5]">
              Transforms passive duties (e.g. "Responsible for...") into decisive Google XYZ achievements: "Accomplished [X] as measured by [Y] by doing [Z]".
            </p>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Target Role (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Staff Infrastructure Engineer"
                value={improveRole}
                onChange={(e) => setImproveRole(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Resume Experience Bullets *</label>
              <textarea
                required
                rows={10}
                placeholder="Paste your existing resume bullet points here..."
                value={improveResume}
                onChange={(e) => setImproveResume(e.target.value)}
                className="w-full p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] font-mono focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
            >
              {loading ? "Critiquing & Rewriting..." : "Improve with XYZ Framework"}
            </button>
          </form>

          {/* Improve Results Panel */}
          <div className="surface-card border-[#253048] p-5">
            {improveResult ? (
              <div className="space-y-5 animate-in fade-in">
                <div className="flex items-center justify-between pb-4 border-b border-[#253048]">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#8f9cb5] block">Resume Health Score</span>
                    <h3 className="text-2xl font-bold font-mono text-[#f1ede6]">
                      {improveResult.overall_score} <span className="text-xs text-[#8f9cb5]">/ 100</span>
                    </h3>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1a2235] text-[#34d399] border border-[#34d399]/30">
                    XYZ Compliant
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#fb7185] uppercase tracking-wider font-mono mb-2">Identified Weaknesses</h4>
                  <ul className="space-y-1 text-xs text-[#8f9cb5]">
                    {improveResult.weaknesses.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#d4a853] uppercase tracking-wider font-mono mb-2">Quantified Rewrites</h4>
                  <div className="space-y-3">
                    {improveResult.xyz_bullet_improvements.map((imp, i) => (
                      <div key={i} className="p-3 rounded bg-[#0c1019] border border-[#253048] space-y-2 text-xs">
                        <div className="text-[#8f9cb5] line-through text-[11px]">
                          {imp.original}
                        </div>
                        <div className="text-[#34d399] font-medium font-mono text-[11px] leading-relaxed">
                          {imp.improved}
                        </div>
                        <div className="text-[10px] text-[#57647d] italic">
                          Why: {imp.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center">
                <Sparkles className="w-10 h-10 text-[#253048] mb-2" />
                <p className="text-xs text-[#8f9cb5]">Paste your resume bullet points to generate Google XYZ-standard metric rewrites.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Cover Letter & Outreach */}
      {activeTab === "letter" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleGenerateLetter} className="surface-card border-[#253048] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#f1ede6] flex items-center gap-2">
              <Send className="w-4 h-4 text-[#d4a853]" />
              Tailored Outreach Generator
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Company *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Linear"
                  value={letterCompany}
                  onChange={(e) => setLetterCompany(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Role Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Frontend Engineer"
                  value={letterRole}
                  onChange={(e) => setLetterRole(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Tone of Voice</label>
              <select
                value={letterTone}
                onChange={(e) => setLetterTone(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
              >
                <option value="Professional">Professional (Standard High-Impact)</option>
                <option value="Enthusiastic">Enthusiastic (Passionate & Mission-Driven)</option>
                <option value="Technical">Technical (Architecture & Scale-Focused)</option>
                <option value="Direct">Direct (Concise & Results-Oriented)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Your Resume / Background *</label>
              <textarea
                required
                rows={9}
                placeholder="Paste key experience highlights from your resume..."
                value={letterResume}
                onChange={(e) => setLetterResume(e.target.value)}
                className="w-full p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] font-mono focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
            >
              {loading ? "Generating Personalized Communications..." : "Generate Cover Letter & Outreach"}
            </button>
          </form>

          {/* Letter Results Panel */}
          <div className="surface-card border-[#253048] p-5 space-y-5">
            {letterResult ? (
              <div className="space-y-5 animate-in fade-in">
                {/* Formal Cover Letter */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-[#d4a853] uppercase tracking-wider font-mono">Formal Cover Letter</h4>
                    <button
                      onClick={() => copyToClipboard(letterResult.cover_letter, "letter")}
                      className="text-xs text-[#8f9cb5] hover:text-[#f1ede6] flex items-center gap-1"
                    >
                      {copiedKey === "letter" ? <Check className="w-3.5 h-3.5 text-[#34d399]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === "letter" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                    {letterResult.cover_letter}
                  </pre>
                </div>

                {/* Recruiter Outreach */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-[#60a5fa] uppercase tracking-wider font-mono">LinkedIn / Email Recruiter Outreach</h4>
                    <button
                      onClick={() => copyToClipboard(letterResult.recruiter_outreach, "outreach")}
                      className="text-xs text-[#8f9cb5] hover:text-[#f1ede6] flex items-center gap-1"
                    >
                      {copiedKey === "outreach" ? <Check className="w-3.5 h-3.5 text-[#34d399]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === "outreach" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] whitespace-pre-wrap font-sans leading-relaxed">
                    {letterResult.recruiter_outreach}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center">
                <Send className="w-10 h-10 text-[#253048] mb-2" />
                <p className="text-xs text-[#8f9cb5]">Fill in role details and background to generate targeted outreach communications.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Resume Profile Parser */}
      {activeTab === "parse" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleParseResume} className="surface-card border-[#253048] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#f1ede6] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#d4a853]" />
              Structured Resume Profile Extractor
            </h2>
            <p className="text-xs text-[#8f9cb5]">
              Extracts candidate contact details, professional summaries, and technical skills taxonomy.
            </p>

            <div>
              <label className="block text-[11px] font-mono text-[#8f9cb5] mb-1">Resume Text *</label>
              <textarea
                required
                rows={12}
                placeholder="Paste raw resume text here..."
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                className="w-full p-3 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] font-mono focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-xs font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
            >
              {loading ? "Extracting Profile Entities..." : "Parse Resume Profile"}
            </button>
          </form>

          {/* Parse Results */}
          <div className="surface-card border-[#253048] p-5">
            {parseResult ? (
              <div className="space-y-4 animate-in fade-in">
                <h3 className="text-sm font-bold text-[#f1ede6] pb-3 border-b border-[#253048]">
                  Extracted Profile Metadata
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-[#57647d] block">Candidate Name</span>
                    <span className="text-[#f1ede6] font-medium">{parseResult.candidate_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-[#57647d] block">Email Address</span>
                    <span className="text-[#60a5fa]">{parseResult.email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-[#57647d] block">Phone Number</span>
                    <span className="text-[#f1ede6]">{parseResult.phone || "—"}</span>
                  </div>
                </div>

                {parseResult.summary && (
                  <div>
                    <span className="text-[10px] font-mono text-[#57647d] block mb-1">Executive Summary</span>
                    <p className="text-xs text-[#8f9cb5] bg-[#0c1019] p-3 rounded border border-[#253048]">
                      {parseResult.summary}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-mono text-[#57647d] block mb-1.5">Detected Technical Competencies ({parseResult.skills.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {parseResult.skills.map((sk) => (
                      <span key={sk} className="text-xs px-2.5 py-1 rounded bg-[#1a2235] text-[#d4a853] border border-[#253048]">
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center">
                <FileText className="w-10 h-10 text-[#253048] mb-2" />
                <p className="text-xs text-[#8f9cb5]">Paste resume text to parse contact details and competencies.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AI Telemetry Log */}
      {activeTab === "telemetry" && (
        <div className="surface-card border-[#253048] p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#253048]">
            <div>
              <h3 className="text-sm font-semibold text-[#f1ede6]">AI Execution Telemetry</h3>
              <p className="text-xs text-[#8f9cb5]">Auditable runtime telemetry of model invocations, providers, and latencies.</p>
            </div>
            <button
              onClick={loadTelemetry}
              className="text-xs px-3 py-1 rounded bg-[#1a2235] text-[#8f9cb5] hover:text-[#f1ede6] border border-[#253048]"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#253048] bg-[#0e131f] text-[10px] font-mono uppercase text-[#8f9cb5]">
                  <th className="py-2.5 px-3">Capability</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#253048]/60 font-mono text-[11px]">
                {telemetry.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#57647d] italic">
                      No AI model executions logged yet.
                    </td>
                  </tr>
                ) : (
                  telemetry.map((t) => (
                    <tr key={t.id} className="hover:bg-[#1a2235]/40">
                      <td className="py-2.5 px-3 text-[#f1ede6] font-semibold">{t.capability}</td>
                      <td className="py-2.5 px-3 text-[#8f9cb5]">{t.provider}</td>
                      <td className="py-2.5 px-3 text-[#a78bfa]">{t.modelName}</td>
                      <td className="py-2.5 px-3 text-[#34d399]">{t.latencyMs}ms</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                            t.status === "success"
                              ? "bg-[#34d399]/15 text-[#34d399]"
                              : t.status === "fallback"
                              ? "bg-[#fbbf24]/15 text-[#fbbf24]"
                              : "bg-[#fb7185]/15 text-[#fb7185]"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#57647d]">{new Date(t.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

