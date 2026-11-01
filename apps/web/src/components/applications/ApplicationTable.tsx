import React from "react";
import { KanbanApplication } from "./KanbanBoard";
import { Lock, Unlock, MapPin, DollarSign, ExternalLink, Trash2, ArrowUpRight } from "lucide-react";
import { LIFECYCLE_STAGES } from "@track/shared";

interface ApplicationTableProps {
  applications: KanbanApplication[];
  onSelectApplication: (id: string) => void;
  onMoveStage: (id: string, newStage: string) => void;
  onDeleteApplication: (id: string) => void;
}

export const ApplicationTable: React.FC<ApplicationTableProps> = ({
  applications,
  onSelectApplication,
  onMoveStage,
  onDeleteApplication,
}) => {
  return (
    <div className="surface-card border-[#253048] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#253048] bg-[#0e131f] text-[11px] font-mono uppercase text-[#8f9cb5]">
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Role Title</th>
              <th className="py-3 px-4">Stage</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Compensation</th>
              <th className="py-3 px-4">Updated</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#253048]/60 text-xs">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[#57647d] italic">
                  No applications match your filter criteria.
                </td>
              </tr>
            ) : (
              applications.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => onSelectApplication(app.id)}
                  className="hover:bg-[#1a2235]/50 cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 px-4 font-semibold text-[#f1ede6]">
                    <div className="flex items-center gap-2">
                      <span>{app.companyName}</span>
                      {app.stageLocked && (
                        <span title="Stage Locked" className="text-[#fbbf24]">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-[#f1ede6] font-medium group-hover:text-[#d4a853] transition-colors">
                    {app.roleTitle}
                  </td>

                  <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={app.currentStage}
                      onChange={(e) => onMoveStage(app.id, e.target.value)}
                      className="px-2 py-1 rounded bg-[#1a2235] border border-[#253048] text-[11px] font-semibold uppercase text-[#d4a853] focus:outline-none focus:border-[#d4a853]"
                    >
                      {LIFECYCLE_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-3.5 px-4 text-[#8f9cb5]">
                    {app.location || "—"}
                  </td>

                  <td className="py-3.5 px-4 text-[#34d399] font-mono">
                    {app.salaryMin || app.salaryMax
                      ? `$${app.salaryMin?.toLocaleString("en-US") || ""}${
                          app.salaryMin && app.salaryMax ? " - $" : ""
                        }${app.salaryMax?.toLocaleString("en-US") || ""}`
                      : "—"}
                  </td>

                  <td className="py-3.5 px-4 text-[#57647d] font-mono text-[11px]">
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </td>

                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {app.jobUrl && (
                        <a
                          href={app.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Job Listing"
                          className="p-1 rounded text-[#8f9cb5] hover:text-[#60a5fa] hover:bg-[#1a2235]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => onDeleteApplication(app.id)}
                        title="Delete application"
                        className="p-1 rounded text-[#8f9cb5] hover:text-[#fb7185] hover:bg-[#fb7185]/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

