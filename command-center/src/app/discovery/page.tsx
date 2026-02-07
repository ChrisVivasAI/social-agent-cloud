"use client";

import { Search } from "lucide-react";
import { FeedList } from "@/components/discovery/feed-list";
import { useDiscovery } from "@/hooks/use-discovery";

export default function DiscoveryPage() {
  const { items, isLoading, queue, dismiss } = useDiscovery();

  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Search className="w-5 h-5" />
          Content Discovery
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          RSS discoveries with relevance scores.
          {newCount > 0 && (
            <span className="ml-2 text-blue-400">{newCount} new items</span>
          )}
        </p>
      </div>

      <FeedList
        items={items}
        isLoading={isLoading}
        onQueue={queue}
        onDismiss={dismiss}
      />
    </div>
  );
}
