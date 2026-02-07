export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  generating: { bg: "bg-blue-500/20", text: "text-blue-400" },
  generated: { bg: "bg-blue-500/20", text: "text-blue-400" },
  rendering: { bg: "bg-indigo-500/20", text: "text-indigo-400" },
  awaiting_approval: { bg: "bg-orange-500/20", text: "text-orange-400" },
  ready: { bg: "bg-green-500/20", text: "text-green-400" },
  posting: { bg: "bg-teal-500/20", text: "text-teal-400" },
  posted: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  failed: { bg: "bg-red-500/20", text: "text-red-400" },
  skipped: { bg: "bg-gray-500/20", text: "text-gray-400" },
  paused: { bg: "bg-gray-500/20", text: "text-gray-400" },
  // Video project statuses
  draft: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
  analyzing: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  editing: { bg: "bg-blue-500/20", text: "text-blue-400" },
  review: { bg: "bg-amber-500/20", text: "text-amber-400" },
  approved: { bg: "bg-green-500/20", text: "text-green-400" },
  archived: { bg: "bg-gray-500/20", text: "text-gray-400" },
  // Video idea statuses
  pitched: { bg: "bg-purple-500/20", text: "text-purple-400" },
  rejected: { bg: "bg-red-500/20", text: "text-red-400" },
  in_production: { bg: "bg-blue-500/20", text: "text-blue-400" },
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  // Footage analysis statuses
  scanning: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  analyzed: { bg: "bg-green-500/20", text: "text-green-400" },
  // Series episode statuses
  planned: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
};

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  link: "Link",
  image: "Image",
  video: "Video",
  remotion: "Remotion",
  text: "Text",
  video_edit: "Video Edit",
};

export const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  linkedin: "LinkedIn",
  both: "Both",
};

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Chat", href: "/chat", icon: "Terminal" },
  { label: "Queue", href: "/queue", icon: "ListTodo" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Analytics", href: "/analytics", icon: "BarChart3" },
  { label: "Video Studio", href: "/video", icon: "Film" },
  { label: "Engagement", href: "/engagement", icon: "MessageSquare" },
  { label: "Memory", href: "/memory", icon: "Brain" },
  { label: "Discovery", href: "/discovery", icon: "Search" },
  { label: "Settings", href: "/settings", icon: "Settings" },
  { label: "Activity Feed", href: "/activity", icon: "Activity" },
] as const;
