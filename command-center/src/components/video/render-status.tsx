"use client";

import { useState, useEffect } from "react";
import { Loader2, Film } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe } from "@/lib/supabase/realtime";
import type { VideoProject } from "@/lib/supabase/types";

export function RenderStatus() {
  const [rendering, setRendering] = useState<VideoProject[]>([]);

  useEffect(() => {
    async function fetch() {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from("video_projects")
        .select("*")
        .eq("status", "rendering");
      if (data) setRendering(data as VideoProject[]);
    }
    fetch();

    const channel = subscribeToTable<VideoProject>(
      "video_projects",
      (payload) => {
        if (payload.eventType === "UPDATE") {
          setRendering((prev) => {
            const updated = payload.new;
            if (updated.status === "rendering") {
              const exists = prev.find((p) => p.id === updated.id);
              if (exists) {
                return prev.map((p) => (p.id === updated.id ? updated : p));
              }
              return [...prev, updated];
            }
            return prev.filter((p) => p.id !== updated.id);
          });
        }
      },
      "status=eq.rendering"
    );

    return () => unsubscribe(channel);
  }, []);

  if (rendering.length === 0) return null;

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
        <h3 className="text-sm font-medium text-indigo-400">
          Rendering in Progress
        </h3>
      </div>
      {rendering.map((project) => (
        <div key={project.id} className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <Film className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-foreground truncate">{project.title}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 animate-pulse"
              style={{ width: "60%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
