"use client";

import { Eye } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

interface EnvViewerProps {
  settings: Record<string, unknown>;
  isLoading: boolean;
}

const SENSITIVE_KEYS = [
  "api_key",
  "secret",
  "token",
  "password",
  "credential",
  "private",
  "anon_key",
];

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s));
}

function maskValue(key: string, value: unknown): string {
  if (isSensitive(key)) return "****";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EnvViewer({ settings, isLoading }: EnvViewerProps) {
  if (isLoading) {
    return <CardSkeleton />;
  }

  // Show non-sensitive env vars and config
  const envEntries = Object.entries(settings).filter(([key]) => {
    // Skip internal settings shown in other components
    return !["auto_approve", "posting_schedule"].includes(key);
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Environment & Config</h3>
        <span className="text-xs text-muted-foreground ml-auto">Read-only</span>
      </div>

      {envEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No configuration entries found.</p>
      ) : (
        <div className="divide-y divide-border">
          {envEntries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-2.5 gap-4">
              <span className="text-xs font-mono text-muted-foreground">{key}</span>
              <span className="text-xs text-foreground font-mono truncate max-w-[300px]">
                {maskValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
