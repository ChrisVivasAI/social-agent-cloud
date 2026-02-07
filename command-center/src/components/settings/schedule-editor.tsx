"use client";

import { Calendar } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

interface ScheduleEditorProps {
  settings: Record<string, unknown>;
  isLoading: boolean;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ScheduleEditor({ settings, isLoading }: ScheduleEditorProps) {
  if (isLoading) {
    return <CardSkeleton />;
  }

  // Parse schedule from settings or show defaults
  const schedule = (settings.posting_schedule as Record<string, unknown>) || {};
  const slots = (schedule.slots as Array<{ day: number; hour: number }>) || [];

  // Build a set for quick lookup
  const slotSet = new Set(slots.map((s) => `${s.day}-${s.hour}`));

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Posting Schedule</h3>
        <span className="text-xs text-muted-foreground ml-auto">Read-only</span>
      </div>

      {slots.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No schedule configured. The agent uses the default schedule defined in code.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-grid gap-px" style={{ gridTemplateColumns: `auto repeat(24, 1fr)` }}>
            {/* Header row */}
            <div className="w-10" />
            {HOURS.map((h) => (
              <div key={h} className="text-center text-[10px] text-muted-foreground w-5">
                {h}
              </div>
            ))}

            {/* Day rows */}
            {DAYS.map((day, dayIdx) => (
              <>
                <div key={`label-${day}`} className="text-xs text-muted-foreground pr-2 flex items-center">
                  {day}
                </div>
                {HOURS.map((hour) => (
                  <div
                    key={`${dayIdx}-${hour}`}
                    className={`w-5 h-5 rounded-sm ${
                      slotSet.has(`${dayIdx}-${hour}`)
                        ? "bg-primary/80"
                        : "bg-muted/30"
                    }`}
                  />
                ))}
              </>
            ))}
          </div>
        </div>
      )}

      {/* Show raw cron info if available */}
      {!!schedule.cron_expression && (
        <div className="text-xs text-muted-foreground">
          Cron: <code className="px-1 py-0.5 rounded bg-muted">{String(schedule.cron_expression)}</code>
        </div>
      )}
    </div>
  );
}
