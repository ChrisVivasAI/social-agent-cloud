"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface PlatformMetric {
  metric: string;
  twitter: number;
  linkedin: number;
}

interface PlatformComparisonProps {
  data: PlatformMetric[];
}

export function PlatformComparison({ data }: PlatformComparisonProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">
        Platform Comparison
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 3.7% 15.9%)" />
          <XAxis dataKey="metric" stroke="hsl(240 5% 64.9%)" fontSize={12} />
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
          <Bar dataKey="twitter" name="Twitter" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="linkedin" name="LinkedIn" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
