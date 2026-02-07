"use client";

import { useEffect, useRef } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { subscribeToTable, unsubscribe } from "@/lib/supabase/realtime";

type RealtimePayload<T> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
};

export function useRealtimeSubscription<T = Record<string, unknown>>(
  table: string,
  filter?: { column: string; value: string },
  callback?: (payload: RealtimePayload<T>) => void
): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const filterStr = filter ? `${filter.column}=eq.${filter.value}` : undefined;

    channelRef.current = subscribeToTable<T>(
      table,
      (payload) => {
        callbackRef.current?.(payload);
      },
      filterStr
    );

    return () => {
      if (channelRef.current) {
        unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter?.column, filter?.value]);
}
