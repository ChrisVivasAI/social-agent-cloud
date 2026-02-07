import cron from "node-cron";
import { ContentQueueService } from "./content-queue.js";
import { ContentGeneratorService } from "./content-generator.js";
import { PostingService } from "./posting-service.js";
import { RemotionService } from "./remotion-service.js";
import { SlackNotificationService } from "./slack-notification.js";
import { SlackHandlerService } from "./slack-handlers.js";
import { MetricsCollectorService } from "./metrics-collector.js";
import { ContentDiscoveryService } from "./content-discovery.js";
import { GeminiService } from "./gemini-service.js";
import { AgentMemoryService } from "./agent-memory.js";
import { DynamicPromptBuilder } from "./dynamic-prompt-builder.js";
import { VideoEditorAgent } from "./video-editor-agent.js";
import { ProactiveAgentService } from "./proactive-agent.js";
import type { EngagementMonitorService } from "./engagement-monitor.js";
import { MemoryConsolidationService } from "./memory-consolidation.js";
import { getConfig } from "../config/env.js";
import { MAX_RETRY_ATTEMPTS } from "../config/schedule.js";
import { adaptSchedule, saveAdaptedSchedule } from "../config/schedule.js";
import { logger } from "../utils/logger.js";
import { activityBus } from "./activity-bus.js";

export class SchedulerService {
  private tasks: cron.ScheduledTask[] = [];
  private prePostNotifiedIds = new Set<string>();
  private metricsCollector: MetricsCollectorService;
  private contentDiscovery: ContentDiscoveryService;
  private videoEditor: VideoEditorAgent | null = null;
  private proactiveAgent: ProactiveAgentService | null = null;
  private engagementMonitor: EngagementMonitorService | null = null;
  private consolidation: MemoryConsolidationService | null = null;

  constructor(
    private contentQueue: ContentQueueService,
    private contentGenerator: ContentGeneratorService,
    private postingService: PostingService,
    private remotionService: RemotionService,
    private slackNotification: SlackNotificationService | null,
    private slackHandlers: SlackHandlerService | null,
    gemini?: GeminiService,
    memory?: AgentMemoryService,
    promptBuilder?: DynamicPromptBuilder,
    videoEditor?: VideoEditorAgent,
    proactiveAgent?: ProactiveAgentService,
    engagementMonitor?: EngagementMonitorService,
  ) {
    this.metricsCollector = new MetricsCollectorService(gemini, memory, promptBuilder);
    this.contentDiscovery = new ContentDiscoveryService();
    this.videoEditor = videoEditor || null;
    this.proactiveAgent = proactiveAgent || null;
    this.engagementMonitor = engagementMonitor || null;

    // Initialize consolidation pipeline if intelligence layer is available
    if (gemini?.isAvailable && memory && promptBuilder) {
      this.consolidation = new MemoryConsolidationService(memory, gemini, promptBuilder);
    }
  }

