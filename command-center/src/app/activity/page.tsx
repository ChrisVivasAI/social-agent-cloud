"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Pause,
  Play,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useActivityFeed, type ActivityEvent } from "@/hooks/use-activity-feed";

const EVENT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  post_published: { icon: Send, color: "text-emerald-400", label: "Published" },
  post_approved: { icon: CheckCircle, color: "text-green-400", label: "Approved" },
  post_rejected: { icon: XCircle, color: "text-red-400", label: "Rejected" },
  post_failed: { icon: AlertTriangle, color: "text-red-400", label: "Failed" },
  generation_started: { icon: Loader2, color: "text-blue-400", label: "Generating" },
  generation_complete: { icon: CheckCircle, color: "text-blue-400", label: "Generated" },
  error: { icon: XCircle, color: "text-red-400", label: "Error" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", label: "Warning" },
  success: { icon: CheckCircle, color: "text-emerald-400", label: "Success" },
  info: { icon: Info, color: "text-blue-400", label: "Info" },
};

function getConfig(type: string) {
  return EVENT_CONFIG[type] || { icon: Zap, color: "text-zinc-400", label: type };
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function EventDetail({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const config = getConfig(event.type);
  const Icon = config.icon;
  const hasData = Boolean(event.data && typeof event.data === "object" && Object.keys(event.data as object).length > 0);

  return (
    <div className="border-b border-border last:border-0">
      <div
        className="flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => hasData && setExpanded(!expanded)}
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{event.message || event.type}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {config.label}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTimestamp(event.timestamp)}
          </span>
          {hasData && (
            expanded ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            )
          )}
        </div>
      </div>
      {expanded && hasData && (
        <div className="px-10 pb-3">
          <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-48">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const EVENT_TYPES = [
  "all",
  "post_published",
  "post_approved",
  "post_rejected",
  "post_failed",
  "generation_started",
  "generation_complete",
  "error",
  "warning",
  "success",
  "info",
];

export default function ActivityPage() {
  const { events, isConnected, clear } = useActivityFeed(500);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredEvents = events.filter((event) => {
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (event.message?.toLowerCase().includes(q)) ||
        event.type.toLowerCase().includes(q) ||
        JSON.stringify(event.data).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const scrollToTop = useCallback(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [autoScroll]);

  useEffect(() => {
    scrollToTop();
  }, [filteredEvents.length, scrollToTop]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Activity Feed</h2>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${isConnected ? "text-emerald-400" : "text-red-400"}`}>
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              Disconnected
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === "all" ? "All types" : getConfig(type).label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            autoScroll
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-muted border-border text-muted-foreground"
          }`}
        >
          {autoScroll ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {autoScroll ? "Auto-scroll" : "Paused"}
        </button>
        <button
          onClick={clear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      {/* Event count */}
      <p className="text-xs text-muted-foreground">
        {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
        {typeFilter !== "all" && ` (filtered)`}
      </p>

      {/* Events list */}
      <div
        ref={scrollRef}
        className="rounded-lg border border-border bg-card overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {events.length === 0
              ? isConnected
                ? "Waiting for events..."
                : "Connecting to activity stream..."
              : "No events match your filter"}
          </div>
        ) : (
          filteredEvents.map((event) => <EventDetail key={event.id} event={event} />)
        )}
      </div>
    </div>
  );
}
