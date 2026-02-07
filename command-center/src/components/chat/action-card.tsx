"use client";

import { CheckCircle } from "lucide-react";
import type { ChatAction } from "@/hooks/use-chat";

interface ActionCardProps {
  action: ChatAction;
  onExecute?: () => void;
}

export function ActionCard({ action, onExecute }: ActionCardProps) {
  const data = action.data as Record<string, string | null | undefined>;

  return (
    <div className="rounded-md border border-border bg-card p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground truncate">
            {action.label}
          </div>
          {data.id && (
            <div className="text-muted-foreground truncate">
              ID: {String(data.id).substring(0, 8)}
              {data.scheduled_for && (
                <span> &middot; {new Date(data.scheduled_for).toLocaleDateString()}</span>
              )}
            </div>
          )}
          {data.source_text && (
            <div className="text-muted-foreground truncate mt-0.5">
              {String(data.source_text).substring(0, 80)}
            </div>
          )}
        </div>
        {onExecute && action.type === "approvable_item" && (
          <button
            onClick={onExecute}
            className="shrink-0 flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 transition-colors"
          >
            <CheckCircle className="h-3 w-3" />
            Approve
          </button>
        )}
      </div>
    </div>
  );
}