  start(): void {
    const tz = getConfig().POST_TIMEZONE;

    // Job 1: Process pending queue items (generate content) - every 5 min
    this.tasks.push(
      cron.schedule("*/5 * * * *", () => this.processQueueItems(), {
        timezone: tz,
      }),
    );

    // Job 2: Post due items - every minute
    this.tasks.push(
      cron.schedule("* * * * *", () => this.postDueItems(), {
        timezone: tz,
      }),
    );

    // Job 3: Check rendering items - every 2 minutes
    this.tasks.push(
      cron.schedule("*/2 * * * *", () => this.checkRenderingItems(), {
        timezone: tz,
      }),
    );

    // Job 4: Retry failed items - every 30 minutes
    this.tasks.push(
      cron.schedule("*/30 * * * *", () => this.retryFailed(), {
        timezone: tz,
      }),
    );

    // Job 5: Promote generated items to awaiting_approval - every minute
    this.tasks.push(
      cron.schedule("* * * * *", () => this.promoteGeneratedItems(), {
        timezone: tz,
      }),
    );

    // Job 6: Weekly digest - Monday 9 AM
    if (this.slackNotification) {
      this.tasks.push(
        cron.schedule("0 9 * * 1", () => this.sendWeeklyDigest(), {
          timezone: tz,
        }),
      );
    }

    // Job 7: Pre-post notifications - every 5 minutes
    if (this.slackNotification) {
      this.tasks.push(
        cron.schedule("*/5 * * * *", () => this.sendPrePostNotifications(), {
          timezone: tz,
        }),
      );
    }

    // Job 8: Collect engagement metrics - hourly
    this.tasks.push(
      cron.schedule("0 * * * *", () => this.collectEngagementMetrics(), {
        timezone: tz,
      }),
    );

    // Job 9: Content discovery - every 2 hours
    if (this.slackHandlers) {
      this.tasks.push(
        cron.schedule("0 */2 * * *", () => this.discoverContent(), {
          timezone: tz,
        }),
      );
    }

    // Job 10: Evergreen repost suggestions - Sunday 6 PM
    if (this.slackHandlers) {
      this.tasks.push(
        cron.schedule("0 18 * * 0", () => this.suggestEvergreenReposts(), {
          timezone: tz,
        }),
      );
    }

    // Job 11: Performance analysis - weekly on Sunday 9 AM
    this.tasks.push(
      cron.schedule("0 9 * * 0", () => this.runPerformanceAnalysis(), {
        timezone: tz,
      }),
    );

    // Job 11b: Adaptive schedule optimization - Sunday 10:30 AM (after performance analysis)
    this.tasks.push(
      cron.schedule("30 10 * * 0", () => this.runAdaptiveScheduling(), {
        timezone: tz,
      }),
    );

    // Job 12: Check video project status - every 5 minutes
    if (this.videoEditor) {
      this.tasks.push(
        cron.schedule("*/5 * * * *", () => this.checkVideoProjects(), {
          timezone: tz,
        }),
      );
    }

    // Job 13: Weekly video idea generation - Monday 8 AM
    if (this.videoEditor && this.slackHandlers) {
      this.tasks.push(
        cron.schedule("0 8 * * 1", () => this.generateWeeklyVideoIdeas(), {
          timezone: tz,
        }),
      );
    }

    // Job 14: Clean expired memories - daily at 3 AM
    this.tasks.push(
      cron.schedule("0 3 * * *", () => this.cleanExpiredMemories(), {
        timezone: tz,
      }),
    );

    // ─── Proactive Agent Jobs ───

    if (this.proactiveAgent) {
      // Job 15: Morning briefing - daily at 8:30 AM (Mon-Fri)
      this.tasks.push(
        cron.schedule("30 8 * * 1-5", () => this.sendMorningBriefing(), {
          timezone: tz,
        }),
      );

      // Job 16: Smart nudge - daily at 3 PM (Mon-Fri)
      this.tasks.push(
        cron.schedule("0 15 * * 1-5", () => this.sendSmartNudge(), {
          timezone: tz,
        }),
      );

      // Job 17: Milestone check - every 30 minutes
      this.tasks.push(
        cron.schedule("*/30 * * * *", () => this.checkMilestones(), {
          timezone: tz,
        }),
      );

      // Job 18: Trend alert - every 4 hours during business hours
      this.tasks.push(
        cron.schedule("0 10,14,18 * * 1-5", () => this.checkTrendAlerts(), {
          timezone: tz,
        }),
      );

      // Job 19: Weekly retro - Friday at 4 PM
      this.tasks.push(
        cron.schedule("0 16 * * 5", () => this.sendWeeklyRetro(), {
          timezone: tz,
        }),
      );
    }

    // ─── Voice Learning / Memory Consolidation Jobs ───

    if (this.consolidation) {
      // Job 20: Voice consolidation - nightly at 2 AM
      this.tasks.push(
        cron.schedule("0 2 * * *", () => this.runVoiceConsolidation(), {
          timezone: tz,
        }),
      );

      // Job 21: Procedural rule promotion - weekly Sunday 10 AM
      this.tasks.push(
        cron.schedule("0 10 * * 0", () => this.runProceduralPromotion(), {
          timezone: tz,
        }),
      );
    }

    // ─── Engagement Monitoring Jobs ───

    if (this.engagementMonitor && this.slackHandlers) {
      // Job 22: Check mentions/replies - every 15 min during business hours (Mon-Fri 8AM-8PM)
      this.tasks.push(
        cron.schedule("*/15 8-20 * * 1-5", () => this.checkEngagements(), {
          timezone: tz,
        }),
      );
    }

    logger.info(
      `Scheduler started with ${this.tasks.length} cron jobs (timezone: ${tz})`,
    );
  }

