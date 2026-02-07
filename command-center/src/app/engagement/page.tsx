"use client";

import { MessageSquare } from "lucide-react";
import { MentionList } from "@/components/engagement/mention-list";
import { useEngagement } from "@/hooks/use-engagement";

export default function EngagementPage() {
  const { mentions, isLoading, approve, dismiss, editReply } = useEngagement();

  const pendingCount = mentions.filter((m) => !m.replied).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Engagement Inbox
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Twitter mentions with AI-drafted replies.
            {pendingCount > 0 && (
              <span className="ml-2 text-yellow-400">{pendingCount} pending</span>
            )}
          </p>
        </div>
      </div>

      <MentionList
        mentions={mentions}
        isLoading={isLoading}
        onApprove={approve}
        onDismiss={dismiss}
        onEditReply={editReply}
      />
    </div>
  );
}
