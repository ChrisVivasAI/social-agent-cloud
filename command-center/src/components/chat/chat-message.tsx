"use client";

import type { ChatMessage as ChatMessageType, ChatAction } from "@/hooks/use-chat";
import { ActionCard } from "./action-card";

interface ChatMessageProps {
  message: ChatMessageType;
  onAction?: (action: ChatAction) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderMarkdown(text: string): string {
  // Minimal markdown: bold, code, line breaks
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>')
    .replace(/\n/g, "<br />");
}

export function ChatMessage({ message, onAction }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[80%] space-y-2`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            className="leading-relaxed [&_strong]:font-semibold"
          />
        </div>

        {message.actions && message.actions.length > 0 && (
          <div className="space-y-1">
            {message.actions.map((action, i) => (
              <ActionCard
                key={i}
                action={action}
                onExecute={onAction ? () => onAction(action) : undefined}
              />
            ))}
          </div>
        )}

        <div
          className={`text-[10px] text-muted-foreground ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
