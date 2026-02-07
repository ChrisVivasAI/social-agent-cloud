"use client";

import { useState, useEffect, useCallback } from "react";
import { Lightbulb, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { videoApi } from "@/lib/agent-api";
import type { VideoIdea } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export function IdeaList() {
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("video_ideas")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setIdeas(data as VideoIdea[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  async function handleApprove(id: string) {
    setActing(id);
    try {
      await videoApi.approveIdea(id);
      await fetchIdeas();
    } catch (err) {
      console.error("Failed to approve idea:", err);
    } finally {
      setActing(null);
    }
  }

  async function handleReject(id: string) {
    setActing(id);
    try {
      await videoApi.rejectIdea(id);
      await fetchIdeas();
    } catch (err) {
      console.error("Failed to reject idea:", err);
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb className="w-12 h-12" />}
        title="No video ideas"
        description="Video ideas from the agent will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {ideas.map((idea) => {
        const isExpanded = expandedId === idea.id;
        const canAct = idea.status === "pitched";

        return (
          <div
            key={idea.id}
            className="rounded-lg border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{idea.concept}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{idea.target_platform}</span>
                  {idea.estimated_duration_sec && (
                    <span>{idea.estimated_duration_sec}s</span>
                  )}
                  <StatusBadge status={idea.status} />
                </div>
              </div>

              {canAct && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleApprove(idea.id)}
                    disabled={acting === idea.id}
                    className="p-1.5 rounded-md hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-50"
                    title="Approve"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleReject(idea.id)}
                    disabled={acting === idea.id}
                    className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                    title="Reject"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {idea.rationale && (
              <p className="text-xs text-muted-foreground">{idea.rationale}</p>
            )}

            {idea.feedback_history && idea.feedback_history.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  {idea.feedback_history.length} feedback item{idea.feedback_history.length !== 1 ? "s" : ""}
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-1.5 pl-4 border-l border-border">
                    {idea.feedback_history.map((fb, i) => (
                      <div key={i} className="text-xs">
                        <p className="text-foreground">{fb.feedback}</p>
                        {fb.refined_concept && (
                          <p className="text-muted-foreground mt-0.5">
                            Refined: {fb.refined_concept}
                          </p>
                        )}
                        <p className="text-muted-foreground/60 mt-0.5">
                          {new Date(fb.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
