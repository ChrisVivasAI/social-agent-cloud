"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Film, Clock, ArrowUpDown } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe } from "@/lib/supabase/realtime";
import type { VideoProject, VideoProjectStatus } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

const ALL_STATUSES: VideoProjectStatus[] = [
  "draft",
  "analyzing",
  "editing",
  "rendering",
  "review",
  "approved",
  "posted",
  "archived",
];

type SortField = "created_at" | "updated_at";

export function ProjectList() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<VideoProjectStatus | "all">("all");
  const [sortField, setSortField] = useState<SortField>("updated_at");

  const fetchProjects = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    let query = supabase
      .from("video_projects")
      .select("*")
      .order(sortField, { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    if (data) setProjects(data as VideoProject[]);
    setLoading(false);
  }, [statusFilter, sortField]);

  useEffect(() => {
    fetchProjects();

    const channel = subscribeToTable<VideoProject>("video_projects", () => {
      fetchProjects();
    });

    return () => unsubscribe(channel);
  }, [fetchProjects]);

  function formatDuration(ms: number | undefined): string {
    if (!ms) return "--";
    const sec = Math.round(ms / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return min > 0 ? `${min}m ${rem}s` : `${rem}s`;
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VideoProjectStatus | "all")}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSortField(sortField === "created_at" ? "updated_at" : "created_at")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: {sortField === "created_at" ? "Created" : "Updated"}
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<Film className="w-12 h-12" />}
          title="No video projects"
          description="Video projects will appear here once created."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/video/${project.id}`}
              className="block rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
            >
              {project.output_url ? (
                <div className="aspect-video bg-muted rounded-t-lg overflow-hidden">
                  <video
                    src={project.output_url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-t-lg flex items-center justify-center">
                  <Film className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-foreground text-sm truncate">
                    {project.title}
                  </h3>
                  <StatusBadge status={project.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{project.project_type.replace(/_/g, " ")}</span>
                  {project.output_duration_ms && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(project.output_duration_ms)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
