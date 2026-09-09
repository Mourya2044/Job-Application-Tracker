import React from "react"
import { DragDropContext } from "@hello-pangea/dnd"
import { KanbanColumn } from "./KanbanColumn"

export function KanbanBoard({ 
  columns = [], 
  onStageChange, 
  onOpenDetails, 
  onToggleLock, 
  onDelete,
  onAcceptSuggestion,
  onDismissSuggestion
}) {
  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result
    if (!destination) return

    // If dropped in same column and same position, do nothing
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    const newStage = destination.droppableId
    onStageChange(draggableId, newStage, `Moved via drag-and-drop to ${newStage}`)
  }

  // Ensure stages shown match code.html order
  // applied, screening, interview(ing), offer, rejected
  const desiredOrder = ["applied", "screening", "interviewing", "interview", "offer", "rejected"]
  const orderedColumns = [...columns].sort((a, b) => {
    const idxA = desiredOrder.indexOf(a.stage.toLowerCase())
    const idxB = desiredOrder.indexOf(b.stage.toLowerCase())
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
  }).filter(c => ["applied", "screening", "interviewing", "interview", "offer", "rejected"].includes(c.stage.toLowerCase()))

  const displayColumns = orderedColumns.length > 0 ? orderedColumns : columns

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-8 pt-1 select-none">
        <div className="flex gap-4 min-w-max min-h-[calc(100vh-320px)]">
          {displayColumns.map((column) => (
            <KanbanColumn
              key={column.stage}
              stage={column.stage}
              label={column.label}
              applications={column.applications}
              onOpenDetails={onOpenDetails}
              onStageChange={onStageChange}
              onToggleLock={onToggleLock}
              onDelete={onDelete}
              onAcceptSuggestion={onAcceptSuggestion}
              onDismissSuggestion={onDismissSuggestion}
            />
          ))}
        </div>
      </div>
    </DragDropContext>
  )
}
