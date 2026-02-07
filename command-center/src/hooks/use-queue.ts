"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import type { ContentQueueItem } from "@/lib/supabase/types";

export function useQueueItems() {
  const [items, setItems] = useState<ContentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const client = getSupabaseBrowserClient();
      const { data, error: err } = await client
        .from("content_queue")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (err) throw err;
      setItems((data as ContentQueueItem[]) || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch queue items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useRealtimeSubscription<ContentQueueItem>("content_queue", undefined, (payload) => {
    setItems((prev) => {
      if (payload.eventType === "INSERT") {
        return [payload.new, ...prev];
      }
      if (payload.eventType === "UPDATE") {
        return prev.map((item) => (item.id === payload.new.id ? payload.new : item));
      }
      if (payload.eventType === "DELETE") {
        return prev.filter((item) => item.id !== payload.old.id);
      }
      return prev;
    });
  });

  return { items, loading, error, refetch: fetchItems };
}

// Summary hook for the dashboard
export interface QueueSummary {
  pending: number;
  generating: number;
  awaiting_approval: number;
  ready: number;
  paused: number;
  posted_today: number;
  failed: number;
}

export function useQueueSummary() {
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const client = getSupabaseBrowserClient();
      const { data: rawData } = await client
        .from("content_queue")
        .select("id, status, posted_at");

      const data = (rawData ?? []) as unknown as Array<{ id: string; status: string; posted_at: string | null }>;
      if (data.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        setSummary({
          pending: data.filter((i) => i.status === "pending").length,
          generating: data.filter((i) => i.status === "generating").length,
          awaiting_approval: data.filter((i) => i.status === "awaiting_approval").length,
          ready: data.filter((i) => i.status === "ready").length,
          paused: data.filter((i) => i.status === "paused").length,
          posted_today: data.filter(
            (i) => i.status === "posted" && i.posted_at?.startsWith(today)
          ).length,
          failed: data.filter((i) => i.status === "failed").length,
        });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useRealtimeSubscription("content_queue", undefined, () => {
    fetchSummary();
  });

  return { summary, loading, refetch: fetchSummary };
}

// Mutation helpers for queue actions via the API proxy
export async function queueAction(id: string, action: string, body?: unknown) {
  const res = await fetch(`/api/proxy/api/queue/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Queue action failed: ${res.status}`);
  return res.json().catch(() => ({}));
}
