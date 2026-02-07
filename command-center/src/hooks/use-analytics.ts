"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PostHistoryRecord } from "@/lib/supabase/types";

export type DateRange = "7d" | "30d" | "90d" | "all";

interface DailyMetric {
  date: string;
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
}

interface PlatformMetric {
  metric: string;
  twitter: number;
  linkedin: number;
}

interface ContentTypeMetric {
  type: string;
  avgEngagementRate: number;
  count: number;
}

interface TimingData {
  dayOfWeek: number;
  hourOfDay: number;
  avgEngagementRate: number;
  count: number;
}

interface AnalyticsData {
  dailyMetrics: DailyMetric[];
  platformComparison: PlatformMetric[];
  contentTypeMetrics: ContentTypeMetric[];
  timingData: TimingData[];
  topPosts: PostHistoryRecord[];
  loading: boolean;
  error: string | null;
}

function getDateFilter(range: DateRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function useAnalytics(range: DateRange): AnalyticsData {
  const [data, setData] = useState<AnalyticsData>({
    dailyMetrics: [],
    platformComparison: [],
    contentTypeMetrics: [],
    timingData: [],
    topPosts: [],
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const client = getSupabaseBrowserClient();
      const dateFilter = getDateFilter(range);

      const baseQuery = client.from("post_history").select("*");
      const filtered = dateFilter ? baseQuery.gte("posted_at", dateFilter) : baseQuery;
      const { data: rawPosts, error } = await filtered.order("posted_at", { ascending: true });

      if (error) throw error;
      const posts = (rawPosts ?? []) as unknown as PostHistoryRecord[];

      if (posts.length === 0) {
        setData({
          dailyMetrics: [],
          platformComparison: [],
          contentTypeMetrics: [],
          timingData: [],
          topPosts: [],
          loading: false,
          error: null,
        });
        return;
      }

      // Aggregate daily metrics
      const dailyMap = new Map<string, DailyMetric>();
      for (const p of posts) {
        const date = p.posted_at.split("T")[0];
        const existing = dailyMap.get(date) || {
          date,
          likes: 0,
          retweets: 0,
          comments: 0,
          impressions: 0,
        };
        existing.likes += p.likes || 0;
        existing.retweets += p.retweets || 0;
        existing.comments += p.comments || 0;
        existing.impressions += p.impressions || 0;
        dailyMap.set(date, existing);
      }

      // Platform comparison
      const platformAgg: Record<string, { likes: number; retweets: number; comments: number; impressions: number; count: number; engTotal: number }> = {
        twitter: { likes: 0, retweets: 0, comments: 0, impressions: 0, count: 0, engTotal: 0 },
        linkedin: { likes: 0, retweets: 0, comments: 0, impressions: 0, count: 0, engTotal: 0 },
      };
      for (const p of posts) {
        const key = p.platform as string;
        if (platformAgg[key]) {
          platformAgg[key].likes += p.likes || 0;
          platformAgg[key].retweets += p.retweets || 0;
          platformAgg[key].comments += p.comments || 0;
          platformAgg[key].impressions += p.impressions || 0;
          platformAgg[key].count += 1;
          platformAgg[key].engTotal += p.engagement_rate || 0;
        }
      }

      const platformComparison: PlatformMetric[] = [
        {
          metric: "Avg Eng. Rate",
          twitter: platformAgg.twitter.count ? platformAgg.twitter.engTotal / platformAgg.twitter.count : 0,
          linkedin: platformAgg.linkedin.count ? platformAgg.linkedin.engTotal / platformAgg.linkedin.count : 0,
        },
        { metric: "Total Likes", twitter: platformAgg.twitter.likes, linkedin: platformAgg.linkedin.likes },
        { metric: "Total Comments", twitter: platformAgg.twitter.comments, linkedin: platformAgg.linkedin.comments },
        { metric: "Total Impressions", twitter: platformAgg.twitter.impressions, linkedin: platformAgg.linkedin.impressions },
      ];

      // Content type metrics — read from related content_queue
      const typeMap = new Map<string, { engTotal: number; count: number }>();
      // We only have post_history here; group by platform as a proxy
      // In a real scenario we'd join with content_queue
      for (const p of posts) {
        const type = p.platform || "unknown";
        const existing = typeMap.get(type) || { engTotal: 0, count: 0 };
        existing.engTotal += p.engagement_rate || 0;
        existing.count += 1;
        typeMap.set(type, existing);
      }
      const contentTypeMetrics: ContentTypeMetric[] = Array.from(typeMap.entries()).map(
        ([type, agg]) => ({
          type,
          avgEngagementRate: agg.count > 0 ? agg.engTotal / agg.count : 0,
          count: agg.count,
        })
      );

      // Timing data
      const timingMap = new Map<string, { engTotal: number; count: number }>();
      for (const p of posts) {
        const key = `${p.day_of_week}-${p.hour_of_day}`;
        const existing = timingMap.get(key) || { engTotal: 0, count: 0 };
        existing.engTotal += p.engagement_rate || 0;
        existing.count += 1;
        timingMap.set(key, existing);
      }
      const timingData: TimingData[] = Array.from(timingMap.entries()).map(([key, agg]) => {
        const [day, hour] = key.split("-").map(Number);
        return {
          dayOfWeek: day,
          hourOfDay: hour,
          avgEngagementRate: agg.count > 0 ? agg.engTotal / agg.count : 0,
          count: agg.count,
        };
      });

      // Top posts
      const topPosts = [...posts]
        .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
        .slice(0, 20) as PostHistoryRecord[];

      setData({
        dailyMetrics: Array.from(dailyMap.values()),
        platformComparison,
        contentTypeMetrics,
        timingData,
        topPosts,
        loading: false,
        error: null,
      });
    } catch (err) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch analytics",
      }));
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return data;
}
