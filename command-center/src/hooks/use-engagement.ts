"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeSubscription } from "./use-realtime";
import type { Mention } from "@/components/engagement/mention-card";

async function proxyPost(path: string, body?: unknown) {
  const res = await fetch(`/api/proxy${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface UseEngagementReturn {
  mentions: Mention[];
  isLoading: boolean;
  approve: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  editReply: (id: string, text: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useEngagement(): UseEngagementReturn {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client
        .from("processed_mentions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      // If table doesn't exist, just show empty state
      if (error) {
        setMentions([]);
        return;
      }
      setMentions((data as Mention[]) ?? []);
    } catch {
      // silently fail on load — table may not exist
      setMentions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription("processed_mentions", undefined, () => {
    fetchData();
  });

  const approve = async (id: string) => {
    await proxyPost(`/api/engagement/${id}/approve`);
    await fetchData();
  };

  const dismiss = async (id: string) => {
    await proxyPost(`/api/engagement/${id}/dismiss`);
    await fetchData();
  };

  const editReply = async (id: string, text: string) => {
    await proxyPost(`/api/engagement/${id}/edit`, { draft_reply: text });
    await fetchData();
  };

  return { mentions, isLoading, approve, dismiss, editReply, refetch: fetchData };
}
