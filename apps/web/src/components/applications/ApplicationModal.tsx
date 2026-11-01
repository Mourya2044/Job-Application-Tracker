import React, { useState } from "react";
import { apiFetch } from "../../api/client";
import { X, Building2, Briefcase, DollarSign, MapPin, Globe, Lock } from "lucide-react";
import { LIFECYCLE_STAGES } from "@track/shared";

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ApplicationModal: React.FC<ApplicationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [companyName, setCompanyName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [currentStage, setCurrentStage] = useState("applied");
  const [jobUrl, setJobUrl] = useState("");
  const [location, setLocation] = useState("");
  const [salaryMin, setSalaryMin] = useState<number | "">("");
  const [salaryMax, setSalaryMax] = useState<number | "">("");
  const [stageLocked, setStageLocked] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await apiFetch("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          companyName,
          roleTitle,
          currentStage,
          jobUrl: jobUrl || null,
          location: location || null,
          salaryMin: salaryMin !== "" ? Number(salaryMin) : null,
          salaryMax: salaryMax !== "" ? Number(salaryMax) : null,
          stageLocked,
          notes: notes || null,
          tags: [],
        }),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || err?.error || "Failed to create application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-[#131926] border border-[#253048] rounded-xl shadow-2xl p-6 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-[#8f9cb5] hover:text-[#f1ede6] hover:bg-[#1a2235] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-[#f1ede6] mb-1">Track New Application</h2>
        <p className="text-xs text-[#8f9cb5] mb-5">
          Record a new position to monitor lifecycle transitions, email updates, and interview milestones.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Company *</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Stripe"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Role Title *</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineer"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Initial Stage</label>
              <select
                value={currentStage}
                onChange={(e) => setCurrentStage(e.target.value)}
                className="w-full px-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
              >
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Location</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="text"
                  placeholder="Remote / San Francisco, CA"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Min Salary ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="number"
                  placeholder="140000"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value ? Number(e.target.value) : "")}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Max Salary ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
                <input
                  type="number"
                  placeholder="190000"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value ? Number(e.target.value) : "")}
                  className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#8f9cb5] mb-1">Job Listing URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
              <input
                type="url"
                placeholder="https://company.com/careers/job-id"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#0c1019] border border-[#253048] rounded-md text-sm text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
              />
            </div>
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stageLocked}
                onChange={(e) => setStageLocked(e.target.checked)}
                className="rounded border-[#253048] text-[#d4a853] focus:ring-[#d4a853] bg-[#0c1019]"
              />
              <span className="text-xs text-[#f1ede6] flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-[#d4a853]" />
                Lock Stage (protects against automatic overwrite from background mailbox sync)
              </span>
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Create Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

