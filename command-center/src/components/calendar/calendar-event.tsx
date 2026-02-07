"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlatformIcon } from "@/components/shared/platform-icon";
import type { ContentQueueItem } from "@/lib/supabase/types";

const TYPE_COLORS: Record<string, string> = {
  link: "bg-blue-500/80 border-blue-500",
  image: "bg-purple-500/80 border-purple-500",
  video: "bg-red-500/80 border-red-500",
  text: "bg-green-500/80 border-green-500",
  remotion: "bg-orange-500/80 border-orange-500",
  video_edit: "bg-pink-500/80 border-pink-500",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-yellow-400",
  generating: "bg-blue-400",
  awaiting_approval: "bg-orange-400",
  ready: "bg-green-400",
  posted: "bg-emerald-400",
  failed: "bg-red-400",
  paused: "bg-gray-400",
};

interface CalendarEventProps {
  item: ContentQueueItem;
  onClick: (item: ContentQueueItem) => void;
  compact?: boolean;
}

function getPostTitle(item: ContentQueueItem): string {
  const text =
    item.generated_post_twitter ||
    item.generated_post_linkedin ||
    item.generated_post ||
    item.source_text ||
    item.type;
  return text.length > 40 ? text.slice(0, 40) + "..." : text;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarEvent({ item, onClick, compact }: CalendarEventProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const colorClass = TYPE_COLORS[item.type] || "bg-gray-500/80 border-gray-500";
  const dotClass = STATUS_DOT[item.status] || "bg-gray-400";
  const time = formatTime(item.scheduled_for);
  const title = getPostTitle(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(item)}
      className={`rounded px-2 py-1 text-xs border-l-2 cursor-pointer transition-opacity hover:opacity-80 ${colorClass} ${
        isDragging ? "opacity-50" : ""
      } ${compact ? "py-0.5" : ""}`}
    >
      <div className="flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        {time && <span className="text-white/70 flex-shrink-0">{time}</span>}
        <PlatformIcon platform={item.platform} className="w-3 h-3 text-white/70 flex-shrink-0" />
      </div>
      {!compact && (
        <p className="text-white/90 truncate mt-0.5 leading-tight">{title}</p>
      )}
    </div>
  );
}

export function CalendarEventOverlay({ item }: { item: ContentQueueItem }) {
  const colorClass = TYPE_COLORS[item.type] || "bg-gray-500/80 border-gray-500";
  const time = formatTime(item.scheduled_for);
  const title = getPostTitle(item);

  return (
    <div className={`rounded px-2 py-1 text-xs border-l-2 shadow-lg ring-2 ring-primary/30 ${colorClass}`}>
      <div className="flex items-center gap-1">
        {time && <span className="text-white/70">{time}</span>}
        <PlatformIcon platform={item.platform} className="w-3 h-3 text-white/70" />
      </div>
      <p className="text-white/90 truncate mt-0.5">{title}</p>
    </div>
  );
}
