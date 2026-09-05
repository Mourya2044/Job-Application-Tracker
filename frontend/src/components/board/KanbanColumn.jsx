import React from "react"
import { Droppable } from "@hello-pangea/dnd"
import { ApplicationCard } from "./ApplicationCard"

const STAGE_CONFIG = {
  applied: {
    dotColor: "bg-sky-400",
  },
  screening: {
    dotColor: "bg-amber-400",
  },
  interviewing: {
    dotColor: "bg-violet-400",
  },
  offer: {
    dotColor: "bg-emerald-400",
  },
  accepted: {
    dotColor: "bg-teal-400",
  },
  rejected: {
    dotColor: "bg-rose-400",
  },
  withdrawn: {
    dotColor: "bg-zinc-500",
  },
}

export function KanbanColumn({ 
  stage, 
  label, 
  applications, 
  onOpenDetails, 
  onStageChange, 
  onToggleLock, 
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion
}) {
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.applied

  return (
    <div className="flex flex-col flex-1 min-w-[270px] max-w-[320px] rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm shadow-none">
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
          <span className="font-medium text-xs text-foreground/90 tracking-tight">
            {label}
          </span>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground/80 bg-muted/40 px-1.5 py-0.5 rounded">
          {applications.length}
        </span>
      </div>

      {/* Column Droppable Area */}
      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2.5 min-h-[480px] transition-colors rounded-b-xl ${
              snapshot.isDraggingOver ? "bg-primary/5 ring-1 ring-primary/20" : ""
            }`}
          >
            {applications.map((app, index) => (
              <ApplicationCard
                key={app.id}
                application={app}
                index={index}
                onOpenDetails={onOpenDetails}
                onStageChange={onStageChange}
                onToggleLock={onToggleLock}
                onDelete={onDelete}
                onAcceptSuggestion={onAcceptSuggestion}
                onDismissSuggestion={onDismissSuggestion}
              />
            ))}
            {provided.placeholder}

            {applications.length === 0 && !snapshot.isDraggingOver && (
              <div className="h-28 flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 text-muted-foreground/40 text-[11px]">
                <span>No applications</span>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}
