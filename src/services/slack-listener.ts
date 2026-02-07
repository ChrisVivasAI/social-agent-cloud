import { App, LogLevel } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { ContentQueueService } from "./content-queue.js";
import { SlackHandlerService } from "./slack-handlers.js";
import { IntakeService } from "./intake-service.js";
import { getConfig } from "../config/env.js";
import { extractUrlsFromSlackText } from "../utils/urls.js";
import { createSupabaseClient } from "../utils/supabase.js";
import {
  buildQueueList,
  buildScheduleList,
  buildStatusSummary,
  buildEditCaptionsModal,
  buildRescheduleModal,
} from "../utils/slack-blocks.js";
import { logger } from "../utils/logger.js";
import type { VideoEditorAgent } from "./video-editor-agent.js";
import type { FootageLibraryService } from "./footage-library.js";
import type { ContentType, IntakeResult, Platform } from "../types/index.js";

export class SlackListenerService {
  private app: App;
  private contentQueue: ContentQueueService;
  private slackHandlers: SlackHandlerService;
  private intakeService: IntakeService;
  private videoEditor: VideoEditorAgent | null = null;
  private footageLibrary: FootageLibraryService | null = null;
  private processedMessages = new Set<string>();
  private dedupeWindowMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    contentQueue: ContentQueueService,
    slackHandlers: SlackHandlerService,
    intakeService: IntakeService,
    videoEditor?: VideoEditorAgent,
    footageLibrary?: FootageLibraryService,
  ) {
    this.contentQueue = contentQueue;
    this.slackHandlers = slackHandlers;
    this.intakeService = intakeService;
    this.videoEditor = videoEditor || null;
    this.footageLibrary = footageLibrary || null;
    const config = getConfig();

    this.app = new App({
      token: config.SLACK_BOT_OAUTH_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET,
      logLevel: LogLevel.WARN,
      customRoutes: [
        {
          path: "/health",
          method: ["GET"],
          handler: (_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));
          },
        },
      ],
    });

    this.setupHandlers();
    this.setupSlashCommands();
    this.setupActions();
    this.setupModalSubmissions();
  }

  getWebClient(): WebClient {
    return this.app.client;
  }

  async start(): Promise<void> {
    const port = getConfig().SLACK_EVENTS_PORT;
    await this.app.start(port);
    logger.info(`Slack listener started on port ${port}`);
  }

  async stop(): Promise<void> {
    await this.app.stop();
    logger.info("Slack listener stopped");
  }

  // ─── Message handlers (existing) ───

  private setupHandlers(): void {
    // Handle messages in the configured channel
    this.app.message(async ({ message, say }) => {
      if (message.subtype && message.subtype !== "file_share") return;
      if (!("text" in message) && !("files" in message)) return;

      const msgKey = `${message.ts}-${("channel" in message && message.channel) || "unknown"}`;
      if (this.isDuplicate(msgKey)) return;

      try {
        const text = "text" in message ? (message.text || "") : "";
        const files = "files" in message ? message.files : undefined;
        const userId = "user" in message ? message.user : undefined;
        const channelId =
          "channel" in message ? message.channel : undefined;
        const messageTs = message.ts;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileTypes = (files || []).map((f: any) => (f.mimetype as string) || "").filter(Boolean);
        const hasFiles = files !== undefined && files.length > 0;

        // AI-powered intake classification
        const intake = await this.intakeService.analyzeMessage(text, hasFiles, fileTypes);
        const scheduledFor = this.resolveScheduling(intake);
        let itemsQueued = 0;

        switch (intake.contentType) {
          case "link": {
            const urls = extractUrlsFromSlackText(text);
            const urlToUse = intake.url || urls[0];
            if (urlToUse) {
              const item = await this.contentQueue.addItem({
                type: "link",
                content_url: urlToUse,
                source_text: intake.creativeDirection || undefined,
                platform: intake.platform,
                priority: intake.priority,
                scheduled_for: scheduledFor,
                slack_channel_id: channelId,
                slack_message_ts: messageTs,
                slack_user_id: userId,
              });
              logger.info(`Queued link from Slack: ${urlToUse} -> ${item.id}`);
              itemsQueued++;
            }
            // Also queue any additional URLs beyond the first
            const allUrls = extractUrlsFromSlackText(text);
            for (const url of allUrls) {
              if (url === urlToUse) continue;
              const item = await this.contentQueue.addItem({
                type: "link",
                content_url: url,
                source_text: intake.creativeDirection || undefined,
                platform: intake.platform,
                priority: intake.priority,
                scheduled_for: scheduledFor,
                slack_channel_id: channelId,
                slack_message_ts: messageTs,
                slack_user_id: userId,
              });
              logger.info(`Queued additional link from Slack: ${url} -> ${item.id}`);
              itemsQueued++;
            }
            break;
          }

          case "image":
          case "video": {
            if (files && files.length > 0) {
              for (const file of files) {
                const contentType = this.classifyFile(file);
                if (!contentType) continue;

                const mediaUrl = await this.transferFileToSupabase(file);
                if (!mediaUrl) continue;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const f = file as any;
                const item = await this.contentQueue.addItem({
                  type: contentType,
                  media_url: mediaUrl,
                  media_mime_type: f.mimetype || undefined,
                  source_text: intake.creativeDirection || text || f.title || f.name || undefined,
                  platform: intake.platform,
                  priority: intake.priority,
                  scheduled_for: scheduledFor,
                  slack_channel_id: channelId,
                  slack_message_ts: messageTs,
                  slack_user_id: userId,
                });
                logger.info(`Queued ${contentType} from Slack: ${f.name} -> ${item.id}`);
                itemsQueued++;
              }
            }
            break;
          }

          case "remotion": {
            const urls = extractUrlsFromSlackText(text);
            const urlForVideo = intake.url || urls[0] || undefined;
            const item = await this.contentQueue.addItem({
              type: "remotion",
              content_url: urlForVideo,
              source_text: intake.creativeDirection || text || undefined,
              platform: intake.platform,
              priority: intake.priority,
              scheduled_for: scheduledFor,
              slack_channel_id: channelId,
              slack_message_ts: messageTs,
              slack_user_id: userId,
            });
            logger.info(`Queued remotion video from Slack -> ${item.id}${urlForVideo ? ` (URL: ${urlForVideo})` : " (topic-only)"}`);
            itemsQueued++;
            break;
          }

          case "video_edit": {
            // Video editing request — group ALL files into a single video project
            if (this.videoEditor && this.footageLibrary && files && files.length > 0) {
              const videoFiles = files.filter((f: any) => {
                const mime = (f.mimetype as string) || "";
                return mime.startsWith("video/");
              });

              if (videoFiles.length > 0) {
                const creativeGoal = intake.creativeDirection || text || "Create an engaging video";

                // 1. Upload all video files and ingest as footage assets
                const assetIds: string[] = [];
                for (const file of videoFiles) {
                  const mediaUrl = await this.transferFileToSupabase(file);
                  if (!mediaUrl) continue;
                  try {
                    const asset = await this.footageLibrary.ingestFromUrl(mediaUrl, "slack_upload", userId);
                    assetIds.push(asset.id);
                    logger.info(`Ingested footage asset: ${(file as any).name} -> ${asset.id}`);
                  } catch (err) {
                    logger.warn(`Failed to ingest footage ${(file as any).name}: ${err}`);
                  }
                }

                if (assetIds.length > 0) {
                  // 2. Create a single video project with all footage
                  const project = await this.videoEditor.createProject(
                    `Slack edit: ${creativeGoal.substring(0, 80)}`,
                    creativeGoal,
                    userId,
                  );
                  await this.videoEditor.addFootage(project.id, assetIds);
                  logger.info(`Created video project ${project.id} with ${assetIds.length} assets`);

                  // 3. Create ONE queue item linked to this project
                  const item = await this.contentQueue.addItem({
                    type: "video_edit",
                    source_text: creativeGoal,
                    platform: intake.platform,
                    priority: intake.priority,
                    scheduled_for: scheduledFor,
                    slack_channel_id: channelId,
                    slack_message_ts: messageTs,
                    slack_user_id: userId,
                    video_project_id: project.id,
                  });
                  logger.info(`Queued video_edit project from Slack -> ${item.id} (project: ${project.id})`);
                  itemsQueued++;

                  // 4. Kick off video processing in the background
                  this.videoEditor.processProject(project.id, async (msg) => {
                    logger.info(`[VideoProject ${project.id}] ${msg}`);
                  }).then(async (finishedProject) => {
                    // Update queue item with rendered video output
                    await this.contentQueue.updateItem(item.id, {
                      media_url: finishedProject.output_url || undefined,
                      media_mime_type: "video/mp4",
                      status: "generated",
                    });
                    logger.info(`Video project ${project.id} rendered, queue item ${item.id} updated`);
                  }).catch((err) => {
                    logger.error(`Video project ${project.id} failed: ${err}`);
                    this.contentQueue.markFailed(item.id, `Video editing failed: ${err}`).catch(() => {});
                  });
                }
              }
            } else if (files && files.length > 0) {
              // Fallback: no video editor available, queue individually
              for (const file of files) {
                const contentType = this.classifyFile(file);
                if (contentType !== "video") continue;
                const mediaUrl = await this.transferFileToSupabase(file);
                if (!mediaUrl) continue;
                const f = file as any;
                await this.contentQueue.addItem({
                  type: "video_edit",
                  media_url: mediaUrl,
                  media_mime_type: f.mimetype || undefined,
                  source_text: intake.creativeDirection || text || f.title || f.name || undefined,
                  platform: intake.platform,
                  priority: intake.priority,
                  scheduled_for: scheduledFor,
                  slack_channel_id: channelId,
                  slack_message_ts: messageTs,
                  slack_user_id: userId,
                });
                itemsQueued++;
              }
            }
            break;
          }

          case "text": {
            if (text.trim()) {
              const item = await this.contentQueue.addItem({
                type: "text",
                source_text: text,
                platform: intake.platform,
                priority: intake.priority,
                scheduled_for: scheduledFor,
                slack_channel_id: channelId,
                slack_message_ts: messageTs,
                slack_user_id: userId,
              });
              logger.info(`Queued text post from Slack -> ${item.id}`);
              itemsQueued++;
            }
            break;
          }
        }

        if (itemsQueued > 0) {
          await say({
            text: intake.summary,
            thread_ts: messageTs,
          });
        }
      } catch (error) {
        logger.error(`Error processing Slack message: ${error}`);
      }
    });

    // Handle app mentions for commands
    this.app.event("app_mention", async ({ event, say }) => {
      const text = event.text.toLowerCase();

      if (text.includes("status")) {
        const summary = await this.contentQueue.getQueueSummary();
        await say({
          blocks: buildStatusSummary(summary),
          text: "Queue status",
          thread_ts: event.ts,
        });
      } else if (text.includes("next")) {
        const summary = await this.contentQueue.getQueueSummary();
        const next = summary.upcoming[0];
        await say({
          text: next
            ? `Next post: ${next.type} scheduled for ${next.scheduled_for || "TBD"} (${next.status})`
            : "No upcoming posts in the queue.",
          thread_ts: event.ts,
        });
      } else {
        await say({
          text: "Available commands: `status`, `next`, or use `/queue`, `/queue-status`, `/schedule`, `/post`",
          thread_ts: event.ts,
        });
      }
    });
  }

  // ─── Slash commands ───

  private setupSlashCommands(): void {
    // /ping — simple health check
    this.app.command("/ping", async ({ ack, respond }) => {
      await ack();
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      await respond({
        text: `:white_check_mark: Agent is alive! Uptime: ${hours}h ${minutes}m`,
        response_type: "ephemeral",
      });
    });

    // /queue [status]
    this.app.command("/queue", async ({ command, ack, respond }) => {
      await ack();
      try {
        const filterStatus = command.text?.trim() || "awaiting_approval";
        let items;
        if (filterStatus === "awaiting_approval") {
          items = await this.contentQueue.getAwaitingApprovalItems();
        } else if (filterStatus === "paused") {
          items = await this.contentQueue.getPausedItems();
        } else {
          items = await this.contentQueue.getAwaitingApprovalItems();
        }
        await respond({
          blocks: buildQueueList(items),
          text: `Queue (${filterStatus}): ${items.length} items`,
          response_type: "ephemeral",
        });
      } catch (error) {
        logger.error(`Error handling /queue: ${error}`);
        await respond({ text: `Error: ${error}`, response_type: "ephemeral" });
      }
    });

    // /queue-status
    this.app.command("/queue-status", async ({ ack, respond }) => {
      await ack();
      try {
        const summary = await this.contentQueue.getQueueSummary();
        await respond({
          blocks: buildStatusSummary(summary),
          text: "Queue status",
          response_type: "ephemeral",
        });
      } catch (error) {
        logger.error(`Error handling /queue-status: ${error}`);
        await respond({ text: `Error: ${error}`, response_type: "ephemeral" });
      }
    });

    // /schedule — shows current week with navigation buttons
    this.app.command("/schedule", async ({ ack, respond }) => {
      await ack();
      try {
        const items = await this.contentQueue.getItemsForWeekOffset(0);
        await respond({
          blocks: buildScheduleList(items, 0),
          text: `Schedule: ${items.length} upcoming posts`,
          response_type: "ephemeral",
        });
      } catch (error) {
        logger.error(`Error handling /schedule: ${error}`);
        await respond({ text: `Error: ${error}`, response_type: "ephemeral" });
      }
    });

    // /video-status [project-id]
    this.app.command("/video-status", async ({ command, ack, respond }) => {
      await ack();
      try {
        const projectId = command.text?.trim();
        if (!projectId) {
          await respond({
            text: "Usage: `/video-status <project-id>`",
            response_type: "ephemeral",
          });
          return;
        }
        // Fetch project status and respond
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        const { data: project } = await supabase
          .from("video_projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (!project) {
          await respond({
            text: `Video project \`${projectId}\` not found.`,
            response_type: "ephemeral",
          });
          return;
        }

        const { buildVideoStatusCard } = await import("../utils/slack-blocks.js");
        await respond({
          blocks: buildVideoStatusCard(project),
          text: `Video project: ${project.title}`,
          response_type: "ephemeral",
        });
      } catch (error) {
        logger.error(`Error handling /video-status: ${error}`);
        await respond({ text: `Error: ${error}`, response_type: "ephemeral" });
      }
    });

    // /post <id> [now]
    this.app.command("/post", async ({ command, ack, respond }) => {
      await ack();
      try {
        const args = command.text?.trim().split(/\s+/) || [];
        const itemId = args[0];
        const postNow = args[1] === "now";

        if (!itemId) {
          await respond({
            text: "Usage: `/post <item-id> [now]`",
            response_type: "ephemeral",
          });
          return;
        }

        const item = await this.contentQueue.getItem(itemId);
        if (!item) {
          await respond({
            text: `Item \`${itemId}\` not found.`,
            response_type: "ephemeral",
          });
          return;
        }

        if (postNow) {
          await this.slackHandlers.handlePostNow(itemId);
          await respond({
            text: `Item \`${itemId.substring(0, 8)}\` approved and set to post now.`,
            response_type: "ephemeral",
          });
        } else {
          await this.slackHandlers.handleApprove(itemId);
          await respond({
            text: `Item \`${itemId.substring(0, 8)}\` approved. Will post at ${item.scheduled_for || "next available slot"}.`,
            response_type: "ephemeral",
          });
        }
      } catch (error) {
        logger.error(`Error handling /post: ${error}`);
        await respond({ text: `Error: ${error}`, response_type: "ephemeral" });
      }
    });
  }

  // ─── Button action handlers ───

  private setupActions(): void {
    // Approve
    this.app.action("approve_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handleApprove(itemId);
      } catch (error) {
        logger.error(`Error handling approve_item: ${error}`);
      }
    });

    // Skip
    this.app.action("skip_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handleSkip(itemId);
      } catch (error) {
        logger.error(`Error handling skip_item: ${error}`);
      }
    });

    // Pause
    this.app.action("pause_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handlePause(itemId);
      } catch (error) {
        logger.error(`Error handling pause_item: ${error}`);
      }
    });

    // Resume
    this.app.action("resume_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handleResume(itemId);
      } catch (error) {
        logger.error(`Error handling resume_item: ${error}`);
      }
    });

    // Retry
    this.app.action("retry_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handleRetry(itemId);
      } catch (error) {
        logger.error(`Error handling retry_item: ${error}`);
      }
    });

    // Post now
    this.app.action("post_now_item", async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        await this.slackHandlers.handlePostNow(itemId);
      } catch (error) {
        logger.error(`Error handling post_now_item: ${error}`);
      }
    });

    // Edit → opens modal
    this.app.action("edit_item", async ({ action, ack, body, client }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        if (!("trigger_id" in body) || !body.trigger_id) return;

        const item = await this.contentQueue.getItem(itemId);
        if (!item) return;

        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: "modal",
            callback_id: "edit_captions_modal",
            private_metadata: itemId,
            title: { type: "plain_text", text: "Edit Captions" },
            submit: { type: "plain_text", text: "Save" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: buildEditCaptionsModal(item),
          },
        });
      } catch (error) {
        logger.error(`Error handling edit_item: ${error}`);
      }
    });

    // Reschedule → opens modal
    this.app.action(
      "reschedule_item",
      async ({ action, ack, body, client }) => {
        await ack();
        try {
          const itemId = "value" in action ? action.value : undefined;
          if (!itemId) return;
          if (!("trigger_id" in body) || !body.trigger_id) return;

          const item = await this.contentQueue.getItem(itemId);
          if (!item) return;

          await client.views.open({
            trigger_id: body.trigger_id,
            view: {
              type: "modal",
              callback_id: "reschedule_modal",
              private_metadata: itemId,
              title: { type: "plain_text", text: "Reschedule Post" },
              submit: { type: "plain_text", text: "Reschedule" },
              close: { type: "plain_text", text: "Cancel" },
              blocks: buildRescheduleModal(item),
            },
          });
        } catch (error) {
          logger.error(`Error handling reschedule_item: ${error}`);
        }
      },
    );

    // Queue a discovered content item
    this.app.action("queue_discovery", async ({ action, ack }) => {
      await ack();
      try {
        const discoveryId = "value" in action ? action.value : undefined;
        if (!discoveryId) return;
        await this.slackHandlers.handleQueueDiscovery(discoveryId);
      } catch (error) {
        logger.error(`Error handling queue_discovery: ${error}`);
      }
    });

    // Dismiss a discovered content item
    this.app.action("dismiss_discovery", async ({ action, ack }) => {
      await ack();
      try {
        const discoveryId = "value" in action ? action.value : undefined;
        if (!discoveryId) return;
        await this.slackHandlers.handleDismissDiscovery(discoveryId);
      } catch (error) {
        logger.error(`Error handling dismiss_discovery: ${error}`);
      }
    });

    // Repost an evergreen item
    this.app.action("repost_item", async ({ action, ack }) => {
      await ack();
      try {
        const postHistoryId = "value" in action ? action.value : undefined;
        if (!postHistoryId) return;
        await this.slackHandlers.handleRepost(postHistoryId);
      } catch (error) {
        logger.error(`Error handling repost_item: ${error}`);
      }
    });

    // Cross-post an evergreen item
    this.app.action("crosspost_item", async ({ action, ack }) => {
      await ack();
      try {
        const postHistoryId = "value" in action ? action.value : undefined;
        if (!postHistoryId) return;
        // Determine target platform: if original was twitter, crosspost to linkedin and vice versa
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        const { data: record } = await supabase
          .from("post_history")
          .select("platform")
          .eq("id", postHistoryId)
          .single();
        const target =
          record?.platform === "twitter" ? "linkedin" : "twitter";
        await this.slackHandlers.handleCrosspost(
          postHistoryId,
          target as "twitter" | "linkedin",
        );
      } catch (error) {
        logger.error(`Error handling crosspost_item: ${error}`);
      }
    });

    // Dismiss a repost suggestion
    this.app.action("dismiss_repost", async ({ ack }) => {
      await ack();
      // No-op — just acknowledge
    });

    // Video idea actions
    this.app.action("approve_video_idea", async ({ action, ack }) => {
      await ack();
      try {
        const ideaId = "value" in action ? action.value : undefined;
        if (!ideaId) return;
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        await supabase
          .from("video_ideas")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", ideaId);
        logger.info(`Approved video idea ${ideaId}`);
      } catch (error) {
        logger.error(`Error approving video idea: ${error}`);
      }
    });

    this.app.action("reject_video_idea", async ({ action, ack }) => {
      await ack();
      try {
        const ideaId = "value" in action ? action.value : undefined;
        if (!ideaId) return;
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        await supabase
          .from("video_ideas")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", ideaId);
        logger.info(`Rejected video idea ${ideaId}`);
      } catch (error) {
        logger.error(`Error rejecting video idea: ${error}`);
      }
    });

    this.app.action("critique_video_idea", async ({ ack }) => {
      await ack();
      // Critique is handled via thread replies — just acknowledge
    });

    // Video project actions
    this.app.action("approve_video_project", async ({ action, ack }) => {
      await ack();
      try {
        const projectId = "value" in action ? action.value : undefined;
        if (!projectId) return;
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        await supabase
          .from("video_projects")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", projectId);
        logger.info(`Approved video project ${projectId}`);
      } catch (error) {
        logger.error(`Error approving video project: ${error}`);
      }
    });

    this.app.action("feedback_video_project", async ({ ack }) => {
      await ack();
      // Feedback is handled via thread replies
    });

    this.app.action("reject_video_project", async ({ action, ack }) => {
      await ack();
      try {
        const projectId = "value" in action ? action.value : undefined;
        if (!projectId) return;
        const { createSupabaseClient } = await import("../utils/supabase.js");
        const supabase = createSupabaseClient();
        await supabase
          .from("video_projects")
          .update({ status: "archived", updated_at: new Date().toISOString() })
          .eq("id", projectId);
        logger.info(`Rejected/archived video project ${projectId}`);
      } catch (error) {
        logger.error(`Error rejecting video project: ${error}`);
      }
    });

    // Schedule navigation: previous week
    this.app.action("schedule_prev", async ({ action, ack, respond }) => {
      await ack();
      try {
        const weekOffset = parseInt("value" in action ? (action.value as string) : "0", 10);
        const items = await this.contentQueue.getItemsForWeekOffset(weekOffset);
        await respond({
          replace_original: true,
          blocks: buildScheduleList(items, weekOffset),
          text: `Schedule: ${items.length} posts`,
        });
      } catch (error) {
        logger.error(`Error handling schedule_prev: ${error}`);
      }
    });

    // Schedule navigation: next week
    this.app.action("schedule_next", async ({ action, ack, respond }) => {
      await ack();
      try {
        const weekOffset = parseInt("value" in action ? (action.value as string) : "0", 10);
        const items = await this.contentQueue.getItemsForWeekOffset(weekOffset);
        await respond({
          replace_original: true,
          blocks: buildScheduleList(items, weekOffset),
          text: `Schedule: ${items.length} posts`,
        });
      } catch (error) {
        logger.error(`Error handling schedule_next: ${error}`);
      }
    });

    // ─── Proactive agent actions ───

    this.app.action("proactive_view_stats", async ({ ack }) => {
      await ack();
      // Stats view — acknowledged, no further action needed
    });

    this.app.action(/^proactive_review_/, async ({ action, ack }) => {
      await ack();
      try {
        const itemId = "value" in action ? action.value : undefined;
        if (!itemId) return;
        // Navigate user to the review card — just approve for now
        await this.slackHandlers.handleApprove(itemId);
      } catch (error) {
        logger.error(`Error handling proactive_review: ${error}`);
      }
    });

    this.app.action("proactive_create_from_trend", async ({ action, ack, respond }) => {
      await ack();
      try {
        const topic = "value" in action ? (action.value as string) : undefined;
        if (!topic) return;
        const item = await this.contentQueue.addItem({
          type: "text",
          source_text: topic,
        });
        await respond({
          text: `:rocket: Queued trend topic for content generation: \`${item.id.substring(0, 8)}\``,
          replace_original: false,
        });
      } catch (error) {
        logger.error(`Error handling proactive_create_from_trend: ${error}`);
      }
    });

    this.app.action("proactive_dismiss_trend", async ({ ack }) => {
      await ack();
      // Dismissed — no action needed
    });

    // Handle overflow menu from queue list
    this.app.action(
      /^queue_overflow_/,
      async ({ action, ack }) => {
        await ack();
        try {
          if (!("selected_option" in action) || !action.selected_option)
            return;
          const val = action.selected_option.value as string;
          const [actionType, itemId] = val.split(":");
          if (!itemId) return;

          switch (actionType) {
            case "approve":
              await this.slackHandlers.handleApprove(itemId);
              break;
            case "edit":
              // overflow can't open modals, fall through
              break;
            case "skip":
              await this.slackHandlers.handleSkip(itemId);
              break;
          }
        } catch (error) {
          logger.error(`Error handling queue overflow: ${error}`);
        }
      },
    );
  }

  // ─── Modal submissions ───

  private setupModalSubmissions(): void {
    // Edit captions modal
    this.app.view("edit_captions_modal", async ({ ack, view }) => {
      await ack();
      try {
        const itemId = view.private_metadata;
        const values = view.state.values;

        const twitterCaption =
          values.twitter_caption?.twitter_caption_input?.value || "";
        const linkedinCaption =
          values.linkedin_caption?.linkedin_caption_input?.value || "";
        const platform = (values.platform_select?.platform_select_input
          ?.selected_option?.value || "both") as Platform;

        await this.slackHandlers.handleEditSubmission(
          itemId,
          twitterCaption,
          linkedinCaption,
          platform,
        );
      } catch (error) {
        logger.error(`Error handling edit_captions_modal: ${error}`);
      }
    });

    // Reschedule modal
    this.app.view("reschedule_modal", async ({ ack, view }) => {
      await ack();
      try {
        const itemId = view.private_metadata;
        const values = view.state.values;

        const date =
          values.reschedule_date?.reschedule_date_input?.selected_date;
        const time =
          values.reschedule_time?.reschedule_time_input?.selected_time;

        if (!date || !time) return;

        const newDate = new Date(`${date}T${time}:00`).toISOString();
        await this.slackHandlers.handleRescheduleSubmission(itemId, newDate);
      } catch (error) {
        logger.error(`Error handling reschedule_modal: ${error}`);
      }
    });
  }

  // ─── Utilities ───

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private classifyFile(file: any): ContentType | null {
    const mimetype = (file.mimetype as string) || "";
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async transferFileToSupabase(file: any): Promise<string | null> {
    try {
      const config = getConfig();
      const expectedSize: number | undefined = file.size;
      const mimeType: string =
        (file.mimetype as string) || "application/octet-stream";

      // Strategy 1: Use files.info API to get a fresh download URL
      // (more reliable on enterprise Slack; requires files:read scope)
      let downloadUrl: string | null = null;
      try {
        const fileInfo = await this.app.client.files.info({
          file: file.id as string,
        });
        if (fileInfo.file) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = fileInfo.file as any;
          downloadUrl = f.url_private_download || f.url_private;
          logger.info(
            `Got fresh download URL via files.info for ${file.id}`,
          );
        }
      } catch (apiError) {
        logger.warn(
          `files.info API failed (bot may need 'files:read' scope): ${apiError}`,
        );
      }

      // Fall back to URLs from the event payload
      if (!downloadUrl) {
        downloadUrl =
          (file.url_private_download as string) ||
          (file.url_private as string);
      }
      if (!downloadUrl) return null;

      // Download the file with Bearer auth
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${config.SLACK_BOT_OAUTH_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download from Slack: ${response.status} ${response.statusText}`,
        );
      }

      // Validate content-type to detect enterprise SSO login page redirects
      const responseContentType = response.headers.get("content-type") || "";
      if (responseContentType.includes("text/html")) {
        throw new Error(
          `Slack returned HTML instead of file content (enterprise SSO redirect). ` +
            `Add 'files:read' scope to the Slack bot to fix this. ` +
            `Response Content-Type: ${responseContentType}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Validate file size — detect when we got a stub instead of the real file
      if (expectedSize && buffer.length < expectedSize * 0.5) {
        logger.warn(
          `Downloaded file size (${buffer.length} bytes) is much smaller than ` +
            `expected (${expectedSize} bytes). The download may have failed.`,
        );
      }

      const rawName = (file.name as string) || `upload-${Date.now()}`;
      const sanitizedName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const bucket = mimeType.startsWith("video/") ? "videos" : "images";

      const supabase = createSupabaseClient();
      const path = `slack-uploads/${Date.now()}-${sanitizedName}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: mimeType });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      logger.info(
        `File transferred to Supabase: ${publicUrl} (${buffer.length} bytes, ${mimeType})`,
      );
      return publicUrl;
    } catch (error) {
      logger.error(`Failed to transfer file to Supabase: ${error}`);
      return null;
    }
  }

  private resolveScheduling(intake: IntakeResult): string | undefined {
    switch (intake.scheduling.intent) {
      case "asap":
        return new Date().toISOString();
      case "specific_date":
        return intake.scheduling.date || undefined;
      case "this_week":
      case "next_available":
      default:
        return undefined; // let the scheduler auto-assign
    }
  }

  private isDuplicate(key: string): boolean {
    if (this.processedMessages.has(key)) return true;
    this.processedMessages.add(key);

    setTimeout(() => {
      this.processedMessages.delete(key);
    }, this.dedupeWindowMs);

    return false;
  }
}
