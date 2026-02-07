"use client";

import { usePathname } from "next/navigation";

interface LayoutShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}

export function LayoutShell({ sidebar, header, children }: LayoutShellProps) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebar}
      <div className="flex flex-col flex-1 overflow-hidden">
        {header}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
