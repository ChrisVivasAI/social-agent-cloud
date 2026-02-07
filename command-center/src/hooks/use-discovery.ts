"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRealtimeSubscription } from "./use-realtime";
import type { DiscoveredContent } from "@/lib/supabase/types";

async function proxyPost(path: string, body?: unknown) {
  const res = await fetch(`/api/proxy${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface UseDiscoveryReturn {
  items: DiscoveredContent[];
  isLoading: boolean;
  queue: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useDiscovery(): UseDiscoveryReturn {
  const [items, setItems] = useState<DiscoveredContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const client = getSupabaseBrowserClient();
      const { data } = await client
        .from("discovered_content")
        .select("*")
        .order("discovered_at", { ascending: false })
        .limit(200);

      if (data) setItems(data as DiscoveredContent[]);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription("discovered_content", undefined, () => {
    fetchData();
  });

  const queue = async (id: string) => {
    await proxyPost(`/api/discovery/${id}/queue`);
    await fetchData();
  };

  const dismiss = async (id: string) => {
    await proxyPost(`/api/discovery/${id}/dismiss`);
    await fetchData();
  };

  return { items, isLoading, queue, dismiss, refetch: fetchData };
}
