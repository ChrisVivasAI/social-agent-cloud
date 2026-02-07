"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CalendarEvent, CalendarEventOverlay } from "./calendar-event";
import { Toolbar } from "./toolbar";
import { Preview } from "@/components/queue/preview";
import { EditDialog } from "@/components/queue/edit-dialog";
import { RescheduleDialog } from "@/components/queue/reschedule-dialog";
import { useQueueItems } from "@/hooks/use-queue";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import type { ContentQueueItem, ContentType, Platform, ContentStatus } from "@/lib/supabase/types";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonthDays(date: Date): Date[] {
  const first = startOfMonth(date);
  const start = startOfWeek(first);
  // Always show 6 rows
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function DayCell({
  date,
  items,
  isCurrentMonth,
  isToday,
  view,
  onItemClick,
}: {
  date: Date;
  items: ContentQueueItem[];
  isCurrentMonth: boolean;
  isToday: boolean;
  view: "week" | "month";
  onItemClick: (item: ContentQueueItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey(date) });
  const isWeek = view === "week";

  return (
    <div
      ref={setNodeRef}
      className={`border-r border-b border-border transition-colors ${
        isOver ? "bg-primary/5" : ""
      } ${isWeek ? "min-h-[calc(100vh-260px)]" : "min-h-[100px]"} ${
        !isCurrentMonth ? "opacity-40" : ""
      }`}
    >
      <div className="px-2 py-1 text-right">
        <span
          className={`text-xs font-medium ${
            isToday
              ? "bg-primary text-primary-foreground rounded-full px-1.5 py-0.5"
              : "text-muted-foreground"
          }`}
        >
          {date.getDate()}
        </span>
      </div>
      <div className="px-1 pb-1 space-y-0.5">
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          {items.map((item) => (
            <CalendarEvent
              key={item.id}
              item={item}
              onClick={onItemClick}
              compact={!isWeek}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

async function callAction(id: string, action: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api/proxy/api/queue/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error("Action failed");
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
  if (!res.ok) throw new Error("Edit failed");
}

async function callReschedule(id: string, scheduledFor: string) {
  const res = await fetch(`/api/proxy/api/queue/${id}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_for: scheduledFor }),
  });
  if (!res.ok) throw new Error("Reschedule failed");
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView() {
  const { items, loading } = useQueueItems();
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterType, setFilterType] = useState<ContentType | "all">("all");
  const [filterPlatform, setFilterPlatform] = useState<Platform | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ContentStatus | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentQueueItem | null>(null);
  const [editItem, setEditItem] = useState<ContentQueueItem | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<ContentQueueItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterPlatform !== "all" && item.platform !== filterPlatform) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      return true;
    });
  }, [items, filterType, filterPlatform, filterStatus]);

  const days = view === "week" ? getWeekDays(currentDate) : getMonthDays(currentDate);
  const today = new Date();

  const itemsByDay = useMemo(() => {
    const map: Record<string, ContentQueueItem[]> = {};
    for (const day of days) {
      map[dateKey(day)] = [];
    }
    for (const item of filtered) {
      if (!item.scheduled_for) continue;
      const d = new Date(item.scheduled_for);
      const key = dateKey(d);
      if (map[key]) {
        map[key].push(item);
      }
    }
    // Sort each day by time
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const ta = a.scheduled_for ? new Date(a.scheduled_for).getTime() : 0;
        const tb = b.scheduled_for ? new Date(b.scheduled_for).getTime() : 0;
        return ta - tb;
      });
    }
    return map;
  }, [filtered, days]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function navigate(dir: "prev" | "next" | "today") {
    if (dir === "today") {
      setCurrentDate(new Date());
      return;
    }
    const d = new Date(currentDate);
    if (view === "week") {
      d.setDate(d.getDate() + (dir === "next" ? 7 : -7));
    } else {
      d.setMonth(d.getMonth() + (dir === "next" ? 1 : -1));
    }
    setCurrentDate(d);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const item = items.find((i) => i.id === active.id);
      if (!item) return;

      const targetKey = String(over.id);
      // Parse target date key
      const parts = targetKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!parts) return;

      const targetDate = new Date(
        parseInt(parts[1]),
        parseInt(parts[2]) - 1,
        parseInt(parts[3])
      );

      // Preserve original time, change date
      const originalDate = item.scheduled_for ? new Date(item.scheduled_for) : new Date();
      targetDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);

      const newIso = targetDate.toISOString();
      if (item.scheduled_for && new Date(item.scheduled_for).toISOString() === newIso) return;

      try {
        await callReschedule(item.id, newIso);
      } catch {
        // Realtime will revert
      }
    },
    [items]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted animate-pulse rounded-md" />
        <div className="grid grid-cols-7 gap-0">
          {Array.from({ length: 14 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <Toolbar
          view={view}
          onViewChange={setView}
          currentDate={currentDate}
          onNavigate={navigate}
          filterType={filterType}
          onFilterType={setFilterType}
          filterPlatform={filterPlatform}
          onFilterPlatform={setFilterPlatform}
          filterStatus={filterStatus}
          onFilterStatus={setFilterStatus}
        />

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="px-2 py-1.5 text-xs font-medium text-muted-foreground text-center border-r border-border last:border-r-0"
                >
                  {name}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className={`grid grid-cols-7 ${view === "month" ? "" : ""}`}>
              {days.map((day) => (
                <DayCell
                  key={dateKey(day)}
                  date={day}
                  items={itemsByDay[dateKey(day)] || []}
                  isCurrentMonth={day.getMonth() === currentDate.getMonth()}
                  isToday={isSameDay(day, today)}
                  view={view}
                  onItemClick={setSelectedItem}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeItem ? <CalendarEventOverlay item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

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
