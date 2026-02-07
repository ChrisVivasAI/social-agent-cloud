"use client";

import type { ContentType, Platform, ContentStatus } from "@/lib/supabase/types";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ToolbarProps {
  view: "week" | "month";
  onViewChange: (view: "week" | "month") => void;
  currentDate: Date;
  onNavigate: (direction: "prev" | "next" | "today") => void;
  filterType: ContentType | "all";
  onFilterType: (type: ContentType | "all") => void;
  filterPlatform: Platform | "all";
  onFilterPlatform: (platform: Platform | "all") => void;
  filterStatus: ContentStatus | "all";
  onFilterStatus: (status: ContentStatus | "all") => void;
}

function formatTitle(date: Date, view: "week" | "month"): string {
  if (view === "month") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} - ${fmt(end)}`;
}

export function Toolbar({
  view,
  onViewChange,
  currentDate,
  onNavigate,
  filterType,
  onFilterType,
  filterPlatform,
  onFilterPlatform,
  filterStatus,
  onFilterStatus,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onNavigate("prev")}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate("today")}
          className="px-3 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent text-foreground transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => onNavigate("next")}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <h3 className="text-sm font-semibold text-foreground min-w-[180px]">
        {formatTitle(currentDate, view)}
      </h3>

      <div className="flex items-center border border-border rounded-md overflow-hidden">
        <button
          onClick={() => onViewChange("week")}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Week
        </button>
        <button
          onClick={() => onViewChange("month")}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Month
        </button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <select
          value={filterType}
          onChange={(e) => onFilterType(e.target.value as ContentType | "all")}
          className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">All Types</option>
          <option value="link">Link</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="text">Text</option>
          <option value="remotion">Remotion</option>
        </select>
        <select
          value={filterPlatform}
          onChange={(e) => onFilterPlatform(e.target.value as Platform | "all")}
          className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">All Platforms</option>
          <option value="twitter">Twitter</option>
          <option value="linkedin">LinkedIn</option>
          <option value="both">Both</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => onFilterStatus(e.target.value as ContentStatus | "all")}
          className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="generating">Generating</option>
          <option value="awaiting_approval">Awaiting Approval</option>
          <option value="ready">Ready</option>
          <option value="posted">Posted</option>
          <option value="failed">Failed</option>
        </select>
      </div>
    </div>
  );
}
