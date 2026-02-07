import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { ContentQueueService } from "./content-queue.js";
import {
  buildReviewCard,
  buildApprovedCard,
  buildAutoApprovedCard,
  buildSkippedCard,
  buildPausedCard,
  buildFailedCard,
  buildPostedCard,
  buildDiscoveryCard,
  buildRepostSuggestionCard,
  buildEngagementCard,
} from "../utils/slack-blocks.js";
import { ContentDiscoveryService } from "./content-discovery.js";
import type { DraftedEngagement } from "./engagement-monitor.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import {
  buildVideoIdeaCard,
  buildVideoReviewCard,
  buildVideoStatusCard,
} from "../utils/slack-blocks.js";
import type { AgentMemoryService } from "./agent-memory.js";
import type {
  ContentQueueItem,
  DiscoveredContent,
  Platform,
  VideoIdea,
  VideoProject,
} from "../types/index.js";

export class SlackHandlerService {
  private webClient: WebClient | null = null;
  private memory: AgentMemoryService | null;

  constructor(
    private contentQueue: ContentQueueService,
    memory?: AgentMemoryService,
  ) {
    this.memory = memory || null;
  }

  setWebClient(client: WebClient): void {
    this.webClient = client;
  }

  private getClient(): WebClient {
    if (!this.webClient) throw new Error("WebClient not initialized");
    return this.webClient;
  }

  async handleApprove(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.approveItem(itemId);
    const updated = { ...item, status: "ready" as const };
    await this.updateReviewCard(updated, buildApprovedCard(updated));

    // Record approval as episodic memory
    this.recordEpisode("approve", item).catch((err) =>
      logger.warn(`Failed to record approve episode: ${err}`),
    );

    logger.info(`Approved item ${itemId}`);
  }

  async handleSkip(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.skipItem(itemId);
    const updated = { ...item, status: "skipped" as const };
    await this.updateReviewCard(updated, buildSkippedCard(updated));

    // Record skip as rejection episode
    this.recordEpisode("reject", item, "skip").catch((err) =>
      logger.warn(`Failed to record skip episode: ${err}`),
    );

    logger.info(`Skipped item ${itemId}`);
  }

  async handlePause(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.pauseItem(itemId);
    const updated = { ...item, status: "paused" as const };
    await this.updateReviewCard(updated, buildPausedCard(updated));

    // Record pause as soft reject episode
    this.recordEpisode("reject", item, "pause").catch((err) =>
      logger.warn(`Failed to record pause episode: ${err}`),
    );

    logger.info(`Paused item ${itemId}`);
  }

  async handleResume(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.updateItem(itemId, {
      status: "awaiting_approval",
    });
    const updated = { ...item, status: "awaiting_approval" as const };
    await this.updateReviewCard(updated, buildReviewCard(updated));
    logger.info(`Resumed item ${itemId}`);
  }

  async handleRetry(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.updateItem(itemId, {
      status: "pending",
      error_message: null,
    });
    const updated = { ...item, status: "pending" as const };
    await this.updateReviewCard(updated, buildReviewCard(updated));
    logger.info(`Retrying item ${itemId}`);
  }

