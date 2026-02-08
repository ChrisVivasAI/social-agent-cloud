const AGENT_BASE_URL = process.env.AGENT_API_URL || "http://localhost:3002";

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function agentFetch<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, ...rest } = options;

  const res = await fetch(`${AGENT_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Agent API error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return res.text() as unknown as T;
}

// Queue endpoints
export const queueApi = {
  getItems: (status?: string) =>
    agentFetch(`/api/queue${status ? `?status=${status}` : ""}`),
  getItem: (id: string) => agentFetch(`/api/queue/${id}`),
  approve: (id: string) => agentFetch(`/api/queue/${id}/approve`, { method: "POST" }),
  reject: (id: string, reason?: string) =>
    agentFetch(`/api/queue/${id}/reject`, { method: "POST", body: { reason } }),
  reschedule: (id: string, scheduledFor: string) =>
    agentFetch(`/api/queue/${id}/reschedule`, { method: "POST", body: { scheduled_for: scheduledFor } }),
  pause: (id: string) => agentFetch(`/api/queue/${id}/pause`, { method: "POST" }),
  resume: (id: string) => agentFetch(`/api/queue/${id}/resume`, { method: "POST" }),
  retry: (id: string) => agentFetch(`/api/queue/${id}/retry`, { method: "POST" }),
  delete: (id: string) => agentFetch(`/api/queue/${id}`, { method: "DELETE" }),
};

// Engagement endpoints
export const engagementApi = {
  getItems: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return agentFetch(`/api/engagement${qs}`);
  },
};

// Video endpoints
export const videoApi = {
  getProjects: () => agentFetch("/api/video-projects"),
  getProject: (id: string) => agentFetch(`/api/video-projects/${id}`),
  getIdeas: () => agentFetch("/api/video-ideas"),
  approveIdea: (id: string) =>
    agentFetch(`/api/video-ideas/${id}/approve`, { method: "POST" }),
  rejectIdea: (id: string) =>
    agentFetch(`/api/video-ideas/${id}/reject`, { method: "POST" }),
  addFeedback: (id: string, feedback: string) =>
    agentFetch(`/api/video-projects/${id}/feedback`, {
      method: "POST",
      body: { feedback },
    }),
};

// Discovery endpoints
export const discoveryApi = {
  getItems: () => agentFetch("/api/discovery"),
  dismiss: (id: string) => agentFetch(`/api/discovery/${id}/dismiss`, { method: "POST" }),
  queue: (id: string) => agentFetch(`/api/discovery/${id}/queue`, { method: "POST" }),
};

// System endpoints
export const systemApi = {
  getHealth: () => agentFetch("/health"),
  getStatus: () => agentFetch("/api/status"),
  updateSettings: (settings: Record<string, unknown>) =>
    agentFetch("/api/settings", { method: "PUT", body: settings }),
};

// Chat endpoint
export interface ChatResponse {
  reply: string;
  actions?: Array<{ type: string; label: string; data: unknown }>;
}

export const chatApi = {
  sendMessage: (message: string) =>
    agentFetch<ChatResponse>("/api/chat", { method: "POST", body: { message } }),
};

// SSE connection helper for activity feed
export function connectActivityStream(
  onEvent: (event: { type: string; data: unknown; timestamp: string }) => void,
  onError?: (error: Event) => void
): EventSource {
  const es = new EventSource("/api/proxy/api/activity");

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {
      // ignore malformed events
    }
  };

  if (onError) {
    es.onerror = onError;
  }

  return es;
}
