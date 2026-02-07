"use client";

import { useState } from "react";

interface ReplyEditorProps {
  initialText: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}

export function ReplyEditor({ initialText, onSave, onCancel }: ReplyEditorProps) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const charLimit = 280;
  const remaining = charLimit - text.length;
  const isOverLimit = remaining < 0;

  async function handleSave() {
    if (isOverLimit || saving) return;
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${
            isOverLimit ? "text-red-400" : remaining < 20 ? "text-yellow-400" : "text-muted-foreground"
          }`}
        >
          {remaining} characters remaining
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isOverLimit || saving}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