  stop(): void {
    this.tasks.forEach((task) => task.stop());
    this.tasks = [];
    logger.info("Scheduler stopped");
  }

  private async processQueueItems(): Promise<void> {
    try {
      const items = await this.contentQueue.getPendingItems(3);
      if (items.length === 0) return;

      logger.info(`Processing ${items.length} pending queue items`);
      activityBus.emitActivity("cron_executed", `Processing ${items.length} pending queue items`);

      for (const item of items) {
        await this.contentGenerator.processQueueItem(item);
      }
    } catch (error) {
      logger.error(`Error processing queue items: ${error}`);
    }
  }

  private async postDueItems(): Promise<void> {
    try {
      const items = await this.contentQueue.getDueItems();
      if (items.length === 0) return;

      logger.info(`Posting ${items.length} due items`);
      activityBus.emitActivity("cron_executed", `Posting ${items.length} due items`);

      for (const item of items) {
        try {
          await this.contentQueue.updateItem(item.id, { status: "posting" });
          const result = await this.postingService.postToAll(item);

          if (result.success) {
            await this.contentQueue.markPosted(
              item.id,
              result.twitterPostId,
              result.linkedinPostId,
            );

            // Send Slack post confirmation and update review card
            if (this.slackNotification) {
              await this.slackNotification.sendPostConfirmation(item, result);
            }
            if (this.slackHandlers) {
              const twitterUrl = result.twitterPostId
                ? `https://twitter.com/i/status/${result.twitterPostId}`
                : undefined;
              await this.slackHandlers.sendPostedCard(
                item,
                twitterUrl,
                result.linkedinPostId,
              );
            }

            // Proactive agent celebration
            if (this.proactiveAgent) {
              this.proactiveAgent.onPostPublished(item).catch((err) =>
                logger.warn(`Post celebration failed (non-critical): ${err}`),
              );
            }
          } else {
            await this.contentQueue.markFailed(
              item.id,
              result.errors.join("; "),
            );
            if (this.slackHandlers) {
              await this.slackHandlers.sendFailedCard(item);
            }
          }

          // Clean up pre-post notification dedup
          this.prePostNotifiedIds.delete(item.id);
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "Unknown error";
          await this.contentQueue.markFailed(item.id, msg);
        }
      }
    } catch (error) {
      logger.error(`Error posting due items: ${error}`);
    }
  }

