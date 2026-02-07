"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { ContentQueueItem, ContentStatus } from "@/lib/supabase/types";
import {
  Check,
  X,
  Pencil,
  CalendarClock,
  Send,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

interface QueueActionsProps {
  item: ContentQueueItem;
  onAction: (id: string, action: string, body?: Record<string, unknown>) => Promise<void>;
  onEdit: (item: ContentQueueItem) => void;
  onReschedule: (item: ContentQueueItem) => void;
}

interface ActionDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  visibleFor: ContentStatus[];
  destructive?: boolean;
  confirmTitle?: string;
  confirmDesc?: string;
}

const ACTIONS: ActionDef[] = [
  {
    key: "approve",
    label: "Approve",
    icon: <Check className="w-4 h-4" />,
    visibleFor: ["awaiting_approval"],
  },
  {
    key: "reject",
    label: "Reject",
    icon: <X className="w-4 h-4" />,
    visibleFor: ["awaiting_approval"],
    destructive: true,
    confirmTitle: "Reject this content?",
    confirmDesc: "This will move the item back to pending.",
  },
  {
    key: "edit",
    label: "Edit",
    icon: <Pencil className="w-4 h-4" />,
    visibleFor: ["pending", "generated", "awaiting_approval", "ready", "paused"],
  },
  {
    key: "reschedule",
    label: "Reschedule",
    icon: <CalendarClock className="w-4 h-4" />,
    visibleFor: ["pending", "awaiting_approval", "ready", "paused"],
  },
  {
    key: "post-now",
    label: "Post Now",
    icon: <Send className="w-4 h-4" />,
    visibleFor: ["ready"],
    confirmTitle: "Post this content now?",
    confirmDesc: "This will publish the content immediately.",
  },
  {
    key: "pause",
    label: "Pause",
    icon: <Pause className="w-4 h-4" />,
    visibleFor: ["pending", "ready"],
  },
  {
    key: "resume",
    label: "Resume",
    icon: <Play className="w-4 h-4" />,
    visibleFor: ["paused"],
  },
  {
    key: "retry",
    label: "Retry",
    icon: <RotateCcw className="w-4 h-4" />,
    visibleFor: ["failed"],
  },
];

export function QueueActions({ item, onAction, onEdit, onReschedule }: QueueActionsProps) {
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const visible = ACTIONS.filter((a) => a.visibleFor.includes(item.status));

  async function handleAction(action: ActionDef) {
    if (action.key === "edit") {
      onEdit(item);
      return;
    }
    if (action.key === "reschedule") {
      onReschedule(item);
      return;
    }
    if (action.confirmTitle) {
      setConfirmAction(action);
      return;
    }
    await executeAction(action.key);
  }

  async function executeAction(key: string) {
    setLoading(key);
    try {
      await onAction(item.id, key);
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  }

  if (visible.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visible.map((action) => (
          <button
            key={action.key}
            onClick={() => handleAction(action)}
            disabled={loading !== null}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              action.destructive
                ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                : "border border-border text-foreground hover:bg-accent"
            } ${loading === action.key ? "opacity-50" : ""}`}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.confirmTitle || "Confirm"}
          description={confirmAction.confirmDesc}
          variant={confirmAction.destructive ? "destructive" : "default"}
          confirmLabel={confirmAction.label}
          onConfirm={() => executeAction(confirmAction.key)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}
