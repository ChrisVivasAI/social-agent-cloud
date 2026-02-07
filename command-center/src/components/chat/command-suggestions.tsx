"use client";

import {
  ListTodo,
  BarChart3,
  Calendar,
  Sparkles,
  HelpCircle,
  CheckSquare,
} from "lucide-react";
import type { ComponentType } from "react";

interface Suggestion {
  label: string;
  command: string;
  icon: ComponentType<{ className?: string }>;
}

const SUGGESTIONS: Suggestion[] = [
  { label: "Queue Status", command: "queue status", icon: ListTodo },
  { label: "Awaiting Approval", command: "awaiting approval", icon: CheckSquare },
  { label: "Upcoming Posts", command: "show upcoming", icon: Calendar },
  { label: "Generate Post", command: "generate a post about ", icon: Sparkles },
  { label: "Analytics", command: "analytics", icon: BarChart3 },
  { label: "Help", command: "help", icon: HelpCircle },
];

interface CommandSuggestionsProps {
  onSelect: (command: string) => void;
}

export function CommandSuggestions({ onSelect }: CommandSuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-2">
      {SUGGESTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.command}
            onClick={() => onSelect(s.command)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-ring transition-colors"
          >
            <Icon className="h-3 w-3" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
