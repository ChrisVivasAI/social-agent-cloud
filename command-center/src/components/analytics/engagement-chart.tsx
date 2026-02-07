"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyMetric {
  date: string;
  likes: number;
  retweets: number;
  comments: number;
  impressions: number;
}

interface EngagementChartProps {
  data: DailyMetric[];
}

const METRICS = [
  { key: "likes", color: "#10b981", label: "Likes" },
  { key: "retweets", color: "#6366f1", label: "Retweets" },
  { key: "comments", color: "#f59e0b", label: "Comments" },
  { key: "impressions", color: "#8b5cf6", label: "Impressions" },
] as const;

export function EngagementChart({ data }: EngagementChartProps) {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    likes: true,
    retweets: true,
    comments: true,
    impressions: true,
  });

  function toggleMetric(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">Engagement Trends</h3>
        <div className="flex gap-3">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`text-xs px-2 py-1 rounded transition-opacity ${
                visible[m.key] ? "opacity-100" : "opacity-40"
              }`}
              style={{ color: m.color }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
          <XAxis
            dataKey="date"
            stroke="hsl(240 5% 64.9%)"
            fontSize={12}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis stroke="hsl(240 5% 64.9%)" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(240 10% 3.9%)",
              border: "1px solid hsl(240 3.7% 15.9%)",
              borderRadius: "6px",
              color: "hsl(0 0% 98%)",
            }}
          />
          <Legend />
          {METRICS.map(
            (m) =>
              visible[m.key] && (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={false}
                  name={m.label}
                />
              )
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
