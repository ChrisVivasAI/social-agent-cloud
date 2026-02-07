"use client";

import { Heart, Repeat2, MessageCircle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useAnalytics } from "@/hooks/use-analytics";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

interface SparklineRowProps {
  label: string;
  icon: React.ReactNode;
  data: Array<{ value: number }>;
  color: string;
  total: number;
}

function SparklineRow({ label, icon, data, color, total }: SparklineRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold text-foreground">{total.toLocaleString()}</span>
        </div>
        <div className="h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function Sparklines() {
  const { dailyMetrics, loading } = useAnalytics("7d");

  if (loading) return <CardSkeleton />;

  const likesData = dailyMetrics.map((d) => ({ value: d.likes }));
  const retweetsData = dailyMetrics.map((d) => ({ value: d.retweets }));
  const commentsData = dailyMetrics.map((d) => ({ value: d.comments }));

  const totalLikes = dailyMetrics.reduce((s, d) => s + d.likes, 0);
  const totalRetweets = dailyMetrics.reduce((s, d) => s + d.retweets, 0);
  const totalComments = dailyMetrics.reduce((s, d) => s + d.comments, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">7-Day Engagement</h3>
      {dailyMetrics.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
      ) : (
        <div className="space-y-4">
          <SparklineRow
            label="Likes"
            icon={<Heart className="w-4 h-4" />}
            data={likesData}
            color="#f472b6"
            total={totalLikes}
          />
          <SparklineRow
            label="Retweets"
            icon={<Repeat2 className="w-4 h-4" />}
            data={retweetsData}
            color="#60a5fa"
            total={totalRetweets}
          />
          <SparklineRow
            label="Comments"
            icon={<MessageCircle className="w-4 h-4" />}
            data={commentsData}
            color="#34d399"
            total={totalComments}
          />
        </div>
      )}
    </div>
  );
}
