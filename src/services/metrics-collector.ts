import { TwitterClient } from "../clients/twitter.js";
import { LinkedInClient } from "../clients/linkedin.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type { PostHistoryRecord } from "../types/index.js";

export class MetricsCollectorService {
  private twitterClient: TwitterClient;
  private linkedInClient: LinkedInClient;
  private supabase = createSupabaseClient();

  constructor() {
    this.twitterClient = TwitterClient.fromEnv();
    this.linkedInClient = LinkedInClient.fromEnv();
  }

  /**
   * Collect metrics for posts needing 24h or 72h metrics pull.
   * Batched: max 10 posts per cycle to respect rate limits.
   */
  async collectMetrics(): Promise<void> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );
    const seventyTwoHoursAgo = new Date(
      now.getTime() - 72 * 60 * 60 * 1000,
    );

    // Find posts needing 24h metrics (posted >= 24h ago, not yet pulled)
    const { data: need24h } = await this.supabase
      .from("post_history")
      .select("*")
      .eq("metrics_pulled_24h", false)
      .lte("posted_at", twentyFourHoursAgo.toISOString())
      .order("posted_at", { ascending: true })
      .limit(5);

    // Find posts needing 72h metrics (posted >= 72h ago, not yet pulled)
    const { data: need72h } = await this.supabase
      .from("post_history")
      .select("*")
      .eq("metrics_pulled_72h", false)
      .eq("metrics_pulled_24h", true)
      .lte("posted_at", seventyTwoHoursAgo.toISOString())
      .order("posted_at", { ascending: true })
      .limit(5);

    const postsToProcess = [
      ...((need24h || []) as PostHistoryRecord[]).map((p) => ({
        record: p,
        window: "24h" as const,
      })),
      ...((need72h || []) as PostHistoryRecord[]).map((p) => ({
        record: p,
        window: "72h" as const,
      })),
    ];

    if (postsToProcess.length === 0) return;

    logger.info(
      `Collecting metrics for ${postsToProcess.length} posts (24h: ${need24h?.length || 0}, 72h: ${need72h?.length || 0})`,
    );

    for (const { record, window } of postsToProcess) {
      try {
        await this.fetchAndUpdateMetrics(record, window);
      } catch (error) {
        logger.warn(
          `Failed to collect ${window} metrics for ${record.id}: ${error}`,
        );
      }
    }
  }

  private async fetchAndUpdateMetrics(
    record: PostHistoryRecord,
    window: "24h" | "72h",
  ): Promise<void> {
    let likes = 0;
    let retweets = 0;
    let comments = 0;
    let impressions = 0;
    let engagementRate = 0;

    try {
      if (record.platform === "twitter" && record.external_post_id) {
        const metrics = await this.twitterClient.getTweetMetrics(
          record.external_post_id,
        );
        likes = metrics.likes;
        retweets = metrics.retweets;
        comments = metrics.comments;
        impressions = metrics.impressions;
        engagementRate = metrics.engagementRate;
      } else if (record.platform === "linkedin" && record.external_post_id) {
        const metrics = await this.linkedInClient.getPostMetrics(
          record.external_post_id,
        );
        likes = metrics.likes;
        comments = metrics.comments;
      }
    } catch {
      logger.warn(
        `Could not fetch ${record.platform} metrics for ${record.external_post_id}`,
      );
      return;
    }

    const updates: Record<string, unknown> = {
      likes,
      retweets,
      comments,
      impressions,
      engagement_rate: engagementRate,
      metrics_pulled_at: new Date().toISOString(),
    };

    if (window === "24h") {
      updates.metrics_pulled_24h = true;
    } else {
      updates.metrics_pulled_72h = true;
    }

    await this.supabase
      .from("post_history")
      .update(updates)
      .eq("id", record.id);

    logger.info(
      `Updated ${window} metrics for ${record.platform} post ${record.external_post_id}: ${likes} likes, ${retweets} RTs, ${comments} comments`,
    );
  }
}
