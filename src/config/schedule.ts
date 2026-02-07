import type { ContentType } from "../types/index.js";

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
