"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AgentMemoryEntry,
  VoiceProfile,
  PerformanceInsight,
} from "@/lib/supabase/types";

interface UseMemoryReturn {
  memories: AgentMemoryEntry[];
  voiceProfile: VoiceProfile | null;
  insights: PerformanceInsight[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useMemory(): UseMemoryReturn {
  const [memories, setMemories] = useState<AgentMemoryEntry[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [insights, setInsights] = useState<PerformanceInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const client = getSupabaseBrowserClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = client as any;

      // Fetch each table independently so one missing table doesn't block the others
      const [memoriesRes, profileRes, insightsRes] = await Promise.allSettled([
        sb
          .from("agent_memory")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        sb.from("voice_profile").select("*").limit(1).single(),
        sb
          .from("performance_insights")
          .select("*")
          .order("generated_at", { ascending: false })
          .limit(100),
      ]);

      if (memoriesRes.status === "fulfilled" && memoriesRes.value?.data) {
        setMemories(memoriesRes.value.data as AgentMemoryEntry[]);
      }
      if (profileRes.status === "fulfilled" && profileRes.value?.data) {
        setVoiceProfile(profileRes.value.data as VoiceProfile);
      }
      if (insightsRes.status === "fulfilled" && insightsRes.value?.data) {
        setInsights(insightsRes.value.data as PerformanceInsight[]);
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

  return { memories, voiceProfile, insights, isLoading, refetch: fetchData };
}
