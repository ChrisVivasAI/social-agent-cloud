"use client";

import { Cog } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { AgentMemoryEntry } from "@/lib/supabase/types";

interface ProceduralRulesProps {
  rules: AgentMemoryEntry[];
  isLoading: boolean;
}

export function ProceduralRules({ rules, isLoading }: ProceduralRulesProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={<Cog className="w-12 h-12" />}
        title="No procedural rules"
        description="The agent will learn patterns from your feedback over time."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
        >
          <Cog className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/90">{rule.content_text}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>Confidence: {Math.round(rule.confidence * 100)}%</span>
              <span>{new Date(rule.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
