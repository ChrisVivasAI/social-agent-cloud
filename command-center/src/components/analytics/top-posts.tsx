"use client";

import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { PlatformIcon } from "@/components/shared/platform-icon";
import type { PostHistoryRecord } from "@/lib/supabase/types";

type Row = Record<string, unknown>;

interface TopPostsProps {
  data: PostHistoryRecord[];
}

function asPost(item: Row): PostHistoryRecord {
  return item as unknown as PostHistoryRecord;
}

export function TopPosts({ data }: TopPostsProps) {
  const columns = [
    {
      key: "post_text",
      label: "Post",
      render: (item: Row) => {
        const p = asPost(item);
        return (
          <span className="text-foreground max-w-xs truncate block">
            {p.post_text?.slice(0, 80)}
            {p.post_text && p.post_text.length > 80 ? "..." : ""}
          </span>
        );
      },
      className: "max-w-xs",
    },
    {
      key: "platform",
      label: "Platform",
      render: (item: Row) => <PlatformIcon platform={asPost(item).platform} />,
    },
    {
      key: "posted_at",
      label: "Posted",
      sortable: true,
      render: (item: Row) => (
        <span className="text-muted-foreground">
          {new Date(asPost(item).posted_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "likes",
      label: "Likes",
      sortable: true,
      render: (item: Row) => <span className="text-foreground">{asPost(item).likes}</span>,
    },
    {
      key: "retweets",
      label: "Retweets",
      sortable: true,
      render: (item: Row) => <span className="text-foreground">{asPost(item).retweets}</span>,
    },
    {
      key: "comments",
      label: "Comments",
      sortable: true,
      render: (item: Row) => <span className="text-foreground">{asPost(item).comments}</span>,
    },
    {
      key: "impressions",
      label: "Impressions",
      sortable: true,
      render: (item: Row) => (
        <span className="text-foreground">{asPost(item).impressions.toLocaleString()}</span>
      ),
    },
    {
      key: "engagement_rate",
      label: "Eng. Rate",
      sortable: true,
      render: (item: Row) => {
        const rate = asPost(item).engagement_rate;
        return (
          <StatusBadge
            status={rate > 0.05 ? "posted" : rate > 0.02 ? "ready" : "pending"}
            className="whitespace-nowrap"
          />
        );
      },
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">
        Top Performing Posts
      </h3>
      <DataTable
        data={data as unknown as Row[]}
        columns={columns}
        keyField="id"
        emptyMessage="No posts yet"
      />
    </div>
  );
}
