"use client";

import { useState } from "react";
import { ListPlus, X, ExternalLink } from "lucide-react";
import type { DiscoveredContent } from "@/lib/supabase/types";

interface DiscoveryCardProps {
  item: DiscoveredContent;
  onQueue: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  queued: "bg-green-500/20 text-green-400",
  dismissed: "bg-gray-500/20 text-gray-400",
};

export function DiscoveryCard({ item, onQueue, onDismiss }: DiscoveryCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  }

  const relevancePercent = item.relevance_score != null ? Math.round(item.relevance_score * 100) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground truncate">
              {item.title || "Untitled"}
            </h4>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                STATUS_STYLES[item.status] || STATUS_STYLES.new
              }`}
            >
              {item.status}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{item.source_feed}</p>
        </div>
        {relevancePercent !== null && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  relevancePercent >= 70
                    ? "bg-green-500"
                    : relevancePercent >= 40
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${relevancePercent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{relevancePercent}%</span>
          </div>
        )}
      </div>

      {item.summary && (
        <p className="text-sm text-foreground/80 line-clamp-3">{item.summary}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(item.discovered_at).toLocaleDateString()}</span>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        </div>

        {item.status === "new" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAction("queue", () => onQueue(item.id))}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50"
            >
              <ListPlus className="w-3.5 h-3.5" />
              {loading === "queue" ? "Queuing..." : "Queue"}
            </button>
            <button
              onClick={() => handleAction("dismiss", () => onDismiss(item.id))}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {loading === "dismiss" ? "Dismissing..." : "Dismiss"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
