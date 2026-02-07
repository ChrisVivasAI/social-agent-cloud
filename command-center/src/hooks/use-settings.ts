"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function proxyPut(path: string, body: unknown) {
  const res = await fetch(`/api/proxy${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface UseSettingsReturn {
  settings: Record<string, unknown>;
  isLoading: boolean;
  updateSettings: (updates: Record<string, unknown>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = getSupabaseBrowserClient() as any;
      const { data } = await client.from("agent_settings").select("*");

      if (data) {
        const map: Record<string, unknown> = {};
        for (const row of data as Array<{ key: string; value: unknown }>) {
          try {
            map[row.key] = JSON.parse(row.value as string);
          } catch {
            map[row.key] = row.value;
          }
        }
        setSettings(map);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateSettings = async (updates: Record<string, unknown>) => {
    await proxyPut("/api/settings", updates);
    await fetchData();
  };

  return { settings, isLoading, updateSettings, refetch: fetchData };
}
