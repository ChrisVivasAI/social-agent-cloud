"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, X, Clock } from "lucide-react";
import { ContentTypeIcon } from "@/components/shared/content-type-icon";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queueAction } from "@/hooks/use-queue";
import type { ContentQueueItem } from "@/lib/supabase/types";

function formatScheduled(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);

  if (diffHrs < 0) return "Overdue";
  if (diffHrs < 1) return `${Math.floor(diffMs / 60000)}m`;
  if (diffHrs < 24) return `${diffHrs}h`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NextPosts() {
  const [posts, setPosts] = useState<ContentQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const client = getSupabaseBrowserClient();
        const { data } = await client
          .from("content_queue")
          .select("*")
          .in("status", ["awaiting_approval", "ready", "generating", "pending"])
          .order("scheduled_for", { ascending: true })
          .limit(5);

        if (data) setPosts(data as ContentQueueItem[]);
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    }
    fetch();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await queueAction(id, "approve");
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: "ready" as const } : p)));
    } catch {
      // ignore
    }
  };

  const handleReject = async (id: string) => {
    try {
      await queueAction(id, "reject");
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  };

  if (isLoading) return <CardSkeleton />;

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Next Posts</h3>
        <EmptyState title="No upcoming posts" description="Queue is empty" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Next Posts</h3>
        <Link href="/queue" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>
      <div className="space-y-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/queue?id=${post.id}`}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors group"
          >
            <ContentTypeIcon type={post.type} className="w-4 h-4 text-muted-foreground shrink-0" />
            <PlatformIcon platform={post.platform} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                {post.generated_post?.slice(0, 60) || post.source_text?.slice(0, 60) || `${post.type} post`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatScheduled(post.scheduled_for)}
              </div>
              <StatusBadge status={post.status} />
              {post.status === "awaiting_approval" && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
                  <button
                    onClick={() => handleApprove(post.id)}
                    className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400"
                    title="Approve"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleReject(post.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                    title="Reject"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
