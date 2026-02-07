import { createSupabaseClient } from "../utils/supabase.js";
import { findNextAvailableSlot } from "../utils/date.js";
import { getConfig } from "../config/env.js";
import { PREFERRED_CONTENT_MIX } from "../config/schedule.js";
import { logger } from "../utils/logger.js";
import type {
  ContentQueueItem,
  NewContentQueueItem,
  QueueSummary,
} from "../types/index.js";

export class ContentQueueService {
  private supabase = createSupabaseClient();

  async addItem(item: NewContentQueueItem): Promise<ContentQueueItem> {
    // Auto-schedule if no scheduled_for provided
    let scheduledFor = item.scheduled_for;
    if (!scheduledFor) {
      const existingDates = await this.getScheduledDates();

      // Queue balancing: check if this type already has its weekly quota filled
      const scheduledThisWeek = await this.getScheduledItemsThisWeek();
      const typeCounts = this.countByType(scheduledThisWeek);
      const normalizedType = ["image", "video"].includes(item.type)
        ? "media"
        : item.type;
      const quota = PREFERRED_CONTENT_MIX[normalizedType] ?? 1;

      let weekOffset = 0;
      if ((typeCounts[normalizedType] || 0) >= quota) {
        // This type's quota is filled for the current week — push to next week
        weekOffset = 1;
        logger.info(
          `Type "${normalizedType}" has ${typeCounts[normalizedType]}/${quota} slots filled this week, pushing to next week`,
        );
      }

      let nextSlot = findNextAvailableSlot(
        item.type,
        existingDates,
        getConfig().POST_TIMEZONE,
      );

      if (weekOffset > 0) {
        // Add a week to push beyond the current week
        const { addWeeks } = await import("date-fns");
        nextSlot = addWeeks(nextSlot, weekOffset);
      }

      scheduledFor = nextSlot.toISOString();
    }

    const { data, error } = await this.supabase
      .from("content_queue")
      .insert({
        ...item,
        scheduled_for: scheduledFor,
        platform: item.platform || "both",
        priority: item.priority || 2,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add item: ${error.message}`);
    logger.info(`Added item to queue: ${data.id} (${item.type})`, {
      scheduledFor,
    });
    return data;
  }

  async getPendingItems(limit: number = 5): Promise<ContentQueueItem[]> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Failed to get pending items: ${error.message}`);
    return data || [];
  }

  async getDueItems(): Promise<ContentQueueItem[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "ready")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true });

    if (error) throw new Error(`Failed to get due items: ${error.message}`);
    return data || [];
  }

  async getGeneratedItems(): Promise<ContentQueueItem[]> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "generated")
      .order("created_at", { ascending: true });

    if (error)
      throw new Error(`Failed to get generated items: ${error.message}`);
    return data || [];
  }

  async updateItem(
    id: string,
    updates: Partial<ContentQueueItem>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("content_queue")
      .update(updates)
      .eq("id", id);

    if (error) throw new Error(`Failed to update item ${id}: ${error.message}`);
  }

  async markPosted(
    id: string,
    twitterId?: string,
    linkedinId?: string,
  ): Promise<void> {
    await this.updateItem(id, {
      status: "posted",
      twitter_post_id: twitterId || null,
      linkedin_post_id: linkedinId || null,
      posted_at: new Date().toISOString(),
    });

    // Also record in post_history
    const item = await this.getItem(id);
    if (item) {
      const now = new Date();
      const records = [];
      if (twitterId) {
        records.push({
          content_queue_id: id,
          platform: "twitter",
          post_text: item.generated_post || "",
          media_url: item.media_url || item.image_url,
          external_post_id: twitterId,
          posted_at: now.toISOString(),
          day_of_week: now.getUTCDay(),
          hour_of_day: now.getUTCHours(),
        });
      }
      if (linkedinId) {
        records.push({
          content_queue_id: id,
          platform: "linkedin",
          post_text: item.generated_post || "",
          media_url: item.media_url || item.image_url,
          external_post_id: linkedinId,
          posted_at: now.toISOString(),
          day_of_week: now.getUTCDay(),
          hour_of_day: now.getUTCHours(),
        });
      }
      if (records.length > 0) {
        await this.supabase.from("post_history").insert(records);
      }
    }

    logger.info(`Marked item ${id} as posted`, { twitterId, linkedinId });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    const item = await this.getItem(id);
    await this.updateItem(id, {
      status: "failed",
      error_message: errorMessage,
      retry_count: (item?.retry_count || 0) + 1,
    });
    logger.error(`Marked item ${id} as failed: ${errorMessage}`);
  }

  async getItem(id: string): Promise<ContentQueueItem | null> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  }

  async getAwaitingApprovalItems(
    limit: number = 20,
  ): Promise<ContentQueueItem[]> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "awaiting_approval")
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error)
      throw new Error(
        `Failed to get awaiting approval items: ${error.message}`,
      );
    return data || [];
  }

  async getPausedItems(): Promise<ContentQueueItem[]> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "paused")
      .order("scheduled_for", { ascending: true });

    if (error)
      throw new Error(`Failed to get paused items: ${error.message}`);
    return data || [];
  }

  async getUpcomingItemsForWeek(): Promise<ContentQueueItem[]> {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .in("status", [
        "awaiting_approval",
        "ready",
        "generated",
        "rendering",
        "pending",
        "paused",
      ])
      .lte("scheduled_for", weekFromNow.toISOString())
      .order("scheduled_for", { ascending: true });

    if (error)
      throw new Error(`Failed to get upcoming items: ${error.message}`);
    return data || [];
  }

  async getItemsForWeekOffset(weekOffset: number): Promise<ContentQueueItem[]> {
    const now = new Date();
    // Get Monday of the current week
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .in("status", [
        "awaiting_approval",
        "ready",
        "generated",
        "rendering",
        "pending",
        "paused",
      ])
      .gte("scheduled_for", monday.toISOString())
      .lte("scheduled_for", sunday.toISOString())
      .order("scheduled_for", { ascending: true });

    if (error)
      throw new Error(`Failed to get items for week: ${error.message}`);
    return data || [];
  }

  async getItemsDueSoon(minutesAhead: number): Promise<ContentQueueItem[]> {
    const now = new Date();
    const future = new Date(now.getTime() + minutesAhead * 60 * 1000);
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "ready")
      .gte("scheduled_for", now.toISOString())
      .lte("scheduled_for", future.toISOString())
      .order("scheduled_for", { ascending: true });

    if (error)
      throw new Error(`Failed to get items due soon: ${error.message}`);
    return data || [];
  }

  async approveItem(id: string): Promise<void> {
    await this.updateItem(id, { status: "ready" });
    logger.info(`Approved item ${id}`);
  }

  async skipItem(id: string): Promise<void> {
    await this.updateItem(id, { status: "skipped" });
    logger.info(`Skipped item ${id}`);
  }

  async pauseItem(id: string): Promise<void> {
    await this.updateItem(id, { status: "paused" });
    logger.info(`Paused item ${id}`);
  }

  async getFailedItems(maxRetries: number = 3): Promise<ContentQueueItem[]> {
    const { data, error } = await this.supabase
      .from("content_queue")
      .select("*")
      .eq("status", "failed")
      .lt("retry_count", maxRetries)
      .order("updated_at", { ascending: true });

    if (error) throw new Error(`Failed to get failed items: ${error.message}`);
    return data || [];
  }

  async getQueueSummary(): Promise<QueueSummary> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      pending,
      generating,
      awaitingApproval,
      ready,
      paused,
      postedToday,
      failed,
      upcoming,
    ] = await Promise.all([
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "pending"),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "generating"),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "awaiting_approval"),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "ready"),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "paused"),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "posted")
        .gte("posted_at", todayStart.toISOString()),
      this.supabase
        .from("content_queue")
        .select("id", { count: "exact" })
        .eq("status", "failed"),
      this.supabase
        .from("content_queue")
        .select("id, type, scheduled_for, status")
        .in("status", [
          "ready",
          "awaiting_approval",
          "generated",
          "rendering",
          "pending",
        ])
        .order("scheduled_for", { ascending: true })
        .limit(10),
    ]);

    return {
      pending: pending.count || 0,
      generating: generating.count || 0,
      awaiting_approval: awaitingApproval.count || 0,
      ready: ready.count || 0,
      paused: paused.count || 0,
      posted_today: postedToday.count || 0,
      failed: failed.count || 0,
      upcoming: (upcoming.data || []) as QueueSummary["upcoming"],
    };
  }

  async getScheduledItemsThisWeek(): Promise<ContentQueueItem[]> {
    const now = new Date();
    // Get start of current week (Monday)
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const { data } = await this.supabase
      .from("content_queue")
      .select("*")
      .in("status", [
        "pending",
        "generating",
        "generated",
        "rendering",
        "awaiting_approval",
        "ready",
      ])
      .gte("scheduled_for", monday.toISOString())
      .lte("scheduled_for", sunday.toISOString());

    return (data || []) as ContentQueueItem[];
  }

  private countByType(
    items: ContentQueueItem[],
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const normalized = ["image", "video"].includes(item.type)
        ? "media"
        : item.type;
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
    return counts;
  }

  private async getScheduledDates(): Promise<Date[]> {
    const { data } = await this.supabase
      .from("content_queue")
      .select("scheduled_for")
      .in("status", ["ready", "awaiting_approval", "generated", "pending", "rendering"])
      .not("scheduled_for", "is", null);

    return (data || [])
      .filter((d) => d.scheduled_for)
      .map((d) => new Date(d.scheduled_for));
  }
}
