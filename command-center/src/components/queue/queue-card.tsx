"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ContentTypeIcon } from "@/components/shared/content-type-icon";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import type { ContentQueueItem } from "@/lib/supabase/types";
import { Clock, GripVertical } from "lucide-react";

interface QueueCardProps {
  item: ContentQueueItem;
  onClick: (item: ContentQueueItem) => void;
}

function getPostText(item: ContentQueueItem): string {
  return (
    item.generated_post_twitter ||
    item.generated_post_linkedin ||
    item.generated_post ||
    item.source_text ||
    "No content yet"
  );
}

function formatScheduledTime(scheduled_for: string | null): string | null {
  if (!scheduled_for) return null;
  const date = new Date(scheduled_for);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function QueueCard({ item, onClick }: QueueCardProps) {
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

  const text = getPostText(item);
  const scheduledTime = formatScheduledTime(item.scheduled_for);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-zinc-600 transition-colors ${
        isDragging ? "opacity-50 shadow-lg ring-2 ring-primary/50" : ""
      }`}
      onClick={() => onClick(item)}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <ContentTypeIcon type={item.type} className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <PlatformIcon platform={item.platform} className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <StatusBadge status={item.status} />
          </div>
          <p className="text-sm text-foreground line-clamp-2 leading-snug">
            {text.length > 80 ? text.slice(0, 80) + "..." : text}
          </p>
          {item.image_url && (
            <div className="mt-2 rounded-md overflow-hidden bg-muted h-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {scheduledTime && (
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {scheduledTime}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function QueueCardOverlay({ item }: { item: ContentQueueItem }) {
  const text = getPostText(item);
  return (
    <div className="rounded-lg border border-primary/50 bg-card p-3 shadow-xl ring-2 ring-primary/30 w-72">
      <div className="flex items-center gap-2 mb-1.5">
        <ContentTypeIcon type={item.type} className="w-3.5 h-3.5 text-muted-foreground" />
        <PlatformIcon platform={item.platform} className="w-3.5 h-3.5 text-muted-foreground" />
        <StatusBadge status={item.status} />
      </div>
      <p className="text-sm text-foreground line-clamp-2 leading-snug">
        {text.length > 80 ? text.slice(0, 80) + "..." : text}
      </p>
    </div>
  );
}
