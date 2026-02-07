"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  Calendar,
  BarChart3,
  Film,
  MessageSquare,
  Brain,
  Search,
  Settings,
  Activity,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  ListTodo,
  Calendar,
  BarChart3,
  Film,
  MessageSquare,
  Brain,
  Search,
  Settings,
  Activity,
  Terminal,
};

const NAV_ITEMS = [
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
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">
            Command Center
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              title={collapsed ? item.label : undefined}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
