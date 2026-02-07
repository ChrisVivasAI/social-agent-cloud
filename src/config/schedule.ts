import type { ContentType } from "../types/index.js";
import { createSupabaseClient } from "../utils/supabase.js";
import { logger } from "../utils/logger.js";

export interface PostingSlot {
  dayOfWeek: number[]; // 0=Sun through 6=Sat
  hour: number; // 0-23 in POST_TIMEZONE
  minute: number; // 0-59
  contentType?: ContentType; // null = any type
  label: string;
}

// Weekly target: 4 posts/week, content-type-agnostic slots
export const WEEKLY_TARGET = 4;

// Preferred weekly mix — soft guideline for queue balancing
export const PREFERRED_CONTENT_MIX: Record<string, number> = {
  link: 1,
  media: 1, // image + video combined
  remotion: 1,
  text: 1,
};

// Default weekly schedule (4 posts/week)
// Optimal posting times based on engagement research:
// Twitter: Tue-Thu 9-11 AM
// LinkedIn: Tue-Thu 10 AM-12 PM
export const DEFAULT_POSTING_SLOTS: PostingSlot[] = [
  {
    dayOfWeek: [1], // Monday
    hour: 9,
    minute: 0,
    label: "Monday morning slot",
  },
  {
    dayOfWeek: [2], // Tuesday
    hour: 10,
    minute: 0,
    label: "Tuesday mid-morning slot",
  },
  {
    dayOfWeek: [4], // Thursday
    hour: 9,
    minute: 0,
    label: "Thursday morning slot",
  },
  {
    dayOfWeek: [5], // Friday
    hour: 10,
    minute: 0,
    label: "Friday mid-morning slot",
  },
];

// Minimum hours between posts on the same platform
export const MIN_HOURS_BETWEEN_POSTS = 2;

// Maximum retry attempts for failed posts
export const MAX_RETRY_ATTEMPTS = 3;

// Content types that match "image" or "video" slots interchangeably
export const MEDIA_CONTENT_TYPES: ContentType[] = ["image", "video"];

// Adaptive scheduling configuration
export const ADAPTIVE_SCHEDULING = {
  // Minimum data points before adjusting schedule
  MIN_POSTS_FOR_ADAPTATION: 20,
  // How much weight to give recent performance vs defaults
  ADAPTATION_STRENGTH: 0.5,
  // Maximum slots per week when queue is full
  MAX_WEEKLY_SLOTS: 8,
  // When queue exceeds this, add extra slots
  QUEUE_OVERFLOW_THRESHOLD: 6,
  // Analyze last N days for timing optimization
  ANALYSIS_WINDOW_DAYS: 30,
};

// Get mutable copy of posting slots (for adaptive scheduling to modify)
export function getPostingSlots(): PostingSlot[] {
  return DEFAULT_POSTING_SLOTS.map((slot) => ({ ...slot }));
}

// ─── Adaptive Scheduling ───

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface TimeSlotScore {
  dayOfWeek: number;
  hour: number;
  totalEngagement: number;
  postCount: number;
  avgEngagement: number;
}

/**
 * Analyze post_history to find the best-performing day/hour combinations,
 * blend with default slots using ADAPTATION_STRENGTH, and return adapted
 * PostingSlot[]. If insufficient data, returns default slots unchanged.
 *
 * Also handles queue-depth-aware slot expansion/contraction.
 */
