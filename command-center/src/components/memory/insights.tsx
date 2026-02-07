"use client";

import { Lightbulb } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { PerformanceInsight } from "@/lib/supabase/types";

interface InsightsProps {
  insights: PerformanceInsight[];
  isLoading: boolean;
}

const INSIGHT_TYPE_COLORS: Record<string, string> = {
  engagement_pattern: "bg-blue-500/20 text-blue-400",
  content_type_performance: "bg-green-500/20 text-green-400",
  timing_optimization: "bg-yellow-500/20 text-yellow-400",
  audience_preference: "bg-purple-500/20 text-purple-400",
  template_performance: "bg-indigo-500/20 text-indigo-400",
  topic_performance: "bg-teal-500/20 text-teal-400",
};

export function InsightsList({ insights, isLoading }: InsightsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb className="w-12 h-12" />}
        title="No insights yet"
        description="Performance insights will appear as the agent learns."
      />
    );
  }

  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`rounded-lg border bg-card p-4 space-y-2 ${
            insight.is_active ? "border-border" : "border-border/50 opacity-60"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-foreground/90 flex-1">{insight.insight_text}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  INSIGHT_TYPE_COLORS[insight.insight_type] || "bg-gray-500/20 text-gray-400"
                }`}
              >
                {insight.insight_type.replace(/_/g, " ")}
              </span>
              {!insight.is_active && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                  inactive
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Confidence: {Math.round(insight.confidence * 100)}%</span>
            {insight.applicable_to.platform && (
              <span>Platform: {insight.applicable_to.platform}</span>
            )}
            {insight.applicable_to.content_type && (
              <span>Type: {insight.applicable_to.content_type}</span>
            )}
            <span>{new Date(insight.generated_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
