"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ContentTypeMetric {
  type: string;
  avgEngagementRate: number;
  count: number;
}

interface ContentTypeChartProps {
  data: ContentTypeMetric[];
}

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];

export function ContentTypeChart({ data }: ContentTypeChartProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">
        Content Type Performance
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
          <XAxis dataKey="type" stroke="hsl(240 5% 64.9%)" fontSize={12} />
          <YAxis
            stroke="hsl(240 5% 64.9%)"
            fontSize={12}
            tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(240 10% 3.9%)",
              border: "1px solid hsl(240 3.7% 15.9%)",
              borderRadius: "6px",
              color: "hsl(0 0% 98%)",
            }}
            formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "Avg Engagement"]}
          />
          <Bar dataKey="avgEngagementRate" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
