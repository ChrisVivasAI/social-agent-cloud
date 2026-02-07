"use client";

import { useState } from "react";
import { Check, X, Pencil, ExternalLink } from "lucide-react";
import { SentimentBadge } from "./sentiment-badge";
import { ReplyEditor } from "./reply-editor";

export interface Mention {
  mention_id: string;
  author_name: string | null;
  author_username: string | null;
  tweet_text: string | null;
  sentiment: string | null;
  draft_reply: string | null;
  replied: boolean;
  created_at: string;
}

interface MentionCardProps {
  mention: Mention;
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onEditReply: (id: string, text: string) => Promise<void>;
}

export function MentionCard({ mention, onApprove, onDismiss, onEditReply }: MentionCardProps) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  }

  const timeAgo = formatTimeAgo(mention.created_at);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground text-sm">
              {mention.author_name || "Unknown"}
            </span>
            {mention.author_username && (
              <span className="text-xs text-muted-foreground">
                @{mention.author_username}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {mention.tweet_text}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mention.sentiment && <SentimentBadge sentiment={mention.sentiment} />}
          {mention.replied && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
              replied
            </span>
          )}
        </div>
      </div>

      {mention.draft_reply && !editing && (
        <div className="rounded-md bg-muted/50 p-3 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">AI Draft Reply</p>
          <p className="text-sm text-foreground/90">{mention.draft_reply}</p>
        </div>
      )}

      {editing && mention.draft_reply !== null && (
        <ReplyEditor
          initialText={mention.draft_reply || ""}
          onSave={async (text) => {
            await onEditReply(mention.mention_id, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {!mention.replied && !editing && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => handleAction("approve", () => onApprove(mention.mention_id))}
            disabled={loading !== null || !mention.draft_reply}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {loading === "approve" ? "Sending..." : "Approve"}
          </button>
          <button
            onClick={() => setEditing(true)}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => handleAction("dismiss", () => onDismiss(mention.mention_id))}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {loading === "dismiss" ? "Dismissing..." : "Dismiss"}
          </button>
          {mention.author_username && (
            <a
              href={`https://x.com/${mention.author_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
