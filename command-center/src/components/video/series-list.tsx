"use client";

import { useState, useEffect } from "react";
import { Layers, ChevronDown, ChevronRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VideoSeries } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export function SeriesList() {
  const [series, setSeries] = useState<VideoSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from("video_series")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setSeries(data as VideoSeries[]);
      setLoading(false);
    }
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="w-12 h-12" />}
        title="No video series"
        description="Video series will appear here once created."
      />
    );
  }

  return (
    <div className="space-y-3">
      {series.map((s) => {
        const isExpanded = expandedId === s.id;
        const episodeCount = s.episode_plan?.length ?? 0;

        return (
          <div
            key={s.id}
            className="rounded-lg border border-border bg-card"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors rounded-lg"
            >
              <div className="space-y-1 min-w-0">
                <h3 className="font-medium text-foreground text-sm">{s.title}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{s.project_type.replace(/_/g, " ")}</span>
                  <span>{episodeCount} episode{episodeCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">{s.concept}</p>

                {s.episode_plan && s.episode_plan.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Episode Plan
                    </h4>
                    <div className="space-y-1.5">
                      {s.episode_plan.map((ep) => (
                        <div
                          key={ep.episode_number}
                          className="flex items-center gap-3 text-sm p-2 rounded bg-muted/30"
                        >
                          <span className="text-muted-foreground text-xs font-mono w-6">
                            #{ep.episode_number}
                          </span>
                          <span className="text-foreground flex-1 truncate">{ep.title}</span>
                          <StatusBadge status={ep.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {s.continuity?.narrative_arc && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Narrative Arc
                    </h4>
                    <p className="text-sm text-foreground">{s.continuity.narrative_arc}</p>
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