  async handlePostNow(itemId: string): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.updateItem(itemId, {
      scheduled_for: new Date().toISOString(),
      status: "ready",
    });
    const updated = {
      ...item,
      status: "ready" as const,
      scheduled_for: new Date().toISOString(),
    };
    await this.updateReviewCard(updated, buildApprovedCard(updated));
    logger.info(`Post-now item ${itemId}`);
  }

  async handleEditSubmission(
    itemId: string,
    twitterCaption: string,
    linkedinCaption: string,
    platform: Platform,
  ): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    // Capture original text BEFORE overwriting for voice learning
    const originalTwitter = item.generated_post_twitter || item.generated_post || "";
    const originalLinkedin = item.generated_post_linkedin || item.generated_post || "";

    await this.contentQueue.updateItem(itemId, {
      generated_post_twitter: twitterCaption,
      generated_post_linkedin: linkedinCaption,
      generated_post: twitterCaption, // keep fallback in sync
      platform,
    });

    const updated = {
      ...item,
      generated_post_twitter: twitterCaption,
      generated_post_linkedin: linkedinCaption,
      generated_post: twitterCaption,
      platform,
    };
    await this.updateReviewCard(updated, buildReviewCard(updated));

    // Record edit episodes with original vs edited text for voice learning
    if (this.memory) {
      const editPromises: Promise<unknown>[] = [];

      if (originalTwitter && originalTwitter !== twitterCaption) {
        editPromises.push(
          this.memory.recordFeedback("edit", {
            contentId: itemId,
            contentType: item.type,
            originalText: originalTwitter,
            editedText: twitterCaption,
            platform: "twitter",
          }),
        );
      }

      if (originalLinkedin && originalLinkedin !== linkedinCaption) {
        editPromises.push(
          this.memory.recordFeedback("edit", {
            contentId: itemId,
            contentType: item.type,
            originalText: originalLinkedin,
            editedText: linkedinCaption,
            platform: "linkedin",
          }),
        );
      }

      Promise.all(editPromises).catch((err) =>
        logger.warn(`Failed to record edit episodes: ${err}`),
      );
    }

    logger.info(`Edited captions for item ${itemId}`);
  }

  async handleRescheduleSubmission(
    itemId: string,
    newDate: string,
  ): Promise<void> {
    const item = await this.contentQueue.getItem(itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    await this.contentQueue.updateItem(itemId, {
      scheduled_for: newDate,
    });

    const updated = { ...item, scheduled_for: newDate };
    await this.updateReviewCard(updated, buildReviewCard(updated));
    logger.info(`Rescheduled item ${itemId} to ${newDate}`);
  }

  async sendReviewCard(
    item: ContentQueueItem,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildReviewCard(item);

    let result;
    try {
      result = await client.chat.postMessage({
        channel: channelId,
        text: `New post ready for review: ${item.type}`,
        blocks,
        thread_ts: item.slack_message_ts || undefined,
      });
    } catch (error) {
      // If blocks fail (e.g. Slack can't fetch an image URL), retry without image blocks
      logger.warn(`Review card failed with blocks, retrying without images: ${error}`);
      const safeBlocks = blocks.filter((b) => b.type !== "image");
      result = await client.chat.postMessage({
        channel: channelId,
        text: `New post ready for review: ${item.type}`,
        blocks: safeBlocks,
        thread_ts: item.slack_message_ts || undefined,
      });
    }

    // Store the message ts so we can update the card later
    if (result.ts) {
      await this.contentQueue.updateItem(item.id, {
        slack_review_ts: result.ts,
        slack_review_channel_id: channelId,
      });
    }
  }

  async updateReviewCard(
    item: ContentQueueItem,
    blocks: KnownBlock[],
  ): Promise<void> {
    const ts = item.slack_review_ts;
    const channel = item.slack_review_channel_id;
    if (!ts || !channel) return;

    try {
      const client = this.getClient();
      await client.chat.update({
        channel,
        ts,
        text: `Post update: ${item.status}`,
        blocks,
      });
    } catch (error) {
      logger.warn(`Failed to update review card for item ${item.id}: ${error}`);
    }
  }

  async sendAutoApprovedCard(
    item: ContentQueueItem,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildAutoApprovedCard(item);

    const result = await client.chat.postMessage({
      channel: channelId,
      text: `Post auto-approved: ${item.type}`,
      blocks,
      thread_ts: item.slack_message_ts || undefined,
    });

    if (result.ts) {
      await this.contentQueue.updateItem(item.id, {
        slack_review_ts: result.ts,
        slack_review_channel_id: channelId,
      });
    }
  }

  async sendPostedCard(
    item: ContentQueueItem,
    twitterUrl?: string,
    linkedinId?: string,
  ): Promise<void> {
    const updated = { ...item, status: "posted" as const };
    await this.updateReviewCard(
      updated,
      buildPostedCard(updated, twitterUrl, linkedinId),
    );
  }

  async sendFailedCard(item: ContentQueueItem): Promise<void> {
    const updated = { ...item, status: "failed" as const };
    const blocks = buildFailedCard(updated);

    // Also update review card if it exists
    if (updated.slack_review_ts && updated.slack_review_channel_id) {
      await this.updateReviewCard(updated, blocks);
    }

    // Always post a new top-level message for failures
    const client = this.getClient();
    const channelId =
      item.slack_channel_id ||
      (await import("../config/env.js")).getConfig().SLACK_CHANNEL_ID;
    if (!channelId) {
      logger.warn(`No channel to send failed card for item ${item.id}`);
      return;
    }
    try {
      await client.chat.postMessage({
        channel: channelId,
        text: `Post failed: ${item.type} (${item.id.substring(0, 8)})`,
        blocks,
      });
    } catch (error) {
      logger.error(`Failed to send failure notification for item ${item.id}: ${error}`);
    }
  }

  // ─── Content Discovery handlers ───

  async sendDiscoveryCard(
    item: DiscoveredContent,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildDiscoveryCard(item);
    await client.chat.postMessage({
      channel: channelId,
      text: `Content discovery: ${item.title || item.url}`,
      blocks,
    });
  }

  async handleQueueDiscovery(discoveryId: string): Promise<void> {
    const discovery = new ContentDiscoveryService();
    const supabase = createSupabaseClient();

    const { data } = await supabase
      .from("discovered_content")
      .select("*")
      .eq("id", discoveryId)
      .single();

    if (!data) throw new Error(`Discovery ${discoveryId} not found`);

    // Create a content queue item from the discovery
    const queueItem = await this.contentQueue.addItem({
      type: "link",
      content_url: data.url,
      source_text: data.summary || undefined,
    });

    await discovery.markQueued(discoveryId, queueItem.id);
    logger.info(
      `Queued discovery ${discoveryId} as content queue item ${queueItem.id}`,
    );
  }

  async handleDismissDiscovery(discoveryId: string): Promise<void> {
    const discovery = new ContentDiscoveryService();
    await discovery.markDismissed(discoveryId);
    logger.info(`Dismissed discovery ${discoveryId}`);
  }

  // ─── Evergreen Repost handlers ───

  async sendRepostSuggestionCard(
    record: Record<string, unknown>,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildRepostSuggestionCard(record);
    await client.chat.postMessage({
      channel: channelId,
      text: `Evergreen repost suggestion`,
      blocks,
    });
  }

  async handleRepost(postHistoryId: string): Promise<void> {
    const supabase = createSupabaseClient();
    const { data: record } = await supabase
      .from("post_history")
      .select("*, content_queue(*)")
      .eq("id", postHistoryId)
      .single();

    if (!record || !record.content_queue) {
      throw new Error(`Post history ${postHistoryId} not found`);
    }

    const original = record.content_queue as ContentQueueItem;

    // Create new queue item with the same content
    await this.contentQueue.addItem({
      type: original.type,
      content_url: original.content_url || undefined,
      source_text: original.source_text || undefined,
      generated_post_twitter:
        original.generated_post_twitter || undefined,
      generated_post_linkedin:
        original.generated_post_linkedin || undefined,
      media_url: original.media_url || undefined,
      media_mime_type: original.media_mime_type || undefined,
      image_url: original.image_url || undefined,
      is_evergreen: true,
    });

    // Increment repost_count on original
    await supabase
      .from("content_queue")
      .update({
        repost_count: (original.repost_count || 0) + 1,
        last_reposted_at: new Date().toISOString(),
      })
      .eq("id", original.id);

    logger.info(`Reposted content from post history ${postHistoryId}`);
  }

  async handleCrosspost(
    postHistoryId: string,
    targetPlatform: Platform,
  ): Promise<void> {
    const supabase = createSupabaseClient();
    const { data: record } = await supabase
      .from("post_history")
      .select("*, content_queue(*)")
      .eq("id", postHistoryId)
      .single();

    if (!record || !record.content_queue) {
      throw new Error(`Post history ${postHistoryId} not found`);
    }

    const original = record.content_queue as ContentQueueItem;

    await this.contentQueue.addItem({
      type: original.type,
      platform: targetPlatform,
      content_url: original.content_url || undefined,
      source_text: original.source_text || undefined,
      generated_post_twitter:
        original.generated_post_twitter || undefined,
      generated_post_linkedin:
        original.generated_post_linkedin || undefined,
      media_url: original.media_url || undefined,
      media_mime_type: original.media_mime_type || undefined,
      image_url: original.image_url || undefined,
      is_evergreen: true,
    });

    logger.info(
      `Cross-posted content to ${targetPlatform} from post history ${postHistoryId}`,
    );
  }

  // ─── Video Editor handlers ───

  async sendVideoIdeaCard(
    idea: VideoIdea,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildVideoIdeaCard(idea);
    const result = await client.chat.postMessage({
      channel: channelId,
      text: `Video idea: ${idea.concept.substring(0, 100)}`,
      blocks,
    });

    if (result.ts) {
      const supabase = createSupabaseClient();
      await supabase
        .from("video_ideas")
        .update({
          slack_message_ts: result.ts,
          slack_channel_id: channelId,
        })
        .eq("id", idea.id);
    }
  }

  async sendVideoReviewCard(
    project: VideoProject,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildVideoReviewCard(project);
    await client.chat.postMessage({
      channel: channelId,
      text: `Video ready for review: ${project.title}`,
      blocks,
      thread_ts: project.slack_thread_ts || undefined,
    });
  }

  async sendVideoStatusCard(
    project: VideoProject,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildVideoStatusCard(project);
    await client.chat.postMessage({
      channel: channelId,
      text: `Video project status: ${project.title}`,
      blocks,
      thread_ts: project.slack_thread_ts || undefined,
    });
  }

  async sendProgressUpdate(
    channelId: string,
    threadTs: string,
    message: string,
  ): Promise<void> {
    const client = this.getClient();
    await client.chat.postMessage({
      channel: channelId,
      text: message,
      thread_ts: threadTs,
    });
  }

  // ─── Engagement monitoring handlers ───

  async sendEngagementCard(
    engagement: DraftedEngagement,
    channelId: string,
  ): Promise<void> {
    const client = this.getClient();
    const blocks = buildEngagementCard(engagement);
    await client.chat.postMessage({
      channel: channelId,
      text: `New engagement from @${engagement.mention.authorUsername}: ${engagement.mention.text.substring(0, 80)}`,
      blocks,
    });
  }

  async handleApproveEngagement(mentionId: string): Promise<string | null> {
    // Return the mention ID — the caller (slack-listener action handler) will
    // use the EngagementMonitorService to actually post the reply.
    return mentionId;
  }

  async handleDismissEngagement(mentionId: string): Promise<void> {
    const supabase = createSupabaseClient();
    await supabase
      .from("processed_mentions")
      .update({ replied: false })
      .eq("mention_id", mentionId);
    logger.info(`Dismissed engagement for mention ${mentionId}`);
  }

  // ─── Episodic memory recording ───

  /**
   * Record an approval/rejection/skip episode for voice learning.
   * Fire-and-forget — errors are logged but never thrown.
   */
  private async recordEpisode(
    action: "approve" | "reject",
    item: ContentQueueItem,
    subAction?: "skip" | "pause",
  ): Promise<void> {
    if (!this.memory) return;

    const postText =
      item.generated_post_twitter ||
      item.generated_post_linkedin ||
      item.generated_post ||
      "";

    await this.memory.recordFeedback(action, {
      contentId: item.id,
      contentType: item.type,
      originalText: postText,
      platform: item.platform || undefined,
      feedbackText: subAction
        ? `User ${subAction}ed this post`
        : `User ${action}d this post`,
    });
  }
}
