"use client";

import { HealthCard } from "@/components/dashboard/health-card";
import { QueueSummaryCard } from "@/components/dashboard/queue-summary";
import { NextPosts } from "@/components/dashboard/next-posts";
import { Sparklines } from "@/components/dashboard/sparklines";
import { ActivityFeedWidget } from "@/components/dashboard/activity-feed";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Dashboard</h2>

      {/* Top row: Health + Queue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HealthCard />
        <div className="lg:col-span-2">
          <QueueSummaryCard />
        </div>
      </div>

      {/* Middle row: Next Posts */}
      <NextPosts />

      {/* Bottom row: Sparklines + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Sparklines />
        <ActivityFeedWidget maxEvents={20} />
      </div>
    </div>
  );
}