export async function adaptSchedule(): Promise<PostingSlot[]> {
  const supabase = createSupabaseClient();
  const {
    MIN_POSTS_FOR_ADAPTATION,
    ADAPTATION_STRENGTH,
    MAX_WEEKLY_SLOTS,
    QUEUE_OVERFLOW_THRESHOLD,
    ANALYSIS_WINDOW_DAYS,
  } = ADAPTIVE_SCHEDULING;

  // 1. Query post_history for the analysis window
  const windowStart = new Date(
    Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: posts, error } = await supabase
    .from("post_history")
    .select("day_of_week, hour_of_day, likes, retweets, comments, impressions, engagement_rate")
    .eq("metrics_pulled_72h", true)
    .gte("posted_at", windowStart);

  if (error) {
    logger.error(`adaptSchedule: failed to query post_history: ${error.message}`);
    return getPostingSlots();
  }

  if (!posts || posts.length < MIN_POSTS_FOR_ADAPTATION) {
    logger.info(
      `adaptSchedule: only ${posts?.length ?? 0} posts with metrics (need ${MIN_POSTS_FOR_ADAPTATION}), using defaults`,
    );
    return getPostingSlots();
  }

  // 2. Group by day_of_week + hour_of_day and compute avg engagement
  const slotMap = new Map<string, TimeSlotScore>();
  for (const p of posts) {
    const key = `${p.day_of_week}:${p.hour_of_day}`;
    const existing = slotMap.get(key);
    // Composite engagement score: likes*2 + retweets*3 + comments*4 + impressions*0.01
    const score =
      (p.likes || 0) * 2 +
      (p.retweets || 0) * 3 +
      (p.comments || 0) * 4 +
      (p.impressions || 0) * 0.01;

    if (existing) {
      existing.totalEngagement += score;
      existing.postCount += 1;
      existing.avgEngagement = existing.totalEngagement / existing.postCount;
    } else {
      slotMap.set(key, {
        dayOfWeek: p.day_of_week,
        hour: p.hour_of_day,
        totalEngagement: score,
        postCount: 1,
        avgEngagement: score,
      });
    }
  }

  // 3. Rank slots by average engagement
  const rankedSlots = Array.from(slotMap.values())
    .filter((s) => s.postCount >= 2) // need at least 2 posts in a slot to be meaningful
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  if (rankedSlots.length === 0) {
    logger.info("adaptSchedule: no slots with enough data, using defaults");
    return getPostingSlots();
  }

  // 4. Determine how many slots we need (queue-depth-aware)
  let targetSlotCount = DEFAULT_POSTING_SLOTS.length; // default 4
  const queueDepth = await getActiveQueueDepth(supabase);

  if (queueDepth > QUEUE_OVERFLOW_THRESHOLD) {
    // Scale up: add 1 slot per 2 items over threshold, capped at MAX_WEEKLY_SLOTS
    const extra = Math.ceil((queueDepth - QUEUE_OVERFLOW_THRESHOLD) / 2);
    targetSlotCount = Math.min(
      DEFAULT_POSTING_SLOTS.length + extra,
      MAX_WEEKLY_SLOTS,
    );
    logger.info(
      `adaptSchedule: queue depth ${queueDepth} exceeds threshold ${QUEUE_OVERFLOW_THRESHOLD}, expanding to ${targetSlotCount} slots`,
    );
  } else if (queueDepth === 0) {
    // Reduce to minimum of 2 slots if queue is empty
    targetSlotCount = Math.max(2, DEFAULT_POSTING_SLOTS.length - 1);
    logger.info(
      `adaptSchedule: queue empty, reducing to ${targetSlotCount} slots`,
    );
  }

  // 5. Blend learned optimal times with defaults
  const defaults = getPostingSlots();
  const adaptedSlots: PostingSlot[] = [];

  // First pass: blend each default slot toward the nearest high-performing slot
  for (const defaultSlot of defaults) {
    const defaultDay = defaultSlot.dayOfWeek[0];
    const defaultHour = defaultSlot.hour;

    // Find the best-performing slot closest to this default's day
    const nearby = rankedSlots.filter(
      (s) => Math.abs(s.dayOfWeek - defaultDay) <= 1 || // same or adjacent day
             (defaultDay === 0 && s.dayOfWeek === 6) || // wrap Sun<->Sat
             (defaultDay === 6 && s.dayOfWeek === 0),
    );

    if (nearby.length > 0) {
      const best = nearby[0]; // highest avg engagement in the neighborhood
      // Blend: lerp between default and learned
      const blendedDay = Math.round(
        defaultDay * (1 - ADAPTATION_STRENGTH) + best.dayOfWeek * ADAPTATION_STRENGTH,
      );
      const blendedHour = Math.round(
        defaultHour * (1 - ADAPTATION_STRENGTH) + best.hour * ADAPTATION_STRENGTH,
      );
      // Clamp to valid ranges
      const finalDay = ((blendedDay % 7) + 7) % 7;
      const finalHour = Math.max(7, Math.min(20, blendedHour)); // keep between 7 AM and 8 PM

      adaptedSlots.push({
        dayOfWeek: [finalDay],
        hour: finalHour,
        minute: defaultSlot.minute,
        label: `Adapted ${DAY_NAMES[finalDay]} ${finalHour}:00 slot`,
      });
    } else {
      // No nearby data -- keep the default
      adaptedSlots.push({ ...defaultSlot });
    }
  }

  // Second pass: if we need more slots than defaults, add top-performing slots
  if (targetSlotCount > adaptedSlots.length) {
    const usedKeys = new Set(
      adaptedSlots.map((s) => `${s.dayOfWeek[0]}:${s.hour}`),
    );
    for (const candidate of rankedSlots) {
      if (adaptedSlots.length >= targetSlotCount) break;
      const key = `${candidate.dayOfWeek}:${candidate.hour}`;
      if (usedKeys.has(key)) continue;
      // Ensure the hour is reasonable (7 AM - 8 PM)
      if (candidate.hour < 7 || candidate.hour > 20) continue;

      adaptedSlots.push({
        dayOfWeek: [candidate.dayOfWeek],
        hour: candidate.hour,
        minute: 0,
        label: `Overflow ${DAY_NAMES[candidate.dayOfWeek]} ${candidate.hour}:00 slot`,
      });
      usedKeys.add(key);
    }
  }

  // Third pass: if we need fewer slots, trim the lowest-priority ones (last added)
  while (adaptedSlots.length > targetSlotCount && adaptedSlots.length > 2) {
    adaptedSlots.pop();
  }

  // De-duplicate: ensure no two slots land on the same day+hour
  const seen = new Set<string>();
  const deduped: PostingSlot[] = [];
  for (const slot of adaptedSlots) {
    const key = `${slot.dayOfWeek[0]}:${slot.hour}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(slot);
    }
  }

  logger.info(
    `adaptSchedule: produced ${deduped.length} slots from ${posts.length} posts (queue depth: ${queueDepth})`,
  );

  return deduped;
}

/**
 * Persist the adapted schedule to agent_memory so the posting cron can use it.
 */
export async function saveAdaptedSchedule(slots: PostingSlot[]): Promise<void> {
  const supabase = createSupabaseClient();
  const key = "adaptive_schedule";

  // Check if a row already exists
  const { data: existing } = await supabase
    .from("agent_memory")
    .select("id")
    .eq("category", "schedule")
    .eq("content_text", key)
    .limit(1)
    .single();

  const payload = {
    category: "schedule",
    content_text: key,
    content: { slots, updated_at: new Date().toISOString() },
    relevance_tags: ["adaptive_schedule"],
    confidence: 1.0,
  };

  if (existing) {
    await supabase
      .from("agent_memory")
      .update(payload)
      .eq("id", existing.id);
  } else {
    await supabase.from("agent_memory").insert(payload);
  }

  logger.info(`Saved adapted schedule with ${slots.length} slots`);
}

/**
 * Load the most recent adapted schedule from agent_memory.
 * Falls back to defaults if none exists.
 */
export async function loadAdaptedSchedule(): Promise<PostingSlot[]> {
  const supabase = createSupabaseClient();

  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("category", "schedule")
    .eq("content_text", "adaptive_schedule")
    .limit(1)
    .single();

  if (data?.content?.slots && Array.isArray(data.content.slots)) {
    const slots = data.content.slots as PostingSlot[];
    if (slots.length > 0) {
      logger.info(`Loaded adapted schedule with ${slots.length} slots`);
      return slots;
    }
  }

  return getPostingSlots();
}

/**
 * Get the number of active (non-terminal) items in the content queue.
 */
async function getActiveQueueDepth(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<number> {
  const { count } = await supabase
    .from("content_queue")
    .select("id", { count: "exact", head: true })
    .in("status", [
      "pending",
      "generating",
      "generated",
      "rendering",
      "awaiting_approval",
      "ready",
    ]);

  return count || 0;
}
