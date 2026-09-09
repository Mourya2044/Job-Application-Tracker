import React from "react"
import { Droppable } from "@hello-pangea/dnd"
import { ApplicationCard } from "./ApplicationCard"
import { Inbox } from "lucide-react"

const STAGE_CONFIG = {
  applied: {
    color: "#60a5fa",
    bgMuted: "rgba(96, 165, 250, 0.12)",
  },
  screening: {
    color: "#fbbf24",
    bgMuted: "rgba(251, 191, 36, 0.12)",
  },
  interview: {
    color: "#a78bfa",
    bgMuted: "rgba(167, 139, 250, 0.12)",
  },
  interviewing: {
    color: "#a78bfa",
    bgMuted: "rgba(167, 139, 250, 0.12)",
  },
  offer: {
    color: "#4ade80",
    bgMuted: "rgba(74, 222, 128, 0.12)",
  },
  accepted: {
    color: "#4ade80",
    bgMuted: "rgba(74, 222, 128, 0.12)",
  },
  rejected: {
    color: "#fb7185",
    bgMuted: "rgba(251, 113, 133, 0.12)",
  },
  withdrawn: {
    color: "#556178",
    bgMuted: "rgba(85, 97, 120, 0.12)",
  },
}

export function KanbanColumn({ 
  stage, 
  label, 
  applications = [], 
  onOpenDetails, 
  onStageChange, 
  onToggleLock, 
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion
}) {
  const config = STAGE_CONFIG[stage?.toLowerCase()] || STAGE_CONFIG.applied

  return (
    <div className="flex flex-col w-[290px] shrink-0 bg-[#131926] border border-[#253048] rounded-xl transition-all duration-200">
      {/* Column Header */}
      <div className="p-4 flex items-center gap-2.5 border-b border-[#253048] shrink-0">
        <div 
          className="w-[3px] h-6 rounded-full shrink-0" 
          style={{ backgroundColor: config.color }} 
        />
        <div className="flex-1 font-mono text-xs font-semibold uppercase tracking-wider text-[#8a94a8]">
          {label}
        </div>
        <div 
          className="font-serif text-xs font-bold w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ backgroundColor: config.bgMuted, color: config.color }}
        >
          {applications.length}
        </div>
      </div>

      {/* Column Droppable Body */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 flex flex-col gap-2.5 min-h-[480px] transition-all rounded-b-xl ${
              snapshot.isDraggingOver 
                ? "bg-[rgba(212,168,53,0.04)] ring-1 ring-[#d4a853]/60 shadow-[0_0_24px_rgba(212,168,53,0.06)]" 
                : ""
            }`}
          >
            {applications.map((app, index) => (
              <ApplicationCard
                key={app.id}
                application={app}
                index={index}
                stageColor={config.color}
                onOpenDetails={onOpenDetails}
                onStageChange={onStageChange}
                onToggleLock={onToggleLock}
                onDelete={onDelete}
                onAcceptSuggestion={onAcceptSuggestion}
                onDismissSuggestion={onDismissSuggestion}
              />
            ))}
            {provided.placeholder}

            {snapshot.isDraggingOver && (
              <div className="border-2 border-dashed border-[#d4a853]/50 rounded-lg p-3 text-center font-mono text-[11px] text-[#d4a853] bg-[rgba(212,168,53,0.06)] mt-auto">
                Drop here to move
              </div>
            )}

            {applications.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#556178] text-center">
                <Inbox className="w-6 h-6 stroke-1 opacity-30 mb-2" />
                <span className="font-mono text-xs text-[#556178]">No applications</span>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
