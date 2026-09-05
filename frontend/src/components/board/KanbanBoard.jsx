import React from "react"
import { DragDropContext } from "@hello-pangea/dnd"
import { KanbanColumn } from "./KanbanColumn"

export function KanbanBoard({ 
  columns, 
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-6 pt-1 select-none scroll-smooth">
        {columns.map((column) => (
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
    </DragDropContext>
  )
}
