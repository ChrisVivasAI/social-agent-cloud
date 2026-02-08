"use client";

import { useState, useEffect } from "react";
import { Activity, Wifi, WifiOff } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

interface AgentStatus {
  uptime?: number;
  lastActivity?: string;
  status?: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function HealthCard() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/proxy/api/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      } catch {
        setIsOnline(false);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <CardSkeleton />;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Agent Health</h3>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Online
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Offline
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${isOnline ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            {isOnline ? (
              <Wifi className="w-5 h-5 text-emerald-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {isOnline && status?.uptime ? formatUptime(status.uptime) : "--"}
            </p>
            <p className="text-xs text-muted-foreground">Uptime</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3 h-3" />
          <span>
            Last activity:{" "}
            {status?.lastActivity ? formatTimeAgo(status.lastActivity) : "N/A"}
          </span>
        </div>
      </div>
    </div>
  );
}
