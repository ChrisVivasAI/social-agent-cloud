"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/chat": "Chat",
  "/queue": "Queue",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/video": "Video Studio",
  "/engagement": "Engagement",
  "/memory": "Memory",
  "/discovery": "Discovery",
  "/settings": "Settings",
  "/activity": "Activity Feed",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/video/") && pathname !== "/video") {
    return "Video Project";
  }
  return PAGE_TITLES[pathname] || "Command Center";
}

function getBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [];

  let path = "";
  for (const part of parts) {
    path += `/${part}`;
    const label = PAGE_TITLES[path] || part;
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);
  const breadcrumbs = getBreadcrumbs(pathname);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {breadcrumbs.length > 1 && (
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                <span>{crumb.label}</span>
              </span>
            ))}
          </nav>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <LogOut className="w-4 h-4" />
        <span>Logout</span>
      </button>
    </header>
  );
}