  private async checkRenderingItems(): Promise<void> {
    try {
      const { data } = await (await import("../utils/supabase.js"))
        .createSupabaseClient()
        .from("content_queue")
        .select("*")
        .eq("status", "rendering")
        .not("remotion_props", "is", null);

      if (!data || data.length === 0) return;

      for (const item of data) {
        const jobId = (item.remotion_props as Record<string, unknown>)
          ?._renderJobId as string;
        if (!jobId) continue;

        try {
          const status = await this.remotionService.getRenderStatus(jobId);

          if (status.status === "completed" && status.outputUrl) {
            // Render complete → awaiting_approval (not ready)
            await this.contentQueue.updateItem(item.id, {
              remotion_video_url: status.outputUrl,
              media_url: status.outputUrl,
              media_mime_type: "video/mp4",
              status: "awaiting_approval",
            });
            logger.info(`Remotion render completed for item ${item.id}`);

            // Send review card
            if (this.slackHandlers) {
              const channelId = getConfig().SLACK_CHANNEL_ID;
              if (channelId) {
                const updated = await this.contentQueue.getItem(item.id);
                if (updated) {
                  await this.slackHandlers.sendReviewCard(updated, channelId);
                }
              }
            }
          } else if (status.status === "failed") {
            await this.contentQueue.markFailed(
              item.id,
              `Remotion render failed: ${status.error}`,
            );
          }
        } catch (error) {
          logger.warn(
            `Error checking render status for item ${item.id}: ${error}`,
          );
        }
      }
    } catch (error) {
      logger.error(`Error checking rendering items: ${error}`);
    }
  }

