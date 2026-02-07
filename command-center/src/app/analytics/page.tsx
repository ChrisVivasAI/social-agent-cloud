"use client";

import { useState } from "react";
import { useAnalytics, type DateRange } from "@/hooks/use-analytics";
import { EngagementChart } from "@/components/analytics/engagement-chart";
import { PlatformComparison } from "@/components/analytics/platform-comparison";
import { ContentTypeChart } from "@/components/analytics/content-type-chart";
import { TimingHeatmap } from "@/components/analytics/timing-heatmap";
import { TopPosts } from "@/components/analytics/top-posts";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart3 } from "lucide-react";

const RANGES: { label: string; value: DateRange }[] = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
  { label: "All Time", value: "all" },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange>("30d");
  const { dailyMetrics, platformComparison, contentTypeMetrics, timingData, topPosts, loading, error } =
    useAnalytics(range);

  const isEmpty =
    !loading &&
    dailyMetrics.length === 0 &&
    topPosts.length === 0;

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              range === r.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <CardSkeleton />
          <div className="grid grid-cols-2 gap-6">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<BarChart3 className="w-12 h-12" />}
          title="No analytics data yet"
          description="Post some content and check back later to see performance analytics."
        />
      ) : (
        <div className="space-y-6">
          <EngagementChart data={dailyMetrics} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PlatformComparison data={platformComparison} />
            <ContentTypeChart data={contentTypeMetrics} />
          </div>

          <TimingHeatmap data={timingData} />

          <TopPosts data={topPosts} />
        </div>
      )}
    </div>
  );
}
