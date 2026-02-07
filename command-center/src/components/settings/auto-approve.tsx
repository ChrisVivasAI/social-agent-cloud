"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { CardSkeleton } from "@/components/shared/loading-skeleton";

interface AutoApproveProps {
  settings: Record<string, unknown>;
  isLoading: boolean;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}

export function AutoApprove({ settings, isLoading, onSave }: AutoApproveProps) {
  const autoApproveConfig = (settings.auto_approve as Record<string, unknown>) || {};
  const [enabled, setEnabled] = useState<boolean>((autoApproveConfig.enabled as boolean) ?? false);
  const [threshold, setThreshold] = useState<number>((autoApproveConfig.confidence_threshold as number) ?? 0.8);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        auto_approve: {
          enabled,
          confidence_threshold: threshold,
        },
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <CardSkeleton />;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Auto-Approve</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Enable auto-approve</p>
            <p className="text-xs text-muted-foreground">
              Automatically approve content above the confidence threshold.
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-green-600" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground">Confidence threshold</p>
            <span className="text-sm text-muted-foreground">{Math.round(threshold * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