  private async promoteGeneratedItems(): Promise<void> {
    try {
      const config = getConfig();
      const items = await this.contentQueue.getGeneratedItems();
      for (const item of items) {
        try {
          // Check if this item qualifies for auto-approval
          const shouldAutoApprove =
            config.AUTO_APPROVE_ENABLED &&
            config.AUTO_APPROVE_TYPES.includes(item.type);

          if (shouldAutoApprove) {
            // Skip awaiting_approval → go straight to ready
            await this.contentQueue.updateItem(item.id, {
              status: "ready",
            });
            logger.info(`Auto-approved item ${item.id} (type: ${item.type})`);

            // Still send Slack notification so user can intervene
            if (this.slackHandlers) {
              const channelId = config.SLACK_CHANNEL_ID;
              if (channelId) {
                const updated = await this.contentQueue.getItem(item.id);
                if (updated) {
                  await this.slackHandlers.sendAutoApprovedCard(
                    updated,
                    channelId,
                  );
                }
              }
            }
          } else {
            // Normal flow: promote to awaiting_approval
            await this.contentQueue.updateItem(item.id, {
              status: "awaiting_approval",
            });

            // Send review card to Slack
            if (this.slackHandlers) {
              const channelId = config.SLACK_CHANNEL_ID;
              if (channelId) {
                const updated = await this.contentQueue.getItem(item.id);
                if (updated) {
                  await this.slackHandlers.sendReviewCard(updated, channelId);
                }
              }
            }
          }
        } catch (error) {
          logger.error(`Error promoting item ${item.id}: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`Error promoting generated items: ${error}`);
    }
  }

  private async retryFailed(): Promise<void> {
    try {
      const items = await this.contentQueue.getFailedItems(MAX_RETRY_ATTEMPTS);
      if (items.length === 0) return;

      logger.info(`Retrying ${items.length} failed items`);

      for (const item of items) {
        // Smart retry: classify errors and adjust strategy
        const error = item.error_message || "";
        const isPermanent =
          error.includes("not relevant") ||
          error.includes("Unknown content type") ||
          error.includes("missing content_url") ||
          error.includes("missing source_text");

        if (isPermanent) {
          logger.info(`Skipping permanent error for item ${item.id}: ${error}`);
          continue;
        }

        // Rate limit errors get longer backoff
        const isRateLimit =
          error.includes("429") ||
          error.includes("rate limit") ||
          error.includes("Too Many Requests");

        if (isRateLimit && item.retry_count < 2) {
          // Skip this cycle, let it retry next time (effectively doubles backoff)
          logger.info(`Rate-limited item ${item.id}, deferring retry`);
          continue;
        }

        await this.contentQueue.updateItem(item.id, {
          status: "pending",
          error_message: null,
        });
      }
    } catch (error) {
      logger.error(`Error retrying failed items: ${error}`);
    }
  }

  private async sendWeeklyDigest(): Promise<void> {
    try {
      const items = await this.contentQueue.getUpcomingItemsForWeek();
      if (this.slackNotification) {
        await this.slackNotification.sendWeeklyDigest(items);
      }
    } catch (error) {
      logger.error(`Error sending weekly digest: ${error}`);
    }
  }

  private async sendPrePostNotifications(): Promise<void> {
    try {
      const items = await this.contentQueue.getItemsDueSoon(35);
      for (const item of items) {
        // Avoid re-notifying
        if (this.prePostNotifiedIds.has(item.id)) continue;
        this.prePostNotifiedIds.add(item.id);

        if (this.slackNotification) {
          await this.slackNotification.sendPrePostNotification(item);
        }
      }
    } catch (error) {
      logger.error(`Error sending pre-post notifications: ${error}`);
    }
  }

  private async collectEngagementMetrics(): Promise<void> {
    try {
      await this.metricsCollector.collectMetrics();
    } catch (error) {
      logger.error(`Error collecting engagement metrics: ${error}`);
    }
  }

  private async discoverContent(): Promise<void> {
    try {
      const discoveries = await this.contentDiscovery.discoverContent();
      if (discoveries.length === 0) return;

      // Post top 3 discoveries to Slack
      const channelId = getConfig().SLACK_CHANNEL_ID;
      if (!channelId || !this.slackHandlers) return;

      const top = discoveries.slice(0, 3);
      for (const item of top) {
        await this.slackHandlers.sendDiscoveryCard(item, channelId);
      }

      logger.info(`Posted ${top.length} content discoveries to Slack`);
    } catch (error) {
      logger.error(`Error discovering content: ${error}`);
    }
  }

  private async suggestEvergreenReposts(): Promise<void> {
    try {
      const channelId = getConfig().SLACK_CHANNEL_ID;
      if (!channelId || !this.slackHandlers) return;

      const { createSupabaseClient } = await import("../utils/supabase.js");
      const supabase = createSupabaseClient();
      const twoWeeksAgo = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: highPerformers } = await supabase
        .from("post_history")
        .select("*, content_queue(*)")
        .eq("metrics_pulled_72h", true)
        .gte("likes", 5)
        .lte("posted_at", twoWeeksAgo)
        .order("likes", { ascending: false })
        .limit(3);

      if (!highPerformers || highPerformers.length === 0) return;

      for (const record of highPerformers) {
        await this.slackHandlers.sendRepostSuggestionCard(record, channelId);
      }

      logger.info(
        `Sent ${highPerformers.length} evergreen repost suggestions to Slack`,
      );
    } catch (error) {
      logger.error(`Error suggesting evergreen reposts: ${error}`);
    }
  }

  private async runPerformanceAnalysis(): Promise<void> {
    try {
      await this.metricsCollector.analyzePerformancePatterns();
    } catch (error) {
      logger.error(`Error running performance analysis: ${error}`);
    }
  }

  private async runAdaptiveScheduling(): Promise<void> {
    try {
      const adaptedSlots = await adaptSchedule();
      await saveAdaptedSchedule(adaptedSlots);
      logger.info(
        `Adaptive scheduling complete: ${adaptedSlots.length} slots — ` +
        adaptedSlots.map((s) => `${s.label}`).join(", "),
      );
    } catch (error) {
      logger.error(`Error running adaptive scheduling: ${error}`);
    }
  }

  private async checkVideoProjects(): Promise<void> {
    if (!this.videoEditor) return;
    try {
      // Check for projects in "rendering" status that may have completed
      const renderingProjects = await this.videoEditor.getProjectsByStatus("rendering");
      for (const project of renderingProjects) {
        logger.info(`Checking rendering status for video project ${project.id}`);
        // The video editor agent handles its own rendering status checks
        // This job just logs for visibility
      }
    } catch (error) {
      logger.error(`Error checking video projects: ${error}`);
    }
  }

  private async generateWeeklyVideoIdeas(): Promise<void> {
    if (!this.videoEditor) return;
    try {
      const channelId = getConfig().SLACK_CHANNEL_ID;
      const ideas = await this.videoEditor.generateWeeklyIdeas(channelId);
      logger.info(`Generated ${ideas.length} weekly video ideas`);

      // Post idea cards to Slack
      if (this.slackHandlers && channelId && ideas.length > 0) {
        for (const idea of ideas) {
          await this.slackHandlers.sendVideoIdeaCard(idea, channelId);
        }
      }
    } catch (error) {
      logger.error(`Error generating weekly video ideas: ${error}`);
    }
  }

  // ─── Proactive Agent Handlers ───

  private async sendMorningBriefing(): Promise<void> {
    if (!this.proactiveAgent) return;
    try {
      await this.proactiveAgent.sendMorningBriefing();
    } catch (error) {
      logger.error(`Error sending morning briefing: ${error}`);
    }
  }

  private async sendSmartNudge(): Promise<void> {
    if (!this.proactiveAgent) return;
    try {
      await this.proactiveAgent.sendSmartNudge();
    } catch (error) {
      logger.error(`Error sending smart nudge: ${error}`);
    }
  }

  private async checkMilestones(): Promise<void> {
    if (!this.proactiveAgent) return;
    try {
      await this.proactiveAgent.checkMilestones();
    } catch (error) {
      logger.error(`Error checking milestones: ${error}`);
    }
  }

  private async checkTrendAlerts(): Promise<void> {
    if (!this.proactiveAgent) return;
    try {
      await this.proactiveAgent.checkTrendAlerts();
    } catch (error) {
      logger.error(`Error checking trend alerts: ${error}`);
    }
  }

  private async sendWeeklyRetro(): Promise<void> {
    if (!this.proactiveAgent) return;
    try {
      await this.proactiveAgent.sendWeeklyRetro();
    } catch (error) {
      logger.error(`Error sending weekly retro: ${error}`);
    }
  }

  private async cleanExpiredMemories(): Promise<void> {
    try {
      // Import dynamically to avoid circular deps if memory isn't configured
      const { createSupabaseClient } = await import("../utils/supabase.js");
      const supabase = createSupabaseClient();
      const { data } = await supabase
        .from("agent_memory")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .not("expires_at", "is", null)
        .select("id");

      const count = data?.length || 0;
      if (count > 0) {
        logger.info(`Cleaned ${count} expired memories`);
      }
    } catch (error) {
      logger.error(`Error cleaning expired memories: ${error}`);
    }
  }

  // ─── Engagement Monitoring Handler ───

  private async checkEngagements(): Promise<void> {
    if (!this.engagementMonitor || !this.slackHandlers) return;
    try {
      const engagements = await this.engagementMonitor.processNewEngagements();
      if (engagements.length === 0) return;

      const channelId = getConfig().SLACK_CHANNEL_ID;
      if (!channelId) return;

      for (const engagement of engagements) {
        await this.slackHandlers.sendEngagementCard(engagement, channelId);
      }

      logger.info(
        `Surfaced ${engagements.length} engagement cards to Slack`,
      );
    } catch (error) {
      logger.error(`Error checking engagements: ${error}`);
    }
  }

  // ─── Voice Learning Handlers ───

  private async runVoiceConsolidation(): Promise<void> {
    if (!this.consolidation) return;
    try {
      const result = await this.consolidation.runConsolidation();
      logger.info(
        `Voice consolidation: profile=${result.voiceProfileUpdated}, ` +
        `preferences=${result.preferencesExtracted}, ` +
        `compressed=${result.episodesCompressed}`,
      );
    } catch (error) {
      logger.error(`Error running voice consolidation: ${error}`);
    }
  }

  private async runProceduralPromotion(): Promise<void> {
    if (!this.consolidation) return;
    try {
      const promoted = await this.consolidation.promoteToProceduralRules();
      logger.info(`Procedural rule promotion: ${promoted} new rules`);
    } catch (error) {
      logger.error(`Error running procedural promotion: ${error}`);
    }
  }
}
