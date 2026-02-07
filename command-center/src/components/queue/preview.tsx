"use client";

import { ContentTypeIcon } from "@/components/shared/content-type-icon";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueueActions } from "./queue-actions";
import type { ContentQueueItem } from "@/lib/supabase/types";
import { X, Clock, Hash, Calendar, AlertCircle } from "lucide-react";

interface PreviewProps {
  item: ContentQueueItem | null;
  onClose: () => void;
  onAction: (id: string, action: string, body?: Record<string, unknown>) => Promise<void>;
  onEdit: (item: ContentQueueItem) => void;
  onReschedule: (item: ContentQueueItem) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Preview({ item, onClose, onAction, onEdit, onReschedule }: PreviewProps) {
  if (!item) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md border-l border-border bg-card shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ContentTypeIcon type={item.type} className="w-4 h-4 text-muted-foreground" />
          <PlatformIcon platform={item.platform} className="w-4 h-4 text-muted-foreground" />
          <StatusBadge status={item.status} />
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {item.generated_post_twitter && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <PlatformIcon platform="twitter" className="w-3.5 h-3.5" />
              Twitter
            </h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{item.generated_post_twitter}</p>
          </div>
        )}

        {item.generated_post_linkedin && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <PlatformIcon platform="linkedin" className="w-3.5 h-3.5" />
              LinkedIn
            </h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{item.generated_post_linkedin}</p>
          </div>
        )}

        {!item.generated_post_twitter && !item.generated_post_linkedin && item.generated_post && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Post</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{item.generated_post}</p>
          </div>
        )}

        {(item.image_url || item.remotion_video_url || item.media_url) && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Media</h4>
            {item.remotion_video_url ? (
              <video
                src={item.remotion_video_url}
                controls
                className="w-full rounded-md"
              />
            ) : item.media_url && item.media_mime_type?.startsWith("video") ? (
              <video
                src={item.media_url}
                controls
                className="w-full rounded-md"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.image_url || item.media_url || ""}
                alt=""
                className="w-full rounded-md"
              />
            )}
          </div>
        )}

        {item.source_text && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Source</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">{item.source_text}</p>
          </div>
        )}

        {item.report && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Report</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">{item.report}</p>
          </div>
        )}

        {item.error_message && (
          <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Error
            </div>
            <p className="text-sm text-red-300">{item.error_message}</p>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              Created
            </div>
            <div className="text-foreground">{formatDate(item.created_at)}</div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Scheduled
            </div>
            <div className="text-foreground">{formatDate(item.scheduled_for)}</div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="w-3.5 h-3.5" />
              Priority
            </div>
            <div className="text-foreground">{item.priority}</div>
          </div>
          {item.posted_at && (
            <div className="grid grid-cols-2 gap-2">
              <div className="text-muted-foreground">Posted at</div>
              <div className="text-foreground">{formatDate(item.posted_at)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border">
        <QueueActions
          item={item}
          onAction={onAction}
          onEdit={onEdit}
          onReschedule={onReschedule}
        />
      </div>
    </div>
  );
}
