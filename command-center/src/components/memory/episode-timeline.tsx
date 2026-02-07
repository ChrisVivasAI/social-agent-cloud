"use client";

import { Clock, Pencil, Check, X, SkipForward, BarChart3, MessageSquare, Compass } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { AgentMemoryEntry, EpisodeType } from "@/lib/supabase/types";

interface EpisodeTimelineProps {
  episodes: AgentMemoryEntry[];
  isLoading: boolean;
}

const EPISODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  edit: Pencil,
  approve: Check,
  reject: X,
  skip: SkipForward,
  performance: BarChart3,
  video_feedback: MessageSquare,
  creative_direction: Compass,
};

const EPISODE_COLORS: Record<string, string> = {
  edit: "text-blue-400",
  approve: "text-green-400",
  reject: "text-red-400",
  skip: "text-gray-400",
  performance: "text-yellow-400",
  video_feedback: "text-purple-400",
  creative_direction: "text-indigo-400",
};

export function EpisodeTimeline({ episodes, isLoading }: EpisodeTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-12 h-12" />}
        title="No learning episodes"
        description="Episodes will appear as the agent processes feedback."
      />
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4">
        {episodes.map((ep) => {
          const type = ep.episode_type || "edit";
          const Icon = EPISODE_ICON[type] || Pencil;
          const color = EPISODE_COLORS[type] || "text-gray-400";

          return (
            <div key={ep.id} className="relative flex gap-3">
              <div
                className={`absolute -left-3.5 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center ${color}`}
              >
                <Icon className="w-3 h-3" />
              </div>
              <div className="flex-1 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground capitalize">
                    {type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(ep.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/80">{ep.content_text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
