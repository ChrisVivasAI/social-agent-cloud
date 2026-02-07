"use client";

import { useState, useEffect, useRef } from "react";
import { PlatformIcon } from "@/components/shared/platform-icon";
import type { ContentQueueItem, Platform } from "@/lib/supabase/types";
import { X } from "lucide-react";

interface EditDialogProps {
  item: ContentQueueItem | null;
  onSave: (id: string, data: { twitter_text?: string; linkedin_text?: string; platform?: Platform }) => Promise<void>;
  onClose: () => void;
}

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "twitter", label: "Twitter" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "both", label: "Both" },
];

export function EditDialog({ item, onSave, onClose }: EditDialogProps) {
  const [twitterText, setTwitterText] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [platform, setPlatform] = useState<Platform>("both");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (item) {
      setTwitterText(item.generated_post_twitter || item.generated_post || "");
      setLinkedinText(item.generated_post_linkedin || item.generated_post || "");
      setPlatform(item.platform);
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
      await onSave(item.id, {
        twitter_text: twitterText,
        linkedin_text: linkedinText,
        platform,
      });
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
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-lg border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Edit Content</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <PlatformIcon platform="twitter" className="w-4 h-4" />
              Twitter Post
            </label>
            <textarea
              value={twitterText}
              onChange={(e) => setTwitterText(e.target.value)}
              rows={4}
              maxLength={280}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Twitter post text..."
            />
            <span className="text-xs text-muted-foreground">{twitterText.length}/280</span>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <PlatformIcon platform="linkedin" className="w-4 h-4" />
              LinkedIn Post
            </label>
            <textarea
              value={linkedinText}
              onChange={(e) => setLinkedinText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="LinkedIn post text..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Platform</label>
            <div className="flex gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    platform === p.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <PlatformIcon platform={p.value} className="w-3.5 h-3.5" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
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
