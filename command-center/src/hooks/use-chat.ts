"use client";

import { useState, useCallback, useEffect } from "react";

export interface ChatAction {
  type: string;
  label: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  actions?: ChatAction[];
  timestamp: string;
}

const STORAGE_KEY = "command-center-chat-history";

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return [];
}

function saveMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep last 100 messages
    const toSave = messages.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

async function postChat(message: string): Promise<{ reply: string; actions?: ChatAction[] }> {
  const res = await fetch("/api/proxy/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Chat API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMessages(loadMessages());
  }, []);

  // Persist when messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await postChat(text);
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        content: response.reply,
        actions: response.actions as ChatAction[] | undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        content: `Error: ${err instanceof Error ? err.message : "Failed to reach agent"}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const executeAction = useCallback(async (action: ChatAction) => {
    // Execute actions by sending them as chat commands
    if (action.type === "approvable_item" && action.data.id) {
      await sendMessage(`approve ${action.data.id}`);
    } else if (action.type === "queue_item" && action.data.id) {
      await sendMessage(`approve ${action.data.id}`);
    }
  }, [sendMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    executeAction,
    clearHistory,
  };
}
