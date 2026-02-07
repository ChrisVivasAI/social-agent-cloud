"use client";

import { useState } from "react";
import { Search, Database } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { AgentMemoryEntry } from "@/lib/supabase/types";

interface MemoryBrowserProps {
  memories: AgentMemoryEntry[];
  isLoading: boolean;
}

const CATEGORY_OPTIONS = [
  "all",
  "feedback",
  "performance",
  "preference",
  "pattern",
  "style_guide",
  "editing_style",
  "posted_content",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  feedback: "bg-blue-500/20 text-blue-400",
  performance: "bg-green-500/20 text-green-400",
  preference: "bg-purple-500/20 text-purple-400",
  pattern: "bg-orange-500/20 text-orange-400",
  style_guide: "bg-pink-500/20 text-pink-400",
  editing_style: "bg-indigo-500/20 text-indigo-400",
  posted_content: "bg-teal-500/20 text-teal-400",
};

export function MemoryBrowser({ memories, isLoading }: MemoryBrowserProps) {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = memories.filter((m) => {
    if (category !== "all" && m.category !== category) return false;
    if (search && !m.content_text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setCategory(opt)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                category === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {opt.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Database className="w-12 h-12" />}
          title="No memories found"
          description="No memories match the current filters."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground/90 flex-1">{m.content_text}</p>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                    CATEGORY_COLORS[m.category] || "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {m.category.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Confidence: {Math.round(m.confidence * 100)}%</span>
                {m.platform && <span>Platform: {m.platform}</span>}
                <span>{new Date(m.created_at).toLocaleDateString()}</span>
              </div>
              {m.relevance_tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.relevance_tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
