"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface ActivityEvent {
  id: string;
  type: string;
  data: unknown;
  timestamp: string;
  message?: string;
}

interface UseActivityFeedReturn {
  events: ActivityEvent[];
  isConnected: boolean;
  clear: () => void;
}

let eventCounter = 0;

export function useActivityFeed(maxEvents = 100): UseActivityFeedReturn {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource("/api/proxy/api/activity");
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const activityEvent: ActivityEvent = {
          id: `evt-${++eventCounter}`,
          type: parsed.type || "info",
          data: parsed.data ?? parsed,
          timestamp: parsed.timestamp || new Date().toISOString(),
          message: parsed.message || parsed.type || "Event",
        };

        setEvents((prev) => {
          const next = [activityEvent, ...prev];
          return next.slice(0, maxEvents);
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      esRef.current = null;

      // Auto-reconnect after 3 seconds
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [maxEvents]);

  useEffect(() => {
    connect();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, clear };
}
