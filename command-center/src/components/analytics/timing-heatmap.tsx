"use client";

interface TimingData {
  dayOfWeek: number;
  hourOfDay: number;
  avgEngagementRate: number;
  count: number;
}

interface TimingHeatmapProps {
  data: TimingData[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getIntensityClass(rate: number, maxRate: number): string {
  if (maxRate === 0) return "bg-zinc-800";
  const ratio = rate / maxRate;
  if (ratio === 0) return "bg-zinc-800";
  if (ratio < 0.2) return "bg-emerald-900/40";
  if (ratio < 0.4) return "bg-emerald-800/50";
  if (ratio < 0.6) return "bg-emerald-700/60";
  if (ratio < 0.8) return "bg-emerald-600/70";
  return "bg-emerald-500";
}

export function TimingHeatmap({ data }: TimingHeatmapProps) {
  const grid: Record<string, { rate: number; count: number }> = {};
  let maxRate = 0;

  for (const d of data) {
    const key = `${d.dayOfWeek}-${d.hourOfDay}`;
    grid[key] = { rate: d.avgEngagementRate, count: d.count };
    if (d.avgEngagementRate > maxRate) maxRate = d.avgEngagementRate;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">
        Posting Time Heatmap
      </h3>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {h % 3 === 0 ? `${h}h` : ""}
              </div>
            ))}
          </div>
          {/* Grid rows */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex items-center gap-1 mb-1">
              <span className="w-9 text-xs text-muted-foreground text-right pr-1">
                {day}
              </span>
              <div className="flex flex-1 gap-0.5">
                {HOURS.map((hour) => {
                  const key = `${dayIdx}-${hour}`;
                  const cell = grid[key] || { rate: 0, count: 0 };
                  return (
                    <div
                      key={hour}
                      className={`flex-1 h-6 rounded-sm ${getIntensityClass(cell.rate, maxRate)} transition-colors`}
                      title={`${day} ${hour}:00 - Avg: ${(cell.rate * 100).toFixed(2)}% (${cell.count} posts)`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-[10px] text-muted-foreground mr-1">Less</span>
            <div className="w-4 h-3 rounded-sm bg-zinc-800" />
            <div className="w-4 h-3 rounded-sm bg-emerald-900/40" />
            <div className="w-4 h-3 rounded-sm bg-emerald-700/60" />
            <div className="w-4 h-3 rounded-sm bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground ml-1">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
