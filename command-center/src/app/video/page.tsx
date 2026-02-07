"use client";

import { useState } from "react";
import { Film, Layers, Lightbulb, FileVideo } from "lucide-react";
import { ProjectList } from "@/components/video/project-list";
import { SeriesList } from "@/components/video/series-list";
import { IdeaList } from "@/components/video/idea-list";
import { FootageBrowser } from "@/components/video/footage-browser";
import { RenderStatus } from "@/components/video/render-status";

const TABS = [
  { id: "projects", label: "Projects", icon: Film },
  { id: "series", label: "Series", icon: Layers },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "footage", label: "Footage", icon: FileVideo },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function VideoPage() {
  const [activeTab, setActiveTab] = useState<TabId>("projects");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Video Studio</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage video projects, series, ideas, and footage.
        </p>
      </div>

      <RenderStatus />

      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div>
        {activeTab === "projects" && <ProjectList />}
        {activeTab === "series" && <SeriesList />}
        {activeTab === "ideas" && <IdeaList />}
        {activeTab === "footage" && <FootageBrowser />}
      </div>
    </div>
  );
}
