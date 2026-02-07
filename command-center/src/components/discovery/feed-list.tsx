"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Rss, Search } from "lucide-react";
import { DiscoveryCard } from "./discovery-card";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { DiscoveredContent } from "@/lib/supabase/types";

interface FeedListProps {
  items: DiscoveredContent[];
  isLoading: boolean;
  onQueue: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

const STATUS_FILTER_OPTIONS = ["all", "new", "queued", "dismissed"] as const;

export function FeedList({ items, isLoading, onQueue, onDismiss }: FeedListProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [collapsedFeeds, setCollapsedFeeds] = useState<Set<string>>(new Set());

  const filtered = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  // Group by source feed
  const grouped = new Map<string, DiscoveredContent[]>();
  for (const item of filtered) {
    const feed = item.source_feed || "Unknown";
    const arr = grouped.get(feed) || [];
    arr.push(item);
    grouped.set(feed, arr);
  }

  function toggleFeed(feed: string) {
    setCollapsedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(feed)) {
        next.delete(feed);
      } else {
        next.add(feed);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                statusFilter === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} items
        </span>
      </div>

      {grouped.size === 0 ? (
        <EmptyState
          icon={<Search className="w-12 h-12" />}
          title="No discovered content"
          description="Content will appear here as the agent discovers relevant items from RSS feeds."
        />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([feed, feedItems]) => {
            const isCollapsed = collapsedFeeds.has(feed);
            const newCount = feedItems.filter((i) => i.status === "new").length;

            return (
              <div key={feed} className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleFeed(feed)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-card hover:bg-accent/50 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Rss className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">
                    {feed}
                  </span>
                  <span className="text-xs text-muted-foreground">{feedItems.length} items</span>
                  {newCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                      {newCount} new
                    </span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="p-3 space-y-2 bg-background/50">
                    {feedItems.map((item) => (
                      <DiscoveryCard
                        key={item.id}
                        item={item}
                        onQueue={onQueue}
                        onDismiss={onDismiss}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
