"use client";

import { KanbanBoard } from "@/components/queue/kanban-board";

export default function QueuePage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Content Queue</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drag cards between columns to manage content status.
        </p>
      </div>
      <KanbanBoard />
    </div>
  );
}
