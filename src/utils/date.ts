import {
  nextDay,
  setHours,
  setMinutes,
  addWeeks,
  isBefore,
  differenceInHours,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { PostingSlot } from "../config/schedule.js";
import {
  DEFAULT_POSTING_SLOTS,
  MIN_HOURS_BETWEEN_POSTS,
} from "../config/schedule.js";

/**
 * Converts a local time in a timezone to UTC
 */
export function localToUtc(
  date: Date,
  timezone: string = "America/New_York",
): Date {
  return fromZonedTime(date, timezone);
}

/**
 * Converts UTC to local time in a timezone
 */
export function utcToLocal(
  date: Date,
  timezone: string = "America/New_York",
): Date {
  return toZonedTime(date, timezone);
}

/**
 * Gets the next occurrence of a posting slot from now
 */
export function getNextSlotDate(
  slot: PostingSlot,
  timezone: string,
  fromDate: Date = new Date(),
): Date {
  const now = toZonedTime(fromDate, timezone);
  let candidate: Date | null = null;

  for (const dow of slot.dayOfWeek) {
    // nextDay expects 0=Sunday through 6=Saturday
    let next = nextDay(now, dow as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    next = setMinutes(setHours(next, slot.hour), slot.minute);

    // If the slot time is still in the future today
    if (dow === now.getDay()) {
      const todaySlot = setMinutes(setHours(now, slot.hour), slot.minute);
      if (isBefore(now, todaySlot)) {
        next = todaySlot;
      }
    }

    if (!candidate || isBefore(next, candidate)) {
      candidate = next;
    }
  }

  // Convert local slot time to UTC for storage
  return fromZonedTime(candidate!, timezone);
}

/**
 * Finds the next available posting slot for a given content type.
 * Ensures minimum spacing between posts.
 */
export function findNextAvailableSlot(
  _contentType: string,
  existingScheduledDates: Date[],
  timezone: string,
): Date {
  // All slots are content-type-agnostic — iterate all of them
  const slots = DEFAULT_POSTING_SLOTS;

  // Try each week going forward until we find an open slot
  for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
    for (const slot of slots) {
      let candidate = getNextSlotDate(slot, timezone);
      if (weekOffset > 0) {
        candidate = addWeeks(candidate, weekOffset);
      }

      // Check if this slot conflicts with existing scheduled posts
      const hasConflict = existingScheduledDates.some(
        (existing) =>
          Math.abs(differenceInHours(candidate, existing)) <
          MIN_HOURS_BETWEEN_POSTS,
      );

      if (!hasConflict && isBefore(new Date(), candidate)) {
        return candidate;
      }
    }
  }

  // Fallback: schedule for tomorrow at 10 AM
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fallback = setMinutes(setHours(tomorrow, 10), 0);
  return fromZonedTime(fallback, timezone);
}

/**
 * Finds the next open slot within 24h for urgent items.
 */
export function findNextAsapSlot(
  existingScheduledDates: Date[],
  timezone: string,
): Date {
  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const slot of DEFAULT_POSTING_SLOTS) {
    const candidate = getNextSlotDate(slot, timezone);
    if (isBefore(candidate, deadline) && isBefore(now, candidate)) {
      const hasConflict = existingScheduledDates.some(
        (existing) =>
          Math.abs(differenceInHours(candidate, existing)) <
          MIN_HOURS_BETWEEN_POSTS,
      );
      if (!hasConflict) return candidate;
    }
  }

  // No slot within 24h — schedule 1 hour from now
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  return fromZonedTime(soon, timezone);
}
