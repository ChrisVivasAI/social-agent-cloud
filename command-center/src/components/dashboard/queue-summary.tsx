"use client";

import Link from "next/link";
import {
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle,
  Pause,
  Send,
  XCircle,
} from "lucide-react";
import { useQueueSummary } from "@/hooks/use-queue";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

const SUMMARY_ITEMS: Array<{
  key: string;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  filterParam: string;
}> = [
  { key: "pending", label: "Pending", color: "text-yellow-400", icon: Clock, filterParam: "pending" },
  { key: "generating", label: "Generating", color: "text-blue-400", icon: Loader2, filterParam: "generating" },
  { key: "awaiting_approval", label: "Awaiting", color: "text-orange-400", icon: AlertCircle, filterParam: "awaiting_approval" },
  { key: "ready", label: "Ready", color: "text-green-400", icon: CheckCircle, filterParam: "ready" },
  { key: "posted_today", label: "Posted Today", color: "text-emerald-400", icon: Send, filterParam: "posted" },
  { key: "failed", label: "Failed", color: "text-red-400", icon: XCircle, filterParam: "failed" },
  { key: "paused", label: "Paused", color: "text-gray-400", icon: Pause, filterParam: "paused" },
];

export function QueueSummaryCard() {
  const { summary, loading } = useQueueSummary();

  if (loading) return <CardSkeleton />;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Queue Status</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {SUMMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const count = summary ? (summary as unknown as Record<string, number>)[item.key] ?? 0 : 0;

          return (
            <Link
              key={item.key}
              href={`/queue?status=${item.filterParam}`}
              className="flex flex-col items-center gap-1 rounded-md p-2 hover:bg-accent transition-colors"
            >
              <Icon className={`w-4 h-4 ${item.color}`} />
              <span className={`text-xl font-bold ${item.color}`}>{count}</span>
              <span className="text-[10px] text-muted-foreground text-center leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
