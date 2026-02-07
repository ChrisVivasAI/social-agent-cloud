"use client";

import { useState } from "react";
import { MentionCard, type Mention } from "./mention-card";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageSquare } from "lucide-react";

interface MentionListProps {
  mentions: Mention[];
  isLoading: boolean;
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onEditReply: (id: string, text: string) => Promise<void>;
}

const SENTIMENT_OPTIONS = ["all", "positive", "neutral", "negative", "question"] as const;
const STATUS_OPTIONS = ["all", "pending", "replied", "dismissed"] as const;

export function MentionList({
  mentions,
  isLoading,
  onApprove,
  onDismiss,
  onEditReply,
}: MentionListProps) {
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = mentions.filter((m) => {
    if (sentimentFilter !== "all" && m.sentiment !== sentimentFilter) return false;
    if (statusFilter === "pending" && m.replied) return false;
    if (statusFilter === "replied" && !m.replied) return false;
    return true;
  });

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
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sentiment:</span>
          <div className="flex gap-1">
            {SENTIMENT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setSentimentFilter(opt)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  sentimentFilter === opt
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => (
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
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-12 h-12" />}
          title="No mentions found"
          description="No mentions match the current filters."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MentionCard
              key={m.mention_id}
              mention={m}
              onApprove={onApprove}
              onDismiss={onDismiss}
              onEditReply={onEditReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}
