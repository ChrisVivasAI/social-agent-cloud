"use client";

import { useState, useEffect, useRef } from "react";
import type { ContentQueueItem } from "@/lib/supabase/types";
import { X, CalendarClock } from "lucide-react";

interface RescheduleDialogProps {
  item: ContentQueueItem | null;
  onSave: (id: string, scheduledFor: string) => Promise<void>;
  onClose: () => void;
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return formatForInput(now);
  }
  return formatForInput(new Date(iso));
}

function formatForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function RescheduleDialog({ item, onSave, onClose }: RescheduleDialogProps) {
  const [datetime, setDatetime] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (item) {
      setDatetime(toLocalDatetime(item.scheduled_for));
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [item]);

  if (!item) return null;

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    try {
      const iso = new Date(datetime).toISOString();
      await onSave(item.id, iso);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-transparent"
      onClose={onClose}
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarClock className="w-5 h-5" />
            Reschedule
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Scheduled Date & Time
          </label>
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
