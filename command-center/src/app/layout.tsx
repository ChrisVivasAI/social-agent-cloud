import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { LayoutShell } from "@/components/layout/layout-shell";

export const metadata: Metadata = {
  title: "Command Center",
  description: "Social media agent dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <LayoutShell sidebar={<Sidebar />} header={<Header />}>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}
