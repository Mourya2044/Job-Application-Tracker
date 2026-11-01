import React, { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { KanbanBoard, KanbanApplication } from "./KanbanBoard";
import { ApplicationTable } from "./ApplicationTable";
import { ApplicationDetailDrawer } from "./ApplicationDetailDrawer";
import { ApplicationModal } from "./ApplicationModal";
import { Search, LayoutGrid, List, Filter, Plus, AlertCircle } from "lucide-react";
import { LIFECYCLE_STAGES } from "@track/shared";

interface ApplicationsViewProps {
  isModalOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  isModalOpen,
  onOpenModal,
  onCloseModal,
}) => {
  const [applications, setApplications] = useState<KanbanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
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
            jobUrl: app.job_url || app.jobUrl || null,
            updatedAt: app.updated_at || app.updatedAt || new Date().toISOString(),
          }))
        );
        setApplications(flattened);
      } else {
        setApplications([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load tracked applications");
    } finally {
      setLoading(false);
    }
  };

  const handleMoveStage = async (id: string, newStage: string) => {
    try {
      await apiFetch(`/api/applications/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ to_stage: newStage }),
      });
      await loadApplications();
    } catch (err: any) {
      alert(err?.message || "Failed to update stage");
    }
  };

  const handleDeleteApplication = async (id: string) => {
    if (!confirm("Are you sure you want to delete this application?")) return;
    try {
      await apiFetch(`/api/applications/${id}`, { method: "DELETE" });
      await loadApplications();
    } catch (err: any) {
      alert(err?.message || "Failed to delete application");
    }
  };

  const filtered = applications.filter((app) => {
    const matchesSearch =
      app.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.roleTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.location && app.location.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStage = selectedStage === "all" || app.currentStage === selectedStage;

    return matchesSearch && matchesStage;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f1ede6]">
            Application Pipeline
          </h1>
          <p className="text-xs text-[#8f9cb5] mt-0.5">
            Manage your opportunities, track stage progressions, and review immutable lifecycle audits.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#131926] border border-[#253048] rounded-md p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                  : "text-[#8f9cb5] hover:text-[#f1ede6]"
              }`}
              title="Kanban Board View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-[#1a2235] text-[#d4a853] shadow-sm"
                  : "text-[#8f9cb5] hover:text-[#f1ede6]"
              }`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onOpenModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#d4a853] text-[#080b12] text-sm font-semibold hover:bg-[#e6c06a] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Application
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#131926] border border-[#253048] p-3 rounded-xl">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#57647d]" />
          <input
            type="text"
            placeholder="Search company, role title, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] placeholder-[#57647d] focus:outline-none focus:border-[#d4a853]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-[#57647d]" />
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-3 py-1.5 bg-[#0c1019] border border-[#253048] rounded-md text-xs text-[#f1ede6] focus:outline-none focus:border-[#d4a853]"
          >
            <option value="all">All Stages</option>
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-md bg-[#fb7185]/10 border border-[#fb7185]/30 text-[#fb7185] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Board / Table Content */}
      {loading ? (
        <div className="py-24 text-center text-sm text-[#8f9cb5]">
          Loading applications...
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          applications={filtered}
          onSelectApplication={(id) => setSelectedAppId(id)}
          onMoveStage={handleMoveStage}
        />
      ) : (
        <ApplicationTable
          applications={filtered}
          onSelectApplication={(id) => setSelectedAppId(id)}
          onMoveStage={handleMoveStage}
          onDeleteApplication={handleDeleteApplication}
        />
      )}

      {/* Modals & Detail Drawers */}
      <ApplicationModal
        isOpen={isModalOpen}
        onClose={onCloseModal}
        onSuccess={loadApplications}
      />

      <ApplicationDetailDrawer
        applicationId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
        onUpdated={loadApplications}
      />
    </div>
  );
};

