import { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./client";

type RealtimeCallback<T = Record<string, unknown>> = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
}) => void;

export function subscribeToTable<T = Record<string, unknown>>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: string
): RealtimeChannel {
  const client = getSupabaseBrowserClient();

  let channel = client.channel(`table-${table}`);

  const opts: {
    event: "*";
    schema: "public";
    table: string;
    filter?: string;
  } = {
    event: "*",
    schema: "public",
    table,
  };

  if (filter) {
    opts.filter = filter;
  }

  channel = channel.on(
    "postgres_changes",
    opts,
    (payload) => {
      callback(payload as unknown as Parameters<RealtimeCallback<T>>[0]);
    }
  );

  channel.subscribe();
  return channel;
}

export function unsubscribe(channel: RealtimeChannel) {
  const client = getSupabaseBrowserClient();
  client.removeChannel(channel);
}
