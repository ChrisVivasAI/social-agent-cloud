"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { VoiceProfileView } from "@/components/memory/voice-profile";
import { MemoryBrowser } from "@/components/memory/memory-browser";
import { InsightsList } from "@/components/memory/insights";
import { ProceduralRules } from "@/components/memory/procedural-rules";
import { EpisodeTimeline } from "@/components/memory/episode-timeline";
import { useMemory } from "@/hooks/use-memory";

const TABS = [
  { key: "voice", label: "Voice Profile" },
  { key: "memories", label: "Memory Browser" },
  { key: "insights", label: "Insights" },
  { key: "rules", label: "Procedural Rules" },
  { key: "timeline", label: "Episode Timeline" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("voice");
  const { memories, voiceProfile, insights, isLoading } = useMemory();

  const proceduralRules = memories.filter((m) => m.category === "pattern");
  const episodesWithType = memories.filter((m) => m.episode_type);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Memory & Intelligence
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only view of the agent&apos;s learned knowledge and voice profile.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "voice" && (
        <VoiceProfileView profile={voiceProfile} isLoading={isLoading} />
      )}
      {activeTab === "memories" && (
        <MemoryBrowser memories={memories} isLoading={isLoading} />
      )}
      {activeTab === "insights" && (
        <InsightsList insights={insights} isLoading={isLoading} />
      )}
      {activeTab === "rules" && (
        <ProceduralRules rules={proceduralRules} isLoading={isLoading} />
      )}
      {activeTab === "timeline" && (
        <EpisodeTimeline episodes={episodesWithType} isLoading={isLoading} />
      )}
    </div>
  );
}
