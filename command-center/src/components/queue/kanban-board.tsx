"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { QueueCardOverlay } from "./queue-card";
import { Preview } from "./preview";
import { EditDialog } from "./edit-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import { useQueueItems } from "@/hooks/use-queue";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import type { ContentQueueItem, ContentStatus, Platform } from "@/lib/supabase/types";

const COLUMNS: { id: ContentStatus; title: string }[] = [
  { id: "pending", title: "Pending" },
  { id: "generating", title: "Generating" },
  { id: "awaiting_approval", title: "Awaiting Approval" },
  { id: "ready", title: "Ready" },
  { id: "posted", title: "Posted" },
  { id: "failed", title: "Failed" },
];

async function callAction(id: string, action: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api/proxy/api/queue/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Action failed: ${text}`);
  }
}

async function callEdit(
  id: string,
  data: { twitter_text?: string; linkedin_text?: string; platform?: Platform }
) {
  const res = await fetch(`/api/proxy/api/queue/${id}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Edit failed: ${text}`);
  }
}

async function callReschedule(id: string, scheduledFor: string) {
  const res = await fetch(`/api/proxy/api/queue/${id}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_for: scheduledFor }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Reschedule failed: ${text}`);
  }
}

const STATUS_ACTION_MAP: Partial<Record<ContentStatus, string>> = {
  pending: "pause",
  awaiting_approval: "approve",
  ready: "resume",
  posted: "approve",
  failed: "retry",
};

export function KanbanBoard() {
  const { items, loading } = useQueueItems();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentQueueItem | null>(null);
  const [editItem, setEditItem] = useState<ContentQueueItem | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<ContentQueueItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columns = useMemo(() => {
    const grouped: Record<string, ContentQueueItem[]> = {};
    for (const col of COLUMNS) {
      grouped[col.id] = [];
    }
    for (const item of items) {
      const key = item.status;
      if (grouped[key]) {
        grouped[key].push(item);
      } else if (key === "generated" || key === "rendering") {
        grouped["generating"]?.push(item);
      } else if (key === "posting") {
        grouped["ready"]?.push(item);
      } else if (key === "skipped" || key === "paused") {
        grouped["pending"]?.push(item);
      }
    }
    return grouped;
  }, [items]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback handled by droppable isOver
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const item = items.find((i) => i.id === active.id);
      if (!item) return;

      // Determine target column
      let targetStatus: ContentStatus | undefined;
      // Check if dropped on a column
      for (const col of COLUMNS) {
        if (over.id === col.id) {
          targetStatus = col.id;
          break;
        }
      }
      // Or dropped on another card - find its column
      if (!targetStatus) {
        const overItem = items.find((i) => i.id === over.id);
        if (overItem) {
          targetStatus = overItem.status;
        }
      }

      if (!targetStatus || targetStatus === item.status) return;

      // Map status transition to API action
      const actionMap: Record<string, string> = {
        [`${item.status}->awaiting_approval`]: "approve",
        [`${item.status}->ready`]: "approve",
        [`${item.status}->posted`]: "approve",
        [`pending->generating`]: "retry",
        [`failed->pending`]: "retry",
        [`failed->generating`]: "retry",
      };

      const mapKey = `${item.status}->${targetStatus}`;
      const action = actionMap[mapKey] || STATUS_ACTION_MAP[targetStatus];

      if (action) {
        try {
          await callAction(item.id, action);
        } catch {
          // Realtime will revert if failed
        }
      }
    },
    [items]
  );

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className="min-w-[280px] w-[280px] space-y-2">
            <div className="h-10 rounded-t-lg bg-muted animate-pulse" />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              items={columns[col.id] || []}
              onItemClick={setSelectedItem}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? <QueueCardOverlay item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      <Preview
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAction={callAction}
        onEdit={(item) => {
          setEditItem(item);
          setSelectedItem(null);
        }}
        onReschedule={(item) => {
          setRescheduleItem(item);
          setSelectedItem(null);
        }}
      />

      <EditDialog
        item={editItem}
        onSave={callEdit}
        onClose={() => setEditItem(null)}
      />

      <RescheduleDialog
        item={rescheduleItem}
        onSave={callReschedule}
        onClose={() => setRescheduleItem(null)}
      />
    </>
  );
}
