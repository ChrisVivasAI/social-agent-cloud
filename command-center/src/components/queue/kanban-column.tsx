"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { QueueCard } from "./queue-card";
import { EmptyState } from "@/components/shared/empty-state";
import { STATUS_COLORS } from "@/lib/constants";
import type { ContentQueueItem } from "@/lib/supabase/types";
import { Inbox } from "lucide-react";

interface KanbanColumnProps {
  id: string;
  title: string;
  items: ContentQueueItem[];
  onItemClick: (item: ContentQueueItem) => void;
}

export function KanbanColumn({ id, title, items, onItemClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const colors = STATUS_COLORS[id] || { bg: "bg-gray-500/20", text: "text-gray-400" };

  return (
    <div
      className={`flex flex-col min-w-[280px] w-[280px] rounded-lg border transition-colors ${
        isOver ? "border-primary/50 bg-primary/5" : "border-border bg-card/50"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colors.bg.replace("/20", "")}`} />
          <h3 className="text-sm font-medium text-foreground">
            {title}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-220px)]"
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="w-8 h-8" />}
              title="No items"
              className="py-8"
            />
          ) : (
            items.map((item) => (
              <QueueCard key={item.id} item={item} onClick={onItemClick} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
