"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Film,
  Send,
  CheckCircle2,
  Clock,
  FileVideo,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { subscribeToTable, unsubscribe } from "@/lib/supabase/realtime";
import { videoApi } from "@/lib/agent-api";
import type { VideoProject, VideoProjectStatus, FootageAsset, EDL } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EdlTimeline } from "./edl-timeline";

const STATUS_STEPS: VideoProjectStatus[] = [
  "draft",
  "analyzing",
  "editing",
  "rendering",
  "review",
  "approved",
  "posted",
];

function StatusTimeline({ current }: { current: VideoProjectStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(current);

  return (
    <div className="flex items-center gap-1">
      {STATUS_STEPS.map((step, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  isComplete
                    ? "bg-green-500/20 text-green-400"
                    : isCurrent
                    ? "bg-primary/20 text-primary ring-2 ring-primary/40"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-[10px] mt-1 capitalize ${
                  isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div
                className={`w-6 h-0.5 mb-4 ${
                  i < currentIdx ? "bg-green-500/40" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [footage, setFootage] = useState<FootageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackText, setFeedbackText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchProject = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (data) {
      const proj = data as VideoProject;
      setProject(proj);

      if (proj.footage_asset_ids && proj.footage_asset_ids.length > 0) {
        const { data: assets } = await supabase
          .from("footage_assets")
          .select("*")
          .in("id", proj.footage_asset_ids);
        if (assets) setFootage(assets as FootageAsset[]);
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchProject();

    const channel = subscribeToTable<VideoProject>(
      "video_projects",
      (payload) => {
        if (payload.new.id === projectId) {
          setProject(payload.new);
        }
      },
      `id=eq.${projectId}`
    );

    return () => unsubscribe(channel);
  }, [fetchProject, projectId]);

  async function handleSendFeedback() {
    if (!feedbackText.trim()) return;
    setSending(true);
    try {
      await videoApi.addFeedback(projectId, feedbackText.trim());
      setFeedbackText("");
      await fetchProject();
    } catch (err) {
      console.error("Failed to send feedback:", err);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton lines={2} />
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
        <Link href="/video" className="text-primary text-sm mt-2 inline-block hover:underline">
          Back to Video Studio
        </Link>
      </div>
    );
  }

  const edl = project.current_edl as EDL | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/video"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{project.title}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
            <span className="capitalize">{project.project_type.replace(/_/g, " ")}</span>
            <StatusBadge status={project.status} />
          </div>
        </div>
      </div>

      <StatusTimeline current={project.status} />

      {project.goal && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Goal</h3>
          <p className="text-sm text-foreground">{project.goal}</p>
        </div>
      )}

      {project.creative_brief && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Creative Brief
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {project.creative_brief.target_audience && (
              <div>
                <span className="text-muted-foreground">Audience:</span>{" "}
                <span className="text-foreground">{project.creative_brief.target_audience}</span>
              </div>
            )}
            {project.creative_brief.mood && (
              <div>
                <span className="text-muted-foreground">Mood:</span>{" "}
                <span className="text-foreground">{project.creative_brief.mood}</span>
              </div>
            )}
            {project.creative_brief.aspect_ratio && (
              <div>
                <span className="text-muted-foreground">Aspect Ratio:</span>{" "}
                <span className="text-foreground">{project.creative_brief.aspect_ratio}</span>
              </div>
            )}
            {project.creative_brief.duration_target_ms && (
              <div>
                <span className="text-muted-foreground">Target Duration:</span>{" "}
                <span className="text-foreground">
                  {Math.round(project.creative_brief.duration_target_ms / 1000)}s
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {project.output_url && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Output Video
          </h3>
          <video
            src={project.output_url}
            controls
            className="w-full max-w-2xl rounded-lg"
          />
          {project.output_duration_ms && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.round(project.output_duration_ms / 1000)}s
            </p>
          )}
        </div>
      )}

      {edl && edl.tracks && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Edit Decision List (v{edl.version})
          </h3>
          <EdlTimeline edl={edl} />
        </div>
      )}

      {footage.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Linked Footage ({footage.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {footage.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm"
              >
                <FileVideo className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-foreground truncate">
                  {asset.original_filename || asset.storage_path.split("/").pop()}
                </span>
                <StatusBadge status={asset.analysis_status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Feedback
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendFeedback()}
            placeholder="Add feedback for the agent..."
            className="flex-1 bg-muted/30 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSendFeedback}
            disabled={!feedbackText.trim() || sending}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>

        {project.feedback_history && project.feedback_history.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...project.feedback_history].reverse().map((fb, i) => (
              <div key={i} className="text-sm p-2.5 rounded bg-muted/20 border border-border/50">
                <p className="text-foreground">{fb.feedback}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{new Date(fb.timestamp).toLocaleString()}</span>
                  {fb.applied && (
                    <span className="text-green-400 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Applied
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No feedback yet.</p>
        )}
      </div>
    </div>
  );
}
