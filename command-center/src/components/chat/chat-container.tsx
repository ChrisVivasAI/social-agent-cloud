"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { CommandSuggestions } from "./command-suggestions";

export function ChatContainer() {
  const { messages, sendMessage, isLoading, executeAction, clearHistory } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSuggestion = useCallback((command: string) => {
    // If the command ends with a space (like "generate a post about "),
    // let the user finish typing
    if (command.endsWith(" ")) {
      setPendingSuggestion(command);
      return;
    }
    sendMessage(command);
  }, [sendMessage]);

  const handleSend = useCallback((text: string) => {
    setPendingSuggestion(null);
    sendMessage(text);
  }, [sendMessage]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Agent Chat</h2>
          <p className="text-xs text-muted-foreground">
            Command your social media agent
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Clear chat history"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-muted-foreground text-sm mb-2">
              No messages yet
            </div>
            <div className="text-muted-foreground text-xs">
              Use the suggestions below or type a command to get started.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAction={executeAction}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <CommandSuggestions onSelect={handleSuggestion} />

      {/* Pending suggestion hint */}
      {pendingSuggestion && (
        <div className="px-4 pb-1 text-xs text-muted-foreground">
          Finish your command: <span className="text-foreground">{pendingSuggestion}</span>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
