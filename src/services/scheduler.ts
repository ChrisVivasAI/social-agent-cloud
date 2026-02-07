import cron from "node-cron";
import { ContentQueueService } from "./content-queue.js";
import { ContentGeneratorService } from "./content-generator.js";
import { PostingService } from "./posting-service.js";
import { RemotionService } from "./remotion-service.js";
import { SlackNotificationService } from "./slack-notification.js";
import { SlackHandlerService } from "./slack-handlers.js";
import { MetricsCollectorService } from "./metrics-collector.js";
import { ContentDiscoveryService } from "./content-discovery.js";
import { getConfig } from "../config/env.js";
import { MAX_RETRY_ATTEMPTS } from "../config/schedule.js";
import { logger } from "../utils/logger.js";

export class SchedulerService {
  private tasks: cron.ScheduledTask[] = [];
  private prePostNotifiedIds = new Set<string>();
  private metricsCollector: MetricsCollectorService;
  private contentDiscovery: ContentDiscoveryService;

  constructor(
    private contentQueue: ContentQueueService,
    private contentGenerator: ContentGeneratorService,
    private postingService: PostingService,
    private remotionService: RemotionService,
    private slackNotification: SlackNotificationService | null,
    private slackHandlers: SlackHandlerService | null,
  ) {
    this.metricsCollector = new MetricsCollectorService();
    this.contentDiscovery = new ContentDiscoveryService();
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
}
