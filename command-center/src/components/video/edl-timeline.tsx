"use client";

import type { EDL, EDLTrackItem } from "@/lib/supabase/types";

const TRACK_COLORS: Record<EDLTrackItem["type"], string> = {
  video_clip: "bg-blue-500",
  ai_generated_video: "bg-purple-500",
  audio: "bg-green-500",
  text_overlay: "bg-amber-500",
  image_overlay: "bg-pink-500",
  transition: "bg-zinc-500",
};

const NARRATIVE_COLORS: Record<string, string> = {
  hook: "border-red-500/50",
  buildup: "border-yellow-500/50",
  climax: "border-orange-500/50",
  resolution: "border-green-500/50",
};

function formatMs(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}:${String(rem).padStart(2, "0")}`;
}

interface EdlTimelineProps {
  edl: EDL;
}

function TrackRow({ label, items, totalMs }: { label: string; items: EDLTrackItem[]; totalMs: number }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative h-8 bg-muted/30 rounded overflow-hidden">
        {items.map((item) => {
          const left = (item.start_ms / totalMs) * 100;
          const width = (item.duration_ms / totalMs) * 100;
          return (
            <div
              key={item.id}
              className={`absolute top-0 h-full ${TRACK_COLORS[item.type]} opacity-80 hover:opacity-100 transition-opacity rounded-sm`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
              }}
              title={`${item.type.replace(/_/g, " ")} | ${formatMs(item.start_ms)} - ${formatMs(item.start_ms + item.duration_ms)}${item.reasoning ? ` | ${item.reasoning}` : ""}`}
            >
              {width > 8 && (
                <span className="text-[10px] text-white px-1 truncate block leading-8">
                  {item.type.replace(/_/g, " ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EdlTimeline({ edl }: EdlTimelineProps) {
  const totalMs = edl.total_duration_ms || 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>0:00</span>
        <span>Total: {formatMs(totalMs)}</span>
        <span>{formatMs(totalMs)}</span>
      </div>

      {edl.narrative_structure && edl.narrative_structure.length > 0 && (
        <div className="relative h-4 bg-muted/20 rounded overflow-hidden">
          {edl.narrative_structure.map((section, i) => {
            const left = (section.start_ms / totalMs) * 100;
            const width = ((section.end_ms - section.start_ms) / totalMs) * 100;
            return (
              <div
                key={i}
                className={`absolute top-0 h-full border-t-2 ${NARRATIVE_COLORS[section.role] || "border-zinc-500/50"} bg-white/5`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={section.role}
              >
                <span className="text-[9px] text-muted-foreground px-0.5 capitalize">
                  {section.role}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <TrackRow label="Video" items={edl.tracks.video} totalMs={totalMs} />
        <TrackRow label="Audio" items={edl.tracks.audio} totalMs={totalMs} />
        <TrackRow label="Overlays" items={edl.tracks.overlays} totalMs={totalMs} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(TRACK_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-muted-foreground capitalize">{type.replace(/_/g, " ")}</span>
          </div>
        ))}
      </div>

      {edl.output_format && (
        <div className="text-xs text-muted-foreground">
          Output: {edl.output_format.width}x{edl.output_format.height} @ {edl.output_format.fps}fps ({edl.output_format.codec})
        </div>
      )}
    </div>
  );
}
