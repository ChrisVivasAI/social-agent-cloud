import { TwitterClient } from "../clients/twitter.js";
import { LinkedInClient } from "../clients/linkedin.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type { PostHistoryRecord, PerformanceInsight } from "../types/index.js";
import type { GeminiService } from "./gemini-service.js";
import type { AgentMemoryService } from "./agent-memory.js";
import type { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";

export class MetricsCollectorService {
  private twitterClient: TwitterClient;
  private linkedInClient: LinkedInClient;
  private supabase = createSupabaseClient();
  private gemini: GeminiService | null = null;
  private memory: AgentMemoryService | null = null;
  private promptBuilder: DynamicPromptBuilder | null = null;

  constructor(
    gemini?: GeminiService,
    memory?: AgentMemoryService,
    promptBuilder?: DynamicPromptBuilder,
  ) {
    this.twitterClient = TwitterClient.fromEnv();
    this.linkedInClient = LinkedInClient.fromEnv();
    this.gemini = gemini || null;
    this.memory = memory || null;
    this.promptBuilder = promptBuilder || null;
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

    // Store performance outcome in memory for feedback loop
    if (this.memory && window === "72h") {
      try {
        await this.memory.recordPerformance(record.id, {
          contentType: (record as unknown as Record<string, unknown>).content_type as string || "unknown",
          templateUsed: (record as unknown as Record<string, unknown>).template_used as string | undefined,
          platform: record.platform,
          likes,
          retweets,
          comments,
          impressions,
          engagementRate,
          dayOfWeek: record.day_of_week,
          hourOfDay: record.hour_of_day,
        });
      } catch (err) {
        logger.warn(`Failed to record performance in memory: ${err}`);
      }
    }
  }

  /**
   * Analyze collected metrics using Gemini Flash to extract actionable insights.
   * Called periodically (e.g., weekly) to derive patterns from accumulated data.
   */
  async analyzePerformancePatterns(): Promise<void> {
    if (!this.gemini?.isAvailable || !this.memory || !this.promptBuilder) {
      logger.info("Gemini/memory not configured, skipping performance analysis");
      return;
    }

    try {
      // Get recent posts with metrics for analysis
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await this.supabase
        .from("post_history")
        .select("*")
        .eq("metrics_pulled_72h", true)
        .gte("posted_at", thirtyDaysAgo)
        .order("posted_at", { ascending: false })
        .limit(50);

      if (!recentPosts || recentPosts.length < 5) {
        logger.info("Not enough data for performance analysis (need >= 5 posts)");
        return;
      }

      // Build analysis prompt with existing insights context
      const analysisPrompt = await this.promptBuilder.buildAnalysisPrompt(recentPosts);

      // Run Gemini Flash analysis
      const analysisResult = await this.gemini.generateJSON<{
        insights: Array<{
          insight_text: string;
          insight_type: string;
          confidence: number;
          applicable_to: Record<string, unknown>;
          supporting_data: Record<string, unknown>;
        }>;
      }>(
        analysisPrompt,
        "Analyze these metrics and return insights as JSON with an 'insights' array.",
        { model: "flash", temperature: 0.3 },
      );

      // Store each insight
      let storedCount = 0;
      for (const insight of analysisResult.insights || []) {
        try {
          await this.memory.storeInsight({
            insight_text: insight.insight_text,
            insight_type: insight.insight_type as PerformanceInsight["insight_type"],
            confidence: insight.confidence,
            applicable_to: insight.applicable_to as PerformanceInsight["applicable_to"],
            supporting_data: insight.supporting_data,
            is_active: true,
            generated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 week expiry
          });
          storedCount++;
        } catch (err) {
          logger.warn(`Failed to store insight: ${err}`);
        }
      }

      logger.info(`Performance analysis complete: ${storedCount} new insights stored`);
    } catch (error) {
      logger.error(`Performance analysis failed: ${error}`);
    }
  }
}
