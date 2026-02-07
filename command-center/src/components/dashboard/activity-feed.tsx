"use client";

import { useRef, useEffect } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Info,
  Zap,
  Send,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useActivityFeed, type ActivityEvent } from "@/hooks/use-activity-feed";

const EVENT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  post_published: { icon: Send, color: "text-emerald-400" },
  post_approved: { icon: CheckCircle, color: "text-green-400" },
  post_rejected: { icon: XCircle, color: "text-red-400" },
  post_failed: { icon: AlertTriangle, color: "text-red-400" },
  generation_started: { icon: Loader2, color: "text-blue-400" },
  generation_complete: { icon: CheckCircle, color: "text-blue-400" },
  error: { icon: XCircle, color: "text-red-400" },
  warning: { icon: AlertTriangle, color: "text-yellow-400" },
  success: { icon: CheckCircle, color: "text-emerald-400" },
  info: { icon: Info, color: "text-blue-400" },
};

function getEventConfig(type: string) {
  return EVENT_CONFIG[type] || { icon: Zap, color: "text-zinc-400" };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function EventRow({ event }: { event: ActivityEvent }) {
  const config = getEventConfig(event.type);
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-accent/50 transition-colors">
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">{event.message || event.type}</p>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
        {formatTime(event.timestamp)}
      </span>
    </div>
  );
}

export function ActivityFeedWidget({ maxEvents = 20 }: { maxEvents?: number }) {
  const { events, isConnected } = useActivityFeed(maxEvents);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Live Activity</h3>
        <div className={`flex items-center gap-1 text-[10px] ${isConnected ? "text-emerald-400" : "text-red-400"}`}>
          {isConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {isConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-64 space-y-0.5">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {isConnected ? "Waiting for events..." : "Connecting..."}
          </p>
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}
