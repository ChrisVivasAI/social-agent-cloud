import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { activityBus } from "./activity-bus.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";
import type { ContentQueueService } from "./content-queue.js";
import type { SlackHandlerService } from "./slack-handlers.js";
import type { VideoEditorAgent } from "./video-editor-agent.js";
import type { EngagementMonitorService } from "./engagement-monitor.js";
import type { ContentGeneratorService } from "./content-generator.js";
import type { ContentStatus } from "../types/index.js";

export interface ApiRouterDeps {
  contentQueue: ContentQueueService;
  slackHandlers: SlackHandlerService | null;
  videoEditor: VideoEditorAgent | null;
  engagementMonitor: EngagementMonitorService | null;
  contentGenerator: ContentGeneratorService | null;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    res.status(503).json({ error: "DASHBOARD_SECRET not configured" });
    return;
  }
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  const { contentQueue, slackHandlers, videoEditor: _videoEditor, engagementMonitor, contentGenerator } = deps;
  const supabase = createSupabaseClient();

  router.use(authMiddleware);

  // ==========================================================================
  // Queue endpoints
  // ==========================================================================

  // GET /api/queue — list items with optional status filter + pagination
  router.get("/queue", async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      let query = supabase
        .from("content_queue")
        .select("*", { count: "exact" })
        .order("scheduled_for", { ascending: true })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      res.json({ items: data || [], total: count || 0 });
    } catch (err) {
      logger.error(`API GET /queue error: ${err}`);
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  // GET /api/queue/:id — single item
  router.get("/queue/:id", async (req: Request, res: Response) => {
    try {
      const item = await contentQueue.getItem(req.params.id);
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      res.json(item);
    } catch (err) {
      logger.error(`API GET /queue/:id error: ${err}`);
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  // POST /api/queue/:id/approve
  router.post("/queue/:id/approve", async (req: Request, res: Response) => {
    try {
      if (slackHandlers) {
        await slackHandlers.handleApprove(req.params.id);
      } else {
        await contentQueue.approveItem(req.params.id);
      }
      activityBus.emitActivity("queue_item_approved", `Queue item ${req.params.id} approved via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/approve error: ${err}`);
      res.status(500).json({ error: "Failed to approve item" });
    }
  });

  // POST /api/queue/:id/reject (skip)
  router.post("/queue/:id/reject", async (req: Request, res: Response) => {
    try {
      if (slackHandlers) {
        await slackHandlers.handleSkip(req.params.id);
      } else {
        await contentQueue.skipItem(req.params.id);
      }
      activityBus.emitActivity("queue_item_rejected", `Queue item ${req.params.id} rejected via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/reject error: ${err}`);
      res.status(500).json({ error: "Failed to reject item" });
    }
  });

  // POST /api/queue/:id/edit — update generated_post fields
  router.post("/queue/:id/edit", async (req: Request, res: Response) => {
    try {
      const { generated_post_twitter, generated_post_linkedin, platform } = req.body || {};
      const updates: Record<string, unknown> = {};
      if (generated_post_twitter !== undefined) updates.generated_post_twitter = generated_post_twitter;
      if (generated_post_linkedin !== undefined) updates.generated_post_linkedin = generated_post_linkedin;
      if (platform !== undefined) updates.platform = platform;
      if (generated_post_twitter !== undefined) updates.generated_post = generated_post_twitter;

      await contentQueue.updateItem(req.params.id, updates);
      activityBus.emitActivity("queue_item_edited", `Queue item ${req.params.id} edited via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/edit error: ${err}`);
      res.status(500).json({ error: "Failed to edit item" });
    }
  });

  // POST /api/queue/:id/reschedule — update scheduled_for
  router.post("/queue/:id/reschedule", async (req: Request, res: Response) => {
    try {
      const { scheduled_for } = req.body || {};
      if (!scheduled_for) {
        res.status(400).json({ error: "scheduled_for is required" });
        return;
      }
      await contentQueue.updateItem(req.params.id, { scheduled_for });
      activityBus.emitActivity("queue_item_rescheduled", `Queue item ${req.params.id} rescheduled via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/reschedule error: ${err}`);
      res.status(500).json({ error: "Failed to reschedule item" });
    }
  });

  // POST /api/queue/:id/post-now — set to ready + now
  router.post("/queue/:id/post-now", async (req: Request, res: Response) => {
    try {
      await contentQueue.updateItem(req.params.id, {
        status: "ready",
        scheduled_for: new Date().toISOString(),
      });
      activityBus.emitActivity("queue_item_post_now", `Queue item ${req.params.id} set to post now via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/post-now error: ${err}`);
      res.status(500).json({ error: "Failed to post now" });
    }
  });

  // POST /api/queue/:id/pause
  router.post("/queue/:id/pause", async (req: Request, res: Response) => {
    try {
      await contentQueue.pauseItem(req.params.id);
      activityBus.emitActivity("queue_item_paused", `Queue item ${req.params.id} paused via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/pause error: ${err}`);
      res.status(500).json({ error: "Failed to pause item" });
    }
  });

  // POST /api/queue/:id/resume — set back to awaiting_approval
  router.post("/queue/:id/resume", async (req: Request, res: Response) => {
    try {
      const item = await contentQueue.getItem(req.params.id);
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      const resumeStatus: ContentStatus =
        item.generated_post ? "awaiting_approval" : "ready";
      await contentQueue.updateItem(req.params.id, { status: resumeStatus });
      activityBus.emitActivity("queue_item_resumed", `Queue item ${req.params.id} resumed via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/resume error: ${err}`);
      res.status(500).json({ error: "Failed to resume item" });
    }
  });

  // POST /api/queue/:id/retry — reset to pending + clear error
  router.post("/queue/:id/retry", async (req: Request, res: Response) => {
    try {
      await contentQueue.updateItem(req.params.id, {
        status: "pending",
        error_message: null,
      });
      activityBus.emitActivity("queue_item_retried", `Queue item ${req.params.id} retried via dashboard`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /queue/:id/retry error: ${err}`);
      res.status(500).json({ error: "Failed to retry item" });
    }
  });

  // ==========================================================================
  // Engagement endpoints
  // ==========================================================================

  // GET /api/engagement — list processed_mentions
  router.get("/engagement", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabase
        .from("processed_mentions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      res.json({ items: data || [], total: count || 0 });
    } catch (err) {
      logger.error(`API GET /engagement error: ${err}`);
      res.status(500).json({ error: "Failed to fetch engagements" });
    }
  });

  // POST /api/engagement/:id/approve — post the drafted reply
  router.post("/engagement/:id/approve", async (req: Request, res: Response) => {
    try {
      if (!engagementMonitor) {
        res.status(503).json({ error: "Engagement monitor not available" });
        return;
      }
      const draft = await engagementMonitor.getDraftReply(req.params.id);
      if (!draft) {
        res.status(404).json({ error: "No draft found for this mention" });
        return;
      }
      const tweetId = await engagementMonitor.postReply(req.params.id, draft);
      activityBus.emitActivity("engagement_approved", `Reply posted for mention ${req.params.id}`);
      res.json({ success: true, tweetId });
    } catch (err) {
      logger.error(`API POST /engagement/:id/approve error: ${err}`);
      res.status(500).json({ error: "Failed to approve engagement" });
    }
  });

  // POST /api/engagement/:id/edit — update draft reply text
  router.post("/engagement/:id/edit", async (req: Request, res: Response) => {
    try {
      const { draft_reply } = req.body || {};
      if (!draft_reply) {
        res.status(400).json({ error: "draft_reply is required" });
        return;
      }
      const { error } = await supabase
        .from("processed_mentions")
        .update({ draft_reply })
        .eq("mention_id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /engagement/:id/edit error: ${err}`);
      res.status(500).json({ error: "Failed to edit engagement" });
    }
  });

  // POST /api/engagement/:id/dismiss
  router.post("/engagement/:id/dismiss", async (req: Request, res: Response) => {
    try {
      const { error } = await supabase
        .from("processed_mentions")
        .update({ replied: false })
        .eq("mention_id", req.params.id);
      if (error) throw error;
      activityBus.emitActivity("engagement_dismissed", `Mention ${req.params.id} dismissed`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /engagement/:id/dismiss error: ${err}`);
      res.status(500).json({ error: "Failed to dismiss engagement" });
    }
  });

  // ==========================================================================
  // Video endpoints
  // ==========================================================================

  // GET /api/video-ideas
  router.get("/video-ideas", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabase
        .from("video_ideas")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      res.json({ items: data || [], total: count || 0 });
    } catch (err) {
      logger.error(`API GET /video-ideas error: ${err}`);
      res.status(500).json({ error: "Failed to fetch video ideas" });
    }
  });

  // POST /api/video-ideas/:id/approve
  router.post("/video-ideas/:id/approve", async (req: Request, res: Response) => {
    try {
      const { error } = await supabase
        .from("video_ideas")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;
      activityBus.emitActivity("video_idea_approved", `Video idea ${req.params.id} approved`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /video-ideas/:id/approve error: ${err}`);
      res.status(500).json({ error: "Failed to approve video idea" });
    }
  });

  // POST /api/video-ideas/:id/reject
  router.post("/video-ideas/:id/reject", async (req: Request, res: Response) => {
    try {
      const { error } = await supabase
        .from("video_ideas")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;
      activityBus.emitActivity("video_idea_rejected", `Video idea ${req.params.id} rejected`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /video-ideas/:id/reject error: ${err}`);
      res.status(500).json({ error: "Failed to reject video idea" });
    }
  });

  // GET /api/video-projects
  router.get("/video-projects", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const { data, error, count } = await supabase
        .from("video_projects")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      res.json({ items: data || [], total: count || 0 });
    } catch (err) {
      logger.error(`API GET /video-projects error: ${err}`);
      res.status(500).json({ error: "Failed to fetch video projects" });
    }
  });

  // GET /api/video-projects/:id
  router.get("/video-projects/:id", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("video_projects")
        .select("*")
        .eq("id", req.params.id)
        .single();

      if (error || !data) {
        res.status(404).json({ error: "Video project not found" });
        return;
      }
      res.json(data);
    } catch (err) {
      logger.error(`API GET /video-projects/:id error: ${err}`);
      res.status(500).json({ error: "Failed to fetch video project" });
    }
  });

  // POST /api/video-projects/:id/feedback
  router.post("/video-projects/:id/feedback", async (req: Request, res: Response) => {
    try {
      const { feedback } = req.body || {};
      if (!feedback) {
        res.status(400).json({ error: "feedback is required" });
        return;
      }

      // Append to feedback_history array
      const { data: project, error: fetchError } = await supabase
        .from("video_projects")
        .select("feedback_history")
        .eq("id", req.params.id)
        .single();

      if (fetchError || !project) {
        res.status(404).json({ error: "Video project not found" });
        return;
      }

      const history = (project.feedback_history as Array<Record<string, unknown>>) || [];
      history.push({
        timestamp: new Date().toISOString(),
        feedback,
        applied: false,
      });

      const { error } = await supabase
        .from("video_projects")
        .update({
          feedback_history: history,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id);

      if (error) throw error;
      activityBus.emitActivity("video_feedback", `Feedback added to video project ${req.params.id}`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /video-projects/:id/feedback error: ${err}`);
      res.status(500).json({ error: "Failed to add feedback" });
    }
  });

  // ==========================================================================
  // Discovery endpoints
  // ==========================================================================

  // GET /api/discovery
  router.get("/discovery", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;

      let query = supabase
        .from("discovered_content")
        .select("*", { count: "exact" })
        .order("discovered_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ items: data || [], total: count || 0 });
    } catch (err) {
      logger.error(`API GET /discovery error: ${err}`);
      res.status(500).json({ error: "Failed to fetch discoveries" });
    }
  });

  // POST /api/discovery/:id/queue — create queue item from discovery
  router.post("/discovery/:id/queue", async (req: Request, res: Response) => {
    try {
      const { data: discovery, error: fetchError } = await supabase
        .from("discovered_content")
        .select("*")
        .eq("id", req.params.id)
        .single();

      if (fetchError || !discovery) {
        res.status(404).json({ error: "Discovery not found" });
        return;
      }

      const queueItem = await contentQueue.addItem({
        type: "link",
        content_url: discovery.url,
        source_text: discovery.summary || undefined,
      });

      await supabase
        .from("discovered_content")
        .update({
          status: "queued",
          content_queue_id: queueItem.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id);

      activityBus.emitActivity("discovery_queued", `Discovery ${req.params.id} queued as ${queueItem.id}`);
      res.json({ success: true, queueItemId: queueItem.id });
    } catch (err) {
      logger.error(`API POST /discovery/:id/queue error: ${err}`);
      res.status(500).json({ error: "Failed to queue discovery" });
    }
  });

  // POST /api/discovery/:id/dismiss
  router.post("/discovery/:id/dismiss", async (req: Request, res: Response) => {
    try {
      const { error } = await supabase
        .from("discovered_content")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", req.params.id);
      if (error) throw error;
      activityBus.emitActivity("discovery_dismissed", `Discovery ${req.params.id} dismissed`);
      res.json({ success: true });
    } catch (err) {
      logger.error(`API POST /discovery/:id/dismiss error: ${err}`);
      res.status(500).json({ error: "Failed to dismiss discovery" });
    }
  });

  // ==========================================================================
  // System endpoints
  // ==========================================================================

  // GET /api/status — agent health + queue summary
  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const summary = await contentQueue.getQueueSummary();
      res.json({
        status: "ok",
        uptime: process.uptime(),
        queue: summary,
      });
    } catch (err) {
      logger.error(`API GET /status error: ${err}`);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // GET /api/schedule — current cron schedule info
  router.get("/schedule", async (_req: Request, res: Response) => {
    try {
      const items = await contentQueue.getUpcomingItemsForWeek();
      res.json({ items });
    } catch (err) {
      logger.error(`API GET /schedule error: ${err}`);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  // GET /api/activity — SSE endpoint
  router.get("/activity", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send recent history as initial burst
    const history = activityBus.getRecentHistory(20);
    for (const event of history) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Stream new events
    const onActivity = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    activityBus.on("activity", onActivity);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);

    req.on("close", () => {
      activityBus.off("activity", onActivity);
      clearInterval(heartbeat);
    });
  });

  // POST /api/generate — trigger content generation for a queue item
  router.post("/generate", async (req: Request, res: Response) => {
    try {
      const { itemId } = req.body || {};
      if (!itemId) {
        res.status(400).json({ error: "itemId is required" });
        return;
      }
      const item = await contentQueue.getItem(itemId);
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      if (!contentGenerator) {
        res.status(503).json({ error: "Content generator not available" });
        return;
      }
      // Trigger in background
      contentGenerator.processQueueItem(item).catch((err) => {
        logger.error(`Background generation failed for ${itemId}: ${err}`);
      });
      activityBus.emitActivity("generation_triggered", `Content generation triggered for ${itemId}`);
      res.json({ success: true, message: "Generation started" });
    } catch (err) {
      logger.error(`API POST /generate error: ${err}`);
      res.status(500).json({ error: "Failed to trigger generation" });
    }
  });

  // ==========================================================================
  // Chat endpoint
  // ==========================================================================

  // POST /api/chat — command interface to the agent
  router.post("/chat", async (req: Request, res: Response) => {
    try {
      const { message } = req.body || {};
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "message is required" });
        return;
      }

      const lower = message.toLowerCase().trim();
      let reply = "";
      let actions: Array<{ type: string; label: string; data: unknown }> = [];

      // --- Parse intent and execute ---

      // Queue status
      if (
        lower.includes("queue status") ||
        lower.includes("show queue") ||
        lower === "queue" ||
        lower === "status"
      ) {
        const summary = await contentQueue.getQueueSummary();
        reply =
          `**Queue Status**\n` +
          `- Pending: ${summary.pending}\n` +
          `- Generating: ${summary.generating}\n` +
          `- Awaiting Approval: ${summary.awaiting_approval}\n` +
          `- Ready: ${summary.ready}\n` +
          `- Paused: ${summary.paused}\n` +
          `- Posted Today: ${summary.posted_today}\n` +
          `- Failed: ${summary.failed}`;
        if (summary.upcoming.length > 0) {
          actions = summary.upcoming.slice(0, 5).map((item) => ({
            type: "queue_item",
            label: `${item.type} — ${item.status}`,
            data: { id: item.id, type: item.type, status: item.status, scheduled_for: item.scheduled_for },
          }));
        }
      }
      // Approve item
      else if (lower.startsWith("approve ")) {
        const idPart = message.trim().split(/\s+/)[1];
        if (!idPart) {
          reply = "Please provide an item ID. Usage: `approve <id>`";
        } else {
          try {
            if (slackHandlers) {
              await slackHandlers.handleApprove(idPart);
            } else {
              await contentQueue.approveItem(idPart);
            }
            activityBus.emitActivity("queue_item_approved", `Queue item ${idPart} approved via chat`);
            reply = `Item \`${idPart.substring(0, 8)}\` has been approved.`;
          } catch {
            reply = `Failed to approve item \`${idPart.substring(0, 8)}\`. It may not exist or is not in an approvable state.`;
          }
        }
      }
      // Reject / skip item
      else if (lower.startsWith("reject ") || lower.startsWith("skip ")) {
        const idPart = message.trim().split(/\s+/)[1];
        if (!idPart) {
          reply = "Please provide an item ID. Usage: `reject <id>`";
        } else {
          try {
            if (slackHandlers) {
              await slackHandlers.handleSkip(idPart);
            } else {
              await contentQueue.skipItem(idPart);
            }
            activityBus.emitActivity("queue_item_rejected", `Queue item ${idPart} rejected via chat`);
            reply = `Item \`${idPart.substring(0, 8)}\` has been skipped.`;
          } catch {
            reply = `Failed to skip item \`${idPart.substring(0, 8)}\`.`;
          }
        }
      }
      // Show upcoming / schedule
      else if (
        lower.includes("upcoming") ||
        lower.includes("schedule") ||
        lower.includes("next posts") ||
        lower.includes("what's next")
      ) {
        const items = await contentQueue.getUpcomingItemsForWeek();
        if (items.length === 0) {
          reply = "No upcoming posts scheduled this week.";
        } else {
          reply = `**Upcoming Posts (${items.length})**\n` +
            items.slice(0, 10).map((item, i) =>
              `${i + 1}. \`${item.id.substring(0, 8)}\` — ${item.type} [${item.status}] — ${item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : "unscheduled"}`
            ).join("\n");
          actions = items.slice(0, 5).map((item) => ({
            type: "queue_item",
            label: `${item.type} — ${item.status}`,
            data: {
              id: item.id,
              type: item.type,
              status: item.status,
              scheduled_for: item.scheduled_for,
              generated_post_twitter: item.generated_post_twitter,
              generated_post_linkedin: item.generated_post_linkedin,
            },
          }));
        }
      }
      // Awaiting approval
      else if (
        lower.includes("awaiting") ||
        lower.includes("pending approval") ||
        lower.includes("needs approval") ||
        lower.includes("review")
      ) {
        const items = await contentQueue.getAwaitingApprovalItems();
        if (items.length === 0) {
          reply = "No items awaiting approval right now.";
        } else {
          reply = `**Awaiting Approval (${items.length})**\n` +
            items.slice(0, 10).map((item, i) =>
              `${i + 1}. \`${item.id.substring(0, 8)}\` — ${item.type} — ${item.source_text?.substring(0, 60) || "(no source text)"}`
            ).join("\n");
          actions = items.slice(0, 5).map((item) => ({
            type: "approvable_item",
            label: `Approve: ${item.type}`,
            data: {
              id: item.id,
              type: item.type,
              source_text: item.source_text?.substring(0, 100),
              generated_post_twitter: item.generated_post_twitter?.substring(0, 100),
            },
          }));
        }
      }
      // Generate content
      else if (
        lower.startsWith("generate ") ||
        lower.startsWith("create a post") ||
        lower.startsWith("write a post") ||
        lower.startsWith("make a post")
      ) {
        const topic = message.replace(/^(generate|create|write|make)\s+(a\s+)?(post\s+)?(about\s+)?/i, "").trim();
        if (!topic) {
          reply = "What topic should I generate a post about?";
        } else {
          const item = await contentQueue.addItem({
            type: "text",
            source_text: topic,
          });
          activityBus.emitActivity("generation_triggered", `Content generation queued for "${topic}" via chat`);
          if (contentGenerator) {
            contentGenerator.processQueueItem(item).catch((err) => {
              logger.error(`Background generation failed for ${item.id}: ${err}`);
            });
          }
          reply = `Queued content generation for: "${topic}"\nItem ID: \`${item.id.substring(0, 8)}\``;
          actions = [{
            type: "queue_item",
            label: "View item",
            data: { id: item.id, type: item.type, status: item.status },
          }];
        }
      }
      // Pause posting
      else if (lower === "pause posting" || lower === "pause") {
        reply = "System-wide pause is not yet implemented. You can pause individual items with `pause <id>`.";
      }
      // Resume posting
      else if (lower === "resume posting" || lower === "resume") {
        reply = "System-wide resume is not yet implemented. You can resume individual items with `resume <id>`.";
      }
      // Pause individual item
      else if (lower.startsWith("pause ")) {
        const idPart = message.trim().split(/\s+/)[1];
        if (idPart) {
          try {
            await contentQueue.pauseItem(idPart);
            activityBus.emitActivity("queue_item_paused", `Queue item ${idPart} paused via chat`);
            reply = `Item \`${idPart.substring(0, 8)}\` has been paused.`;
          } catch {
            reply = `Failed to pause item \`${idPart.substring(0, 8)}\`.`;
          }
        }
      }
      // Resume individual item
      else if (lower.startsWith("resume ")) {
        const idPart = message.trim().split(/\s+/)[1];
        if (idPart) {
          try {
            const item = await contentQueue.getItem(idPart);
            if (!item) {
              reply = `Item \`${idPart.substring(0, 8)}\` not found.`;
            } else {
              const resumeStatus = item.generated_post ? "awaiting_approval" : "pending";
              await contentQueue.updateItem(idPart, { status: resumeStatus });
              activityBus.emitActivity("queue_item_resumed", `Queue item ${idPart} resumed via chat`);
              reply = `Item \`${idPart.substring(0, 8)}\` has been resumed (status: ${resumeStatus}).`;
            }
          } catch {
            reply = `Failed to resume item \`${idPart.substring(0, 8)}\`.`;
          }
        }
      }
      // Analytics / engagement summary
      else if (
        lower.includes("analytics") ||
        lower.includes("engagement") ||
        lower.includes("performance") ||
        lower.includes("metrics")
      ) {
        const { data: recent } = await supabase
          .from("post_history")
          .select("likes, retweets, comments, impressions, platform")
          .order("posted_at", { ascending: false })
          .limit(20);

        if (!recent || recent.length === 0) {
          reply = "No post performance data available yet.";
        } else {
          const totals = recent.reduce(
            (acc, r) => ({
              likes: acc.likes + (r.likes || 0),
              retweets: acc.retweets + (r.retweets || 0),
              comments: acc.comments + (r.comments || 0),
              impressions: acc.impressions + (r.impressions || 0),
            }),
            { likes: 0, retweets: 0, comments: 0, impressions: 0 },
          );
          reply =
            `**Recent Performance (last ${recent.length} posts)**\n` +
            `- Likes: ${totals.likes}\n` +
            `- Retweets: ${totals.retweets}\n` +
            `- Comments: ${totals.comments}\n` +
            `- Impressions: ${totals.impressions}`;
        }
      }
      // Help
      else if (lower === "help" || lower === "commands" || lower === "?") {
        reply =
          `**Available Commands**\n` +
          `- \`queue status\` — Show queue summary\n` +
          `- \`show upcoming\` — List scheduled posts\n` +
          `- \`awaiting approval\` — List items needing review\n` +
          `- \`approve <id>\` — Approve a queue item\n` +
          `- \`reject <id>\` — Skip/reject a queue item\n` +
          `- \`generate a post about <topic>\` — Generate new content\n` +
          `- \`pause <id>\` — Pause a queue item\n` +
          `- \`resume <id>\` — Resume a paused item\n` +
          `- \`analytics\` — Show recent performance\n` +
          `- \`help\` — Show this message`;
      }
      // Fallback
      else {
        reply = `I didn't understand that command. Type \`help\` to see available commands.`;
      }

      res.json({ reply, actions });
    } catch (err) {
      logger.error(`API POST /chat error: ${err}`);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // PUT /api/settings — update settings
  router.put("/settings", async (req: Request, res: Response) => {
    try {
      // Store settings in Supabase agent_settings table (or env overrides)
      const settings = req.body || {};
      // For now, persist to a simple key-value store
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from("agent_settings")
          .upsert(
            { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
            { onConflict: "key" },
          );
      }
      activityBus.emitActivity("settings_updated", "Agent settings updated via dashboard");
      res.json({ success: true });
    } catch (err) {
      logger.error(`API PUT /settings error: ${err}`);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  return router;
}
